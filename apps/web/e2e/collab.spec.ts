import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, openAsEditor, openAsViewer, signUp, unique, newDesign } from "./helpers";

async function newPost(page: Page) {
  await signUp(page, unique("co"));
  await createWorkspace(page, "Collab Lab");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
}

async function addRect(page: Page) {
  await addShape(page, "Rectangle");
}

const rects = (page: Page) => page.getByRole("complementary", { name: "Layers panel" }).getByRole("button", { name: "Rectangle", exact: true });
const status = (page: Page) => page.getByRole("status");

test("two people edit live", async ({ page: owner, browser }) => {
  await newPost(owner);
  const editor = await openAsEditor(browser, owner);
  await editor.goto(new URL(owner.url()).pathname);
  await editorReady(editor);

  await addRect(owner);
  await expect(rects(editor)).toBeVisible({ timeout: 5000 });

  const title = editor.getByLabel("Design title");
  await title.fill("Live title");
  await title.press("Enter");
  await expect(owner.getByLabel("Design title")).toHaveValue("Live title", { timeout: 5000 });
});

test("offline edits sync on reconnect", async ({ page: owner, browser }) => {
  await newPost(owner);
  const editor = await openAsEditor(browser, owner);
  await editor.goto(new URL(owner.url()).pathname);
  await editorReady(editor);
  await expect(status(editor)).toHaveText("Saved");

  await editor.context().setOffline(true);
  await expect(status(editor)).toHaveText(/^Offline/, { timeout: 15_000 });
  await addRect(editor);
  await expect(rects(editor)).toBeVisible();
  await editor.context().setOffline(false);
  await expect(status(editor)).toHaveText("Saved", { timeout: 30_000 });
  await expect(rects(owner)).toBeVisible({ timeout: 10_000 });
});

test("a viewer watches changes but cannot edit", async ({ page: owner, browser }) => {
  await newPost(owner);
  const viewer = await openAsViewer(browser, owner);
  await addRect(owner);
  await expect(rects(viewer)).toBeVisible({ timeout: 5000 });
  await expect(viewer.getByRole("button", { name: "Undo" })).toBeDisabled();
  // the R shortcut and a canvas click add nothing
  await viewer.keyboard.press("r");
  const box = (await viewer.getByLabel("Page 1 canvas").boundingBox())!;
  await viewer.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await viewer.waitForTimeout(500);
  await expect(rects(viewer)).toHaveCount(1);
});

test("an idle lone user stays connected", async ({ page }) => {
  test.setTimeout(120_000);
  await newPost(page);
  await expect(status(page)).toHaveText("Saved");
  // Count status changes away from Saved for 45 s (the provider's watchdog fires after 30 s of silence).
  await page.evaluate(() => {
    const el = document.querySelector('[role="status"]')!;
    (window as any).__flips = 0;
    new MutationObserver(() => { if (el.textContent !== "Saved") (window as any).__flips++; }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.waitForTimeout(45_000);
  expect(await page.evaluate(() => (window as any).__flips)).toBe(0);
  await expect(status(page)).toHaveText("Saved");
});
