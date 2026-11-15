import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { invitations, workspaces } from "../src/db/schema";
import { getSettings, saveSettings, type InstanceSettings } from "../src/admin/settings";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp({ adminEmails: ["root@example.com"] }); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const base: InstanceSettings = { registration: "open", allowedDomains: [], workspaceCreation: "anyone", maxUploadMb: 50, storageQuotaGb: null };
const put = (cookie: string | undefined, settings: object) =>
  t.app.inject({ method: "PUT", url: "/api/admin/settings", headers: cookie ? { cookie } : {}, payload: settings });
const trySignUp = (email: string) =>
  t.app.inject({ method: "POST", url: "/api/auth/sign-up/email", payload: { email, password: "berrypass1", name: "N" } });
const admin = () => signUp(t.app, "root@example.com");

describe("instance settings", () => {
  it("settings default when no row exists", async () => {
    expect(await getSettings(t.db)).toEqual(base);
  });

  it("only admins read and write settings", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/admin/settings" })).statusCode).toBe(401);
    const bo = await signUp(t.app, "bo@example.com");
    const denied = await t.app.inject({ method: "GET", url: "/api/admin/settings", headers: { cookie: bo.cookie } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "forbidden" });
    expect((await put(bo.cookie, base)).statusCode).toBe(403);
    const a = await admin();
    expect((await put(a.cookie, { ...base, maxUploadMb: 20 })).json()).toEqual({ settings: { ...base, maxUploadMb: 20 } });
    expect((await t.app.inject({ method: "GET", url: "/api/admin/settings", headers: { cookie: a.cookie } })).json())
      .toEqual({ settings: { ...base, maxUploadMb: 20 } });
  });

  it("saving normalises domains", async () => {
    const a = await admin();
    const ok = await put(a.cookie, { ...base, registration: "domains", allowedDomains: [" @Acme.COM ", "acme.com"] });
    expect(ok.json().settings.allowedDomains).toEqual(["acme.com"]);
    const bad = await put(a.cookie, { ...base, allowedDomains: ["localhost"] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: "invalid_body" });
    expect((await put(a.cookie, { ...base, maxUploadMb: 30 })).statusCode).toBe(400);
    expect((await put(a.cookie, { ...base, storageQuotaGb: 0 })).statusCode).toBe(400);
  });
});

describe("registration policy", () => {
  it("domain policy matches exactly", async () => {
    const a = await admin();
    await put(a.cookie, { ...base, registration: "domains", allowedDomains: ["acme.com"] });
    expect((await trySignUp("Bob@Acme.com")).statusCode).toBe(200);
    for (const e of ["x@evil-acme.com", "x@acme.com.evil.io", "x@sub.acme.com"]) {
      const r = await trySignUp(e);
      expect(r.statusCode).toBe(403);
      expect(r.json().code).toBe("registration_closed");
    }
  });

  it("invited policy needs a live invitation", async () => {
    const a = await admin();
    const [w] = await t.db.insert(workspaces).values({ name: "W", publicId: "w-1", accessMode: "invite", createdBy: a.userId }).returning();
    const inv = (email: string, expiresAt: Date, acceptedAt: Date | null = null) =>
      t.db.insert(invitations).values({
        workspaceId: w!.id, email, role: "editor", invitedBy: a.userId, expiresAt, acceptedAt,
        tokenHash: createHash("sha256").update(email).digest("hex"),
      });
    const future = new Date(Date.now() + 86_400_000), past = new Date(Date.now() - 86_400_000);
    await inv("live@example.com", future);
    await inv("old@example.com", past);
    await inv("used@example.com", future, new Date());
    await put(a.cookie, { ...base, registration: "invited" });
    expect((await trySignUp("Live@Example.com")).statusCode).toBe(200);
    expect((await trySignUp("old@example.com")).statusCode).toBe(403);
    expect((await trySignUp("used@example.com")).statusCode).toBe(403);
    expect((await trySignUp("nobody@example.com")).statusCode).toBe(403);
  });

  it("admin email signs up under any policy", async () => {
    await saveSettings(t.db, { ...base, registration: "invited" });
    expect((await trySignUp("Root@Example.com")).statusCode).toBe(200);
  });

  it("existing users still sign in after registration closes", async () => {
    await signUp(t.app, "ada@example.com");
    const a = await admin();
    await put(a.cookie, { ...base, registration: "invited" });
    const r = await t.app.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: { email: "ada@example.com", password: "berrypass1" } });
    expect(r.statusCode).toBe(200);
  });
});

describe("workspace creation and uploads", () => {
  it("admins-only workspace creation", async () => {
    const a = await admin();
    const bo = await signUp(t.app, "bo@example.com");
    await put(a.cookie, { ...base, workspaceCreation: "admins" });
    const body = { name: "W", accessMode: "invite" };
    const denied = await t.app.inject({ method: "POST", url: "/api/workspaces", headers: { cookie: bo.cookie }, payload: body });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "forbidden" });
    expect((await t.app.inject({ method: "POST", url: "/api/workspaces", headers: { cookie: a.cookie }, payload: body })).statusCode).toBe(201);
    const info = async (c: string) => (await t.app.inject({ method: "GET", url: "/api/instance", headers: { cookie: c } })).json();
    expect(await info(bo.cookie)).toEqual({ admin: false, canCreateWorkspace: false, maxUploadMb: 50 });
    expect(await info(a.cookie)).toEqual({ admin: true, canCreateWorkspace: true, maxUploadMb: 50 });
  });

  it("upload over max_upload_mb is too_large", async () => {
    const a = await admin();
    await put(a.cookie, { ...base, maxUploadMb: 20 });
    const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(21 * 1024 * 1024)]);
    const boundary = "XBOUNDARY";
    const field = (n: string, v: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
    const payload = Buffer.concat([
      Buffer.from(field("confirmed", "true") + field("title", "Big") + field("tags", "") + field("license", "own") + field("visibility", "private")),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      file, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await t.app.inject({
      method: "POST", url: "/api/assets",
      headers: { cookie: a.cookie, "content-type": `multipart/form-data; boundary=${boundary}` }, payload,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: "too_large" });
  });
});
