import { expect, test } from "@playwright/test";
import { createWorkspace, newDesign, openAsViewer, signUp, unique } from "./helpers";

test("new user creates a workspace and reaches home", async ({ page }) => {
  await signUp(page, unique("ada"));
  await page.getByLabel("Workspace name").fill("North Studio");
  await page.getByLabel(/Invitation only/).check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /^Workspace: North Studio/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What are you making today?" })).toBeVisible();
});

test("second user joins with ID and password", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signUp(a, unique("owner"));
  await a.getByLabel("Workspace name").fill("Berry Lab");
  await a.getByLabel(/ID \+ password/).check();
  await a.getByLabel("Password for joining").fill("joinpass1");
  await a.getByRole("button", { name: "Create workspace" }).click();
  await expect(a).toHaveURL(/\/$/);
  await a.getByRole("button", { name: /^Workspace: / }).click();
  const publicId = (await a.getByTestId("workspace-public-id").textContent())!.trim();
  expect(publicId).toMatch(/^berry-lab-[A-Z0-9]{4}$/);

  const b = await (await browser.newContext()).newPage();
  await signUp(b, unique("guest"));
  await b.getByLabel("Workspace ID").fill(publicId.toLowerCase());
  await b.getByLabel("Workspace password").fill("wrong-pass");
  await b.getByRole("button", { name: "Join workspace" }).click();
  await expect(b.getByText("That password doesn't match this workspace.")).toBeVisible();

  await b.getByLabel("Workspace password").fill("joinpass1");
  await b.getByRole("button", { name: "Join workspace" }).click();
  await expect(b).toHaveURL(/\/$/);
  await expect(b.getByRole("button", { name: /^Workspace: Berry Lab/ })).toBeVisible();
});

