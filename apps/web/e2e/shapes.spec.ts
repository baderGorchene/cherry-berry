import { expect, test } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

test("shapes page imports and saves", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signUp(a, unique("shp"));
  await createWorkspace(a, "Shape Lab");
  await a.getByRole("link", { name: "Shapes", exact: true }).click();
  await expect(a).toHaveURL(/\/shapes$/);

  await a.getByLabel("Import SVG file").setInputFiles("e2e/fixtures/berry.svg");
  await a.getByLabel("Name").fill("Berry");
  await a.getByLabel("Tags").fill("fruit");
  await a.getByLabel("Share with").selectOption({ label: "Everyone (public)" });
  await a.getByRole("button", { name: "Save shape" }).click();
  await a.getByRole("tab", { name: "My shapes" }).click();
  const grid = a.getByRole("main");
  await expect(grid.getByText("Berry", { exact: true })).toBeVisible();
  await expect(grid.getByRole("button", { name: "Delete" })).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signUp(b, unique("shp2"));
  await createWorkspace(b, "Other Lab");
  await b.getByRole("link", { name: "Shapes", exact: true }).click();
  await b.getByRole("tab", { name: "Public" }).click();
  await expect(b.getByRole("main").getByText("Berry", { exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await b.getByLabel("Search shapes").fill("FRUIT");
  await expect(b.getByRole("main").getByText("Berry", { exact: true })).toBeVisible();
});
