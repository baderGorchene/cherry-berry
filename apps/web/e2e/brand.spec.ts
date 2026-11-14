import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, openAsEditor, signUp, unique, uniquePng } from "./helpers";

async function startKit(page: Page, name = "North Studio brand") {
  await signUp(page, unique("brand"));
  await createWorkspace(page, "Brand Studio");
  await page.goto("/brand");
  await expect(page.getByText("No brand kit yet.")).toBeVisible();
  page.once("dialog", (d) => void d.accept(name));
  await page.getByRole("button", { name: "Create a brand kit" }).click();
  await expect(page.getByLabel("Brand kit", { exact: true })).toContainText(name);
}

async function addColor(page: Page, name: string, hex: string, role = "primary") {
  await page.getByRole("button", { name: "+ Add color" }).click();
  await page.getByLabel("Color name").fill(name);
  await page.getByLabel("Color role").selectOption(role);
  await page.getByLabel("Hex", { exact: true }).fill(hex);
  await page.getByRole("button", { name: "Save color" }).click();
}

test("admin builds a kit", async ({ page }) => {
  await startKit(page);
  await addColor(page, "Berry", "#8E1EA2");
  await expect(page.getByText("AAA text")).toBeVisible();
  await addColor(page, "Petal", "#FFC0DE", "surface");
  await expect(page.getByText("Background only")).toBeVisible();
  await page.getByLabel("Heading font", { exact: true }).selectOption("Georgia");
  const sw = page.getByRole("switch", { name: "Lock logos" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Berry · Primary")).toBeVisible();
  await expect(page.getByText("Petal · Surface")).toBeVisible();
  await expect(page.getByText("#8E1EA2", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Heading font", { exact: true })).toHaveValue("Georgia");
  await expect(page.getByRole("switch", { name: "Lock logos" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Flag low contrast" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Publish a design as a brand template from the editor.")).toBeVisible();
});

test("uploads a font and a logo", async ({ page }) => {
  await startKit(page);
  await page.getByRole("button", { name: "Upload font" }).click();
  await page.getByLabel("Font file").setInputFiles({
    name: "Fraunces-Regular.woff2", mimeType: "font/woff2", buffer: Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(64)]),
  });
  await expect(page.getByLabel("Family", { exact: true })).toHaveValue("Fraunces-Regular");
  await page.getByLabel("Family", { exact: true }).fill("Fraunces");
  await page.getByLabel("I have the right to use this font in this workspace.").check();
  await page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Heading font", { exact: true }).locator("option", { hasText: "Fraunces" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Remove Fraunces" })).toBeVisible();

  const slot = page.getByTestId("slot-primary");
  page.once("dialog", (d) => { expect(d.message()).toBe("Only upload a logo your organisation owns. Continue?"); void d.accept(); });
  const chooser = page.waitForEvent("filechooser");
  await slot.getByRole("button", { name: /Primary/ }).click();
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: uniquePng() });
  await expect(slot.getByRole("img", { name: "Primary logo" })).toBeVisible();
  await expect(slot.getByRole("button", { name: "Replace" })).toBeVisible();

  await page.reload();
  await expect(slot.getByRole("img", { name: "Primary logo" })).toBeVisible();
  await slot.getByRole("button", { name: "Remove" }).click();
  await expect(slot.getByRole("img")).toHaveCount(0);
  await expect(slot.getByRole("button", { name: /Primary/ })).toBeVisible();
});

test("download and import a kit file", async ({ page }) => {
  await startKit(page);
  await addColor(page, "Berry", "#8E1EA2");
  await addColor(page, "Ink", "#22142A", "text");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download kit" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe("North Studio brand.cherrykit.json");
  const path = await download.path();

  await page.getByLabel("Import kit").setInputFiles(path);
  await expect(page.getByLabel("Brand kit", { exact: true }).locator("option")).toHaveCount(2);
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const { kits } = await (await page.request.get(`/api/workspaces/${workspaces[0].id}/brand-kits`)).json();
  expect(kits).toHaveLength(2);
  expect(kits[1].content.colors).toEqual(kits[0].content.colors);
  expect(kits[1].content.colors).toHaveLength(2);

  const bad = Buffer.from(await readFile(path)).toString().replace("cherry-kit", "nope");
  await page.getByLabel("Import kit").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(bad) });
  await expect(page.getByRole("alert")).toHaveText("That file isn't a Cherry Berry kit.");
});

test("editor sees the kit read-only", async ({ page, browser }) => {
  await startKit(page);
  await addColor(page, "Berry", "#8E1EA2");
  const editor = await openAsEditor(browser, page);
  await editor.goto("/brand");
  await expect(editor.getByText("Berry · Primary")).toBeVisible();
  await expect(editor.getByRole("button", { name: "+ Add color" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "+ New brand kit" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Upload font" })).toHaveCount(0);
  for (const n of ["Only allow kit colors", "Lock logos", "Require approval"]) await expect(editor.getByRole("switch", { name: n })).toBeDisabled();
});
