import { expect, type Browser, type Page } from "@playwright/test";

export const unique = (name: string) => `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

export async function signUp(page: Page, email: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("berrypass1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByLabel("Workspace name").fill(name);
  await page.getByLabel(/Invitation only/).check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Invites a new user as a viewer of `owner`'s workspace and opens the design `owner` is on, as that viewer. */
export async function openAsViewer(browser: Browser, owner: Page): Promise<Page> {
  const designUrl = new URL(owner.url()).pathname;
  const { workspaces } = await (await owner.request.get("/api/workspaces/mine")).json();
  const email = unique("viewer");
  const res = await owner.request.post(`/api/workspaces/${workspaces[0].id}/invitations`, { data: { email, role: "viewer" } });
  expect(res.status()).toBe(201);
  const { token } = await res.json();

  const viewer = await (await browser.newContext()).newPage();
  await signUp(viewer, email);
  await viewer.getByLabel("Invitation link").fill(token);
  await viewer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(viewer).toHaveURL(/\/$/);
  await viewer.goto(designUrl);
  await expect(viewer.getByText("View only")).toBeVisible();
  return viewer;
}
