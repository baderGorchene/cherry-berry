import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

const outer = mkdtempSync(join(tmpdir(), "cherry-web-"));
const dist = join(outer, "web");
mkdirSync(dist);
writeFileSync(join(outer, "secret.txt"), "TOPSECRET");
mkdirSync(join(dist, "assets"));
mkdirSync(join(outer, "assets", "web"), { recursive: true });
writeFileSync(join(outer, "assets", "web", "index.html"), "<title>n</title>");
writeFileSync(join(dist, "index.html"), "<!doctype html><title>cherry</title>");
writeFileSync(join(dist, "assets", "a.js"), "console.log(1)");

let t: Awaited<ReturnType<typeof setupTestApp>>;
let nested: Awaited<ReturnType<typeof setupTestApp>>;
let bare: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  t = await setupTestApp({ webDist: dist });
  bare = await setupTestApp();
  nested = await setupTestApp({ webDist: join(outer, "assets", "web") });
});
afterAll(async () => { await t.close(); await bare.close(); await nested.close(); rmSync(outer, { recursive: true, force: true }); });

describe("web", () => {
  it("health is public and identifies the app", async () => {
    const res = await bare.app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok", app: "cherry-berry" });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("serves the web build with spa fallback", async () => {
    for (const url of ["/", "/d/123"]) {
      const res = await t.app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("<title>cherry</title>");
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
    const js = await t.app.inject({ method: "GET", url: "/assets/a.js" });
    expect(js.statusCode).toBe(200);
    expect(js.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("api paths never fall back", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("no web dist, no static routes", async () => {
    expect((await bare.app.inject({ method: "GET", url: "/" })).statusCode).toBe(404);
  });

  it("an assets directory above the web root does not make everything immutable", async () => {
    for (const url of ["/", "/d/1"]) {
      expect((await nested.app.inject({ method: "GET", url })).headers["cache-control"]).toBe("no-cache");
    }
  });

  it("does not serve files outside the web root", async () => {
    for (const url of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/..%2f..%2fetc%2fpasswd"]) {
      const res = await t.app.inject({ method: "GET", url });
      expect(res.body).not.toContain("TOPSECRET");
      expect(res.body).not.toContain("root:");
    }
  });
});
