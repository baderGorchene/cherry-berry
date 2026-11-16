import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, openAsEditor, signUp, toolbar, unique, newDesign } from "./helpers";

async function newPost(page: Page) {
  await signUp(page, unique("pr"));
  await createWorkspace(page, "Presence Lab");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
}

async function addRect(page: Page) {
  await addShape(page, "Rectangle");
}

const layer = (page: Page) => page.getByRole("complementary", { name: "Layers panel" }).getByRole("button", { name: "Rectangle", exact: true });

async function twoPeople(owner: Page, browser: Parameters<typeof openAsEditor>[0]) {
  await newPost(owner);
  await addRect(owner);
  const editor = await openAsEditor(browser, owner);
  await editor.goto(new URL(owner.url()).pathname);
  await expect(layer(editor)).toBeVisible({ timeout: 10_000 });
  return editor;
}

test("people see each other", async ({ page: owner, browser }) => {
  const editor = await twoPeople(owner, browser);
  const group = owner.getByRole("group", { name: "2 people editing" });
  await expect(group).toBeVisible({ timeout: 10_000 });
  await expect(group.getByTitle("Tester")).toHaveCount(2);
  await layer(editor).click();
  await expect(owner.getByText("Tester is editing")).toBeVisible({ timeout: 5000 });
});

test("a remote delete clears my selection", async ({ page: owner, browser }) => {
  const editor = await twoPeople(owner, browser);
  const errors: Error[] = [];
  editor.on("pageerror", (e) => errors.push(e));
  await layer(editor).click();
  const empty = toolbar(editor).getByLabel("Page width"); // the nothing-selected toolbar
  await expect(empty).toHaveCount(0);
  await layer(owner).click();
  await owner.keyboard.press("Delete");
  await expect(layer(editor)).toHaveCount(0, { timeout: 5000 });
  await expect(empty).toBeVisible();
  expect(errors).toEqual([]);
});

test("share copies the link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await newPost(page);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("People in Presence Lab can open this link.")).toBeVisible();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("share falls back when the clipboard is unavailable, and Escape only closes it", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
  await newPost(page);
  const share = page.getByRole("button", { name: "Share" });
  await share.click();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeFocused();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Press Ctrl+C to copy")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Share" })).toHaveCount(0);
  await expect(share).toBeFocused();
});
