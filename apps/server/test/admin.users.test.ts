import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assets, brandFonts, brandKits, designs, memberships, user, workspaces } from "../src/db/schema";
import { saveSettings, type InstanceSettings } from "../src/admin/settings";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp({ adminEmails: ["root@example.com", "root2@example.com"] }); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const get = (url: string, cookie?: string) => t.app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
const post = (url: string, cookie?: string) => t.app.inject({ method: "POST", url, headers: cookie ? { cookie } : {} });
const signIn = (email: string) => t.app.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: { email, password: "berrypass1" } });
const admin = () => signUp(t.app, "root@example.com");
const settings: InstanceSettings = { registration: "open", allowedDomains: [], workspaceCreation: "anyone", maxUploadMb: 50, storageQuotaGb: null };

async function seedAsset(createdBy: string, bytes: number, workspaceId: string | null = null, n = Math.random()) {
  await t.db.insert(assets).values({
    createdBy, workspaceId, visibility: workspaceId ? "workspace" : "private", title: "a", tags: [], license: workspaceId ? "workspace-only" : "own",
    kind: "image", format: "png", width: 1, height: 1, bytes, sha256: `h${n}`,
  });
}
async function seedWorkspace(createdBy: string, name: string) {
  const [w] = await t.db.insert(workspaces).values({ name, publicId: `p-${name}`, accessMode: "invite", createdBy }).returning();
  await t.db.insert(memberships).values({ workspaceId: w!.id, userId: createdBy, role: "owner", joinedVia: "created" });
  return w!;
}

describe("admin overview and lists", () => {
  it("overview reports counts and storage", async () => {
    const a = await admin();
    const bo = await signUp(t.app, "bo@example.com");
    const w = await seedWorkspace(bo.userId, "North");
    await t.db.insert(designs).values({ workspaceId: w.id, title: "D", width: 1, height: 1, unit: "px", colorMode: "rgb", state: Buffer.from([0]), createdBy: bo.userId });
    await seedAsset(bo.userId, 1000, w.id);
    await seedAsset(bo.userId, 500);
    const [kit] = await t.db.insert(brandKits).values({ workspaceId: w.id, name: "K", content: {}, createdBy: bo.userId }).returning();
    await t.db.insert(brandFonts).values({ kitId: kit!.id, family: "F", weight: 400, style: "normal", format: "woff2", sha256: "f", bytes: 250, createdBy: bo.userId });
    await saveSettings(t.db, { ...settings, storageQuotaGb: 2 });
    const res = await get("/api/admin/overview", a.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      version: "0.0.0", database: "PGlite", storage: "In memory (testing)", usedBytes: 1750, quotaBytes: 2 * 1024 ** 3,
      users: 2, workspaces: 1, designs: 1, queue: 0,
    });
  });

  it("users list pages and searches", async () => {
    const a = await admin();
    for (let i = 0; i < 54; i++) {
      await t.db.insert(user).values({ id: `u${i}`, name: `User ${i}`, email: i === 7 ? "bob@x.com" : `u${i}@x.com` });
    }
    const p1 = (await get("/api/admin/users", a.cookie)).json();
    expect(p1.users).toHaveLength(50);
    expect(p1.next).toBeTruthy();
    const p2 = (await get(`/api/admin/users?cursor=${encodeURIComponent(p1.next)}`, a.cookie)).json();
    expect(p2.users).toHaveLength(5);
    expect(p2.next).toBeNull();
    const ids = [...p1.users, ...p2.users].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(55);
    const found = (await get("/api/admin/users?q=BOB", a.cookie)).json();
    expect(found.users.map((u: { email: string }) => u.email)).toEqual(["bob@x.com"]);
    expect(found.users[0]).toMatchObject({ suspended: false, admin: false, workspaces: 0, usedBytes: 0 });
    expect([...p1.users, ...p2.users].find((u: { email: string }) => u.email === "root@example.com").admin).toBe(true);
  });

  it("storage by workspace is top 20", async () => {
    const a = await admin();
    for (let i = 1; i <= 22; i++) {
      const w = await seedWorkspace(a.userId, `W${i}`);
      await seedAsset(a.userId, i * 10, w.id, i);
    }
    await seedAsset(a.userId, 7);
    const r = (await get("/api/admin/storage", a.cookie)).json();
    expect(r.byWorkspace).toHaveLength(20);
    expect(r.byWorkspace[0]).toMatchObject({ name: "W22", usedBytes: 220 });
    expect(r.byWorkspace[19]).toMatchObject({ name: "W3", usedBytes: 30 });
    expect(r.personalBytes).toBe(7);
    expect(r.usedBytes).toBe(2537);
    expect(r.quotaBytes).toBeNull();
    const ws = (await get("/api/admin/workspaces", a.cookie)).json();
    expect(ws.workspaces).toHaveLength(22);
    expect(ws.workspaces[0]).toMatchObject({ members: 1, designs: 0 });
  });
});

