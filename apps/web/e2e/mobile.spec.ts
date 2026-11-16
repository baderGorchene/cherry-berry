import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

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

  // size presets open the new-design flow with that preset filled in
  const sizes = page.getByRole("list", { name: "Sizes" });
  for (const name of ["Post", "Story", "A4 print", "Custom"]) await expect(sizes.getByRole("link", { name })).toBeVisible();
  await sizes.getByRole("link", { name: "Story" }).click();
  await expect(page).toHaveURL(/\/new\?preset=Story$/);
  await expect(page.getByLabel("Width")).toHaveValue("1080");
  await expect(page.getByLabel("Height")).toHaveValue("1920");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/d\//);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Untitled design/ })).toBeVisible();
  const cols = await page.locator(".recent").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(2);

  // 56px New design button floats above the tab bar
  const fab = page.locator("a.fab");
  const f = (await fab.boundingBox())!;
  expect(Math.round(f.width)).toBe(56);
  expect(Math.round(f.height)).toBe(56);
  expect(f.y + f.height).toBeLessThan(bar.y);
  await fab.click();
  await expect(page).toHaveURL(/\/new$/);
});

test("phone library shows chips and upload button", async ({ page }) => {
  await signUp(page, unique("m-lib"));
  await createWorkspace(page, "Pocket Library");
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Visual library" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search visuals" })).toBeVisible();

  // one horizontally scrolling chip row
  const workspace = page.getByRole("button", { name: "Workspace", exact: true });
  await expect(workspace).toHaveAttribute("aria-pressed", "true");
  const ys = new Set<number>();
  for (const name of ["Workspace", "Mine", "Public", "SVG", "GIFs"]) {
    const b = page.getByRole("button", { name, exact: true });
    await b.scrollIntoViewIfNeeded();
    ys.add(Math.round((await b.boundingBox())!.y));
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
