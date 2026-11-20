import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, newDesign, openPanel, panel as railPanel, popover, railButton, signUp, toolbar, unique } from "./helpers";

const content = (colors: [string, string, string, string][], rules: Record<string, boolean> = {}) => ({
  colors: colors.map(([id, name, role, hex]) => ({ id, name, role, hex })),
  typography: {
    heading: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 32, lineHeight: 1.1 },
    subheading: { fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 20, lineHeight: 1.2 },
    body: { fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: 1.5 },
  },
  logos: { primary: null, onDark: null, mark: null, wordmark: null },
  rules: { kitColorsOnly: true, warnOffBrandFonts: true, lockLogos: true, flagContrast: true, requireApproval: false, ...rules },
});

/** A signed-in editor on a new social post, plus a kit in its workspace (created through the API). */
async function start(page: Page, colors: [string, string, string, string][], rules?: Record<string, boolean>) {
  await signUp(page, unique("be"));
  await createWorkspace(page, "Brand Editor Lab");
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Lab kit", content: content(colors, rules) } });
  expect(res.status()).toBe(201);
  const { kit } = await res.json();
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
  return kit.id as string;
}

const brandTab = (page: Page) => railButton(page, "Brand");
const showBrand = (page: Page) => openPanel(page, "Brand");
const panel = (page: Page) => railPanel(page, "Brand");
const layers = (page: Page) => railPanel(page, "Layers");

async function link(page: Page) {
  await showBrand(page);
  await panel(page).getByLabel("Link a brand kit").selectOption({ label: "Lab kit" });
  await expect(panel(page).getByRole("heading", { name: "Colors" })).toBeVisible();
}

const COLORS: [string, string, string, string][] = [["a", "Berry", "primary", "#8E1EA2"], ["b", "Ink", "text", "#22142A"], ["c", "Petal", "surface", "#FFC0DE"]];

test("links a kit and applies its styles", async ({ page }) => {
  await start(page, COLORS);
  await showBrand(page);
  await expect(panel(page).getByText("This design isn't linked to a brand kit.")).toBeVisible();
  await link(page);

  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await openPanel(page, "Layers");
  await expect(layers(page).getByRole("button", { name: "Heading", exact: true })).toBeVisible();

  await addShape(page, "Rectangle");
  await showBrand(page);
  await panel(page).getByRole("button", { name: "Ink" }).click();
  await expect(toolbar(page).getByRole("button", { name: "Fill", exact: true })).toHaveAttribute("title", "Fill: #22142A");
});

test("flags low contrast and off-brand fonts", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await expect(panel(page).getByText("No brand issues on this page.")).toBeVisible();
  await panel(page).getByRole("button", { name: "Body", exact: true }).click();
  await panel(page).getByRole("button", { name: "Petal" }).click();
  await expect(brandTab(page)).toHaveAccessibleName("Brand, 1 issue");
  const issue = panel(page).getByRole("button", { name: /Contrast/ });
  await expect(issue).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(toolbar(page).getByRole("button", { name: "Background colour" })).toBeVisible();
  await issue.click();
  await expect(toolbar(page).getByRole("combobox", { name: "Font" })).toBeVisible();

  await toolbar(page).getByRole("combobox", { name: "Font" }).selectOption("Georgia");
  await expect(panel(page).getByRole("button", { name: /Georgia is not a brand font/ })).toBeVisible();
  await expect(brandTab(page)).toHaveAccessibleName("Brand, 2 issues");
});

test("kit colors only replaces the picker", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await addShape(page, "Rectangle");
  const fill = await popover(page, "Fill", "Fill colour");
  await expect(fill.getByRole("group", { name: "Brand kit" }).getByRole("button", { name: "Berry" })).toBeVisible();
  await expect(fill.getByRole("group", { name: "Palette" })).toHaveCount(0);
  await expect(fill.locator("input[type=color]")).toHaveCount(0);
});

test("kit deleted while linked", async ({ page }) => {
  const kitId = await start(page, COLORS);
  await link(page);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Other kit", content: content([]) } });
  expect((await page.request.delete(`/api/brand-kits/${kitId}`)).ok()).toBe(true);
  await page.reload();
  await editorReady(page);
  await showBrand(page);
  await expect(panel(page).getByText("This design isn't linked to a brand kit.")).toBeVisible();
  await expect(panel(page).getByLabel("Link a brand kit")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a locked text layer is left alone by text styles and colors", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await openPanel(page, "Layers");
  await layers(page).getByRole("button", { name: "Lock Heading" }).click();
  await showBrand(page);
  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await expect(panel(page).getByText("Selected layers are locked")).toBeVisible();
  await panel(page).getByRole("button", { name: "Berry" }).click();
  await expect(panel(page).getByText("Selected layers are locked")).toBeVisible();
  await openPanel(page, "Layers");
  await expect(layers(page).getByRole("button", { name: "Heading", exact: true })).toHaveCount(1);
});

test("uploads a font from the font picker and lists this computer's fonts", async ({ page }) => {
  // A stand-in for the Local Font Access API (Chromium only shows its permission prompt to a real user).
  await page.addInitScript(() => {
    (window as unknown as { queryLocalFonts(): Promise<{ family: string }[]> }).queryLocalFonts =
      async () => [{ family: "Desk Serif" }, { family: "Desk Serif" }, { family: "Arial" }];
  });
  await start(page, COLORS);
  await link(page);
  await panel(page).getByRole("button", { name: "Body", exact: true }).click();
  const font = toolbar(page).getByRole("combobox", { name: "Font" });
  await expect(font).toBeVisible();

  const fonts = await popover(page, "Fonts", "Add fonts");
  await fonts.getByRole("button", { name: /Upload a font/ }).click();
  // A real WOFF2 (not just the magic bytes), so the browser has to load it.
  const require = createRequire(import.meta.url);
  const pkg = dirname(require.resolve("@fontsource/pacifico", { paths: [resolve("../server")] }));
  await page.getByLabel("Font file").setInputFiles({ name: "Brand Script.woff2", mimeType: "", buffer: readFileSync(join(pkg, "files/pacifico-latin-400-normal.woff2")) });
  await expect(page.getByLabel("Family", { exact: true })).toHaveValue("Brand Script");
  await page.getByLabel("I have the right to use this font in this workspace.").check();
  await page.getByRole("dialog", { name: "Upload font" }).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Upload font" })).toHaveCount(0);
  await expect(font).toHaveValue("Brand Script");
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Brand Script" && f.status === "loaded"))).toBe(true);

  const again = await popover(page, "Fonts", "Add fonts");
  await again.getByRole("button", { name: "Show fonts on this computer" }).click();
  await expect(again.getByText("Added 1 font from this computer to the font list.")).toBeVisible();
  await expect(font.locator("optgroup[label='On this computer'] option")).toHaveText(["Desk Serif"]);
  await font.selectOption("Desk Serif");
  await expect(font).toHaveValue("Desk Serif");
});
