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
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();

  const x = page.getByLabel("X", { exact: true });
  await x.fill("100");
  await x.press("Enter");
  await expect(status(page)).toHaveText("Saved");

  await page.reload();
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("100");
});

test("each committed field is one undo step", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const x = page.getByLabel("X", { exact: true });
  const y = page.getByLabel("Y", { exact: true });
  await x.fill("100");
  await x.press("Enter");
  await y.fill("50");
  await y.press("Enter");
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.keyboard.press("Control+Z");
  await expect(y).toHaveValue("405");
  await expect(x).toHaveValue("100");
  await page.keyboard.press("Control+Z");
  await expect(x).toHaveValue("405");
  await expect(layers(page).getByRole("button", { name: "Hide Rectangle" })).toBeVisible();
});

test("drag moves a shape", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const x = page.getByLabel("X", { exact: true });
  await expect(x).toHaveValue("405");
  // The new rectangle sits at the page center, which fit-zoom puts at the canvas center.
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 25, cy, { steps: 5 });
  await page.mouse.move(cx + 50, cy, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(405);
});

test("text tool", async ({ page }) => {
  await newSocialPost(page);
  await page.keyboard.press("T");
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByLabel("Edit text")).toBeFocused();
  await page.keyboard.type("Hello");
  await page.keyboard.press("Escape");
  const layer = layers(page).getByRole("button", { name: "Hello", exact: true });
  await expect(layer).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
  await page.reload();
  await expect(layer).toBeVisible();
});

test("recent designs load error offers retry", async ({ page }) => {
  await signUp(page, unique("rd"));
  await page.route("**/api/workspaces/*/designs", (r) => r.fulfill({ status: 500, body: "{}" }));
  await createWorkspace(page, "Flaky Lab");
  await expect(page.getByText("Couldn't load your designs.")).toBeVisible();
  await page.unroute("**/api/workspaces/*/designs");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("No designs yet.", { exact: false })).toBeVisible();
});

test("undo and redo", async ({ page }) => {
  await newSocialPost(page);
  await page.getByRole("button", { name: "Ellipse (O)" }).click();
  const layer = layers(page).getByRole("button", { name: "Ellipse", exact: true });
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
