import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { createWorkspace, signUp, unique, uniquePng } from "./helpers";

const ADMIN = "admin@e2e.test"; // in ADMIN_EMAILS (playwright.config.ts)
const PASSWORD = "berrypass1";

/** Signs `req` up, or in when the account already exists (an earlier test made it). */
async function account(req: APIRequestContext, email: string, name = "Tester") {
  const up = await req.post("/api/auth/sign-up/email", { data: { name, email, password: PASSWORD } });
  if (!up.ok()) expect((await req.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } })).ok()).toBe(true);
}

/** Signs the admin in, with a workspace so the account menu is there. */
async function asAdmin(page: Page) {
  await account(page.request, ADMIN, "Instance Admin");
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  if (!workspaces.length) expect((await page.request.post("/api/workspaces", { data: { name: "Admin Lab", accessMode: "invite" } })).ok()).toBe(true);
}

async function signInUi(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A fresh signed-in user with a workspace, as an API context. */
async function member(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  await account(ctx.request, unique(name));
  const res = await ctx.request.post("/api/workspaces", { data: { name: `${name} Lab`, accessMode: "invite" } });
  expect(res.ok()).toBe(true);
  return { ctx, workspaceId: (await res.json()).workspace.id as string };
}

async function upload(req: APIRequestContext, workspaceId: string, title: string, svg = false) {
  const res = await req.post("/api/assets", {
    multipart: {
      file: svg
        ? { name: "hostile.svg", mimeType: "image/svg+xml", buffer: Buffer.concat([readFileSync("e2e/fixtures/hostile.svg"), Buffer.from(`<!--${crypto.randomUUID()}-->`)]) }
        : { name: "dot.png", mimeType: "image/png", buffer: uniquePng() },
      title, tags: "", license: "cc0", attribution: "", visibility: "public", workspaceId, confirmed: "true",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).asset.id as string;
}

/** Seeds one reported public PNG per title (two reports each) and one sanitized public SVG. */
async function seedQueue(browser: Browser, titles: string[], svgTitle: string) {
  const owner = await member(browser, "uploader");
  const reporters = [await member(browser, "rep1"), await member(browser, "rep2")];
  for (const title of titles) {
    const id = await upload(owner.ctx.request, owner.workspaceId, title);
    for (const r of reporters) {
      const res = await r.ctx.request.post("/api/reports", { data: { targetType: "asset", targetId: id, reason: "copyright", note: "This is my photo." } });
      expect(res.status()).toBe(201);
    }
  }
  await upload(owner.ctx.request, owner.workspaceId, svgTitle, true);
  for (const c of [owner, ...reporters]) await c.ctx.close();
}

test.describe.configure({ mode: "serial" });

// Runs even after a failure or timeout, so a closed registration never leaks into the other specs.
test.afterEach(async ({ browser }) => {
  const ctx = await browser.newContext();
  await account(ctx.request, ADMIN, "Instance Admin");
  const { settings } = await (await ctx.request.get("/api/admin/settings")).json();
  const res = await ctx.request.put("/api/admin/settings", { data: { ...settings, registration: "open", allowedDomains: [] } });
  expect(res.ok()).toBe(true);
  await ctx.close();
});

test("non-admin has no admin menu and /admin redirects home", async ({ page }) => {
  await signUp(page, unique("plain"));
  await createWorkspace(page, "Plain Lab");
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Join or create another workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Instance admin" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/$/);
});

/** Clicks Save and waits for the settings PUT to come back. */
async function save(page: Page) {
  const put = page.waitForResponse((r) => r.url().endsWith("/api/admin/settings") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Save" }).click();
  expect((await put).ok()).toBe(true);
  await expect(page.getByRole("status")).toHaveText("Saved");
}

test("admin changes registration to allowed domains and a stranger can't sign up", async ({ page, browser }) => {
  await asAdmin(page);
  await page.goto("/workspaces"); // an admin without a workspace still gets in from here
  await expect(page.getByRole("link", { name: "Instance admin" })).toBeVisible();
  await page.goto("/admin/registration");
  // The form renders once the saved settings have loaded; touching it earlier lets the load overwrite the edit.
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await page.getByLabel("Only emails on allowed domains").check();
  // example.com stays allowed: the other specs sign up there while this one runs.
  await page.getByLabel("Allowed domains", { exact: true }).fill("acme.test\nexample.com");
  await save(page);

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto("/sign-in");
  await stranger.getByRole("button", { name: "Create an account" }).click();
  await stranger.getByLabel("Name").fill("Stranger");
  await stranger.getByLabel("Email").fill("x@other.test");
  await stranger.getByLabel("Password").fill(PASSWORD);
  await stranger.getByRole("button", { name: "Create account" }).click();
  await expect(stranger.getByRole("alert")).toHaveText("This server isn't taking new sign-ups. Ask an admin to invite you.");
  await stranger.context().close();

  // A bad domain hidden behind another mode doesn't block saving that mode.
  await page.getByLabel("Allowed domains", { exact: true }).fill("not a domain");
  await page.getByLabel("Anyone").check();
  await save(page);
});

test("account menu opens the instance admin overview", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page.locator(".ws-menu").getByRole("link", { name: "Instance admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Instance admin" })).toBeVisible();
  await expect(page.getByText("PGlite")).toBeVisible();
});

test("admin suspends a user who then can't sign in", async ({ page, browser }) => {
  const email = unique("suspendee");
  const ctx = await browser.newContext();
  await account(ctx.request, email);
  await ctx.close();

  await asAdmin(page);
  await page.goto("/admin/users");
  await page.getByLabel("Search users").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Suspend" }).click();
  const dlg = page.getByRole("dialog", { name: "Suspend Tester?" });
  await expect(dlg).toContainText("They'll be signed out everywhere and can't sign in until you unsuspend them.");
  await dlg.getByRole("button", { name: "Suspend" }).click();
  await expect(row.getByText("Suspended", { exact: true })).toBeVisible();

  const them = await (await browser.newContext()).newPage();
  await signInUi(them, email);
  await expect(them.getByRole("alert")).toHaveText("This account is suspended. Contact the server's admin.");

  await row.getByRole("button", { name: "Unsuspend" }).click();
  await expect(row.getByRole("button", { name: "Suspend" })).toBeVisible();
  await signInUi(them, email);
  await expect(them).toHaveURL(/\/(workspaces)?$/);
  await them.context().close();

  // Admins carry a badge instead of a Suspend button.
  await page.getByLabel("Search users").fill(ADMIN);
  const adminRow = page.getByRole("row").filter({ hasText: ADMIN });
  await expect(adminRow.getByText("Admin", { exact: true })).toBeVisible();
  await expect(adminRow.getByRole("button")).toHaveCount(0);
});

test("moderation keep and remove", async ({ page, browser }) => {
  const tag = Math.random().toString(36).slice(2, 7);
  const [kept, removed, cleaned] = [`Kept ${tag}`, `Removed ${tag}`, `Cleaned ${tag}`];
  await seedQueue(browser, [kept, removed], cleaned);

  await asAdmin(page);
  await page.goto("/admin/moderation");
  const card = (title: string) => page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(card(kept).getByText("Copyright claim")).toBeVisible();
  await expect(card(kept).getByText("2 reports")).toBeVisible();
  await expect(card(cleaned).getByText("Sanitizer flagged")).toBeVisible();

  await card(kept).getByRole("button", { name: "Keep" }).click();
  await expect(card(kept)).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveRole("button"); // focus moves on to the next card, not lost to <body>

  await card(removed).getByRole("button", { name: "Remove" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText(removed);
  await dlg.getByRole("button", { name: "Remove" }).click();
  await expect(card(removed)).toHaveCount(0);

  await card(cleaned).getByRole("button", { name: "Approve cleaned file" }).click();
  await expect(card(cleaned)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Moderation" })).toBeVisible();
  for (const t of [kept, removed, cleaned]) await expect(card(t)).toHaveCount(0);
});

test("admin pages fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asAdmin(page);
  for (const s of ["", "/moderation", "/users", "/storage", "/registration"]) {
    await page.goto(`/admin${s}`);
    await expect(page.getByRole("heading", { name: "Instance admin" })).toBeVisible();
    await expect(page.locator("main h2").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const link of await page.getByRole("navigation", { name: "Instance admin" }).getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});
