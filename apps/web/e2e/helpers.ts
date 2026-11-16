import { deflateSync } from "node:zlib";
import { expect, type Browser, type Page } from "@playwright/test";

// admin.spec.ts relies on the @example.com domain: it allows it while registration is limited to listed domains.
export const unique = (name: string) => `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

export async function signUp(page: Page, email: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("berrypass1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByLabel("Workspace name").fill(name);
  await page.getByLabel(/Invitation only/).check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Invites a new user as a viewer of `owner`'s workspace and opens the design `owner` is on, as that viewer. */
export async function openAsViewer(browser: Browser, owner: Page): Promise<Page> {
  const designUrl = new URL(owner.url()).pathname;
  const { workspaces } = await (await owner.request.get("/api/workspaces/mine")).json();
  const email = unique("viewer");
  const res = await owner.request.post(`/api/workspaces/${workspaces[0].id}/invitations`, { data: { email, role: "viewer" } });
  expect(res.status()).toBe(201);
  const { token } = await res.json();

  const viewer = await (await browser.newContext()).newPage();
  await signUp(viewer, email);
  await viewer.getByLabel("Invitation link").fill(token);
  await viewer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(viewer).toHaveURL(/\/$/);
  await viewer.goto(designUrl);
  await expect(viewer.getByText("View only")).toBeVisible();
  return viewer;
}

/** A valid 8x8 PNG whose bytes differ on every call (random pixel colour plus a unique tEXt chunk), so uploads never dedupe. */
export function uniquePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let r = 0xffffffff;
    for (const x of b) r = crcTable[(r ^ x) & 255]! ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rgb = [142, 30, 162].map((v) => (v + Math.floor(Math.random() * 100)) & 255);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [...rgb, 255]).flat())])));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from(`id\0${crypto.randomUUID()}`)),
    chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Invites a new user as an editor of `owner`'s workspace and returns that user's page, signed in and on the home page. */
export async function openAsEditor(browser: Browser, owner: Page): Promise<Page> {
  const { workspaces } = await (await owner.request.get("/api/workspaces/mine")).json();
  const email = unique("editor");
  const res = await owner.request.post(`/api/workspaces/${workspaces[0].id}/invitations`, { data: { email, role: "editor" } });
  expect(res.status()).toBe(201);
  const { token } = await res.json();

  const editor = await (await browser.newContext()).newPage();
  await signUp(editor, email);
  await editor.getByLabel("Invitation link").fill(token);
  await editor.getByRole("button", { name: "Accept invitation" }).click();
  await expect(editor).toHaveURL(/\/$/);
  return editor;
}

/** Waits until the editor is loaded and editable (Undo is enabled for anyone who can edit). */
export async function editorReady(page: Page) {
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
}

const SHAPE_KEYS = { Rectangle: "r", Ellipse: "o", Line: "l", Text: "t" } as const;
export type PanelName = "Templates" | "Elements" | "Text" | "Uploads" | "Brand" | "Draw" | "Layers";

/** The editor's panel rail (left column on desktop, bottom bar on phones) and one of its buttons. */
export const rail = (page: Page) => page.getByRole("navigation", { name: "Editor panels" });
export const railButton = (page: Page, name: PanelName) => rail(page).getByRole("button", { name: new RegExp(`^${name}`) });
/** A rail panel by name (on phones it sits inside a sheet). */
export const panel = (page: Page, name: PanelName) => page.getByRole("complementary", { name: `${name} panel` });

/** Opens a rail panel (a no-op when it is already open). The only place that knows the rail and panel names. */
export async function openPanel(page: Page, name: PanelName) {
  const b = railButton(page, name);
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  await expect(panel(page, name)).toBeVisible();
}

/** Adds a shape the way a user does: arms it with its keyboard shortcut, then clicks the canvas centre (offset by dx, dy px).
 *  The only place that knows how shapes are added (the Elements panel is not needed, and Layers stays visible).
 *  When the Layers panel is showing, fails unless exactly one layer appeared (so an ignored key is loud). */
export async function addShape(page: Page, shape: keyof typeof SHAPE_KEYS, dx = 0, dy = 0, canvas = page.getByLabel(/^Page \d+ canvas$/)) {
  const rows = panel(page, "Layers").locator("li.ed-layrow");
  const watch = await panel(page, "Layers").isVisible();
  const before = watch ? await rows.count() : 0;
  // Commit a pending text edit (Escape) instead of discarding it; other fields just lose focus, since shortcuts are ignored while typing.
  if (await page.getByLabel("Edit text").isVisible()) await page.keyboard.press("Escape");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(SHAPE_KEYS[shape]);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  if (watch && shape !== "Text") await expect(rows).toHaveCount(before + 1);
}

/** Creates a design from Home the way a user does: a shortcut opens the Create dialog, then a size card opens the editor. */
export async function newDesign(page: Page, size: "Social post" | "Presentation" | "Story" = "Social post") {
  await page.getByRole("button", { name: size, exact: true }).click();
  await page.getByRole("dialog", { name: "Create a design" }).getByRole("button", { name: new RegExp(`^${size}`) }).first().click();
  await expect(page).toHaveURL(/\/d\//);
}

/** The bottom bar's page strip and the thumbnail of page `n` (1-based). */
export const pageStrip = (page: Page) => page.getByRole("navigation", { name: "Pages" });
export const pageThumb = (page: Page, n: number) => pageStrip(page).getByRole("button", { name: `Page ${n}`, exact: true });
/** Adds a page after the current one from the page strip. */
export const addPage = (page: Page) => pageStrip(page).getByRole("button", { name: "Add page" }).click();

/** Runs an item of the editor's File menu. */
export async function fileMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: item }).click();
}

/** The context toolbar above the canvas (above the page strip on phones). */
export const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selection", exact: true });
/** The small menu floating above the selection. */
export const selectionMenu = (page: Page) => page.getByRole("toolbar", { name: "Selection actions" });

/** Opens one of the toolbar's popovers by its button (a no-op when it is already open) and returns the dialog. */
export async function popover(page: Page, button: string, name = button) {
  const dialog = page.getByRole("dialog", { name, exact: true });
  if (!(await dialog.isVisible())) await toolbar(page).getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}
/** The Position popover (X, Y, W, H, rotation, align, distribute, arrange). */
export const position = (page: Page) => popover(page, "Position");
/** Reads one Position field of the selection, then closes the popover. */
export async function positionValue(page: Page, label: string) {
  const v = await (await position(page)).getByLabel(label, { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  return v;
}
/** Commits one Position field (one undo step), then closes the popover. */
export async function setPosition(page: Page, label: string, value: string) {
  const field = (await position(page)).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
  await page.keyboard.press("Escape");
}
