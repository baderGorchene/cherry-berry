import { expect, test, type Locator, type Page } from "@playwright/test";
import { createWorkspace, newDesign, openPanel, panel, popover, position, positionValue, rail, railButton, selectionMenu, signUp, toolbar, unique } from "./helpers";

// msedge can't emulate isMobile, so phones are a 390×844 touch viewport.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function newPost(page: Page) {
  await signUp(page, unique("m-ed"));
  await createWorkspace(page, "Pocket Editor");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const canvasCenter = async (page: Page) => {
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Picks a basic shape from the Elements sheet and taps it onto the canvas center; the toolbar shows its styling. */
async function placeRect(page: Page) {
  await openPanel(page, "Elements");
  await sheet(page, "Elements").getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(sheet(page, "Elements")).toBeHidden();
  const c = await canvasCenter(page);
  await page.touchscreen.tap(c.x, c.y);
  await expect(toolbar(page).getByRole("button", { name: "Fill", exact: true })).toBeVisible();
}

const zoomLabel = async (page: Page) => Number((await page.getByTitle("Zoom level").innerText()).replace("%", ""));
/** The Draw sheet's pen: arms it (or puts it down when armed); the sheet closes so the canvas takes the taps. */
async function togglePen(page: Page) {
  await openPanel(page, "Draw");
  await panel(page, "Draw").getByRole("button", { name: "Pen (P)" }).click();
  await expect(sheet(page, "Draw")).toBeHidden();
}
const layersSheet = async (page: Page) => { await openPanel(page, "Layers"); return sheet(page, "Layers"); };

test("phone editor shows the rail as a bottom bar and opens panels in sheets", async ({ page }) => {
  await newPost(page);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(header.getByLabel("Design title")).toBeVisible();
  for (const name of ["Undo", "File", "Export", "More"]) await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["Templates", "Elements", "Text", "Uploads", "Brand", "Draw", "Layers"]) await expect(rail(page).getByRole("button", { name, exact: true })).toBeVisible();
  // no side panels on phones; the page header and the page strip stay
  await expect(page.getByRole("complementary", { name: "Properties" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: / panel$/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Page name" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
  const bar = (await rail(page).boundingBox())!;
  expect(bar.y + bar.height).toBeCloseTo(844, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Elements opens a sheet; Escape closes it and focus returns to the rail button
  const elements = railButton(page, "Elements");
  await elements.click();
  await expect(sheet(page, "Elements").getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  const s = (await sheet(page, "Elements").boundingBox())!;
  expect(s.height).toBeLessThanOrEqual(844 * 0.7 + 1);
  await expect(sheet(page, "Elements")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet(page, "Elements")).toBeHidden();
  await expect(elements).toBeFocused();

  // one sheet at a time: Uploads replaces Elements; a scrim tap closes it
  await elements.click();
  await railButton(page, "Uploads").click();
  await expect(sheet(page, "Elements")).toBeHidden();
  await expect(sheet(page, "Uploads")).toBeVisible();
  await page.getByTestId("sheet-scrim").click({ position: { x: 20, y: 200 } });
  await expect(sheet(page, "Uploads")).toBeHidden();

  // Every panel opens as a sheet without horizontal scroll
  for (const name of ["Templates", "Text", "Brand", "Draw", "Layers"] as const) {
    await openPanel(page, name);
    await expect(sheet(page, name)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
  }

  // The Draw sheet's pen arms the pen and gets out of the way
  await togglePen(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openPanel(page, "Draw");
  await expect(panel(page, "Draw").getByRole("button", { name: "Pen (P)" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // Presence and redo live in More; History and Publish in File
  await page.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expect(more).toBeFocused();
  await expect(more.getByRole("button", { name: "Redo" })).toBeVisible();
  await expect(more.getByRole("group", { name: /editing$/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
  await header.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "History" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "Publish as template" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("selecting a layer shows the context toolbar, which scrolls within itself", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  await expect(page.getByRole("dialog")).toHaveCount(0); // no properties sheet any more
  await expect((await position(page)).getByLabel("X", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selectionMenu(page).getByRole("button", { name: "Delete" })).toBeVisible();

  // a text layer from the Text sheet
  await openPanel(page, "Text");
  await sheet(page, "Text").getByRole("button", { name: "Add a little body text" }).click();
  await expect(sheet(page, "Text")).toBeHidden(); // the insert shows the canvas and its toolbar
  const bar = toolbar(page);
  await expect(bar.getByLabel("Size", { exact: true })).toBeVisible();
  await expect((await popover(page, "Spacing", "Text spacing")).getByLabel("Line height", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const tb = await bar.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth, overflow: getComputedStyle(e).overflowX }));
  expect(tb.scroll).toBeGreaterThan(tb.client);
  expect(tb.overflow).toBe("auto");
  await bar.evaluate((e) => { e.scrollLeft = e.scrollWidth; });
  await expect(bar.getByLabel("Opacity", { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const b of await bar.getByRole("button").all()) {
    const r = (await b.boundingBox())!;
    expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
  }
});

test("pinch zooms without moving the layer", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  const x0 = await positionValue(page, "X");
  const y0 = await positionValue(page, "Y");
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
  await (await layersSheet(page)).getByRole("button", { name: "Rectangle", exact: true }).click();
  expect(await positionValue(page, "X")).toBe(x0);
  expect(await positionValue(page, "Y")).toBe(y0);
});

test("a second finger landing mid-drag pinches without moving the layer", async ({ page }) => {
  await newPost(page);
  await placeRect(page);
  const x0 = await positionValue(page, "X");
  const y0 = await positionValue(page, "Y");
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
  await (await layersSheet(page)).getByRole("button", { name: "Rectangle", exact: true }).click();
  expect(await positionValue(page, "X")).toBe(x0);
  expect(await positionValue(page, "Y")).toBe(y0);
});

test("pinching with the pen armed adds no anchors", async ({ page }) => {
  await newPost(page);
  await togglePen(page);
  const c = await canvasCenter(page);
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [{ x: c.x - d, y: c.y + d / 2, id: 1 }, { x: c.x + d, y: c.y, id: 2 }];
  for (let i = 0; i < 2; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(20) });
    for (let d = 30; d <= 60; d += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await togglePen(page); // putting the pen down finishes a pen path in progress
  await openPanel(page, "Draw");
  await expect(panel(page, "Draw").getByRole("button", { name: "Pen (P)" })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await layersSheet(page);
  await expect(sheet(page, "Layers").getByRole("button", { name: "Path", exact: true })).toHaveCount(0);
  await expect(sheet(page, "Layers").getByRole("button", { name: /^Hide / })).toHaveCount(0);
});

type P = { x: number; y: number };
/** One-finger touch drag through CDP (move events in steps, so the 8 px tap threshold is passed). */
async function touchDrag(page: Page, from: P, to: P) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: (P & { id: number })[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ ...from, id: 1 }]);
  for (let i = 1; i <= 6; i++) await send("touchMove", [{ x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6, id: 1 }]);
  await send("touchEnd", []);
}

/** Pen-taps a closed triangle around the canvas center; returns its first anchor (screen px). */
async function tapTriangle(page: Page) {
  const c = await canvasCenter(page);
  const pts = [{ x: c.x - 80, y: c.y - 50 }, { x: c.x + 80, y: c.y - 50 }, { x: c.x, y: c.y + 70 }];
  await togglePen(page);
  for (const p of pts) await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.tap(pts[0]!.x, pts[0]!.y); // back on the first point closes the path
  await expect(toolbar(page).getByRole("button", { name: "Edit points" })).toBeVisible(); // the new path is selected
  return pts[0]!;
}

const pathLayer = async (page: Page) => (await layersSheet(page)).getByRole("button", { name: "Path", exact: true });

test("pen taps draw a path", async ({ page }) => {
  await newPost(page);
  await tapTriangle(page);
  await page.keyboard.press("Escape");
  await expect(await pathLayer(page)).toHaveCount(1);
});

test("a pen touch drag pulls a curve handle", async ({ page }) => {
  await newPost(page);
  const c = await canvasCenter(page);
  await togglePen(page);
  // three points on one line; the middle one is dragged out, so the path bends off that line
  await page.touchscreen.tap(c.x - 90, c.y);
  await touchDrag(page, { x: c.x, y: c.y }, { x: c.x, y: c.y + 50 });
  await page.touchscreen.tap(c.x + 90, c.y);
  await togglePen(page); // putting the pen down finishes the open path
  await expect(toolbar(page).getByRole("button", { name: "Edit points" })).toBeVisible();
  const h = Number(await positionValue(page, "H")), w = Number(await positionValue(page, "W"));
  // bent by the pulled handle, but only by about that pull (a drag left armed would follow the mouse to the tool bar)
  expect(h).toBeGreaterThan(0);
  expect(h).toBeLessThan(w / 2);
  await page.keyboard.press("Escape");
  await expect(await pathLayer(page)).toHaveCount(1);
});

test("a touch drag moves an anchor in point-edit mode", async ({ page }) => {
  await newPost(page);
  const first = await tapTriangle(page);
  // Enter on a focused button activates that button, so start from no focus (as after a canvas tap).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter"); // point-edit the selected path
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(sheet(page, "Draw")).toBeVisible(); // point tools and point properties
  await page.keyboard.press("Escape"); // close the sheet that opened with it, stay in point edit
  await page.touchscreen.tap(first.x, first.y); // select the first anchor
  const pointX = async () => {
    await openPanel(page, "Draw");
    const x = Number(await sheet(page, "Draw").getByRole("complementary", { name: "Path properties" }).getByLabel("X", { exact: true }).inputValue());
    await page.keyboard.press("Escape");
    return x;
  };
  const x0 = await pointX();
  await touchDrag(page, first, { x: first.x + 40, y: first.y });
  expect(await pointX()).toBeGreaterThan(x0);
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
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

test.describe("at 375 x 812", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("phone touch targets are at least 44 x 44", async ({ page }) => {
    await signUp(page, unique("m-44"));
    await createWorkspace(page, "Pocket Targets");
    const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
    const kit = await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Kit", content: {
      colors: [{ id: "a", name: "Berry", role: "primary", hex: "#8E1EA2" }, { id: "b", name: "Ink", role: "text", hex: "#1A1A1A" }],
      typography: {
        heading: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 32, lineHeight: 1.1 },
        subheading: { fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 20, lineHeight: 1.2 },
        body: { fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: 1.5 },
      },
      logos: { primary: null, onDark: null, mark: null, wordmark: null },
      rules: { kitColorsOnly: false, warnOffBrandFonts: false, lockLogos: false, flagContrast: false, requireApproval: false },
    } } });
    expect(kit.status()).toBe(201);
    await newDesign(page, "Social post");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    const atLeast44 = async (loc: Locator) => {
      const n = await loc.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const b = (await loc.nth(i).boundingBox())!;
        const what = await loc.nth(i).evaluate((e) => e.getAttribute("aria-label") ?? e.textContent ?? e.tagName);
        expect.soft(Math.round(b.width), `${what} width`).toBeGreaterThanOrEqual(44);
        expect.soft(Math.round(b.height), `${what} height`).toBeGreaterThanOrEqual(44);
      }
    };
    const phead = page.locator(".ed-phead");
    await atLeast44(phead.getByRole("textbox", { name: "Page name" }));
    await atLeast44(phead.getByRole("button"));

    // Text sheet: the linked kit's colour swatches
    await openPanel(page, "Brand");
    await sheet(page, "Brand").getByLabel("Link a brand kit").selectOption({ label: "Kit" });
    await page.keyboard.press("Escape");
    await openPanel(page, "Text");
    await expect(sheet(page, "Text").getByRole("button", { name: /^Text colour / }).first()).toBeVisible(); // once the kit has loaded
    await atLeast44(sheet(page, "Text").getByRole("button", { name: /^Text colour / }));
    await page.keyboard.press("Escape");

    // a portrait A4 page's thumbnail in the strip
    await openPanel(page, "Templates");
    await sheet(page, "Templates").getByRole("button", { name: "Insert Jazz night flyer" }).click();
    await expect(sheet(page, "Templates")).toBeHidden();
    await atLeast44(page.getByRole("navigation", { name: "Pages" }).getByRole("button"));

    await page.getByRole("banner").getByRole("button", { name: "File", exact: true }).click();
    await atLeast44(page.getByRole("menu", { name: "File" }).getByRole("menuitem"));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Grid view" }).click();
    await atLeast44(page.getByRole("dialog", { name: "All pages" }).getByRole("button", { name: /^Move page/ }));
  });
});
