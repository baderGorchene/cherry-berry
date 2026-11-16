import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, openAsEditor, openAsViewer, signUp, unique, newDesign } from "./helpers";

const rects = (page: Page) => page.getByRole("complementary", { name: "Layers" }).getByRole("button", { name: "Rectangle", exact: true });
const versions = (page: Page) => page.getByRole("complementary", { name: "Versions" });

async function addRect(page: Page, dx = 0) {
  await addShape(page, "Rectangle", dx);
}

/** A design with one rect and a named version "Client review v1"; the owner is back in the editor. */
async function withNamedVersion(page: Page) {
  await signUp(page, unique("hist"));
  await createWorkspace(page, "History Lab");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
  await addRect(page);
  await expect(rects(page)).toHaveCount(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const editorUrl = page.url();
  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.getByRole("button", { name: "Name this version" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Client review v1");
  await page.getByRole("dialog").getByRole("button", { name: "Save name" }).click();
  await expect(versions(page).getByRole("button", { name: /Client review v1/ })).toBeVisible();
  await page.getByRole("link", { name: "Back to editor" }).click();
  await expect(page).toHaveURL(editorUrl);
  await expect(rects(page)).toHaveCount(1);
  return editorUrl;
}

async function addSecondRect(page: Page) {
  await addRect(page, 150);
  await expect(rects(page)).toHaveCount(2);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test("name a version, change the design, compare side by side", async ({ page }) => {
  await withNamedVersion(page);
  await addSecondRect(page);
  await page.getByRole("link", { name: "History" }).click();
  await versions(page).getByRole("button", { name: /Client review v1/ }).click();
  await expect(page.getByText("Current · 1 change outlined")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.locator("canvas").last()).toBeVisible();
  await page.getByRole("group", { name: "View mode" }).getByRole("button", { name: "Overlay diff" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("group", { name: "View mode" }).getByRole("button", { name: "Single" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("restore brings the old design back for everyone", async ({ page: owner, browser }) => {
  const url = await withNamedVersion(owner);
  await addSecondRect(owner);
  const editor = await openAsEditor(browser, owner);
  await editor.goto(new URL(url).pathname);
  await expect(rects(editor)).toHaveCount(2, { timeout: 10_000 });

  await owner.getByRole("link", { name: "History" }).click();
  await versions(owner).getByRole("button", { name: /Client review v1/ }).click();
  const rowRestore = owner.getByRole("button", { name: "Restore", exact: true });
  await rowRestore.click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Restore", exact: true })).toBeFocused();
  await owner.keyboard.press("Tab");
  await owner.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).not.toBeFocused(); // wrapped back inside the dialog
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await owner.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rowRestore).toBeFocused();
  await rowRestore.click();
  await expect(dialog).toContainText("Restore this version? Everyone editing will see it. The current design is kept as “Before restore”.");
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(rects(editor)).toHaveCount(1, { timeout: 10_000 });
  const rows = versions(owner).getByRole("listitem");
  await expect(rows.nth(1)).toContainText("Before restore");
  await expect(rows.nth(2)).toContainText("Client review v1");
});

test("branch from a version opens a new design", async ({ page }) => {
  const url = await withNamedVersion(page);
  const title = await page.getByLabel("Design title").inputValue();
  await addSecondRect(page);
  await page.goto(url + "/history");
  await versions(page).getByRole("button", { name: /Client review v1/ }).click();
  await page.getByRole("button", { name: "Branch from here" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toHaveValue("Client review v1");
  await dialog.getByLabel("Name").fill("dark variant");
  await dialog.getByRole("button", { name: "Create branch" }).click();

  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toBe(url);
  await expect(page.getByLabel("Design title")).toHaveValue(`${title} — dark variant`);
  await expect(rects(page)).toHaveCount(1);

  await page.goto(url + "/history");
  await expect(versions(page).getByText("Branch: dark variant")).toBeVisible();
  await expect(versions(page).getByRole("link", { name: "Open branch" })).toBeVisible();
});

test("viewer sees history without actions", async ({ page: owner, browser }) => {
  const url = await withNamedVersion(owner);
  const viewer = await openAsViewer(browser, owner);
  await viewer.goto(new URL(url).pathname + "/history");
  const row = versions(viewer).getByRole("button", { name: /Client review v1/ });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(viewer.getByText("Current ·", { exact: false })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Name this version" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Restore" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Branch from here" })).toHaveCount(0);
});
