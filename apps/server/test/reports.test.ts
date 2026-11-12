import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
afterAll(() => t.close());

type Method = "GET" | "POST" | "DELETE";
const call = (method: Method, url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

let n = 0;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: ++n, g: 20, b: 30 } } }).png().toBuffer() as Promise<Buffer<ArrayBuffer>>;
async function upload(cookie: string, fields: Record<string, string> = {}, file?: Buffer<ArrayBuffer>) {
  const b = "----cherry" + Math.random().toString(16).slice(2);
  const all = { title: "Berry", tags: "", license: "cc0", attribution: "", visibility: "private", confirmed: "true", ...fields };
  const parts = Object.entries(all).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file ?? (await png()), Buffer.from(`\r\n--${b}--\r\n`),
  );
  return t.app.inject({ method: "POST", url: "/api/assets", payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${b}`, cookie } });
}
const uploadAsset = async (cookie: string, fields: Record<string, string> = {}) =>
  (await upload(cookie, fields)).json().asset.id as string;
const uploadShape = async (cookie: string, over: object = {}) => (await call("POST", "/api/shapes", cookie,
  { name: "Box", visibility: "private", d: "m10 10 h20 v20 h-20 z", fillRule: "nonzero", ...over })).json().shape.id as string;
const newDesign = async (cookie: string, ws: string) => (await call("POST", `/api/workspaces/${ws}/designs`, cookie,
  { title: "D", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design.id as string;

async function workspaceWith(role: "editor" | "admin") {
  const ada = await signUp(t.app, "ada@example.com", "Ada");
  const bo = await signUp(t.app, "bo@example.com", "Bo");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  return { ada, bo, ws: workspace.id as string };
}
const report = (cookie: string, targetType: string, targetId: string, over: object = {}) =>
  call("POST", "/api/reports", cookie, { targetType, targetId, reason: "spam", ...over });

describe("filing", () => {
  it("reports a visible asset and shape once per reporter", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const a = await uploadAsset(ada.cookie, { visibility: "public" });
    const s = await uploadShape(ada.cookie, { visibility: "public" });
    for (const [type, id] of [["asset", a], ["shape", s]] as const) {
      const first = await report(bo.cookie, type, id);
      expect(first.statusCode).toBe(201);
      const again = await report(bo.cookie, type, id, { reason: "copyright" });
      expect(again.statusCode).toBe(200);
      expect(again.json().report.id).toBe(first.json().report.id);
    }
  });

  it("rejects own items, invisible targets and bad input", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const own = await uploadAsset(ada.cookie, { visibility: "public" });
    const priv = await uploadAsset(ada.cookie);
    const shape = await uploadShape(ada.cookie);
    const r = await report(ada.cookie, "asset", own);
    expect([r.statusCode, r.json().error]).toEqual([400, "invalid_body"]);
    expect((await report(bo.cookie, "asset", priv)).statusCode).toBe(404);
    expect((await report(bo.cookie, "shape", shape)).statusCode).toBe(404);
    expect((await report(bo.cookie, "asset", "nope")).statusCode).toBe(404);
    expect((await report(bo.cookie, "asset", own, { reason: "rude" })).statusCode).toBe(400);
    expect((await report(bo.cookie, "asset", own, { note: "x".repeat(501) })).statusCode).toBe(400);
    expect((await report(bo.cookie, "banana", own)).statusCode).toBe(400);
  });

  it("an asset seen only through a design cannot be reported", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const a = await uploadAsset(ada.cookie); // private
    await call("POST", `/api/designs/${await newDesign(ada.cookie, ws)}/assets`, ada.cookie, { assetId: a });
    expect((await call("GET", `/api/assets/${a}`, bo.cookie)).statusCode).toBe(200);
    expect((await report(bo.cookie, "asset", a)).statusCode).toBe(404);
  });
});

describe("workspace queue", () => {
  it("lists one row per target for an admin and refuses others", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const cy = await signUp(t.app, "cy@example.com");
    const a = await uploadAsset(bo.cookie, { visibility: "workspace", workspaceId: ws, title: "Logo" });
    const s = await uploadShape(bo.cookie, { visibility: "workspace", workspaceId: ws, name: "Star" });
    await uploadAsset(bo.cookie, { visibility: "public" });
    await report(ada.cookie, "asset", a, { reason: "copyright" });
    expect((await report(cy.cookie, "asset", a)).statusCode).toBe(404); // not a member
    expect((await report(ada.cookie, "shape", s, { reason: "spam", note: "meh" })).statusCode).toBe(201);
    const { reports } = (await call("GET", `/api/workspaces/${ws}/reports`, ada.cookie)).json();
    expect(reports).toHaveLength(2);
    expect(reports.find((r: { targetId: string }) => r.targetId === a)).toMatchObject(
      { targetType: "asset", title: "Logo", reason: "copyright", reporterName: "Ada", count: 1 });
    expect(reports.find((r: { targetId: string }) => r.targetId === s)).toMatchObject(
      { targetType: "shape", title: "Star", note: "meh" });
    expect((await call("GET", `/api/workspaces/${ws}/reports`, bo.cookie)).statusCode).toBe(403);
    expect((await call("GET", `/api/workspaces/${ws}/reports`, cy.cookie)).statusCode).toBe(404);
  });

  it("counts reporters and shows the newest reason", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "W", accessMode: "invite" })).json();
    const users = [await signUp(t.app, "bo@example.com", "Bo"), await signUp(t.app, "cy@example.com", "Cy")];
    for (const u of users) {
      const email = u === users[0] ? "bo@example.com" : "cy@example.com";
      const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email, role: "editor" });
      await call("POST", `/api/invitations/${inv.json().token}/accept`, u.cookie);
    }
    const a = await uploadAsset(ada.cookie, { visibility: "workspace", workspaceId: workspace.id });
    await report(users[0]!.cookie, "asset", a);
    await report(users[1]!.cookie, "asset", a, { reason: "other" });
    const { reports } = (await call("GET", `/api/workspaces/${workspace.id}/reports`, ada.cookie)).json();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ count: 2, reason: "other", reporterName: "Cy" });
  });
});

describe("resolve", () => {
  async function queued() {
    const { ada, bo, ws } = await workspaceWith("editor");
    const a = await uploadAsset(bo.cookie, { visibility: "workspace", workspaceId: ws });
    const s = await uploadShape(bo.cookie, { visibility: "workspace", workspaceId: ws });
    const ra = (await report(ada.cookie, "asset", a)).json().report.id;
    const rs = (await report(ada.cookie, "shape", s)).json().report.id;
    return { ada, bo, ws, a, s, ra, rs };
  }
  const queue = async (cookie: string, ws: string) => (await call("GET", `/api/workspaces/${ws}/reports`, cookie)).json().reports;

  it("remove deletes the target on behalf of the admin and empties the queue", async () => {
    const { ada, ws, a, s, ra, rs } = await queued();
    expect((await call("POST", `/api/reports/${ra}/resolve`, ada.cookie, { action: "remove" })).statusCode).toBe(204);
    expect((await call("POST", `/api/reports/${rs}/resolve`, ada.cookie, { action: "remove" })).statusCode).toBe(204);
    expect((await call("GET", `/api/assets/${a}`, ada.cookie)).statusCode).toBe(404);
    const shapes = (await call("GET", `/api/shapes?scope=workspace&workspaceId=${ws}`, ada.cookie)).json().shapes;
    expect(shapes.map((x: { id: string }) => x.id)).not.toContain(s);
    expect(await queue(ada.cookie, ws)).toEqual([]);
    expect(t.storage.keys().length).toBe(0); // bytes cleaned up like a normal delete
  });

  it("dismiss keeps the target and empties the queue", async () => {
    const { ada, ws, a, ra } = await queued();
    expect((await call("POST", `/api/reports/${ra}/resolve`, ada.cookie, { action: "dismiss" })).statusCode).toBe(204);
    expect((await call("GET", `/api/assets/${a}`, ada.cookie)).statusCode).toBe(200);
    expect((await queue(ada.cookie, ws)).map((r: { targetId: string }) => r.targetId)).not.toContain(a);
  });

  it("an editor cannot resolve, a stranger sees nothing, bad actions fail", async () => {
    const { ada, bo, ra } = await queued();
    const cy = await signUp(t.app, "cy@example.com");
    expect((await call("POST", `/api/reports/${ra}/resolve`, bo.cookie, { action: "remove" })).statusCode).toBe(403);
    expect((await call("POST", `/api/reports/${ra}/resolve`, cy.cookie, { action: "remove" })).statusCode).toBe(404);
    expect((await call("POST", `/api/reports/${ra}/resolve`, ada.cookie, { action: "nuke" })).statusCode).toBe(400);
    expect((await call("POST", "/api/reports/nope/resolve", ada.cookie, { action: "remove" })).statusCode).toBe(404);
  });

  it("a removed asset that a design uses is soft-deleted, not purged", async () => {
    const { ada, bo, ws, a, ra } = await queued();
    await call("POST", `/api/designs/${await newDesign(bo.cookie, ws)}/assets`, bo.cookie, { assetId: a });
    await call("POST", `/api/reports/${ra}/resolve`, ada.cookie, { action: "remove" });
    expect((await call("GET", `/api/assets/${a}/file`, bo.cookie)).statusCode).toBe(200);
  });
});

describe("hide rule", () => {
  async function crowd() {
    const uploader = await signUp(t.app, "ada@example.com");
    const reporters = [] as { cookie: string }[];
    for (const e of ["r1", "r2", "r3"]) reporters.push(await signUp(t.app, `${e}@example.com`));
    const viewer = await signUp(t.app, "v@example.com");
    return { uploader, reporters, viewer };
  }
  const ids = async (url: string, cookie: string, key: string) =>
    (await call("GET", url, cookie)).json()[key].map((x: { id: string }) => x.id);

  it("three reporters hide a public asset from others, two do not", async () => {
    const { uploader, reporters, viewer } = await crowd();
    const a = await uploadAsset(uploader.cookie, { visibility: "public" });
    for (const r of reporters.slice(0, 2)) await report(r.cookie, "asset", a);
    expect(await ids("/api/assets?scope=public", viewer.cookie, "assets")).toContain(a);
    await report(reporters[2]!.cookie, "asset", a);
    expect(await ids("/api/assets?scope=public", viewer.cookie, "assets")).not.toContain(a);
    expect(await ids("/api/assets?scope=mine", uploader.cookie, "assets")).toContain(a);
    expect(await ids("/api/assets?scope=public", uploader.cookie, "assets")).toContain(a);
  });

  it("hides from by-hash too, except for the uploader", async () => {
    const { uploader, reporters, viewer } = await crowd();
    const bytes = await png();
    const id = (await upload(uploader.cookie, { visibility: "public" }, bytes)).json().asset.id;
    const sha = createHash("sha256").update(bytes).digest("hex");
    for (const r of reporters) await report(r.cookie, "asset", id);
    expect((await call("GET", `/api/assets/by-hash/${sha}`, viewer.cookie)).statusCode).toBe(404);
    expect((await call("GET", `/api/assets/by-hash/${sha}`, uploader.cookie)).statusCode).toBe(200);
  });

  it("applies the same rule to public shapes", async () => {
    const { uploader, reporters, viewer } = await crowd();
    const s = await uploadShape(uploader.cookie, { visibility: "public" });
    for (const r of reporters.slice(0, 2)) await report(r.cookie, "shape", s);
    expect(await ids("/api/shapes?scope=public", viewer.cookie, "shapes")).toContain(s);
    await report(reporters[2]!.cookie, "shape", s);
    expect(await ids("/api/shapes?scope=public", viewer.cookie, "shapes")).not.toContain(s);
    expect(await ids("/api/shapes?scope=mine", uploader.cookie, "shapes")).toContain(s);
    expect(await ids("/api/shapes?scope=public", uploader.cookie, "shapes")).toContain(s);
  });

  it("only open reports count", async () => {
    const { uploader, reporters, viewer } = await crowd();
    const a = await uploadAsset(uploader.cookie, { visibility: "public" });
    for (const r of reporters) await report(r.cookie, "asset", a);
    await t.db.execute(sql`update reports set status = 'dismissed'`);
    expect(await ids("/api/assets?scope=public", viewer.cookie, "assets")).toContain(a);
  });
});