describe("suspension", () => {
  it("admins cannot be suspended", async () => {
    const a = await admin();
    const b = await signUp(t.app, "root2@example.com");
    expect((await post(`/api/admin/users/${a.userId}/suspend`, a.cookie)).statusCode).toBe(400);
    const r = await post(`/api/admin/users/${b.userId}/suspend`, a.cookie);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: "invalid_body" });
    expect((await get("/api/workspaces/mine", b.cookie)).statusCode).toBe(200);
    expect((await post("/api/admin/users/nobody/suspend", a.cookie)).statusCode).toBe(404);
  });

  it("suspension ends sessions and blocks sign-in", async () => {
    const a = await admin();
    const bo = await signUp(t.app, "bo@example.com");
    expect((await get("/api/workspaces/mine", bo.cookie)).statusCode).toBe(200);
    expect((await post(`/api/admin/users/${bo.userId}/suspend`, a.cookie)).statusCode).toBe(204);
    expect((await get("/api/workspaces/mine", bo.cookie)).statusCode).toBe(401);
    const denied = await signIn("bo@example.com");
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("suspended");
    expect((await get("/api/admin/users?q=bo@", a.cookie)).json().users[0].suspended).toBe(true);
    expect((await post(`/api/admin/users/${bo.userId}/unsuspend`, a.cookie)).statusCode).toBe(204);
    expect((await signIn("bo@example.com")).statusCode).toBe(200);
  });
});

describe("quota and access", () => {
  it("quota blocks uploads", async () => {
    const bo = await signUp(t.app, "bo@example.com");
    await saveSettings(t.db, { ...settings, storageQuotaGb: 1 });
    await seedAsset(bo.userId, 1024 ** 3 - 10);
    const file = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#8E1EA2" } }).png().toBuffer();
    const b = "----q";
    const field = (k: string, v: string) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    const payload = Buffer.concat([
      field("title", "T"), field("tags", ""), field("license", "cc0"), field("visibility", "private"), field("confirmed", "true"),
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const res = await t.app.inject({ method: "POST", url: "/api/assets", payload, headers: { cookie: bo.cookie, "content-type": `multipart/form-data; boundary=${b}` } });
    expect(res.statusCode).toBe(507);
    expect(res.json()).toEqual({ error: "storage_full" });
  });

  it("non-admins get 403 on every admin route", async () => {
    const bo = await signUp(t.app, "bo@example.com");
    for (const [m, u] of [["GET", "/api/admin/overview"], ["GET", "/api/admin/users"], ["POST", "/api/admin/users/x/suspend"],
      ["POST", "/api/admin/users/x/unsuspend"], ["GET", "/api/admin/workspaces"], ["GET", "/api/admin/storage"]] as const) {
      const r = await t.app.inject({ method: m, url: u, headers: { cookie: bo.cookie } });
      expect([m, u, r.statusCode]).toEqual([m, u, 403]);
      expect((await t.app.inject({ method: m, url: u })).statusCode).toBe(401);
    }
  });
});
