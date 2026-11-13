import { expect, test } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("main nav links have icons and mark the current page", async ({ page }) => {
  await signUp(page, unique("nav"));
  await createWorkspace(page, "Nav Studio");
  await expect(main(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(main(page).getByRole("link", { name: "Home" }).locator("svg")).toBeVisible();
  await main(page).getByRole("link", { name: "Shapes" }).click();
  await expect(main(page).getByRole("link", { name: "Shapes" })).toHaveAttribute("aria-current", "page");
});

test("workspace menu switches workspace and shows its ID", async ({ page }) => {
  await signUp(page, unique("ws"));
  const alpha = `Alpha ${Date.now()}`, beta = `Beta ${Date.now()}`;
  await createWorkspace(page, alpha);
  await page.goto("/workspaces");
  await createWorkspace(page, beta);
  await expect(page.getByRole("heading", { name: beta })).toBeVisible();

  const button = page.getByRole("button", { name: /^Workspace: / });
  await button.click();
  await expect(page.getByTestId("workspace-public-id")).toBeVisible();
  await page.locator(".ws-menu").getByRole("button", { name: alpha }).click();
  await expect(button).toHaveAccessibleName(new RegExp(alpha));
  await expect(page.getByRole("heading", { name: alpha })).toBeVisible();

  await button.click();
  await expect(page.locator(".ws-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ws-menu")).toBeHidden();
  await expect(button).toBeFocused();
});

test("phone width has a bottom nav and no horizontal scroll", async ({ page }) => {
  await signUp(page, unique("phone"));
  await createWorkspace(page, "Phone Studio");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/library", "/shapes"]) {
    await page.goto(path);
    await expect(main(page).getByRole("link", { name: "Visual library" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test("long workspace names truncate", async ({ page }) => {
  await signUp(page, unique("long"));
  await createWorkspace(page, "W".repeat(70));
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  expect((await page.locator(".side").boundingBox())!.width).toBeLessThanOrEqual(260);
});
