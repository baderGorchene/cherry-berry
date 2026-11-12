import { expect, test } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

test("shapes page imports and saves", async ({ browser }) => {
  // Public shapes are visible to every test sharing this server, so the name must be unique.
  const berry = `Berry ${Math.random().toString(36).slice(2, 8)}`;
  const a = await (await browser.newContext()).newPage();
  await signUp(a, unique("shp"));
  await createWorkspace(a, "Shape Lab");
  await a.getByRole("link", { name: "Shapes", exact: true }).click();
  await expect(a).toHaveURL(/\/shapes$/);

  await a.getByLabel("Import SVG file").setInputFiles("e2e/fixtures/berry.svg");
  const inside = await a.locator("aside[aria-label='New shape'] svg").evaluate((svg) => {
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number, number];
    const b = (svg.querySelector("path") as SVGPathElement).getBBox(), t = 1;
    return b.x >= x - t && b.y >= y - t && b.x + b.width <= x + w + t && b.y + b.height <= y + h + t;
  });
  expect(inside).toBe(true);
  await a.getByLabel("Name").fill(berry);
  await a.getByLabel("Tags").fill("fruit");
  await a.getByLabel("Share with").selectOption({ label: "Everyone (public)" });
  await a.getByRole("button", { name: "Save shape" }).click();
  await a.getByRole("tab", { name: "My shapes" }).click();
  const grid = a.getByRole("main");
  await expect(grid.getByText(berry, { exact: true })).toBeVisible();
  await expect(grid.getByRole("button", { name: "Delete" })).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signUp(b, unique("shp2"));
  await createWorkspace(b, "Other Lab");
  await b.getByRole("link", { name: "Shapes", exact: true }).click();
  await b.getByRole("tab", { name: "Public" }).click();
  await expect(b.getByRole("main").getByText(berry, { exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await b.getByLabel("Search shapes").fill("FRUIT");
  await expect(b.getByRole("main").getByText(berry, { exact: true })).toBeVisible();
});
