import { expect, test, type Page } from "@playwright/test";
import {
  addPage, addShape, createWorkspace, editorReady, newDesign, openAsViewer, openPanel, pageStrip, pageThumb, panel, popover, position, positionValue,
  railButton, selectionMenu, setPosition, signUp, toolbar, unique, uniquePng, type PanelName,
} from "./helpers";

async function newSocialPost(page: Page, size: "Social post" | "Presentation" = "Social post") {
  await signUp(page, unique("ed"));
  await createWorkspace(page, "Editor Lab");
  await newDesign(page, size);
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
}

const layers = (page: Page) => panel(page, "Layers");
/** Every rail panel shares the one left panel; switch back to see the layers. */
const showLayers = (page: Page) => openPanel(page, "Layers");
const pageAction = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
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
  await addShape(page, "Rectangle");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();

  await setPosition(page, "X", "100");
  await expect(status(page)).toHaveText("Saved");

  await page.reload();
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  expect(await positionValue(page, "X")).toBe("100");
});

test("each committed field is one undo step", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  const [x0, y0] = [await positionValue(page, "X"), await positionValue(page, "Y")];
  await setPosition(page, "X", "100");
  await setPosition(page, "Y", "50");
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.keyboard.press("Control+Z");
  expect(await positionValue(page, "Y")).toBe(y0);
  expect(await positionValue(page, "X")).toBe("100");
  await page.keyboard.press("Control+Z");
  expect(await positionValue(page, "X")).toBe(x0);
  await expect(layers(page).getByRole("button", { name: "Hide Rectangle" })).toBeVisible();
});

test("drag moves a shape", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  const x0 = Number(await positionValue(page, "X"));
  // The new rectangle is centered on the canvas center.
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 25, cy, { steps: 5 });
  await page.mouse.move(cx + 50, cy, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await positionValue(page, "X"))).toBeGreaterThan(x0 + 50);
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
  await addShape(page, "Text");
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
  await addShape(page, "Ellipse");
  const layer = layers(page).getByRole("button", { name: "Ellipse", exact: true });
  await expect(layer).toBeVisible();
  await page.keyboard.press("Control+Z");
  await expect(layer).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(layer).toBeVisible();
});

test("pages", async ({ page }) => {
  await newSocialPost(page);
  await addPage(page);
  await expect(pageThumb(page, 2)).toBeVisible();
  await expect(page.getByLabel("Page 2 canvas")).toBeVisible(); // the new page is current
  await pageAction(page, "Delete page").click();
  await expect(pageThumb(page, 2)).toHaveCount(0);
  await expect(pageAction(page, "Delete page")).toBeDisabled();
});

test("the toolbar shows page settings when nothing is selected, and the selection menu deletes", async ({ page }) => {
  await newSocialPost(page);
  await expect(toolbar(page).getByLabel("Page width")).toHaveValue("1080");
  await addShape(page, "Rectangle");
  await expect(toolbar(page).getByLabel("Page width")).toHaveCount(0);
  await selectionMenu(page).getByRole("button", { name: "Delete" }).click();
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(0);
  await expect(toolbar(page).getByLabel("Page width")).toHaveValue("1080");
});

test("the page header renames, duplicates and moves the current page", async ({ page }) => {
  await newSocialPost(page);
  const name = page.getByRole("textbox", { name: "Page name" });
  await name.fill("Cover");
  await name.press("Enter");
  await expect(page.getByLabel("Cover canvas")).toBeVisible();
  await expect(pageThumb(page, 1)).toHaveAttribute("title", "Cover");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Page name" })).toHaveValue("Cover");

  await pageAction(page, "Duplicate page").click();
  await expect(page.getByLabel("Cover copy canvas")).toBeVisible();
  await expect(pageThumb(page, 2)).toHaveAttribute("aria-current", "page");
  await pageAction(page, "Move page up").click();
  await expect(pageThumb(page, 1)).toHaveAttribute("title", "Cover copy");
  await expect(pageAction(page, "Move page up")).toBeDisabled();
  await page.locator(".ed-phead").getByRole("button", { name: "Add page" }).click();
  await expect(pageStrip(page).getByRole("button", { name: /^Page \d$/ })).toHaveCount(3);
  await expect(pageThumb(page, 2)).toHaveAttribute("aria-current", "page");
});

