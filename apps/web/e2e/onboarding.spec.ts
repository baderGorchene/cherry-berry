import { expect, test } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

test("new user creates a workspace and reaches home", async ({ page }) => {
  await signUp(page, unique("ada"));
  await page.getByLabel("Workspace name").fill("North Studio");
  await page.getByLabel(/Invitation only/).check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /^Workspace: North Studio/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start something" })).toBeVisible();
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
    await page.getByRole("button", { name: i === 0 ? /Social post/ : /Presentation/ }).click();
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
  const items = page.getByRole("listitem").filter({ has: page.getByRole("link") }).filter({ hasText: /\d+ × \d+/ });
  await expect(items).toHaveCount(2);
  // previews keep the design ratio (1:1 poster, 16:9 presentation) and sit inside their 160px thumb box
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
  const search = page.getByRole("searchbox", { name: "Search designs" });
  await search.fill("poster");
  await expect(items).toHaveCount(1);
  const card = (await items.first().getByRole("link").boundingBox())!;
  const title = items.first().locator("strong");
  expect(await title.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
  expect(await title.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  const t = (await title.boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(card.x + card.width);
  await search.fill("zzz");
  await expect(page.getByText("No designs match")).toBeVisible();
});
