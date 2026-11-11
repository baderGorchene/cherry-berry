import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, openAsViewer, signUp, unique } from "./helpers";

async function newSocialPost(page: Page) {
  await signUp(page, unique("ed"));
  await createWorkspace(page, "Editor Lab");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();
}

/** Arms a tool from the toolbar and clicks the canvas center (the page center at fit zoom). */
async function place(page: Page, tool: string) {
  await page.getByRole("button", { name: tool }).click();
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const status = (page: Page) => page.getByRole("status");

/** Pen-draws a closed triangle around the canvas center; returns its first anchor and an inside point (screen px). */
async function drawTriangle(page: Page) {
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const pts = [[cx - 100, cy - 60], [cx + 100, cy - 60], [cx, cy + 80]] as const;
  await page.keyboard.press("P");
  for (const [x, y] of pts) await page.mouse.click(x, y);
  await page.mouse.click(pts[0][0], pts[0][1]);
  await expect(layers(page).getByRole("button", { name: "Path", exact: true })).toBeVisible();
  return { first: { x: pts[0][0], y: pts[0][1] }, inside: { x: cx, y: cy - 10 } };
}

test("create from preset, add a shape, edit it, reload", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Rectangle (R)");
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
  await place(page, "Rectangle (R)");
  const x = page.getByLabel("X", { exact: true });
  const y = page.getByLabel("Y", { exact: true });
  const [x0, y0] = [await x.inputValue(), await y.inputValue()];
  await x.fill("100");
  await x.press("Enter");
  await y.fill("50");
  await y.press("Enter");
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.keyboard.press("Control+Z");
  await expect(y).toHaveValue(y0);
  await expect(x).toHaveValue("100");
  await page.keyboard.press("Control+Z");
  await expect(x).toHaveValue(x0);
  await expect(layers(page).getByRole("button", { name: "Hide Rectangle" })).toBeVisible();
});

test("drag moves a shape", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Rectangle (R)");
  const x = page.getByLabel("X", { exact: true });
  const x0 = Number(await x.inputValue());
  // The new rectangle is centered on the canvas center.
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 25, cy, { steps: 5 });
  await page.mouse.move(cx + 50, cy, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(x0 + 50);
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

test("empty new text leaves nothing behind", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Text (T)");
  await expect(page.getByLabel("Edit text")).toBeFocused();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Edit text")).toHaveCount(0);
  await expect(page.getByText("No layers yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Control+Z");
  await expect(page.getByText("No layers yet.", { exact: false })).toBeVisible();
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
  await place(page, "Ellipse (O)");
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
  const viewer = await openAsViewer(browser, owner);
  await expect(viewer.getByRole("button", { name: "Rectangle (R)" })).toBeDisabled();
});

test("pen draws a closed path", async ({ page }) => {
  await newSocialPost(page);
  await drawTriangle(page);
  const layer = layers(page).getByRole("button", { name: "Path", exact: true });
  await page.keyboard.press("Control+Z");
  await expect(layer).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(layer).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
  await page.reload();
  await expect(layer).toBeVisible();
});

test("editing a point is one undo step", async ({ page }) => {
  await newSocialPost(page);
  const { first, inside } = await drawTriangle(page);
  await page.mouse.dblclick(inside.x, inside.y);
  await expect(page.getByText("Editing path", { exact: true })).toBeVisible();
  await page.mouse.click(first.x, first.y); // select the first anchor
  const x = page.getByRole("complementary", { name: "Path properties" }).getByLabel("X", { exact: true });
  const x0 = await x.inputValue();
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x + 20, first.y, { steps: 5 });
  await page.mouse.move(first.x + 40, first.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(Number(x0));
  await page.keyboard.press("Control+Z");
  await expect(x).toHaveValue(x0);
  await expect(layers(page).getByRole("button", { name: "Path", exact: true })).toBeVisible();
});

test("viewer cannot edit paths", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  const { inside } = await drawTriangle(owner);
  await expect(status(owner)).toHaveText("Saved");
  const viewer = await openAsViewer(browser, owner);
  await expect(layers(viewer).getByRole("button", { name: "Path", exact: true })).toBeVisible();
  // Same viewport size as the owner, so the path sits at the same screen point.
  await viewer.mouse.dblclick(inside.x, inside.y);
  await viewer.keyboard.press("Enter");
  await expect(viewer.getByText("Editing path", { exact: true })).toHaveCount(0);
});

