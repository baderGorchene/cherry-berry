import { expect, test } from "@playwright/test";
import { createWorkspace, openAsViewer, signUp, unique, uniquePng, newDesign } from "./helpers";

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
  await newDesign(page, "Social post");
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
  for (const path of ["/", "/templates", "/library", "/shapes", "/brand", "/workspaces", "/new"]) {
    await page.goto(path);
    if (!["/workspaces", "/new"].includes(path)) await expect(main(page).getByRole("link", { name: "Visual library" })).toBeVisible();
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

test("library and shapes keep the detail panel beside the grid on wide screens", async ({ page }) => {
  await signUp(page, unique("aside"));
  await createWorkspace(page, "Aside Studio");
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  const res = await page.request.post("/api/assets", {
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: uniquePng() }, title: "Side dot", tags: "", license: "cc0",
      attribution: "", visibility: "workspace", workspaceId: workspaces[0].id, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/library");
  const tile = page.getByRole("button", { name: /Side dot/ });
  await tile.click();
  const aside = (await page.getByRole("complementary", { name: "Selected visual" }).boundingBox())!;
  const t = (await tile.boundingBox())!;
  expect(aside.x).toBeGreaterThan(t.x + t.width);
  // flush with the right edge of the window, fixed 320px wide
  expect(Math.round(aside.x + aside.width)).toBe(1280);
  expect(Math.round(aside.width)).toBe(320);

  await page.goto("/shapes");
  await expect(page.getByRole("tablist")).toBeVisible();
  const pub = page.getByRole("tab", { name: "Public" });
  await expect(pub).toHaveAttribute("aria-selected", "false");
  await pub.click();
  await expect(pub).toHaveAttribute("aria-selected", "true");
  const sa = (await page.getByRole("complementary", { name: "New shape" }).boundingBox())!;
  expect(Math.round(sa.x + sa.width)).toBe(1280);
});

test("sign in shows the full welcome panel on wide screens and a band on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-in");
  const h = page.getByRole("heading", { name: "Design freely. Own every file." });
  await expect(h).toBeVisible();
  for (const b of ["Open source", "Self-hostable", "Vector editing"]) await expect(page.getByText(b, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(h).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(h).toBeVisible();
  await expect(page.getByText("Open source", { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


test("home has one create control and, on a phone, one avatar and the search icon inside its box", async ({ page }) => {
  await signUp(page, unique("once"));
  await createWorkspace(page, "Once Studio");
  const create = page.getByRole("button", { name: /^(New design|Create a design)$/ });
  const avatar = page.getByRole("img", { name: /^Signed in as/ });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("heading", { name: "What are you making today?" })).toBeVisible();
  await expect(create).toHaveCount(1);
  await expect(create).toHaveText(/Create a design/);
  await expect(avatar).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(create).toHaveCount(1);
  await expect(create).toHaveAccessibleName("New design");
  await expect(avatar).toHaveCount(1);
  await expect(avatar).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const input = (await page.getByRole("searchbox").boundingBox())!;
  const icon = (await page.locator(".home-search svg").boundingBox())!;
  expect(icon.x).toBeGreaterThanOrEqual(input.x);
  expect(icon.y).toBeGreaterThanOrEqual(input.y);
  expect(icon.x + icon.width).toBeLessThanOrEqual(input.x + input.width);
  expect(icon.y + icon.height).toBeLessThanOrEqual(input.y + input.height);
  // the shortcuts scroll inside their own row
  const row = page.getByRole("list", { name: "Create" });
  expect(await row.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
});
