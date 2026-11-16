import { expect, test, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, signUp, unique } from "./helpers";

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
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
  return kit.id as string;
}

const brandTab = (page: Page) => page.getByRole("tab", { name: /^Brand/ });
const panel = (page: Page) => page.getByRole("complementary", { name: "Brand panel" });
const props = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });

async function link(page: Page) {
  await brandTab(page).click();
  await panel(page).getByLabel("Link a brand kit").selectOption({ label: "Lab kit" });
  await expect(panel(page).getByRole("heading", { name: "Colors" })).toBeVisible();
}

const COLORS: [string, string, string, string][] = [["a", "Berry", "primary", "#8E1EA2"], ["b", "Ink", "text", "#22142A"], ["c", "Petal", "surface", "#FFC0DE"]];

test("links a kit and applies its styles", async ({ page }) => {
  await start(page, COLORS);
  await brandTab(page).click();
  await expect(panel(page).getByText("This design isn't linked to a brand kit.")).toBeVisible();
  await link(page);

  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(layers(page).getByRole("button", { name: "Heading", exact: true })).toBeVisible();

  await addShape(page, "Rectangle");
  await brandTab(page).click();
  await panel(page).getByRole("button", { name: "Ink" }).click();
  await expect(props(page).getByText("#22142A", { exact: true })).toBeVisible();
});

test("flags low contrast and off-brand fonts", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await expect(panel(page).getByText("No brand issues on this page.")).toBeVisible();
  await panel(page).getByRole("button", { name: "Body", exact: true }).click();
  await panel(page).getByRole("button", { name: "Petal" }).click();
  await expect(brandTab(page)).toHaveText("Brand (1)");
  const issue = panel(page).getByRole("button", { name: /Contrast/ });
  await expect(issue).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(props(page).getByRole("heading", { name: "Page", exact: true })).toBeVisible();
  await issue.click();
  await expect(props(page).getByRole("heading", { name: "Text", exact: true })).toBeVisible();

  await props(page).getByRole("combobox", { name: "Font" }).selectOption("Georgia");
  await expect(panel(page).getByRole("button", { name: /Georgia is not a brand font/ })).toBeVisible();
  await expect(brandTab(page)).toHaveText("Brand (2)");
});

test("kit colors only replaces the picker", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await addShape(page, "Rectangle");
  await expect(props(page).getByRole("button", { name: "Berry" }).first()).toBeVisible();
  await expect(props(page).locator("input[type=color]")).toHaveCount(0);
});

test("kit deleted while linked", async ({ page }) => {
  const kitId = await start(page, COLORS);
  await link(page);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  await page.request.post(`/api/workspaces/${workspaces[0].id}/brand-kits`, { data: { name: "Other kit", content: content([]) } });
  expect((await page.request.delete(`/api/brand-kits/${kitId}`)).ok()).toBe(true);
  await page.reload();
  await editorReady(page);
  await brandTab(page).click();
  await expect(panel(page).getByText("This design isn't linked to a brand kit.")).toBeVisible();
  await expect(panel(page).getByLabel("Link a brand kit")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a locked text layer is left alone by text styles and colors", async ({ page }) => {
  await start(page, COLORS);
  await link(page);
  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await layers(page).getByRole("button", { name: "Lock Heading" }).click();
  await brandTab(page).click();
  await panel(page).getByRole("button", { name: "Heading", exact: true }).click();
  await expect(panel(page).getByText("Selected layers are locked")).toBeVisible();
  await panel(page).getByRole("button", { name: "Berry" }).click();
  await expect(panel(page).getByText("Selected layers are locked")).toBeVisible();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(layers(page).getByRole("button", { name: "Heading", exact: true })).toHaveCount(1);
});
