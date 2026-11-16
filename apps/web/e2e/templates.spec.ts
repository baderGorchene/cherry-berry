import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, openAsEditor, openAsViewer, signUp, unique, uniquePng, newDesign } from "./helpers";

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const props = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const canvas = (page: Page) => page.getByLabel("Page 1 canvas");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Publish as a template" });

const content = (rules: Record<string, boolean> = {}) => ({
  colors: [{ id: "a", name: "Berry", role: "primary", hex: "#8E1EA2" }],
  typography: {
    heading: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 32, lineHeight: 1.1 },
    subheading: { fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 20, lineHeight: 1.2 },
    body: { fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: 1.5 },
  },
  logos: { primary: null, onDark: null, mark: null, wordmark: null },
  rules: { kitColorsOnly: true, warnOffBrandFonts: true, lockLogos: true, flagContrast: true, requireApproval: false, ...rules },
});

async function newKit(page: Page, rules?: Record<string, boolean>) {
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Tpl kit", content: content(rules) } });
  expect(res.status()).toBe(201);
}

/** On the home page of a workspace: starts a social post with a rectangle on it. */
async function design(page: Page) {
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
  await addShape(page, "Rectangle");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved");
}

async function openPublish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Name").fill("Launch post");
  await dialog(page).getByLabel("Category").selectOption({ label: "Social" });
}
const submit = (page: Page) => dialog(page).getByRole("button", { name: "Publish", exact: true }).click();

test("publish a workspace template and start from it", async ({ page }) => {
  await signUp(page, unique("tp"));
  await createWorkspace(page, "Tpl Lab");
  await design(page);
  await openPublish(page);
  await submit(page);
  await expect(dialog(page).getByRole("status")).toHaveText("Published");
  await dialog(page).getByRole("link", { name: "Open templates" }).click();

  await expect(page).toHaveURL(/\/templates$/);
  const card = page.getByRole("region", { name: "Tpl Lab" }).getByRole("button", { name: "Use Launch post" });
  await expect(card).toBeVisible();
  await expect.poll(() => card.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(card.getByText("LOCKED LAYOUT")).toHaveCount(0);
  await card.click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Design title")).toHaveValue("Launch post");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
});

test("brand template keeps its locks", async ({ page, browser }) => {
  await signUp(page, unique("tb"));
  await createWorkspace(page, "Tpl Brand");
  await newKit(page);
  await design(page);
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  await props(page).getByLabel("Brand lock").selectOption({ label: "Fixed" });
  await expect(page.getByRole("status")).toHaveText("Saved");
  await openPublish(page);
  await dialog(page).getByLabel("Brand kit").selectOption({ label: "Tpl kit" });
  await submit(page);
  await expect(dialog(page).getByRole("status")).toHaveText("Published");

  const editor = await openAsEditor(browser, page);
  await editor.goto("/templates");
  const own = editor.getByRole("region", { name: "Tpl Brand" });
  await expect(own.getByText("LOCKED LAYOUT")).toBeVisible();
  await own.getByRole("button", { name: "Use Launch post" }).click();
  await expect(editor).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(layers(editor).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  const box = (await canvas(editor).boundingBox())!;
  await editor.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(layers(editor).getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("requires approval when the kit says so", async ({ page, browser }) => {
  await signUp(page, unique("ta"));
  await createWorkspace(page, "Tpl Approve");
  await newKit(page, { requireApproval: true });
  const editor = await openAsEditor(browser, page);
  await design(editor);
  await openPublish(editor);
  await dialog(editor).getByLabel("Brand kit").selectOption({ label: "Tpl kit" });
  await submit(editor);
  await expect(dialog(editor).getByRole("status")).toHaveText("Sent for approval. An owner or admin will review it.");

  await page.goto("/templates");
  const waiting = page.getByRole("region", { name: "Waiting for approval" });
  await expect(waiting.getByText("Launch post")).toBeVisible();
  await waiting.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("region", { name: "Waiting for approval" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Tpl Approve" }).getByText("Launch post")).toBeVisible();

  await editor.goto("/templates");
  await expect(editor.getByRole("region", { name: "Tpl Approve" }).getByRole("button", { name: "Use Launch post" })).toBeVisible();
});

test("public template with a workspace visual is refused", async ({ page }) => {
  await signUp(page, unique("tv"));
  await createWorkspace(page, "Tpl Visual");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const up = await page.request.post("/api/assets", {
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: uniquePng() },
      title: "Dot", tags: "", license: "cc0", attribution: "", visibility: "workspace", workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(up.status()).toBe(201);
  await page.getByRole("button", { name: "Visuals" }).click();
  const visuals = page.getByRole("complementary", { name: "Visuals panel" });
  await visuals.getByRole("button", { name: "Workspace", exact: true }).click();
  await visuals.getByRole("button", { name: "Dot" }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await openPublish(page);
  await dialog(page).getByLabel("Where").selectOption({ label: "Everyone (public)" });
  await dialog(page).getByLabel(/I have the right to share/).check();
  await submit(page);
  await expect(dialog(page).getByRole("alert")).toHaveText("Every visual in a public template must be public. Make them public or publish to this workspace.");
});

test("community template from another workspace", async ({ page, browser }) => {
  await signUp(page, unique("tc"));
  await createWorkspace(page, "Tpl Author");
  await design(page);
  await openPublish(page);
  await dialog(page).getByLabel("Where").selectOption({ label: "Everyone (public)" });
  await dialog(page).getByLabel(/I have the right to share/).check();
  await submit(page);
  await expect(dialog(page).getByRole("status")).toHaveText("Published");

  const other = await (await browser.newContext()).newPage();
  await signUp(other, unique("tc2"));
  await createWorkspace(other, "Tpl Reader");
  await other.goto("/templates");
  const card = other.getByRole("region", { name: "Community" }).getByRole("button", { name: "Use Launch post" });
  await expect(card).toBeVisible();
  const community = other.getByRole("region", { name: "Community" }).getByRole("listitem").filter({ has: other.getByRole("button", { name: "Use Launch post" }) }).first();
  await expect(community.getByRole("button", { name: "Report" })).toBeVisible();
  await expect(community.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await card.click();
  await expect(other).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(layers(other).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
});

test("viewer can browse but not use", async ({ page, browser }) => {
  await signUp(page, unique("tw"));
  await createWorkspace(page, "Tpl Viewers");
  await design(page);
  await openPublish(page);
  await submit(page);
  await expect(dialog(page).getByRole("status")).toHaveText("Published");

  const viewer = await openAsViewer(browser, page);
  await viewer.goto("/templates");
  await expect(viewer.getByRole("region", { name: "Tpl Viewers" }).getByRole("button", { name: "Use Launch post" })).toBeDisabled();
  await expect(viewer.getByRole("region", { name: "Tpl Viewers" }).getByText("Viewers can't create designs")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Publish a template" })).toHaveCount(0);
});
