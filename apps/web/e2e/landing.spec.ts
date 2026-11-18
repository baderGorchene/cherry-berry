import { expect, test } from "@playwright/test";

test("landing page renders all assets, walkthrough tabs, custom inputs, dark mode toggle, and navigates to /sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Design freely/i })).toBeVisible();
  await expect(page.locator("header .brand img[src='/logo.png']")).toBeVisible();
  await expect(page.locator("img[src='/hero.png']")).toBeVisible();
  await expect(page.locator("img[src='/cover-wide.jpg']")).toBeVisible();
  for (const img of ["/scene-boss.png", "/scene-craft.png", "/scene-collab.png", "/scene-library.png"]) {
    await expect(page.locator(`img[src='${img}']`)).toBeVisible();
  }

  // Interactive studio walkthrough tabs
  await page.getByRole("tab", { name: /02 · Design/i }).click();
  await expect(page.locator(".sim-lock")).toHaveText("Brand lock · Fixed");
  await page.getByRole("tab", { name: /03 · Review/i }).click();
  await expect(page.getByText("Fonts available")).toBeVisible();
  await page.getByRole("tab", { name: /04 · Export/i }).click();
  await expect(page.locator(".sim-exp-card", { hasText: "PDF · Print" })).toBeVisible();

  // Custom input styling (no default browser chrome)
  const radioApp = await page.locator(".sim-exp-card input[type='radio']").first().evaluate((el) => getComputedStyle(el).appearance);
  const checkApp = await page.locator(".sim-exp-chk input[type='checkbox']").evaluate((el) => getComputedStyle(el).appearance);
  expect(radioApp).toBe("none");
  expect(checkApp).toBe("none");

  // Toggle dark mode and verify persistence across reload
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  await page.getByRole("link", { name: "Start designing" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("landing page fits mobile viewport without horizontal scroll in light and dark modes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Design freely/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("landing page images have transparent background and identical size in light and dark modes", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".land-hero-img");
  const firstStory = page.locator(".land-story-art img").first();
  const firstArt = page.locator(".land-story-art").first();

  await expect(hero).toBeVisible();
  await expect(firstStory).toBeVisible();

  const lightHeroBox = await hero.boundingBox();
  const lightStoryBox = await firstStory.boundingBox();

  // Verify background is transparent in light mode
  const lightHeroBg = await hero.evaluate((el) => getComputedStyle(el).backgroundImage);
  const lightArtBg = await firstArt.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(lightHeroBg).toBe("none");
  expect(lightArtBg).toBe("none");

  // Toggle dark mode
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  const darkHeroBox = await hero.boundingBox();
  const darkStoryBox = await firstStory.boundingBox();

  // Verify background is transparent in dark mode (no white radial-gradient or plate)
  const darkHeroBg = await hero.evaluate((el) => getComputedStyle(el).backgroundImage);
  const darkArtBg = await firstArt.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(darkHeroBg).toBe("none");
  expect(darkArtBg).toBe("none");

  // Verify sizes are invariant (within 1px rounding)
  expect(Math.abs((darkHeroBox?.width ?? 0) - (lightHeroBox?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((darkHeroBox?.height ?? 0) - (lightHeroBox?.height ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((darkStoryBox?.width ?? 0) - (lightStoryBox?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((darkStoryBox?.height ?? 0) - (lightStoryBox?.height ?? 0))).toBeLessThanOrEqual(1);
});
