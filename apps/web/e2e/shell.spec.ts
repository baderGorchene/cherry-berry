import { expect, test } from "@playwright/test";
import { createWorkspace, openAsViewer, signUp, unique, uniquePng } from "./helpers";

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

test("sign in shows the welcome panel on wide screens only", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-in");
  const h = page.getByRole("heading", { name: "Design freely. Own every file." });
  await expect(h).toBeVisible();
  for (const b of ["Open source", "Self-hostable", "Vector editing"]) await expect(page.getByText(b, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(h).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("new design lists presets beside the custom form", async ({ page }) => {
  await signUp(page, unique("new"));
  await createWorkspace(page, "New Studio");
  await page.goto("/new");
  await expect(page.getByLabel("Width")).toBeVisible();
  await expect(page.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\//);
});

test("viewers cannot create from presets on the new design page", async ({ page, browser }) => {
  await signUp(page, unique("owner"));
  await createWorkspace(page, "View Studio");
  await page.getByRole("button", { name: /Social post/ }).click();
  await expect(page).toHaveURL(/\/d\//);
  const viewer = await openAsViewer(browser, page);
  await viewer.goto("/new");
  await expect(viewer.getByText("You have view-only access to this workspace.")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /Social post/ })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: /Social post/ })).toHaveCSS("cursor", "default");
  await expect(viewer.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
});
