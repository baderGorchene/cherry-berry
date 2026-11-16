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
