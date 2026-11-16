import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp, unique, uniquePng } from "./helpers";

type Up = { file: string; mime: string; title: string; license: string; visibility: string; tags?: string };

/** Seeds a visual through the API. */
async function upload(page: Page, u: Up) {
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post("/api/assets", {
    multipart: {
      file: { name: u.file, mimeType: u.mime, buffer: u.file === "dot.png" ? uniquePng() : Buffer.concat([readFileSync(`e2e/fixtures/${u.file}`), Buffer.from(`<!--${crypto.randomUUID()}-->`)]) },
      title: u.title, tags: u.tags ?? "", license: u.license, attribution: "", visibility: u.visibility,
      workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
  expect((await res.json()).duplicate).toBe(false);
}
const png = (title: string, o: Partial<Up> = {}): Up => ({ file: "dot.png", mime: "image/png", title, license: "cc0", visibility: "workspace", ...o });
const svg = (title: string, o: Partial<Up> = {}): Up => ({ file: "berry.svg", mime: "image/svg+xml", title, license: "own", visibility: "private", ...o });

async function start(page: Page, name: string) {
  await signUp(page, unique(name));
  await createWorkspace(page, `${name} Lab`);
}
/** Opens a dropdown filter chip ("Source: Workspace") and picks an item from its menu. */
async function pickFilter(page: Page, filter: "Type" | "Source" | "License", item: string) {
  await page.getByRole("button", { name: new RegExp(`^${filter}: `) }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item, exact: true }).click();
}
const tile = (page: Page, title: string) => page.getByRole("img", { name: title, exact: true });

test("library lists, filters and shows details", async ({ page }) => {
  await start(page, "lib");
  await upload(page, png("Berry dot", { tags: "fruit" }));
  await upload(page, svg("Berry outline"));
  await page.getByRole("link", { name: "Visual library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Visual library" })).toBeVisible();

  await expect(tile(page, "Berry dot")).toBeVisible();
  await expect(tile(page, "Berry outline")).toHaveCount(0);
  const badges = page.locator(".tile");
  await expect(badges.getByText("IMG", { exact: true })).toBeVisible();
  await expect(badges.getByText("CC0", { exact: true })).toBeVisible();

  await pickFilter(page, "Source", "Mine");
  await expect(tile(page, "Berry dot")).toBeVisible();
  await expect(tile(page, "Berry outline")).toBeVisible();
  await pickFilter(page, "Type", "SVG");
  await expect(tile(page, "Berry dot")).toHaveCount(0);
  await expect(tile(page, "Berry outline")).toBeVisible();
  await pickFilter(page, "Type", "All");
  await pickFilter(page, "License", "CC0");
  await expect(tile(page, "Berry outline")).toHaveCount(0);
  await expect(tile(page, "Berry dot")).toBeVisible();
  await pickFilter(page, "License", "Any");
  await page.getByLabel("Search visuals").fill("FRUIT");
  await expect(tile(page, "Berry outline")).toHaveCount(0);
  await expect(tile(page, "Berry dot")).toBeVisible();

  await page.getByRole("button", { name: /Berry dot/ }).click();
  const aside = page.getByRole("complementary", { name: "Selected visual" });
  await expect(aside.getByText("CC0 · public domain")).toBeVisible();
  await expect(aside.getByText("8 × 8 px")).toBeVisible();
  await expect(aside.getByText("0 designs")).toBeVisible();
});

test("filters are one row of three dropdown chips; Escape returns focus", async ({ page }) => {
  await start(page, "chips");
  await page.goto("/library");
  const type = page.getByRole("button", { name: "Type: All" });
  const source = page.getByRole("button", { name: "Source: Workspace" });
  const lic = page.getByRole("button", { name: "License: Any" });
  const ys = await Promise.all([type, source, lic].map(async (b) => Math.round((await b.boundingBox())!.y)));
  expect(new Set(ys).size).toBe(1);
  await type.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(type).toBeFocused();
  await pickFilter(page, "Type", "GIFs");
  await expect(page.getByRole("button", { name: "Type: GIFs" })).toBeVisible();
});

test("empty library invites the first upload and offers a drop zone", async ({ page }) => {
  await start(page, "libempty");
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Upload your first image" })).toBeVisible();
  await expect(page.getByText("Drop files here or click to browse")).toBeVisible();
  await page.getByRole("button", { name: "Upload your first image" }).click();
  await expect(page.getByRole("dialog", { name: "Upload visuals" })).toBeVisible();
});

test("edit and delete your own visual", async ({ page }) => {
  await start(page, "libedit");
  await upload(page, png("Berry dot"));
  await page.goto("/library");
  await page.getByRole("button", { name: /Berry dot/ }).click();
  const aside = page.getByRole("complementary", { name: "Selected visual" });
  await aside.getByRole("button", { name: "Edit details" }).click();
  await aside.getByLabel("Title").fill("Berry spot");
  await aside.getByRole("button", { name: "Save" }).click();
  await expect(tile(page, "Berry spot")).toBeVisible();
  await expect(tile(page, "Berry dot")).toHaveCount(0);

  page.once("dialog", (d) => void d.accept());
  await aside.getByRole("button", { name: "Delete" }).click();
  await expect(tile(page, "Berry spot")).toHaveCount(0);
});

test("report someone else's public visual", async ({ browser }) => {
  const title = `Shared ${Math.random().toString(36).slice(2, 8)}`; // public items are shared by every test
  const a = await (await browser.newContext()).newPage();
  await start(a, "libA");
  await upload(a, png(title, { visibility: "public" }));

  const b = await (await browser.newContext()).newPage();
  await start(b, "libB");
  await b.goto("/library");
  await pickFilter(b, "Source", "Public");
  await b.getByRole("button", { name: new RegExp(title) }).click();
  const aside = b.getByRole("complementary", { name: "Selected visual" });
  await expect(aside.getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await expect(aside.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await aside.getByRole("button", { name: "Report" }).click();
  const dlg = b.getByRole("dialog", { name: "Report" });
  await dlg.getByLabel("Reason").selectOption({ label: "Spam" });
  await dlg.getByRole("button", { name: "Send report" }).click();
  await expect(dlg.getByRole("status")).toHaveText("Thanks. Your report was sent.");
});

const file = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
const uniqueSvg = () => Buffer.concat([readFileSync("e2e/fixtures/berry.svg"), Buffer.from(`<!--${crypto.randomUUID()}-->`)]);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Upload visuals" });
const open = async (page: Page) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Upload visuals" }).click();
  await expect(dialog(page)).toBeVisible();
};
const pick = (page: Page, ...files: ReturnType<typeof file>[]) => dialog(page).locator('input[type="file"]').setInputFiles(files);
/** Gives the selected row a license and the rights confirmation. */
async function fillDetails(page: Page) {
  await dialog(page).getByLabel("License", { exact: true }).selectOption({ label: "CC0 · public domain" });
  await dialog(page).getByLabel(/I created this/).check();
}

test("upload two visuals with details", async ({ page }) => {
  await start(page, "up");
  await open(page);
  await pick(page, file("dot.png", "image/png", uniquePng()), file("berry.svg", "image/svg+xml", uniqueSvg()));
  await expect(dialog(page).getByText("Ready", { exact: true })).toHaveCount(2);
  await expect(dialog(page).getByRole("button", { name: "Add 0 visuals" })).toBeDisabled();
  await expect(dialog(page).getByText("Choose a license.")).toHaveCount(2);
  await expect(dialog(page).getByText("Details for dot.png")).toBeVisible();
  await expect(dialog(page).getByLabel("Title")).toHaveValue("Dot");
  await fillDetails(page);
  await dialog(page).getByRole("button", { name: "Apply to all files" }).click();
  await dialog(page).getByRole("button", { name: "Add 2 visuals" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tile(page, "Dot")).toBeVisible();
  await expect(tile(page, "Berry")).toBeVisible();
  await expect(page.locator(".tile").getByText("CC0", { exact: true })).toHaveCount(2);
  await expect(page.locator(".tile").getByText("SVG", { exact: true })).toHaveCount(1);
});

test("a duplicate is offered instead of re-uploaded", async ({ page }) => {
  await start(page, "dup");
  const bytes = uniquePng();
  await open(page);
  await pick(page, file("dot.png", "image/png", bytes));
  await expect(dialog(page).getByText("Ready", { exact: true })).toBeVisible();
  await fillDetails(page);
  await dialog(page).getByRole("button", { name: "Add 1 visual" }).click();
  await expect(tile(page, "Dot")).toBeVisible();

  await page.getByRole("button", { name: "Upload visuals" }).click();
  await pick(page, file("dot.png", "image/png", bytes));
  await expect(dialog(page).getByText("Already in library")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Use existing" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Selected visual" }).getByRole("heading", { name: "Dot" })).toBeVisible();
  await expect(tile(page, "Dot")).toHaveCount(1);
});

test("one bad file doesn't stop the others", async ({ page }) => {
  await start(page, "bad");
  await open(page);
  await pick(page, file("dot2.png", "image/png", uniquePng()), file("fake.png", "image/png", readFileSync("e2e/fixtures/fake.png")));
  await expect(dialog(page).getByText("Ready", { exact: true })).toHaveCount(2);
  await fillDetails(page);
  await dialog(page).getByRole("button", { name: "Apply to all files" }).click();
  await dialog(page).getByRole("button", { name: "Add 2 visuals" }).click();
  await expect(dialog(page).getByText("Added", { exact: true })).toBeVisible();
  await expect(dialog(page).getByText("That file type isn't supported. Use PNG, JPG, WEBP, GIF or SVG.")).toBeVisible();
  await expect(tile(page, "Dot2")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Add 0 visuals" })).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Remove fake.png" }).click();
  await expect(dialog(page).getByText("That file type isn't supported. Use PNG, JPG, WEBP, GIF or SVG.")).toHaveCount(0);
  await expect(tile(page, "Dot2")).toHaveCount(1);
});

