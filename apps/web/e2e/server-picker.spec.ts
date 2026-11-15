import { expect, test } from "@playwright/test";
import { createWorkspace, signUp, unique } from "./helpers";

const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 CherryBerryDesktop/1";

test.describe("plain browser", () => {
  test("picker shows only in a shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Server" })).toHaveCount(0);
  });

  test("no Switch server outside a shell", async ({ page }) => {
    await signUp(page, unique("plain"));
    await createWorkspace(page, "Plain Studio");
    await page.getByRole("button", { name: /^Workspace: / }).click();
    await expect(page.getByTestId("workspace-public-id")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch server" })).toHaveCount(0);
  });
});

test.describe("desktop shell", () => {
  test.use({ userAgent: DESKTOP });

  async function launcher(page: import("@playwright/test").Page) {
    const seen: string[] = [];
    await page.route("http://tauri.localhost/**", (route) => { seen.push(route.request().url()); return route.fulfill({ body: "launcher", contentType: "text/html" }); });
    return seen;
  }

  test("picker shows only in a shell", async ({ page }) => {
    const seen = await launcher(page);
    await page.goto("/");
    const server = page.getByRole("group", { name: "Server" });
    await expect(server).toBeVisible();
    const address = page.getByLabel("Server address");
    await expect(address).toHaveValue(new URL(page.url()).origin);
    await server.getByRole("radio", { name: /Self-hosted server/ }).check();
    await address.fill("http://10.0.0.5:3000");
    await expect(page.getByText("Not secure: this address uses http.")).toBeVisible();
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page).toHaveURL("http://tauri.localhost/?server=http%3A%2F%2F10.0.0.5%3A3000");
    expect(seen).toEqual(["http://tauri.localhost/?server=http%3A%2F%2F10.0.0.5%3A3000"]);
  });

  test("Switch server returns to the launcher picker", async ({ page }) => {
    await launcher(page);
    await signUp(page, unique("shell"));
    await createWorkspace(page, "Shell Studio");
    await page.getByRole("button", { name: /^Workspace: / }).click();
    await page.getByRole("button", { name: "Switch server" }).click();
    await expect(page).toHaveURL("http://tauri.localhost/?change=1");
  });
});