test("viewer is read-only", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  const viewer = await openAsViewer(browser, owner);
  await expect(viewer.getByRole("button", { name: "Undo" })).toBeDisabled();
  await openPanel(viewer, "Elements");
  await expect(viewer.getByRole("button", { name: "Import SVG…" })).toBeDisabled();
  // the R shortcut and a canvas click add nothing
  await openPanel(viewer, "Layers");
  await viewer.keyboard.press("r");
  const vbox = (await viewer.getByLabel("Page 1 canvas").boundingBox())!;
  await viewer.mouse.click(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
  await viewer.waitForTimeout(500);
  await expect(layers(viewer).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(0);
});

test("each rail button opens its panel, and clicking it again closes it", async ({ page }) => {
  await newSocialPost(page);
  await expect(railButton(page, "Layers")).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Templates", "Elements", "Text", "Uploads", "Brand", "Draw", "Layers"] as PanelName[]) {
    const b = railButton(page, name);
    if ((await b.getAttribute("aria-pressed")) === "true") await b.click(); // Layers starts open
    await expect(panel(page, name)).toHaveCount(0);
    await b.click();
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page, name)).toBeVisible();
    await expect(page.getByRole("complementary", { name: / panel$/ })).toHaveCount(1); // one panel at a time
    await b.click();
    await expect(panel(page, name)).toHaveCount(0);
  }
  // The collapse handle closes it too, and keyboard activation keeps focus on the rail button.
  await railButton(page, "Uploads").click();
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(panel(page, "Uploads")).toHaveCount(0);
  await railButton(page, "Text").focus();
  await page.keyboard.press("Enter");
  await expect(panel(page, "Text")).toBeVisible();
  await expect(railButton(page, "Text")).toBeFocused();
});