test("home search filters recent designs and long titles stay inside the card", async ({ page }) => {
  await signUp(page, unique("find"));
  await createWorkspace(page, "Search Studio");
  for (let i = 0; i < 2; i++) {
    await newDesign(page, i === 0 ? "Social post" : "Presentation");
    await expect(page).toHaveURL(/\/d\//);
    if (i === 0) {
      const title = page.getByLabel("Design title");
      await title.fill("Poster " + "x".repeat(80));
      await title.blur();
    }
    await expect(page.getByLabel("Design title")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  const items = page.locator(".recent > li");
  await expect(items).toHaveCount(2);
  // previews keep the design ratio (1:1 poster, 16:9 presentation) and sit inside their thumb tile
  for (const [text, ratio] of [[/Poster/, 1], [/1920/, 16 / 9]] as const) {
    const item = items.filter({ hasText: text });
    const p = (await item.getByTestId("design-preview").boundingBox())!;
    const box = (await item.getByTestId("design-preview").locator("..").boundingBox())!;
    expect(Math.abs(p.width / p.height / ratio - 1)).toBeLessThan(0.02);
    expect(p.x).toBeGreaterThanOrEqual(box.x);
    expect(p.y).toBeGreaterThanOrEqual(box.y);
    expect(p.x + p.width).toBeLessThanOrEqual(box.x + box.width);
    expect(p.y + p.height).toBeLessThanOrEqual(box.y + box.height);
  }
  const search = page.getByRole("searchbox", { name: "Search designs and templates" });
  await search.fill("poster");
  await expect(items).toHaveCount(1);
  const card = (await items.first().getByRole("link").boundingBox())!;
  const title = items.first().locator("strong");
  expect(await title.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
  expect(await title.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  const t = (await title.boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(card.x + card.width);
  await search.fill("zzz");
  await expect(page.getByText("Nothing matches")).toBeVisible();
});

test("home leads with the hero, one search box, nine shortcuts that open the dialog, and recent designs", async ({ page }) => {
  await signUp(page, unique("hero"));
  await createWorkspace(page, "Hero Studio");
  await newDesign(page, "Story");
  await expect(page.getByLabel("Design title")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.getByRole("link", { name: "Back to home" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What are you making today?");
  await expect(page.getByRole("searchbox")).toHaveCount(1);
  const row = page.getByRole("list", { name: "Create" });
  const panes: [string, string][] = [
    ["Social post", "Social media"], ["Story", "Social media"], ["Presentation", "Presentations"], ["Flyer", "Print"], ["Poster", "Print"],
    ["Business card", "Cards & invites"], ["Invitation", "Cards & invites"], ["Custom size", "Custom size"], ["Open file", "Open a .cherry file"],
  ];
  await expect(row.getByRole("button")).toHaveCount(panes.length);
  const dlg = page.getByRole("dialog", { name: "Create a design" });
  for (const [label, tab] of panes) {
    await row.getByRole("button", { name: label, exact: true }).click();
    await expect(dlg.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  }

  const cont = page.getByRole("region", { name: "Continue designing" });
  await expect(cont.getByRole("link", { name: /Untitled design.*1080 × 1920 px/ })).toBeVisible();
  await page.getByRole("searchbox").fill("market");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(results.getByRole("button", { name: /^Use .*market/i })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Designs" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("untitled");
  await expect(results.getByRole("heading", { name: "Designs" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Templates" })).toHaveCount(0);
});

test("a new user sees the welcome line with templates first, and a starter opens the editor with its content", async ({ page }) => {
  await signUp(page, unique("first"));
  await createWorkspace(page, "First Studio");
  await expect(page.getByText("No designs yet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Continue designing" })).toHaveCount(0);
  const tpl = page.getByRole("region", { name: "Start from a template" });
  const cat = page.getByRole("region", { name: "Browse by category" });
  expect((await tpl.boundingBox())!.y).toBeLessThan((await cat.boundingBox())!.y);
  // every built-in starter, plus any public template another spec has published meanwhile
  await expect.poll(() => tpl.getByRole("button").count()).toBeGreaterThanOrEqual(24);
  await tpl.getByRole("button", { name: /^Use / }).first().click();
  await expect(page).toHaveURL(/\/d\//);
  await expect(page.getByRole("main", { name: "Post canvas" })).toBeVisible();
  await expect(page.getByLabel("Design title")).toHaveValue("Saturday market post");
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page.getByRole("region", { name: "Continue designing" }).getByRole("link")).toHaveCount(1);
  await page.getByRole("link", { name: "Cards & invites" }).click();
  await expect(page).toHaveURL(/\/templates\?category=cards$/);
  await expect(page.getByRole("button", { name: "Cards & invites", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("starter previews mount only for tiles scrolled near", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUp(page, unique("rowlazy"));
  await createWorkspace(page, "Row Studio");
  const tpl = page.getByRole("region", { name: "Start from a template" });
  await expect.poll(() => tpl.getByRole("button", { name: /^Use / }).count()).toBeGreaterThanOrEqual(24);
  const canvases = tpl.locator("canvas");
  await expect.poll(() => canvases.count()).toBeGreaterThan(0);
  const first = await canvases.count();
  expect(first).toBeLessThan(24);
  await tpl.locator(".tpl-row").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect.poll(() => canvases.count()).toBeGreaterThan(first);
});

test("recent previews load only for cards near the viewport", async ({ page }) => {
  await signUp(page, unique("lazy"));
  await createWorkspace(page, "Lazy Studio");
  const { workspaces } = await (await page.request.get("/api/workspaces/mine")).json();
  for (let i = 0; i < 24; i++) {
    const res = await page.request.post(`/api/workspaces/${workspaces[0].id}/designs`, { data: { title: `Lazy ${i}`, width: 1080, height: 1080, unit: "px", colorMode: "rgb" } });
    expect(res.status()).toBe(201);
  }
  const fetched = new Set<string>();
  page.on("request", (r) => { const m = new URL(r.url()).pathname.match(/^\/api\/designs\/([^/]+)$/); if (m) fetched.add(m[1]!); });
  await page.goto("/");
  await page.getByRole("button", { name: /^See all \(24\)/ }).click();
  await expect(page.locator(".recent > li")).toHaveCount(24);
  await expect.poll(() => fetched.size).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(fetched.size).toBeLessThan(24);
  const near = fetched.size;
  await page.locator(".recent > li").last().scrollIntoViewIfNeeded();
  await expect.poll(() => fetched.size).toBeGreaterThan(near);
});

test("viewers get no shortcuts or create button on Home, and starters are disabled", async ({ page, browser }) => {
  await signUp(page, unique("owner-v"));
  await createWorkspace(page, "View Studio");
  await newDesign(page, "Social post");
  const viewer = await openAsViewer(browser, page);
  await viewer.goto("/");
  await expect(viewer.getByRole("heading", { name: "What are you making today?" })).toBeVisible();
  await expect(viewer.getByRole("list", { name: "Create" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /^(New design|Create a design)$/ })).toHaveCount(0);
  const uses = viewer.getByRole("button", { name: /^Use / });
  await expect.poll(() => uses.count()).toBeGreaterThanOrEqual(24); // starters, plus public templates from other specs
  for (const b of await uses.all()) await expect(b).toBeDisabled();
});
