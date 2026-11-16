import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { addShape, createWorkspace, editorReady, signUp, unique, uniquePng, newDesign } from "./helpers";

async function newSocialPost(page: Page) {
  await signUp(page, unique("exp"));
  await createWorkspace(page, "Export Lab");
  await newDesign(page, "Social post");
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await editorReady(page);
}

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const dialog = (page: Page) => page.getByRole("dialog", { name: /^Export/ });
const saved = (page: Page) => expect(page.getByText("Saved", { exact: true })).toBeVisible();
const bytes = async (d: Download) => readFileSync((await d.path())!);

async function exportAs(page: Page, format: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await dialog(page).getByRole("radio", { name: new RegExp(`^${format}`) }).check();
}

async function download(page: Page, label: string) {
  const started = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: `Export ${label}`, exact: true }).click();
  return started;
}

test("exports a png", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  await expect(layers(page).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  await saved(page);
  await exportAs(page, "PNG");
  const file = await download(page, "PNG");
  expect(file.suggestedFilename()).toBe("Untitled design.png");
  expect([...(await bytes(file)).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("exports a print pdf with a bleed warning", async ({ page }) => {
  await newSocialPost(page);
  await saved(page);
  await exportAs(page, "PDF · Print");
  await expect(dialog(page).getByText("No bleed", { exact: true })).toBeVisible();
  await expect(dialog(page).getByText("CMYK and PDF/X come with the print service; spot swatches aren't supported yet.").first()).toBeVisible();
  const file = await download(page, "PDF · Print");
  expect((await bytes(file)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("exports .cherry offline", async ({ page, context }) => {
  await newSocialPost(page);
  await addShape(page, "Rectangle");
  await saved(page);
  await context.setOffline(true);
  await expect(page.getByText("Offline — retrying")).toBeVisible();
  await exportAs(page, ".cherry");
  await expect(dialog(page).getByRole("radio", { name: /^PNG/ })).toBeVisible();
  const file = await download(page, ".cherry");
  expect(file.suggestedFilename()).toBe("Untitled design.cherry");
  const doc = JSON.parse((await bytes(file)).toString());
  expect(doc.format).toBe("cherry");
  expect(doc.pages[0].nodes).toHaveLength(1);
  await context.setOffline(false);
});

test("png waits for a connection", async ({ page, context }) => {
  await newSocialPost(page);
  await saved(page);
  await context.setOffline(true);
  await expect(page.getByText("Offline — retrying")).toBeVisible();
  await exportAs(page, "PNG");
  await expect(dialog(page).getByText("Export needs a connection.")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Export PNG", exact: true })).toBeDisabled();
  await context.setOffline(false);
});

test("custom range must be valid", async ({ page }) => {
  await newSocialPost(page);
  await saved(page);
  await exportAs(page, "PNG");
  await dialog(page).getByRole("radio", { name: "Custom range" }).check();
  await dialog(page).getByLabel("Page range").fill("2");
  await expect(dialog(page).getByText("Enter pages like 1-3, 5")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Export PNG", exact: true })).toBeDisabled();
  await dialog(page).getByLabel("Page range").fill("1");
  await expect(dialog(page).getByRole("button", { name: "Export PNG", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("credits for a cc-by visual", async ({ page }) => {
  await newSocialPost(page);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post("/api/assets", {
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: uniquePng() },
      title: "Dot", tags: "", license: "cc-by", attribution: "Ann Berry", visibility: "workspace", workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
  await page.getByRole("button", { name: "Visuals" }).click();
  const visuals = page.getByRole("complementary", { name: "Visuals panel" });
  await visuals.getByRole("button", { name: "Workspace", exact: true }).click();
  await visuals.getByRole("button", { name: "Dot" }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();
  await saved(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog(page).getByLabel("Credits")).toHaveValue('"Dot" by Ann Berry, CC BY 4.0');
  await expect(dialog(page).getByRole("button", { name: "Copy credits" })).toBeVisible();
});

test("show on page selects the offending layer", async ({ page }) => {
  await newSocialPost(page);
  await addShape(page, "Text");
  await expect(page.getByLabel("Edit text")).toBeFocused();
  await page.keyboard.type("Hello");
  await page.keyboard.press("Escape");
  const layer = layers(page).getByRole("button", { name: "Hello", exact: true });
  await expect(layer).toBeVisible();
  await layer.click();
  await page.getByRole("complementary", { name: "Properties" }).getByRole("combobox", { name: "Font" }).selectOption("Georgia");
  await saved(page);
  await page.keyboard.press("Escape");
  await expect(layer).toHaveAttribute("aria-pressed", "false");

  await exportAs(page, "PNG");
  await expect(dialog(page).getByText("Georgia isn't on this server, so it will be replaced.")).toBeVisible();
  await expect(dialog(page).getByText("1 warning", { exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Show on page" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(layer).toHaveAttribute("aria-pressed", "true");
});

test("export dialog offers PDF/X and plates when the server has print", async ({ page }) => {
  await page.route("**/api/designs/*/export/info", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), print: true } });
  });
  await newSocialPost(page);
  await saved(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog(page).getByRole("radio", { name: /^PDF\/X \(CMYK, for print\)/ })).toBeVisible();
  await expect(dialog(page).getByRole("radio", { name: /^Colour plates \(PNG per ink\)/ })).toBeVisible();
});
