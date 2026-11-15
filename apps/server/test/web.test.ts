import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

const dist = mkdtempSync(join(tmpdir(), "cherry-web-"));
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>cherry</title>");
writeFileSync(join(dist, "assets", "a.js"), "console.log(1)");

let t: Awaited<ReturnType<typeof setupTestApp>>;
let bare: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  t = await setupTestApp({ webDist: dist });
  bare = await setupTestApp();
});
afterAll(async () => { await t.close(); await bare.close(); rmSync(dist, { recursive: true, force: true }); });

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
});