test("the old single-key shortcuts still work", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Layers");
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  const click = (dx: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 - 200);
  for (const [key, name] of [["r", "Rectangle"], ["o", "Ellipse"], ["l", "Line"]] as const) {
    await page.keyboard.press(key);
    await click(0);
    await expect(layers(page).getByRole("button", { name, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(450);
  }
  // V puts an armed tool down: the next click adds nothing.
  await page.keyboard.press("r");
  await page.keyboard.press("v");
  await click(-250);
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(1);
  // T places body text at the click point; P arms the pen in the Draw panel.
  await page.keyboard.press("t");
  await click(0);
  await expect(page.getByLabel("Edit text")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await openPanel(page, "Draw");
  await expect(panel(page, "Draw").getByRole("button", { name: "Pen (P)" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(panel(page, "Draw").getByRole("button", { name: "Pen (P)" })).toHaveAttribute("aria-pressed", "false");
});

/** X, Y, W and H of the selected layer, from the Position popover. */
const box = async (page: Page) => {
  const pos = await position(page);
  const v = async (l: string) => Number(await pos.getByLabel(l, { exact: true }).inputValue());
  const out = { x: await v("X"), y: await v("Y"), w: await v("W"), h: await v("H") };
  await page.keyboard.press("Escape");
  return out;
};

test("Add a heading inserts a page-sized heading fully inside the page", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Text");
  await panel(page, "Text").getByRole("button", { name: "Add a heading" }).click();
  // 8% of a 1080 px page is 86.4 px, stored in points (x 72/96).
  await expect(toolbar(page).getByLabel("Size", { exact: true })).toHaveValue("64.8");
  const b = await box(page);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.w).toBeLessThanOrEqual(1080);
  expect(b.y + b.h).toBeLessThanOrEqual(1080);
  expect(b.w).toBeLessThan(1080 * 0.9); // fitted to the text, not 60% of the page
  expect(Math.abs(b.x + b.w / 2 - 540)).toBeLessThan(2);
  await openPanel(page, "Text");
  await panel(page, "Text").getByRole("button", { name: "Playfair Display and Inter" }).click();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Playfair Display and Inter", exact: true })).toBeVisible();
});

test("templates that fit come first; another size adds its own pages", async ({ page }) => {
  await newSocialPost(page, "Presentation");
  await openPanel(page, "Templates");
  const tpl = panel(page, "Templates");
  const headings = await tpl.getByRole("heading").allInnerTexts();
  expect(headings.map((h) => h.toLowerCase())).toEqual(["fits this page", "other sizes"]);
  await expect(tpl.getByRole("region", { name: "Fits this page" }).getByRole("button", { name: "Insert Brand kickoff deck" })).toBeVisible();
  await expect(tpl.getByRole("region", { name: "Other sizes" }).getByRole("button", { name: "Insert Jazz night flyer" })).toBeVisible();

  // An A4 mm CMYK flyer after a 1920 x 1080 px page: each keeps its own size, and Fit works on each.
  await tpl.getByRole("button", { name: "Insert Jazz night flyer" }).click();
  await expect(pageStrip(page).getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);
  await expect(pageThumb(page, 2)).toHaveAttribute("aria-current", "page");
  const header = page.locator(".ed-phead");
  await expect(header).toContainText("210 × 297 mm");
  const zoom = page.getByTitle("Zoom level");
  const fit = async () => {
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const c = (await page.getByLabel(/ canvas$/).boundingBox())!;
    return { pct: await zoom.innerText(), c };
  };
  const a4 = await fit();
  await pageThumb(page, 1).click();
  await expect(header).toContainText("1920 × 1080 px");
  const wide = await fit();
  expect(a4.pct).not.toBe(wide.pct);
  await page.keyboard.press("Control+Z");
  await expect(pageStrip(page).getByRole("button", { name: /^Page \d$/ })).toHaveCount(1); // one undo step
  await page.keyboard.press("Control+Shift+Z");
  await expect(pageStrip(page).getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveText("Saved");

  // Export of all pages succeeds with mixed sizes.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Export/ });
  await dialog.getByRole("radio", { name: /^PDF · Print/ }).check();
  await expect(dialog.getByText("All pages (2)")).toBeVisible();
  const started = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export PDF · Print", exact: true }).click();
  expect((await started).suggestedFilename()).toMatch(/\.pdf$/);
});

test("the zoom slider changes the zoom", async ({ page }) => {
  await newSocialPost(page);
  const zoom = page.getByTitle("Zoom level");
  const before = await zoom.innerText();
  const slider = page.getByRole("slider", { name: "Zoom" });
  await slider.fill("100"); // log2 x 100: 200%
  await expect(zoom).toHaveText("200%");
  expect(before).not.toBe("200%");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(zoom).toHaveText(before);
});

test("the File menu opens with the keyboard and Escape returns focus", async ({ page }) => {
  await newSocialPost(page);
  const file = page.getByRole("button", { name: "File", exact: true });
  await file.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "File" });
  for (const item of ["Rename", "Page size and colour mode", "History", "Publish as template", "Open a .cherry file", "Export"]) {
    await expect(menu.getByRole("menuitem", { name: item, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Page size and colour mode" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(file).toBeFocused();
  await file.click();
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByLabel("Design title")).toBeFocused();
  await file.click();
  await menu.getByRole("menuitem", { name: "Open a .cherry file" }).click();
  await expect(page.getByRole("dialog", { name: "Create a design" }).getByRole("tab", { name: "Open a .cherry file" })).toHaveAttribute("aria-selected", "true");
});

test("Enter on a focused button activates it, not path edit, while a path is selected", async ({ page }) => {
  await newSocialPost(page);
  await drawTriangle(page);
  await page.keyboard.press("V");
  await layers(page).getByRole("button", { name: "Path", exact: true }).click();
  const file = page.getByRole("button", { name: "File", exact: true });
  await file.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await expect(page.getByText("Editing path", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // the page header and bottom bar buttons too
  await pageAction(page, "Duplicate page").focus();
  await page.keyboard.press("Enter");
  await expect(pageStrip(page).getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);
  await expect(page.getByText("Editing path", { exact: true })).toHaveCount(0);
});

test("a viewer can open every panel, but cannot insert from them", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  const viewer = await openAsViewer(browser, owner);
  for (const name of ["Templates", "Elements", "Text", "Uploads", "Brand", "Draw", "Layers"] as PanelName[]) await openPanel(viewer, name);
  await openPanel(viewer, "Templates");
  await expect(panel(viewer, "Templates").getByRole("button", { name: "Insert Brand kickoff deck" })).toBeDisabled();
  await openPanel(viewer, "Elements");
  await expect(panel(viewer, "Elements").getByRole("button", { name: "Triangle", exact: true })).toBeDisabled();
  await openPanel(viewer, "Text");
  for (const name of ["Add a heading", "Add a subheading", "Add a little body text", "Pacifico and Montserrat"]) {
    await expect(panel(viewer, "Text").getByRole("button", { name })).toBeDisabled();
  }
  await openPanel(viewer, "Uploads");
  await expect(panel(viewer, "Uploads").getByRole("button", { name: "Upload…" })).toBeDisabled();
  await openPanel(viewer, "Draw");
  await expect(panel(viewer, "Draw").getByRole("button", { name: "Pen (P)" })).toBeDisabled();
  for (const name of ["Add page", "Delete page", "Duplicate page"]) await expect(viewer.locator(".ed-phead").getByRole("button", { name })).toBeDisabled();
  await expect(viewer.getByRole("textbox", { name: "Page name" })).toBeDisabled();
  await expect(pageStrip(viewer).getByRole("button", { name: "Add page" })).toBeDisabled();
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
  await expect(panel(page, "Draw").getByRole("group", { name: "Vector tools" })).toBeVisible(); // still editing the path
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
  await addShape(page, "Rectangle");
  const half = Number(await positionValue(page, "W")) / 2;
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

test("a save rejected as invalid offers a reload to the latest version", async ({ page, context, browser }) => {
  await newSocialPost(page);
  await addPage(page);
  await expect(status(page)).toHaveText("Saved");
  // A second tab of the same user, in its own context so it can go offline alone.
  const ctx2 = await browser.newContext({ storageState: await context.storageState() });
  const other = await ctx2.newPage();
  await other.goto(page.url());
  await expect(pageThumb(other, 2)).toBeVisible();
  await expect(status(other)).toHaveText("Saved");

  // Each tab deletes a different page; merged, the design would have no pages.
  // Page actions act on the current page, so switch to it first.
  await pageThumb(page, 1).click();
  await pageThumb(other, 2).click();
  await ctx2.setOffline(true);
  await expect(status(other)).toHaveText(/^Offline/, { timeout: 15_000 });
  await pageAction(page, "Delete page").click();
  await expect(status(page)).toHaveText("Saved");
  await pageAction(other, "Delete page").click();
  await ctx2.setOffline(false);
  const reload = other.getByRole("button", { name: "Reload to get the latest version" });
  await expect(reload).toBeVisible({ timeout: 30_000 });
  await reload.click();
  await expect(pageThumb(other, 1)).toBeVisible();
  await expect(pageThumb(other, 2)).toHaveCount(0);
  await expect(other.getByLabel("Page 2 canvas")).toBeVisible(); // the page the other tab deleted is gone
  await expect(status(other)).toHaveText("Saved");
  await ctx2.close();
});

/** Places a rectangle `dx` px right of the canvas center and waits out Konva's double-click window. */
async function placeAt(page: Page, dx: number) {
  await addShape(page, "Rectangle", dx);
  await page.waitForTimeout(450);
}

test("a selected rectangle shows a usable Corner radius field", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
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
  await placeAt(page, -250);
  await placeAt(page, 250);
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Intersect" }).click();
  await expect(page.getByText("These shapes don't overlap.")).toBeVisible();
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(2);
});

test("convert to path keeps the layer", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
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
  const spacing = await popover(page, "Spacing", "Text spacing");
  for (const label of ["Line height", "Letter spacing"]) {
    await expect(spacing.getByLabel(label)).toBeVisible();
    expect((await spacing.getByLabel(label).boundingBox())!.width).toBeGreaterThanOrEqual(40);
    await spacing.getByLabel(label).fill("2");
    await spacing.getByLabel(label).press("Enter");
    await expect(spacing.getByLabel(label)).toHaveValue("2");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(450);
  await addShape(page, "Rectangle", 200, 150);
  const sw = page.getByLabel("Stroke width");
  await expect(sw).toBeVisible();
  expect((await sw.boundingBox())!.width).toBeGreaterThanOrEqual(40);
  await sw.fill("7");
  await sw.press("Enter");
  await expect(sw).toHaveValue("7");
});

async function saveSelectedShape(page: Page, name: string, share: string) {
  await page.getByRole("button", { name: "Save as custom shape" }).click();
  const dialog = page.getByRole("dialog", { name: "Save shape" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Share with").selectOption({ label: share });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to your shapes")).toBeVisible();
}

test("save a shape and drop it into another design", async ({ page }) => {
  await newSocialPost(page);
  await drawTriangle(page);
  await saveSelectedShape(page, "Peak", "Only me");

  await page.goto("/");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await openPanel(page, "Elements");
  await page.getByRole("tab", { name: "My shapes" }).click();
  await panel(page, "Elements").getByRole("button", { name: "Peak" }).click();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Peak", exact: true })).toBeVisible();
});

test("workspace shapes are shared", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  await drawTriangle(owner);
  await saveSelectedShape(owner, "Badge", "This workspace");
  const viewer = await openAsViewer(browser, owner);
  await openPanel(viewer, "Elements");
  await viewer.getByRole("tab", { name: "Workspace" }).click();
  await expect(panel(viewer, "Elements").getByRole("button", { name: "Badge", exact: true })).toBeVisible();
});

test("import an SVG into a design", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Elements");
  await page.getByLabel("Import SVG file").setInputFiles("e2e/fixtures/berry.svg");
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Imported 1", exact: true })).toBeVisible();
  await expect(layers(page).getByRole("button", { name: "Imported 2", exact: true })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(layers(page).getByRole("button", { name: /Imported/ })).toHaveCount(0);
});

test("import keeps the SVG's transforms", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Elements");
  await page.getByLabel("Import SVG file").setInputFiles("e2e/fixtures/transformed.svg");
  await showLayers(page);
  const width = async (name: string) => {
    await layers(page).getByRole("button", { name, exact: true }).click();
    return Number(await positionValue(page, "W"));
  };
  const w1 = await width("Imported 1");
  expect((await width("Imported 2")) / w1).toBeCloseTo(3, 1);
});

test("hostile SVG imports only its plain shapes", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await newSocialPost(page);
  await openPanel(page, "Elements");
  await page.getByLabel("Import SVG file").setInputFiles("e2e/fixtures/hostile.svg");
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Imported 1", exact: true })).toBeVisible();
  await expect(layers(page).getByRole("button", { name: "Imported 5", exact: true })).toBeVisible();
  await expect(layers(page).getByRole("button", { name: "Imported 6", exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  expect(requests.filter((u) => u.includes("example.invalid"))).toEqual([]);
});

test("too-large file is refused", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Elements");
  const body = '<rect width="1" height="1"/>'.repeat(Math.ceil(1_100_000 / 27));
  await page.getByLabel("Import SVG file").setInputFiles({
    name: "big.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`),
  });
  await expect(page.getByRole("alert").filter({ hasText: "That file is too large (1 MB max)." })).toBeVisible();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: /Imported/ })).toHaveCount(0);
});

/** Seeds a visual through the API; returns its id. */
async function seedVisual(page: Page, title: string, visibility: "private" | "workspace") {
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post("/api/assets", {
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: uniquePng() },
      title, tags: "", license: "cc0", attribution: "", visibility, workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).asset.id as string;
}
const visualsPanel = (page: Page) => panel(page, "Uploads");
const fileUrl = (id: string) => new RegExp(`/api/assets/${id}/file$`);

test("insert a visual into a design", async ({ page }) => {
  await newSocialPost(page);
  const id = await seedVisual(page, "Dot", "workspace");
  await openPanel(page, "Uploads");
  await visualsPanel(page).getByRole("button", { name: "Workspace", exact: true }).click();
  const loaded = page.waitForResponse((r) => fileUrl(id).test(r.url()));
  await visualsPanel(page).getByRole("button", { name: "Dot" }).click();
  expect((await loaded).status()).toBe(200);
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();
  const info = await popover(page, "Info", "Image info");
  await expect(info.getByText("CC0", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(info).toHaveCount(0);
  await expect(toolbar(page).getByRole("button", { name: "Info" })).toBeFocused();
  await expect(status(page)).toHaveText("Saved");

  await page.keyboard.press("Control+Z");
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();
  await expect(status(page)).toHaveText("Saved");

  const again = page.waitForResponse((r) => fileUrl(id).test(r.url()) && r.status() === 200);
  await page.reload();
  await again;
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();
});

test("a teammate sees a private visual used in the design", async ({ page, browser }) => {
  await newSocialPost(page);
  const id = await seedVisual(page, "Secret dot", "private");
  await openPanel(page, "Uploads");
  await visualsPanel(page).getByRole("button", { name: "Mine", exact: true }).click();
  const linked = page.waitForResponse((r) => r.url().includes("/assets") && r.url().includes("/api/designs/") && r.request().method() === "POST");
  await visualsPanel(page).getByRole("button", { name: "Secret dot" }).click();
  expect((await linked).ok()).toBe(true);
  await expect(status(page)).toHaveText("Saved");

  const viewer = await openAsViewer(browser, page);
  const seen = viewer.waitForResponse((r) => fileUrl(id).test(r.url()));
  await viewer.reload();
  expect((await seen).status()).toBe(200);
  await expect(layers(viewer).getByRole("button", { name: "Secret dot", exact: true })).toBeVisible();
});

test("a failed link adds no layer and leaves nothing to redo", async ({ page }) => {
  await newSocialPost(page);
  await seedVisual(page, "Unlinked dot", "workspace");
  await page.route("**/api/designs/*/assets", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"server_error"}' }));
  await openPanel(page, "Uploads");
  await visualsPanel(page).getByRole("button", { name: "Workspace", exact: true }).click();
  await visualsPanel(page).getByRole("button", { name: "Unlinked dot" }).click();
  await expect(visualsPanel(page).getByRole("alert")).toHaveText("Couldn't link this visual to the design. Try again.");
  await showLayers(page);
  const layer = layers(page).getByRole("button", { name: "Unlinked dot", exact: true });
  await expect(layer).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(layer).toHaveCount(0);
});

test("a missing visual shows a placeholder, not a crash", async ({ page }) => {
  await newSocialPost(page);
  await seedVisual(page, "Gone dot", "workspace");
  await page.route("**/api/assets/*/file", (r) => r.fulfill({ status: 404, body: "" }));
  await openPanel(page, "Uploads");
  await visualsPanel(page).getByRole("button", { name: "Workspace", exact: true }).click();
  await visualsPanel(page).getByRole("button", { name: "Gone dot" }).click();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Gone dot", exact: true })).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
  await page.reload();
  const layer = layers(page).getByRole("button", { name: "Gone dot", exact: true });
  await layer.click();
  await expect((await popover(page, "Info", "Image info")).getByRole("heading", { name: "Image" })).toBeVisible();
});

test("upload from the editor", async ({ page }) => {
  await newSocialPost(page);
  await openPanel(page, "Uploads");
  await visualsPanel(page).getByRole("button", { name: "Upload…" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload visuals" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "dot2.png", mimeType: "image/png", buffer: uniquePng() });
  await expect(dialog.getByText("Ready", { exact: true })).toBeVisible();
  await dialog.getByLabel("License", { exact: true }).selectOption({ label: "CC0 · public domain" });
  await dialog.getByLabel(/I created this/).check();
  await dialog.getByRole("button", { name: "Add 1 visual" }).click();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Dot2", exact: true })).toBeVisible();
});

/** Places a text layer saying `text` at the canvas centre and leaves it selected. */
async function placeText(page: Page, text: string) {
  await addShape(page, "Text");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  await layers(page).getByRole("button", { name: text, exact: true }).click();
}

test("the toolbar edits a selected text, and undo reverts each change", async ({ page }) => {
  await newSocialPost(page);
  await placeText(page, "Hello");
  const bar = toolbar(page);
  for (const name of ["Bold", "Text colour", "Align text left", "Align text center", "Align text right", "Position", "Spacing"]) {
    await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const font = bar.getByRole("combobox", { name: "Font" });
  const size = bar.getByLabel("Size", { exact: true });
  const bold = bar.getByRole("button", { name: "Bold" });
  const center = bar.getByRole("button", { name: "Align text center" });
  const colour = bar.getByRole("button", { name: "Text colour" });
  const size0 = await size.inputValue();
  const colour0 = await colour.getAttribute("title");

  await font.selectOption("Lora");
  await bar.getByRole("button", { name: "Increase font size" }).click();
  await expect(size).toHaveValue(String(Number(size0) + 1));
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await center.click();
  await expect(center).toHaveAttribute("aria-pressed", "true");
  const pop = await popover(page, "Text colour");
  await pop.getByRole("group", { name: "Palette" }).getByRole("button", { name: "#C654C3" }).click();
  await page.keyboard.press("Escape");
  await expect(colour).toHaveAttribute("title", "Text colour: #C654C3");
  await expect(status(page)).toHaveText("Saved");

  await page.keyboard.press("Control+Z");
  await expect(colour).toHaveAttribute("title", colour0!);
  await page.keyboard.press("Control+Z");
  await expect(center).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+Z");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+Z");
  await expect(size).toHaveValue(size0);
  await page.keyboard.press("Control+Z");
  await expect(font).toHaveValue("Inter");

  // Bold uses the weights the family has: Pacifico has only 400.
  await font.selectOption("Pacifico");
  await expect(bold).toBeDisabled();
});

test("typing in the Size field does not trigger tool shortcuts", async ({ page }) => {
  await newSocialPost(page);
  await placeText(page, "Hi");
  const size = toolbar(page).getByLabel("Size", { exact: true });
  await size.fill("");
  await page.keyboard.type("r");
  await expect(size).toHaveValue("r");
  await page.keyboard.press("Escape"); // drops the draft
  await expect(size).not.toHaveValue("r");
  const box = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + 40); // an armed rectangle tool would draw here
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(0);
});

test("shape, multi-selection and nothing-selected toolbars", async ({ page }) => {
  await newSocialPost(page);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  expect((await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Bar kit", content: {
    colors: [{ id: "a", name: "Berry", role: "primary", hex: "#8E1EA2" }],
    typography: {
      heading: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 32, lineHeight: 1.1 },
      subheading: { fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 20, lineHeight: 1.2 },
      body: { fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: 1.5 },
    },
    logos: { primary: null, onDark: null, mark: null, wordmark: null },
    rules: { kitColorsOnly: false, warnOffBrandFonts: false, lockLogos: false, flagContrast: false, requireApproval: false },
  } } })).status()).toBe(201);
  await page.reload();
  await editorReady(page);
  const bar = toolbar(page);
  const header = page.locator(".ed-phead");

  // Nothing selected: background, page size, colour mode and the brand kit.
  await expect(bar.getByRole("button", { name: "Background colour" })).toBeVisible();
  await expect(bar.getByRole("combobox", { name: "Colour mode" })).toHaveValue("rgb");
  await expect(bar.getByRole("combobox", { name: "Brand kit" })).toBeVisible();
  const width = bar.getByLabel("Page width");
  await width.fill("1200");
  await width.press("Enter");
  await expect(header).toContainText("1200 × 1080 px");
  const mode = bar.getByRole("combobox", { name: "Colour mode" });
  await mode.selectOption("cmyk");
  await expect(status(page)).toHaveText("Saved");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // so undo is the editor's
  await page.keyboard.press("Control+Z");
  await expect(mode).toHaveValue("rgb");
  await page.keyboard.press("Control+Z");
  await expect(header).toContainText("1080 × 1080 px");

  // File > Page size and colour mode clears the selection and focuses the page size.
  await addShape(page, "Rectangle", -60);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "Page size and colour mode" }).click();
  await expect(bar.getByLabel("Page width")).toBeFocused();

  // A rectangle: fill, stroke and corner radius.
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).click();
  for (const name of ["Fill", "Stroke"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(bar.getByLabel("Corner radius")).toBeVisible();
  await expect(selectionMenu(page).getByRole("button", { name: "Duplicate" })).toBeVisible();

  // Two shapes: combine, group, and distribute in Position.
  await page.waitForTimeout(450);
  await addShape(page, "Rectangle", 60);
  await page.keyboard.press("Control+A");
  await expect(bar.getByRole("button", { name: "Union" })).toBeVisible();
  const pos = await position(page);
  await expect(pos.getByRole("button", { name: "Distribute H" })).toBeVisible();
  await page.keyboard.press("Escape");
  await bar.getByRole("button", { name: "Group", exact: true }).click();
  await expect(layers(page).getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Ungroup" })).toBeVisible();
  await selectionMenu(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Ungroup" }).click();
  await expect(layers(page).getByRole("button", { name: "Group", exact: true })).toHaveCount(0);
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(2);

  // Copy and Paste from the selection menu.
  await layers(page).getByRole("button", { name: "Rectangle", exact: true }).first().click();
  await selectionMenu(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Copy" }).click();
  await selectionMenu(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Paste" }).click();
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(3);
});

test("the colour popover offers swatches, a picker and a hex field, and rejects a bad hex", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  const fill = toolbar(page).getByRole("button", { name: "Fill", exact: true });
  const pop = await popover(page, "Fill", "Fill colour");
  for (const name of ["Document", "Palette"]) await expect(pop.getByRole("group", { name })).toBeVisible();
  await expect(pop.getByRole("group", { name: "Palette" }).getByRole("button")).toHaveCount(9);
  await expect(pop.getByLabel("Custom colour")).toHaveAttribute("type", "color");
  const hex = pop.getByLabel("Hex");
  const before = await fill.getAttribute("title");
  await hex.fill("#12345");
  await hex.press("Enter");
  await expect(pop.getByRole("alert")).toHaveText("Use six hex digits, like #8E1EA2.");
  await expect(fill).toHaveAttribute("title", before!);
  await hex.fill("ffc0de");
  await hex.press("Enter");
  await expect(fill).toHaveAttribute("title", "Fill: #FFC0DE");
  await expect(pop.getByRole("alert")).toHaveCount(0);
  const swatch = pop.getByRole("group", { name: "Palette" }).getByRole("button").first();
  expect((await swatch.boundingBox())!.width).toBeGreaterThanOrEqual(34);
});

test("every toolbar popover opens with Enter, closes with Escape and returns focus", async ({ page }) => {
  await newSocialPost(page);
  const check = async (button: string, dialog: string) => {
    const b = toolbar(page).getByRole("button", { name: button, exact: true });
    await b.focus();
    await page.keyboard.press("Enter");
    const d = page.getByRole("dialog", { name: dialog, exact: true });
    await expect(d).toBeVisible();
    await expect(d.locator(":focus")).toHaveCount(1); // focus moved in
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(b).toBeFocused();
  };
  await check("Background colour", "Background colour");
  await placeText(page, "Pop");
  for (const [b, d] of [["Text colour", "Text colour"], ["Spacing", "Text spacing"], ["Position", "Position"]]) await check(b!, d!);
  await page.keyboard.press("Escape"); // deselect
  await page.waitForTimeout(450);
  await addShape(page, "Rectangle", 0, 150);
  for (const [b, d] of [["Fill", "Fill colour"], ["Stroke", "Stroke colour"], ["Position", "Position"]]) await check(b!, d!);
  await expect(page.getByRole("complementary", { name: "Properties" })).toHaveCount(0);
});

test("the canvas takes the old properties column's width", async ({ page }) => {
  await newSocialPost(page);
  const vw = page.viewportSize()!.width;
  const stage = (await page.getByLabel("Page 1 canvas").boundingBox())!;
  expect(stage.width).toBeGreaterThanOrEqual(vw - 72 - 320 - 40);
});

test("a viewer gets no editing controls in the toolbar or a selection menu", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await newSocialPost(owner);
  await placeText(owner, "Look");
  await expect(status(owner)).toHaveText("Saved");
  const viewer = await openAsViewer(browser, owner);
  await expect(toolbar(viewer)).toContainText("1080 × 1080 px · RGB");
  await layers(viewer).getByRole("button", { name: "Look", exact: true }).click();
  await expect(toolbar(viewer).getByRole("combobox")).toHaveCount(0);
  await expect(toolbar(viewer).getByRole("textbox")).toHaveCount(0);
  await expect(toolbar(viewer).getByRole("button")).toHaveCount(0);
  await expect(selectionMenu(viewer)).toHaveCount(0);
});

test("at 1280 x 800 with a panel open, every text toolbar control is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newSocialPost(page);
  await expect(panel(page, "Layers")).toBeVisible();
  await placeText(page, "Reach");
  // The bar scrolls sideways within itself: every control can be scrolled fully into view, the page never scrolls.
  const bar = toolbar(page);
  for (const c of await bar.locator("button, select, input").all()) {
    await c.scrollIntoViewIfNeeded();
    await expect(c).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // A mouse wheel over the bar scrolls it too.
  await bar.evaluate((e) => { e.scrollLeft = 0; });
  const b = (await bar.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, 2000);
  const lock = bar.getByLabel("Brand lock");
  await expect(lock).toBeInViewport({ ratio: 1 });
  await lock.selectOption({ label: "Fixed" });
  await expect(lock).toHaveValue("fixed");
  await expect(status(page)).toHaveText("Saved");
});

test("Escape cancels popover input drafts without committing and clears stale hex errors", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  const bar = toolbar(page);
  await bar.getByRole("button", { name: "Position", exact: true }).click();
  const posDlg = page.getByRole("dialog", { name: "Position", exact: true });
  const xInput = posDlg.getByLabel("X", { exact: true });
  const beforeX = await xInput.inputValue();
  await xInput.fill("999");
  await page.keyboard.press("Escape");
  await expect(posDlg).toHaveCount(0);
  await bar.getByRole("button", { name: "Position", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Position", exact: true }).getByLabel("X", { exact: true })).toHaveValue(beforeX);
  await page.keyboard.press("Escape");

  await bar.getByRole("button", { name: "Fill", exact: true }).click();
  const fillDlg = page.getByRole("dialog", { name: "Fill colour", exact: true });
  await fillDlg.getByLabel("Hex").fill("#ZZZZZZ");
  await fillDlg.getByLabel("Hex").press("Enter");
  await expect(fillDlg.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await bar.getByRole("button", { name: "Fill", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Fill colour", exact: true }).getByRole("alert")).toHaveCount(0);
});

test("global editor shortcuts do not fire while a modal dialog is open", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  const grid = page.getByRole("dialog", { name: "All pages", exact: true });
  await expect(grid).toBeVisible();
  await grid.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Delete");
  await expect(grid).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grid).toHaveCount(0);
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(1);
});
