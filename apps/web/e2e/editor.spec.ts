import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

async function newSocialPost(page: Page) {
  await signUp(page, unique("ed"));
  await createWorkspace(page, "Editor Lab");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();
}

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const status = (page: Page) => page.getByRole("status");

test("create from preset, add a shape, edit it, reload", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  await expect(layers(page).getByRole("button", { name: /Rectangle/ })).toBeVisible();

  const x = page.getByLabel("X", { exact: true });
  await x.fill("100");
  await x.press("Enter");
  await expect(status(page)).toHaveText(/Unsaved changes|Saving…/);
  await expect(status(page)).toHaveText("Saved");

  await page.reload();
  await layers(page).getByRole("button", { name: /Rectangle/ }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("100");
});

test("undo and redo", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "Ellipse (O)" }).click();
  const layer = layers(page).getByRole("button", { name: /Ellipse/ });
  await expect(layer).toBeVisible();
  await page.keyboard.press("Control+Z");
  await expect(layer).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(layer).toBeVisible();
});

test("pages", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "+ Add page" }).click();
  const page2 = page.getByRole("listitem").filter({ hasText: "2 · Page 2" });
  await expect(page2).toBeVisible();
  await page2.getByRole("button", { name: "Delete" }).click();
  await expect(page2).toHaveCount(0);
  const page1 = page.getByRole("listitem").filter({ hasText: "1 · Page 1" });
  await expect(page1.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("viewer is read-only", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  const designUrl = new URL(owner.url()).pathname;
  const { workspaces } = await (await owner.request.get("/api/workspaces/mine")).json();
  const viewerEmail = unique("viewer");
  const res = await owner.request.post(`/api/workspaces/${workspaces[0].id}/invitations`, {
    data: { email: viewerEmail, role: "viewer" },
  });
  expect(res.status()).toBe(201);
  const { token } = await res.json();

  const viewer = await (await browser.newContext()).newPage();
  await signUp(viewer, viewerEmail);
  await viewer.getByLabel("Invitation link").fill(token);
  await viewer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(viewer).toHaveURL(/\/$/);
  await viewer.goto(designUrl);
  await expect(viewer.getByText("View only")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Rectangle (R)" })).toBeDisabled();
});

test("broken design id", async ({ page }) => {
  await signUp(page, unique("lost"));
  await page.goto("/d/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("This design doesn't exist or you don't have access.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});
