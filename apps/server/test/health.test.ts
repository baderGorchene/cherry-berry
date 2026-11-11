import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
afterAll(() => t.close());

describe("health", () => {
  it("health is ok", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
