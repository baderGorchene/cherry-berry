import { expect, test, type Page } from "@playwright/test";
import { createDocument, serializeCherry } from "@cherry/doc";
import { createWorkspace, openAsViewer, signUp, unique, newDesign } from "./helpers";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Create a design" });
const opener = (page: Page) => page.getByRole("button", { name: "Create a design" });

async function start(page: Page, name: string) {
  await signUp(page, unique(name));
  await createWorkspace(page, `${name} Studio`);
}

test("the sidebar opens a dialog with seven categories and Escape returns focus", async ({ page }) => {
  await start(page, "create");
  await opener(page).click();
  await expect(dialog(page)).toBeVisible();
  const names = ["For you", "Social media", "Presentations", "Print", "Cards & invites", "Custom size", "Open a .cherry file"];
  for (const name of names) await expect(dialog(page).getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("tab")).toHaveCount(names.length);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  await opener(page).click();
  await expect(dialog(page).getByRole("searchbox", { name: "Search sizes" })).toBeFocused();
});

test("choosing Social post opens the editor at 1080 × 1080 px and search filters sizes", async ({ page }) => {
  await start(page, "social");
  await opener(page).click();
  await dialog(page).getByRole("searchbox", { name: "Search sizes" }).fill("post");
  await expect(dialog(page).getByRole("button", { name: /^Postcard/ })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: /^Story/ })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\//);
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator(".ed-phead")).toContainText("1080 × 1080 px");
  // the size is now remembered under For you
  await page.goto("/new");
  await expect(dialog(page).getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: /Social post/ })).toBeVisible();
});

test("/new?category=print opens the dialog over Home on that category", async ({ page }) => {
  await start(page, "route");
  await page.goto("/new?category=print");
  await expect(dialog(page).getByRole("tab", { name: "Print" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).getByRole("button", { name: /A4 print/ })).toContainText("210 × 297 mm · CMYK");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
});

test("Open a .cherry file imports it; a broken file shows a plain message", async ({ page }) => {
  await start(page, "open");
  await opener(page).click();
  await dialog(page).getByRole("tab", { name: "Open a .cherry file" }).click();
  const pick = dialog(page).getByLabel("Choose a .cherry file");
  await pick.setInputFiles({ name: "x.cherry", mimeType: "application/json", buffer: Buffer.from("{ nope") });
  await expect(dialog(page).getByRole("alert")).toHaveText("That file isn't a .cherry file.");
  await pick.setInputFiles({ name: "x.cherry", mimeType: "application/json", buffer: Buffer.from('{"format":"cherry","version":1}') });
  await expect(dialog(page).getByRole("alert")).toHaveText("This .cherry file is damaged and can't be opened.");
  const doc = createDocument({ title: "From file", width: 210, height: 297, unit: "mm", colorMode: "cmyk" });
  await pick.setInputFiles({ name: "ok.cherry", mimeType: "application/json", buffer: Buffer.from(serializeCherry(doc)) });
  await expect(page).toHaveURL(/\/d\//);
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator(".ed-phead")).toContainText("210 × 297 mm");
});

test("viewers see disabled size cards and Open file", async ({ page, browser }) => {
  await start(page, "viewer");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\//);
  const viewer = await openAsViewer(browser, page);
  await viewer.goto("/new");
  await expect(dialog(viewer).getByText("You have view-only access to this workspace.")).toBeVisible();
  await expect(dialog(viewer).getByRole("button", { name: /Instagram post/ })).toBeDisabled();
  await dialog(viewer).getByRole("tab", { name: "Open a .cherry file" }).click();
  await expect(dialog(viewer).getByLabel("Choose a .cherry file")).toBeDisabled();
  await dialog(viewer).getByRole("tab", { name: "Custom size" }).click();
  await expect(dialog(viewer).getByRole("button", { name: "Create", exact: true })).toBeDisabled();
});

test("phone: the dialog fills the screen without horizontal scroll", async ({ page }) => {
  await start(page, "phone");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/new");
  await expect(dialog(page)).toBeVisible();
  const box = (await dialog(page).boundingBox())!;
  expect([box.width, box.height]).toEqual([375, 812]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog(page).getByRole("tab", { name: "Custom size" }).click();
  await expect(dialog(page).getByLabel("Width")).toBeVisible();
  expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
