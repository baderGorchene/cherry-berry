import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, openAsEditor, signUp, unique, uniquePng } from "./helpers";

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const props = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const canvas = (page: Page) => page.getByLabel("Page 1 canvas");
const showLayers = (page: Page) => page.getByRole("tab", { name: "Layers", exact: true }).click();

async function place(page: Page, tool: string, dx = 0, dy = 0) {
  await page.getByRole("button", { name: tool }).click();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function seedVisual(page: Page, title: string) {
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post("/api/assets", {
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: uniquePng() },
      title, tags: "", license: "cc0", attribution: "", visibility: "workspace", workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
}

const setLock = async (page: Page, layer: string, value: string) => {
  await layers(page).getByRole("button", { name: layer, exact: true }).click();
  await props(page).getByLabel("Brand lock").selectOption({ label: value });
  await expect(page.getByRole("status")).toHaveText("Saved");
};

test("editors can't move, delete or select brand-locked layers", async ({ page, browser }) => {
  await signUp(page, unique("bl"));
  await createWorkspace(page, "Lock Lab");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();

  await place(page, "Rectangle (R)", -200, 0);
  await place(page, "Text (T)", 200, 150);
  await page.keyboard.type("Hello");
  await page.keyboard.press("Escape");
  await seedVisual(page, "Dot");
  await seedVisual(page, "Dash");
  await page.getByRole("button", { name: "Visuals" }).click();
  await page.getByRole("complementary", { name: "Visuals panel" }).getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("complementary", { name: "Visuals panel" }).getByRole("button", { name: "Dot" }).click();
  await showLayers(page);
  await expect(layers(page).getByRole("button", { name: "Dot", exact: true })).toBeVisible();

  await setLock(page, "Rectangle", "Fixed");
  await setLock(page, "Hello", "Content editable");
  await setLock(page, "Dot", "Content editable");
  const url = page.url();

  const editor = await openAsEditor(browser, page);
  await editor.goto(url);
  await expect(editor.getByRole("button", { name: "Rectangle (R)" })).toBeEnabled();
  await expect(layers(editor).getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();
  await expect(layers(editor).getByRole("button", { name: "Lock Rectangle" })).toBeDisabled();
  await expect(layers(editor).getByRole("button", { name: "Lock Rectangle" })).toHaveAttribute("title", "Locked by the brand template");
  await expect(layers(editor).getByText("Brand", { exact: true })).toHaveCount(3);

  // Fixed: a click on the rectangle doesn't select it.
  const box = (await canvas(editor).boundingBox())!;
  await editor.mouse.click(box.x + box.width / 2 - 200, box.y + box.height / 2);
  await expect(layers(editor).getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "false");

  // Content: Delete leaves the text in place.
  await layers(editor).getByRole("button", { name: "Hello", exact: true }).click();
  await editor.keyboard.press("Delete");
  await expect(layers(editor).getByRole("button", { name: "Hello", exact: true })).toBeVisible();
  await expect(props(editor).getByLabel("X", { exact: true })).toBeDisabled();
  await expect(props(editor).getByRole("button", { name: "Delete" })).toHaveCount(0);

  // Content text can still be edited by double-click.
  await editor.mouse.dblclick(box.x + box.width / 2 + 200 + 5, box.y + box.height / 2 + 150 + 5);
  await editor.keyboard.press("Control+A");
  await editor.keyboard.type("Changed");
  await editor.keyboard.press("Escape");
  await expect(layers(editor).getByRole("button", { name: "Changed", exact: true })).toBeVisible();
  await expect(editor.getByRole("status")).toHaveText("Saved");

  // A visual placed with a content-locked image selected replaces its picture.
  await layers(editor).getByRole("button", { name: "Dot", exact: true }).click();
  const count = await layers(editor).getByRole("listitem").count();
  await editor.getByRole("button", { name: "Visuals" }).click();
  await editor.getByRole("complementary", { name: "Visuals panel" }).getByRole("button", { name: "Workspace", exact: true }).click();
  await editor.getByRole("complementary", { name: "Visuals panel" }).getByRole("button", { name: "Dash" }).click();
  await showLayers(editor);
  await expect(editor.getByRole("status")).toHaveText("Saved");
  await expect(layers(editor).getByRole("listitem")).toHaveCount(count);
  await expect(props(editor).getByText("Dash", { exact: true })).toBeVisible();
});
