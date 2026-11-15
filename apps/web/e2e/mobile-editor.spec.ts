import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

// msedge can't emulate isMobile, so phones are a 390×844 touch viewport.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function newPost(page: Page) {
  await signUp(page, unique("m-ed"));
  await createWorkspace(page, "Pocket Editor");
  await page.getByRole("list", { name: "Sizes" }).getByRole("link", { name: "Post" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(tools(page).getByRole("button", { name: "Shapes" })).toBeEnabled();
}

const tools = (page: Page) => page.getByRole("navigation", { name: "Tools" });
const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const canvasCenter = async (page: Page) => {
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Picks a basic shape from the Shapes sheet and taps it onto the canvas center; Properties opens for it. */
async function placeRect(page: Page) {
  await tools(page).getByRole("button", { name: "Shapes" }).click();
  await sheet(page, "Shapes").getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(sheet(page, "Shapes")).toBeHidden();
  const c = await canvasCenter(page);
  await page.touchscreen.tap(c.x, c.y);
  await expect(sheet(page, "Properties")).toBeVisible();
}

const zoomLabel = async (page: Page) => {
  await page.getByRole("button", { name: "More" }).click();
  const z = Number((await page.getByTitle("Zoom level").innerText()).replace("%", ""));
  await page.keyboard.press("Escape");
  return z;
};

test("phone editor shows tool bar and opens sheets", async ({ page }) => {
  await newPost(page);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(header.getByLabel("Design title")).toBeVisible();
  for (const name of ["Undo", "Layers", "Export", "More"]) await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["Text", "Shapes", "Visuals", "Draw", "Brand"]) await expect(tools(page).getByRole("button", { name, exact: true })).toBeVisible();
  // the desktop rail, side panels and header extras are gone
  await expect(page.getByRole("button", { name: "Rectangle (R)" })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Properties" })).toBeHidden();
  await expect(page.getByRole("link", { name: "History" })).toBeHidden();
  const bar = (await tools(page).boundingBox())!;
  expect(bar.y + bar.height).toBeCloseTo(844, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Shapes opens a sheet with the shapes; Escape closes it and focus returns to the tool
  const shapes = tools(page).getByRole("button", { name: "Shapes" });
  await shapes.click();
  await expect(sheet(page, "Shapes").getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  const s = (await sheet(page, "Shapes").boundingBox())!;
  expect(s.height).toBeLessThanOrEqual(844 * 0.7 + 1);
  await expect(sheet(page, "Shapes")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet(page, "Shapes")).toBeHidden();
  await expect(shapes).toBeFocused();

  // one sheet at a time: Visuals replaces Shapes; a scrim tap closes it
  await shapes.click();
  await tools(page).getByRole("button", { name: "Visuals" }).click();
  await expect(sheet(page, "Shapes")).toBeHidden();
  await expect(sheet(page, "Visuals")).toBeVisible();
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 200 } });
  await expect(sheet(page, "Visuals")).toBeHidden();

  // Layers from the header; Draw arms the pen without a sheet
  await page.getByRole("banner").getByRole("button", { name: "Layers" }).click();
  await expect(sheet(page, "Layers")).toBeVisible();
  await page.keyboard.press("Escape");
  await tools(page).getByRole("button", { name: "Draw" }).click();
  await expect(tools(page).getByRole("button", { name: "Draw" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // History, Publish, presence and zoom live in More
  await page.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expect(more).toBeFocused();
  await expect(more.getByRole("link", { name: "History" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Publish" })).toBeVisible();
  await expect(more.getByRole("group", { name: "Zoom" })).toBeVisible();
  await expect(more.getByRole("group", { name: /editing$/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
});

test("selecting a layer opens properties in the sheet", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  await expect(sheet(page, "Properties").getByLabel("X", { exact: true })).toBeVisible();
  await expect(sheet(page, "Properties").getByRole("tab")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // a text layer: tap with the Text tool, type, then pick it from Layers
  await tools(page).getByRole("button", { name: "Text" }).click();
  const c = await canvasCenter(page);
  await page.touchscreen.tap(c.x, c.y - 150);
  await page.getByLabel("Edit text").fill("Spring");
  await page.getByLabel("Edit text").press("Escape");
  await expect(sheet(page, "Properties")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("banner").getByRole("button", { name: "Layers" }).click();
  await sheet(page, "Layers").getByRole("button", { name: "Spring", exact: true }).click();
  const props = sheet(page, "Properties");
  await expect(props).toBeVisible();
  await expect(props).toBeFocused(); // the sheet that replaced Layers takes focus
  for (const name of ["Font", "Color", "Spacing", "Effects"]) await expect(props.getByRole("tab", { name })).toBeVisible();
  await expect(props.getByRole("tab", { name: "Font" })).toHaveAttribute("aria-selected", "true");
  await expect(props.getByLabel("Size", { exact: true })).toBeVisible();
  await expect(props.getByLabel("Fill", { exact: true })).toBeHidden();
  await props.getByRole("tab", { name: "Color" }).click();
  await expect(props.getByLabel("Fill", { exact: true })).toBeVisible();
  await expect(props.getByLabel("Size", { exact: true })).toBeHidden();
  await props.getByRole("tab", { name: "Spacing" }).click();
  await expect(props.getByLabel("Line height", { exact: true })).toBeVisible();
  await props.getByRole("tab", { name: "Effects" }).click();
  await expect(props.getByLabel("Opacity", { exact: true })).toBeVisible();
});

test("pinch zooms without moving the layer", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  const x0 = await sheet(page, "Properties").getByLabel("X", { exact: true }).inputValue();
  const y0 = await sheet(page, "Properties").getByLabel("Y", { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const z0 = await zoomLabel(page);

  // two fingers spread apart over the rectangle
  const c = await canvasCenter(page);
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [{ x: c.x - d, y: c.y, id: 1 }, { x: c.x + d, y: c.y, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(20) });
  for (let d = 30; d <= 80; d += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  expect(await zoomLabel(page)).toBeGreaterThan(z0 * 2);
  await page.getByRole("banner").getByRole("button", { name: "Layers" }).click();
  await sheet(page, "Layers").getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(sheet(page, "Properties").getByLabel("X", { exact: true })).toHaveValue(x0);
  await expect(sheet(page, "Properties").getByLabel("Y", { exact: true })).toHaveValue(y0);
});

test("a second finger landing mid-drag pinches without moving the layer", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  const x0 = await sheet(page, "Properties").getByLabel("X", { exact: true }).inputValue();
  const y0 = await sheet(page, "Properties").getByLabel("Y", { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const z0 = await zoomLabel(page);

  // one finger starts dragging the rectangle, then a second lands and both spread
  const c = await canvasCenter(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: { x: number; y: number; id: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await touch("touchStart", [{ x: c.x, y: c.y, id: 1 }]);
  for (let dx = 5; dx <= 20; dx += 5) await touch("touchMove", [{ x: c.x + dx, y: c.y, id: 1 }]);
  await touch("touchStart", [{ x: c.x + 20, y: c.y, id: 1 }, { x: c.x + 60, y: c.y, id: 2 }]);
  for (let d = 10; d <= 60; d += 10) await touch("touchMove", [{ x: c.x + 20 - d, y: c.y, id: 1 }, { x: c.x + 60 + d, y: c.y, id: 2 }]);
  await touch("touchEnd", []);

  expect(await zoomLabel(page)).toBeGreaterThan(z0);
  await page.getByRole("banner").getByRole("button", { name: "Layers" }).click();
  await sheet(page, "Layers").getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(sheet(page, "Properties").getByLabel("X", { exact: true })).toHaveValue(x0);
  await expect(sheet(page, "Properties").getByLabel("Y", { exact: true })).toHaveValue(y0);
});

test("pinching with Draw armed adds no anchors", async ({ page }) => {
  await newPost(page);
  const draw = tools(page).getByRole("button", { name: "Draw" });
  await draw.click();
  const c = await canvasCenter(page);
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [{ x: c.x - d, y: c.y + d / 2, id: 1 }, { x: c.x + d, y: c.y, id: 2 }];
  for (let i = 0; i < 2; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(20) });
    for (let d = 30; d <= 60; d += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await draw.click(); // switching tool finishes a pen path in progress
  await expect(draw).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("banner").getByRole("button", { name: "Layers" }).click();
  await expect(sheet(page, "Layers").getByRole("button", { name: "Path", exact: true })).toHaveCount(0);
  await expect(sheet(page, "Layers").getByRole("button", { name: /^Hide / })).toHaveCount(0);
});

test("export from the phone header", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  await page.keyboard.press("Escape");
  await page.getByRole("banner").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Export/ });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await dialog.getByRole("radio", { name: /^PNG/ }).check();
  const started = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await started).suggestedFilename()).toMatch(/\.png$/);
});