test("the first point edit flattens a rectangle in the same undo step", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Rectangle (R)");
  const half = Number(await page.getByLabel("W", { exact: true }).inputValue()) / 2;
  const zoom = Number((await page.getByTitle("Zoom level").innerText()).replace("%", "")) / 100;
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2; // the new rectangle is centered here
  // Konva pairs clicks within 400 ms into a double-click; keep the placement click out of that window.
  await page.waitForTimeout(450);
  await page.mouse.dblclick(cx, cy);
  await expect(page.getByText("Editing path", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Corner radius")).toHaveCount(0); // path panel
  const corner = { x: cx - half * zoom, y: cy - half * zoom };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x - 20, corner.y - 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Points")).toHaveValue("4");
  await page.keyboard.press("Escape");
  const radius = page.getByLabel("Corner radius");
  const layer = layers(page).getByRole("button", { name: "Rectangle", exact: true });
  await expect(radius).toHaveCount(0); // flattened: a path has no corner radius

  await page.keyboard.press("Control+Z");
  await expect(layer).toBeVisible();
  await expect(radius).toHaveValue("0"); // a rectangle again

  await page.keyboard.press("Control+Shift+Z");
  await expect(radius).toHaveCount(0); // a path again
  await expect(layer).toBeVisible();
});

test("broken design id", async ({ page }) => {
  await signUp(page, unique("lost"));
  await page.goto("/d/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("This design doesn't exist or you don't have access.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});

test("a save rejected as invalid offers a reload to the latest version", async ({ page, context }) => {
  const row = (p: Page, name: string) => p.getByRole("listitem").filter({ hasText: name });
  const saved = (p: Page) => p.waitForResponse((r) => r.url().endsWith("/state") && r.request().method() === "PUT");
  await newSocialPost(page);
  await Promise.all([saved(page), page.getByRole("button", { name: "+ Add page" }).click()]);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(row(other, "Page 2")).toBeVisible();

  // Each tab deletes a different page; merged, the design would have no pages.
  await Promise.all([saved(page), row(page, "Page 1").getByRole("button", { name: "Delete" }).click()]);
  await row(other, "Page 2").getByRole("button", { name: "Delete" }).click();
  const reload = other.getByRole("button", { name: "Reload to get the latest version" });
  await expect(reload).toBeVisible();
  await reload.click();
  await expect(row(other, "Page 2")).toBeVisible();
  await expect(row(other, "Page 1")).toHaveCount(0);
  await expect(status(other)).toHaveText("Saved");
});

/** Places a rectangle `dx` px right of the canvas center and waits out Konva's double-click window. */
async function placeAt(page: Page, dx: number) {
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
  await page.waitForTimeout(450);
}

test("a selected rectangle shows a usable Corner radius field", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Rectangle (R)");
  await expect(page.getByLabel("Corner radius")).toBeVisible();
});

test("union combines two shapes", async ({ page }) => {
  await newSocialPost(page);
  await placeAt(page, -20);
  await placeAt(page, 20);
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Union" }).click();
  await expect(layers(page).getByRole("button", { name: "Union", exact: true })).toHaveCount(1);
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+Z");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(2);
});

test("disjoint intersect explains itself", async ({ page }) => {
  await newSocialPost(page);
  await placeAt(page, -300);
  await placeAt(page, 300);
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Intersect" }).click();
  await expect(page.getByText("These shapes don't overlap.")).toBeVisible();
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(2);
});

test("convert to path keeps the layer", async ({ page }) => {
  await newSocialPost(page);
  await place(page, "Rectangle (R)");
  await page.getByRole("button", { name: "Convert to path" }).click();
  await expect(page.getByLabel("Corner radius")).toHaveCount(0);
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(1);
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.waitForTimeout(450);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText("Editing path", { exact: true })).toBeVisible();
});

test("long-label fields are visible and fillable", async ({ page }) => {
  await newSocialPost(page);
  await page.keyboard.press("T");
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await layers(page).getByRole("button", { name: "Hi", exact: true }).click();
  for (const label of ["Line height", "Letter spacing"]) {
    await expect(page.getByLabel(label)).toBeVisible();
    expect((await page.getByLabel(label).boundingBox())!.width).toBeGreaterThanOrEqual(40);
    await page.getByLabel(label).fill("2");
    await page.getByLabel(label).press("Enter");
    await expect(page.getByLabel(label)).toHaveValue("2");
  }
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  await page.mouse.click(cx + 200, cy + 150);
  const sw = page.getByLabel("Stroke width");
  await expect(sw).toBeVisible();
  expect((await sw.boundingBox())!.width).toBeGreaterThanOrEqual(40);
  await sw.fill("7");
  await sw.press("Enter");
  await expect(sw).toHaveValue("7");
});
