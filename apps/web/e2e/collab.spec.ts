import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, openAsEditor, openAsViewer, signUp, unique } from "./helpers";

async function newPost(page: Page) {
  await signUp(page, unique("co"));
  await createWorkspace(page, "Collab Lab");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();
}

async function addRect(page: Page) {
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const rects = (page: Page) => page.getByRole("complementary", { name: "Layers" }).getByRole("button", { name: "Rectangle", exact: true });
const status = (page: Page) => page.getByRole("status");

test("two people edit live", async ({ page: owner, browser }) => {
  await newPost(owner);
  const editor = await openAsEditor(browser, owner);
  await editor.goto(new URL(owner.url()).pathname);
  await expect(editor.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();

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
  await expect(editor.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();
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
  await expect(viewer.getByRole("button", { name: "Rectangle (R)" })).toBeDisabled();
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
