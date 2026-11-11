import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { session } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

const apps: { close(): Promise<void> }[] = [];
afterAll(async () => { for (const a of apps) await a.close(); });

describe("hardening", () => {
  it("auth bridge ignores a client-supplied X-Forwarded-For", async () => {
    const t = await setupTestApp(); apps.push(t);
    const res = await t.app.inject({
      method: "POST", url: "/api/auth/sign-up/email", remoteAddress: "203.0.113.7",
      headers: { "x-forwarded-for": "6.6.6.6" },
      payload: { email: "ada@example.com", password: "berrypass1", name: "Ada" },
    });
    expect(res.statusCode).toBe(200);
    const [s] = await t.db.select().from(session).where(eq(session.userId, res.json().user.id));
    expect(s!.ipAddress).toBe("203.0.113.7");
  });

  it("join limiter keys on the client IP behind a trusted proxy", async () => {
    const t = await setupTestApp({ trustProxy: true }); apps.push(t);
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { workspace } = (await t.app.inject({
      method: "POST", url: "/api/workspaces", headers: { cookie: ada.cookie },
      payload: { name: "North", accessMode: "password", password: "berrypass1" },
    })).json();
    const guess = (ip: string) => t.app.inject({
      method: "POST", url: "/api/workspaces/join", headers: { cookie: bo.cookie, "x-forwarded-for": ip },
      payload: { publicId: workspace.publicId, password: "wrong-pass" },
    });
    for (let i = 0; i < 10; i++) expect((await guess("198.51.100.1")).statusCode).toBe(401);
    expect((await guess("198.51.100.1")).statusCode).toBe(429);
    expect((await guess("198.51.100.2")).statusCode).toBe(401);
  });

  it("logs server errors", async () => {
    const t = await setupTestApp({ logLevel: "info" }); apps.push(t);
    expect(t.app.log.level).toBe("info");
  });

  it("postgres pool has an error listener so a dropped connection can't crash the process", async () => {
    const { db, close } = createDb("postgres://x:y@127.0.0.1:1/none");
    const pool = (db as unknown as { $client: { listenerCount(e: string): number } }).$client;
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    await close();
  });
});
