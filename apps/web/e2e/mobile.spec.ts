import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, newDesign, signUp, unique } from "./helpers";

// msedge can't emulate isMobile, so phones are a 390×844 touch viewport.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const tabs = (page: Page) => page.getByRole("navigation", { name: "Main" });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("phone home shows tabs, presets and recent", async ({ page }) => {
  await signUp(page, unique("m-home"));
  await createWorkspace(page, "Pocket Studio");

  // top bar: workspace name + account; tab bar: Home, Templates, Library, Brand
  await expect(page.getByRole("button", { name: /^Workspace: Pocket Studio/ })).toContainText("Pocket Studio");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("img", { name: "Signed in as Tester" })).toBeVisible();
  for (const name of ["Home", "Templates", "Visual library", "Brand kits"]) await expect(tabs(page).getByRole("link", { name })).toBeVisible();
  expect(await tabs(page).getByRole("link", { name: "Visual library" }).innerText()).toBe("Library");
  await expect(tabs(page).getByRole("link", { name: "Shapes" })).toBeHidden();
  const bar = (await tabs(page).getByRole("link", { name: "Home" }).boundingBox())!;
  expect(bar.y + bar.height).toBeCloseTo(844, 0);

  // Shapes lives in the account menu on phones
  await page.getByRole("button", { name: /^Workspace: / }).click();
  await page.locator(".ws-menu").getByRole("link", { name: "Shapes" }).click();
  await expect(page).toHaveURL(/\/shapes$/);
  await tabs(page).getByRole("link", { name: "Home" }).click();

  // one scrolling row of shortcuts, each opening the Create dialog on its category
  const shortcuts = page.getByRole("list", { name: "Create" });
  await expect(shortcuts.getByRole("button")).toHaveCount(9);
  await expect(shortcuts.getByRole("button", { name: "Story", exact: true })).toBeVisible();
  await newDesign(page, "Story");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Continue designing" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Untitled design/ })).toBeVisible();
  const cols = await page.locator(".recent").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(2);

  // 56px New design button floats above the tab bar
  const fab = page.locator("button.fab");
  const f = (await fab.boundingBox())!;
  expect(Math.round(f.width)).toBe(56);
  expect(Math.round(f.height)).toBe(56);
  expect(f.y + f.height).toBeLessThan(bar.y);
  await fab.click();
  await expect(page.getByRole("dialog", { name: "Create a design" })).toBeVisible();
});

test("phone library shows chips and upload button", async ({ page }) => {
  await signUp(page, unique("m-lib"));
  await createWorkspace(page, "Pocket Library");
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Visual library" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search visuals" })).toBeVisible();

  // one row of three dropdown chips
  const workspace = page.getByRole("button", { name: "Source: Workspace" });
  const ys = new Set<number>();
  for (const name of ["Type: All", "Source: Workspace", "License: Any"]) {
    ys.add(Math.round((await page.getByRole("button", { name }).boundingBox())!.y));
  }
  expect(ys.size).toBe(1);
  expect((await workspace.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noSideScroll(page)).toBe(true);

  const upload = page.getByRole("button", { name: "Upload visuals" });
  await expect(upload).toHaveCount(1);
  const u = (await upload.boundingBox())!;
  expect(Math.round(u.width)).toBe(56);
  await upload.click();
  await expect(page.getByRole("dialog", { name: "Upload visuals" })).toBeVisible();
});

test("no horizontal scroll on phone pages", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Design freely. Own every file." })).toBeVisible();
  const email = (await page.getByLabel("Email").boundingBox())!;
  expect(Math.round(email.height)).toBe(50);
  expect(await noSideScroll(page)).toBe(true);

  await signUp(page, unique("m-scroll"));
  await createWorkspace(page, "Scroll Studio");
  for (const path of ["/", "/library", "/templates", "/brand", "/shapes"]) {
    await page.goto(path);
    await expect(tabs(page).getByRole("link", { name: "Home" })).toBeVisible();
    expect(await noSideScroll(page), path).toBe(true);
  }
});

test.describe("mobile shell", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 CherryBerryMobile/1" });

  test("sign in shows the server as a segmented control", async ({ page }) => {
    await page.goto("/sign-in");
    const server = page.getByRole("group", { name: "Server" });
    const self = server.getByRole("radio", { name: "Self-hosted" });
    await expect(self).toBeChecked();
    const seg = (await server.locator("label").last().boundingBox())!;
    expect(seg.height).toBeGreaterThanOrEqual(44);
    expect(await noSideScroll(page)).toBe(true);
  });
});

test.describe("tidy asset pages at 375x812", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("library, shapes, templates and brand don't scroll sideways", async ({ page }) => {
    await signUp(page, unique("m-tidy"));
    await createWorkspace(page, "Tidy Studio");
    for (const path of ["/library", "/shapes", "/templates", "/templates?category=print", "/brand"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      expect(await noSideScroll(page), path).toBe(true);
    }
  });
  test("controls on library, templates and brand are at least 44px tall", async ({ page }) => {
    await signUp(page, unique("m-tap"));
    await createWorkspace(page, "Tap Studio");
    const tall = async (loc: import("@playwright/test").Locator) => {
      await expect(loc.first()).toBeVisible();
      const n = await loc.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) expect((await loc.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    };
    await page.goto("/templates");
    await tall(page.getByRole("button", { name: "Publish a template" }));
    await tall(page.locator(".chips .chip"));
    await page.goto("/library");
    await tall(page.locator(".filters .chip"));
    await page.goto("/brand");
    await tall(page.getByRole("button", { name: "Create a brand kit" }));
    await tall(page.getByText("Import kit", { exact: true }));
  });
});