test("license is required", async ({ page }) => {
  await start(page, "lic");
  await open(page);
  await pick(page, file("dot.png", "image/png", uniquePng()));
  await expect(dialog(page).getByText("Ready", { exact: true })).toBeVisible();
  await expect(dialog(page).getByText("Choose a license.")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Add 0 visuals" })).toBeDisabled();
  await dialog(page).getByLabel(/I created this/).check();
  await dialog(page).getByLabel("License", { exact: true }).selectOption({ label: "CC-BY · credit required" });
  await expect(dialog(page).getByText("CC-BY needs an attribution.")).toBeVisible();
  await dialog(page).getByLabel("Attribution / source").fill("Ann");
  await expect(dialog(page).getByRole("button", { name: "Add 1 visual" })).toBeEnabled();
});

test("the details drawer shows only when a visual is selected", async ({ page }) => {
  await start(page, "drawer");
  await upload(page, png("Drawer dot"));
  await page.goto("/library");
  await expect(tile(page, "Drawer dot")).toBeVisible();
  const aside = page.getByRole("complementary", { name: "Selected visual" });
  await expect(aside).toBeHidden();
  const grid = (await page.locator(".split-main").boundingBox())!;
  expect(grid.width).toBeGreaterThan(1000);
  await page.getByRole("button", { name: /Drawer dot/ }).click();
  await expect(aside).toBeVisible();
  await expect(aside.getByRole("heading", { name: "Drawer dot" })).toBeVisible();
});
