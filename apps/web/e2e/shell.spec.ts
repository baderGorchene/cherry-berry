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
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\//);
  await page.getByRole("link", { name: "Back to home" }).click();
  const designs = page.getByRole("link", { name: /Untitled design/ });
  await expect(page.getByRole("button", { name: new RegExp(`^Workspace: ${beta}`) })).toBeVisible();
  await expect(designs).toHaveCount(1);

  const button = page.getByRole("button", { name: /^Workspace: / });
  await button.click();
  await expect(page.getByTestId("workspace-public-id")).toBeVisible();
  await page.locator(".ws-menu").getByRole("button", { name: alpha }).click();
  await expect(button).toHaveAccessibleName(new RegExp(alpha));
  await expect(page.getByText("No designs yet")).toBeVisible();
  await expect(designs).toHaveCount(0);

  await button.click();
  await page.locator(".ws-menu").getByRole("button", { name: beta }).click();
  await expect(button).toHaveAccessibleName(new RegExp(beta));
  await expect(designs).toHaveCount(1);

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
