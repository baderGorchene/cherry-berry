import { eq } from "drizzle-orm";
import sharp from "sharp";
import * as Y from "yjs";
import { replaceDocument, yToDoc, type CherryNode } from "@cherry/doc";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assetUses, assets, reports, shapes, templates, user } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp({ adminEmails: ["root@example.com"] }); });
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
afterAll(() => t.close());

type Method = "GET" | "POST" | "PUT";
const call = (method: Method, url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
const admin = () => signUp(t.app, "root@example.com", "Root");
const queue = async (cookie: string) => (await call("GET", "/api/admin/moderation", cookie)).json().items as Record<string, unknown>[];
const act = (cookie: string, type: string, id: string, action: string) => call("POST", `/api/admin/moderation/${type}/${id}`, cookie, { action });

let n = 0;
async function asset(createdBy: string, over: Partial<typeof assets.$inferInsert> = {}) {
  const sha256 = `mod${++n}`;
  await t.storage.put(`files/${sha256}`, await sharp({ create: { width: 4, height: 4, channels: 3, background: "#00f" } }).png().toBuffer(), "image/png");
  const [a] = await t.db.insert(assets).values({
    createdBy, visibility: "public", title: "Berry", tags: [], license: "cc0", kind: "image", format: "png", width: 4, height: 4, bytes: 1, sha256, ...over,
  }).returning();
  return a!.id;
}
const shape = async (createdBy: string, visibility = "public") => (await t.db.insert(shapes).values({
  createdBy, visibility, name: "Box", tags: [], d: "m0 0h1v1z", width: 1, height: 1, fillRule: "nonzero",
}).returning())[0]!.id;
async function template(createdBy: string, workspaceId: string) {
  const [x] = await t.db.insert(templates).values({
    workspaceId, visibility: "public", license: "cc0", name: "Poster", category: "other", width: 1, height: 1, unit: "px",
    colorMode: "rgb", state: new Uint8Array([0]), createdBy,
  }).returning();
  await t.storage.put(`template-thumbs/${x!.id}.webp`, new Uint8Array([1]), "image/webp");
  return x!.id;
}
const workspaceOf = async (cookie: string) =>
  (await call("POST", "/api/workspaces", cookie, { name: "North", accessMode: "invite" })).json().workspace.id as string;
async function reportBy(targetType: string, targetId: string, ...emails: string[]) {
  for (const e of emails) {
    const [u] = await t.db.select().from(user).where(eq(user.email, e));
    const id = u?.id ?? (await signUp(t.app, e)).userId;
    await t.db.insert(reports).values({ targetType, targetId, reporterId: id, reason: "spam", note: `by ${e}` });
  }
}
const statuses = async (id: string) => (await t.db.select().from(reports).where(eq(reports.targetId, id))).map((r) => r.status);

describe("moderation queue", () => {
  it("queue lists public reported targets once with a count", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com", "Ada");
    const pub = await asset(ada.userId);
    const priv = await asset(ada.userId, { visibility: "private" });
    const wsAsset = await asset(ada.userId, { visibility: "workspace", workspaceId: await workspaceOf(ada.cookie), license: "workspace-only" });
    const sh = await shape(ada.userId);
    await reportBy("asset", pub, "r1@example.com", "r2@example.com");
    await reportBy("asset", priv, "r1@example.com");
    await reportBy("asset", wsAsset, "r1@example.com");
    await reportBy("shape", sh, "r1@example.com");
    const items = await queue(a.cookie);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.targetId === pub)).toMatchObject({
      kind: "report", targetType: "asset", title: "Berry", uploader: { id: ada.userId, name: "Ada" }, visibility: "public",
      license: "cc0", reason: "spam", note: "by r2@example.com", count: 2,
    });
    expect(items.find((i) => i.targetId === sh)).toMatchObject({ kind: "report", targetType: "shape", count: 1 });
    expect((await call("GET", "/api/admin/overview", a.cookie)).json().queue).toBe(2);
  });

  it("keep dismisses and unhides", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com");
    const cy = await signUp(t.app, "cy@example.com");
    const id = await asset(ada.userId);
    await reportBy("asset", id, "r1@example.com", "r2@example.com", "r3@example.com");
    const ids = async () => (await call("GET", "/api/assets?scope=public", cy.cookie)).json().assets.map((x: { id: string }) => x.id);
    expect(await ids()).not.toContain(id);
    expect((await act(a.cookie, "asset", id, "keep")).statusCode).toBe(204);
    expect(await ids()).toContain(id);
    expect(await statuses(id)).toEqual(["dismissed", "dismissed", "dismissed"]);
    expect(await queue(a.cookie)).toEqual([]);
    expect((await act(a.cookie, "asset", id, "keep")).statusCode).toBe(400); // nothing open any more
  });

  it("remove deletes and marks reports removed", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com");
    const as = await asset(ada.userId);
    const sh = await shape(ada.userId);
    const tp = await template(ada.userId, await workspaceOf(ada.cookie));
    for (const [type, id] of [["asset", as], ["shape", sh], ["template", tp]] as const) {
      await reportBy(type, id, "r1@example.com");
      expect((await act(a.cookie, type, id, "remove")).statusCode).toBe(204);
      expect(await statuses(id)).toEqual(["removed"]);
    }
    expect(await t.db.select().from(assets)).toHaveLength(0);
    expect(await t.db.select().from(shapes)).toHaveLength(0);
    expect(await t.db.select().from(templates)).toHaveLength(0);
    expect(t.storage.keys()).not.toContain(`template-thumbs/${tp}.webp`);
    expect(await queue(a.cookie)).toEqual([]);
    expect((await act(a.cookie, "asset", as, "remove")).statusCode).toBe(404);
    expect((await act(a.cookie, "asset", "nope", "remove")).statusCode).toBe(404);
  });

  it("suspend removes and suspends the uploader", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com");
    const id = await asset(ada.userId);
    await reportBy("asset", id, "r1@example.com");
    expect((await act(a.cookie, "asset", id, "suspend")).statusCode).toBe(204);
    expect(await t.db.select().from(assets)).toHaveLength(0);
    expect((await t.db.select().from(user).where(eq(user.id, ada.userId)))[0]!.suspendedAt).not.toBeNull();
    expect((await call("GET", "/api/assets?scope=mine", ada.cookie)).statusCode).toBe(401);

    const boss = await signUp(t.app, "root2@example.com"); // not an admin: root@example.com is the only one
    expect(boss.userId).toBeTruthy();
    const mine = await asset(a.userId);
    await reportBy("asset", mine, "r1@example.com");
    expect((await act(a.cookie, "asset", mine, "suspend")).statusCode).toBe(400);
    expect(await t.db.select().from(assets).where(eq(assets.id, mine))).toHaveLength(1); // nothing was removed
    expect((await act(a.cookie, "asset", mine, "remove")).statusCode).toBe(204);
  });

  it("sanitized public svg is listed until approved", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com", "Ada");
    const flagged = await asset(ada.userId, { kind: "svg", format: "svg", sanitized: true, title: "Logo" });
    await asset(ada.userId, { kind: "svg", format: "svg" });
    await asset(ada.userId, { kind: "svg", format: "svg", sanitized: true, visibility: "private" });
    expect(await queue(a.cookie)).toEqual([expect.objectContaining({ kind: "sanitized", targetType: "asset", targetId: flagged, title: "Logo", uploader: { id: ada.userId, name: "Ada" } })]);
    expect((await act(a.cookie, "asset", flagged, "keep")).statusCode).toBe(400);
    expect((await act(a.cookie, "asset", flagged, "approve")).statusCode).toBe(204);
    expect(await queue(a.cookie)).toEqual([]);
    expect((await act(a.cookie, "asset", flagged, "approve")).statusCode).toBe(400);
    const again = await asset(ada.userId, { sanitized: true });
    expect((await act(a.cookie, "asset", again, "remove")).statusCode).toBe(204);
    expect(await queue(a.cookie)).toEqual([]);
    await reportBy("shape", await shape(ada.userId), "r1@example.com");
    const [row] = await queue(a.cookie);
    expect((await act(a.cookie, "shape", row!.targetId as string, "approve")).statusCode).toBe(400);
  });

  it("removed asset still lets designs export", async () => {
    const a = await admin();
    const ada = await signUp(t.app, "ada@example.com");
    const id = await asset(ada.userId);
    const ws = await workspaceOf(ada.cookie);
    const did = (await call("POST", `/api/workspaces/${ws}/designs`, ada.cookie, { title: "P", colorMode: "rgb", width: 100, height: 50, unit: "px" })).json().design.id as string;
    const d = new Y.Doc();
    Y.applyUpdate(d, Buffer.from((await call("GET", `/api/designs/${did}`, ada.cookie)).json().state, "base64"));
    const r = yToDoc(d);
    if (!r.ok) throw new Error(r.error);
    r.doc.pages[0]!.nodes.push({ name: "n", rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none",
      id: crypto.randomUUID(), kind: "image", x: 0, y: 0, width: 60, height: 30, assetId: id } as CherryNode);
    replaceDocument(d, r.doc);
    expect((await call("PUT", `/api/designs/${did}/state`, ada.cookie, { state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64") })).statusCode).toBe(200);
    await t.db.insert(assetUses).values({ designId: did, assetId: id });
    await reportBy("asset", id, "r1@example.com");
    expect((await act(a.cookie, "asset", id, "remove")).statusCode).toBe(204);
    expect((await call("GET", "/api/assets?scope=public", ada.cookie)).json().assets).toEqual([]);
    expect(await queue(a.cookie)).toEqual([]);
    const res = await call("POST", `/api/designs/${did}/export`, ada.cookie, { format: "png", pageIds: r.doc.pages.map((p) => p.id) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });

  it("queue is admin-only", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const id = await asset(ada.userId);
    expect((await t.app.inject({ method: "GET", url: "/api/admin/moderation" })).statusCode).toBe(401);
    expect((await call("GET", "/api/admin/moderation", ada.cookie)).statusCode).toBe(403);
    expect((await act(ada.cookie, "asset", id, "remove")).statusCode).toBe(403);
    const a = await admin();
    expect((await call("POST", `/api/admin/moderation/banana/${id}`, a.cookie, { action: "remove" })).statusCode).toBe(400);
    expect((await call("POST", `/api/admin/moderation/asset/${id}`, a.cookie, { action: "nuke" })).statusCode).toBe(400);
    expect(await t.db.select().from(assets)).toHaveLength(1);
  });
});
