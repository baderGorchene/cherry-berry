import { expect, test } from "@playwright/test";
import { signUp, unique } from "./helpers";

test("new user creates a workspace and reaches home", async ({ page }) => {
  await signUp(page, unique("ada"));
  await page.getByLabel("Workspace name").fill("North Studio");
  await page.getByLabel(/Invitation only/).check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "North Studio" })).toBeVisible();
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
  await expect(b.getByRole("heading", { name: "Berry Lab" })).toBeVisible();
});
