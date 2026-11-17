import { expect, test } from "@playwright/test";

test("landing page renders at / for signed-out visitors and navigates to /sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Design freely/i })).toBeVisible();
  await expect(page.locator("header .brand img[src='/logo.png']")).toBeVisible();
  await expect(page.locator("img[src='/hero.png']")).toBeVisible();
  await expect(page.locator("img[src='/cover-wide.jpg']")).toBeVisible();
  for (const img of ["/scene-boss.png", "/scene-craft.png", "/scene-collab.png", "/scene-library.png"]) {
    await expect(page.locator(`img[src='${img}']`)).toBeVisible();
  }
  await page.getByRole("tab", { name: /04 · Export/i }).click();
  await expect(page.getByText("PDF · Print")).toBeVisible();
  await page.getByRole("link", { name: "Start designing" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("landing page fits mobile viewport without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Design freely/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
