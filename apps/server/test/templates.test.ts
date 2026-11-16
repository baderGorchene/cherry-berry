import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addNode, createShape, getPageIds, yToDoc, type CherryNode } from "@cherry/doc";
import { assetUses, assets } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let thumb = "";
beforeAll(async () => {
  t = await setupTestApp();
  thumb = (await sharp({ create: { width: 1000, height: 600, channels: 3, background: { r: 200, g: 20, b: 120 } } }).png().toBuffer()).toString("base64");
});
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
afterAll(() => t.close());

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const toYDoc = (state: string) => { const d = new Y.Doc(); Y.applyUpdate(d, Buffer.from(state, "base64")); return d; };

async function setup(role: "viewer" | "editor" | "admin" = "editor") {
  const ada = await signUp(t.app, "ada@example.com", "Ada");
  const bo = await signUp(t.app, "bo@example.com", "Bo");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  return { ada, bo, ws: workspace.id as string };
}
const newDesign = async (cookie: string, ws: string) =>
  (await call("POST", `/api/workspaces/${ws}/designs`, cookie, { title: "P", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design;
const insertAsset = async (createdBy: string, over: Record<string, unknown> = {}) => {
  const [a] = await t.db.insert(assets).values({
    createdBy, visibility: "public", title: "Pic", tags: [], license: "cc0", kind: "image", format: "png",
    width: 1, height: 1, bytes: 1, sha256: "x" + Math.random(), ...over,
  } as typeof assets.$inferInsert).returning();
  return a!.id;
};
/** Puts a rect and an image layer (when `assetId` is given) into the design. */
async function fill(cookie: string, designId: string, assetId?: string) {
  const d = toYDoc((await call("GET", `/api/designs/${designId}`, cookie)).json().state);
  const page = getPageIds(d)[0]!;
  addNode(d, page, { ...createShape("rect", { x: 1, y: 2, width: 30, height: 40 }), id: "rect1" } as CherryNode);
  if (assetId) {
    const { fill: _f, cornerRadius: _c, ...img } = createShape("rect", { x: 5, y: 5, width: 20, height: 20 }) as Record<string, unknown>;
    addNode(d, page, { ...img, id: "img1", kind: "image", assetId } as unknown as CherryNode);
  }
  const res = await call("PUT", `/api/designs/${designId}/state`, cookie, { state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64") });
  expect(res.statusCode).toBe(200);
}
const publish = (cookie: string, designId: string, over: object = {}) =>
  call("POST", `/api/designs/${designId}/template`, cookie, {
    name: "Poster", category: "print", visibility: "workspace", license: "cc0", attribution: "", thumb, ...over,
  });
const pubWs = async (cookie: string, ws: string, over: object = {}) =>
  (await publish(cookie, (await newDesign(cookie, ws)).id, over)).json().template;
const pubPublic = async (cookie: string, ws: string, over: object = {}) =>
  pubWs(cookie, ws, { visibility: "public", license: "cc0", ...over });
const newKit = async (cookie: string, ws: string, requireApproval: boolean) => {
  const kit = (await call("POST", `/api/workspaces/${ws}/brand-kits`, cookie, { name: "Berry" })).json().kit;
  await call("PUT", `/api/brand-kits/${kit.id}`, cookie, {
    name: "Berry", content: { ...kit.content, rules: { ...kit.content.rules, requireApproval } } });
  return kit.id as string;
};
const names = (res: { json(): { templates: { name: string }[] } }) => res.json().templates.map((x) => x.name);

describe("templates", () => {
  it("publishes a workspace template with a thumbnail", async () => {
    const { ada, bo, ws } = await setup();
    const d = await newDesign(bo.cookie, ws);
    const res = await publish(bo.cookie, d.id, { license: "cc0" });
    expect(res.statusCode).toBe(201);
    expect(res.json().template).toMatchObject({
      workspaceId: ws, visibility: "workspace", license: "workspace-only", status: "published", name: "Poster",
      category: "print", width: 100, height: 100, authorName: "Bo", mine: true, kitId: null, kitName: null,
    });
    const id = res.json().template.id;
    expect(t.storage.keys()).toContain(`template-thumbs/${id}.webp`);
    const img = await call("GET", `/api/templates/${id}/thumb`, ada.cookie);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    const meta = await sharp(img.rawPayload).metadata();
    expect([meta.format, meta.width]).toEqual(["webp", 480]);
    const list = await call("GET", `/api/templates?scope=workspace&workspaceId=${ws}`, ada.cookie);
    expect(list.json().templates).toHaveLength(1);
    expect(list.json().templates[0].mine).toBe(false);
    expect((await publish(bo.cookie, d.id, { thumb: Buffer.from("nope").toString("base64") })).json()).toEqual({ error: "invalid_image" });
    const jpeg = (await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).jpeg().toBuffer()).toString("base64");
    expect((await publish(bo.cookie, d.id, { thumb: jpeg })).json()).toEqual({ error: "invalid_image" });
  });

  it("viewers can't publish; outsiders get 404", async () => {
    const { ada, bo, ws } = await setup("viewer");
    const d = await newDesign(ada.cookie, ws);
    expect((await publish(bo.cookie, d.id)).statusCode).toBe(403);
    const cy = await signUp(t.app, "cy@example.com");
    expect((await publish(cy.cookie, d.id)).statusCode).toBe(404);
    expect((await call("GET", `/api/templates?scope=workspace&workspaceId=${ws}`, cy.cookie)).statusCode).toBe(404);
    expect((await publish(ada.cookie, d.id)).statusCode).toBe(201);
  });

  it("refuses a public template with a workspace visual", async () => {
    const { ada, ws } = await setup();
    const d = await newDesign(ada.cookie, ws);
    const wsAsset = await insertAsset(ada.userId, { visibility: "workspace", workspaceId: ws, license: "workspace-only" });
    await fill(ada.cookie, d.id, wsAsset);
    const res = await publish(ada.cookie, d.id, { visibility: "public" });
    expect([res.statusCode, res.json().error]).toEqual([400, "template_private_assets"]);
    expect((await publish(ada.cookie, d.id)).statusCode).toBe(201);
    const priv = await insertAsset(ada.userId, { visibility: "private", license: "own" });
    const d2 = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d2.id, priv);
    expect((await publish(ada.cookie, d2.id)).json().error).toBe("template_private_assets");
    const pub = await insertAsset(ada.userId);
    const d3 = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d3.id, pub);
    expect((await publish(ada.cookie, d3.id, { visibility: "public" })).statusCode).toBe(201);
  });

  it("public templates need cc0 or cc-by with attribution", async () => {
    const { ada, ws } = await setup();
    const d = await newDesign(ada.cookie, ws);
    for (const body of [
      { license: "workspace-only" }, { license: "cc-by", attribution: "" }, { license: "bogus" }, { name: "" },
      { attribution: "x".repeat(301) },
    ]) expect((await publish(ada.cookie, d.id, { visibility: "public", ...body })).statusCode).toBe(400);
    const ok = await publish(ada.cookie, d.id, { visibility: "public", license: "cc-by", attribution: "Ada" });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().template).toMatchObject({ license: "cc-by", attribution: "Ada", visibility: "public" });
  });

  it("brand templates must be workspace templates of the same workspace's kit", async () => {
    const { ada, ws } = await setup();
    const kit = await newKit(ada.cookie, ws, false);
    const d = await newDesign(ada.cookie, ws);
    const bad = await publish(ada.cookie, d.id, { visibility: "public", kitId: kit });
    expect([bad.statusCode, bad.json().error]).toEqual([400, "invalid_body"]);
    const other = (await call("POST", "/api/workspaces", ada.cookie, { name: "Other", accessMode: "invite" })).json().workspace.id;
    const foreign = await newKit(ada.cookie, other, false);
    expect((await publish(ada.cookie, d.id, { kitId: foreign })).json().error).toBe("invalid_body");
    expect((await publish(ada.cookie, d.id, { kitId: "nope" })).statusCode).toBe(400);
    const ok = await publish(ada.cookie, d.id, { kitId: kit });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().template).toMatchObject({ kitId: kit, kitName: "Berry", status: "published" });
  });

  it("requireApproval keeps an editor's brand template pending until an admin approves", async () => {
    const { ada, bo, ws } = await setup("editor");
    const cy = await signUp(t.app, "cy@example.com");
    const inv = await call("POST", `/api/workspaces/${ws}/invitations`, ada.cookie, { email: "cy@example.com", role: "editor" });
    await call("POST", `/api/invitations/${inv.json().token}/accept`, cy.cookie);
    const kit = await newKit(ada.cookie, ws, true);
    const tpl = await pubWs(bo.cookie, ws, { kitId: kit });
    expect(tpl.status).toBe("pending");
    const list = (c: string) => call("GET", `/api/templates?scope=workspace&workspaceId=${ws}`, c);
    expect((await list(cy.cookie)).json().templates).toEqual([]);
    expect((await list(bo.cookie)).json().templates).toHaveLength(1);
    expect((await list(ada.cookie)).json().templates).toHaveLength(1);
    expect((await call("GET", `/api/templates/${tpl.id}/thumb`, cy.cookie)).statusCode).toBe(404);
    expect((await call("GET", `/api/templates/${tpl.id}/thumb`, bo.cookie)).statusCode).toBe(200);
    expect((await call("POST", `/api/templates/${tpl.id}/use`, ada.cookie, { workspaceId: ws })).statusCode).toBe(404);
    expect((await call("POST", `/api/templates/${tpl.id}/approve`, bo.cookie)).statusCode).toBe(403);
    expect((await call("POST", `/api/templates/${tpl.id}/approve`, cy.cookie)).statusCode).toBe(404);
    const ok = await call("POST", `/api/templates/${tpl.id}/approve`, ada.cookie);
    expect(ok.json().template.status).toBe("published");
    expect((await list(cy.cookie)).json().templates).toHaveLength(1);
    expect((await call("POST", `/api/templates/${tpl.id}/use`, cy.cookie, { workspaceId: ws })).statusCode).toBe(201);
    // An admin's own brand template is never held back.
    expect((await pubWs(ada.cookie, ws, { kitId: kit })).status).toBe("published");
  });

  it("use creates a design with the template's content and title", async () => {
    const { ada, bo, ws } = await setup();
    const d = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d.id);
    const kit = await newKit(ada.cookie, ws, false);
    const tpl = (await publish(ada.cookie, d.id, { name: "Flyer", kitId: kit })).json().template;
    const res = await call("POST", `/api/templates/${tpl.id}/use`, bo.cookie, { workspaceId: ws });
    expect(res.statusCode).toBe(201);
    const design = res.json().design;
    expect(design).toMatchObject({ workspaceId: ws, title: "Flyer", width: 100, kitId: kit, createdBy: bo.userId });
    const opened = (await call("GET", `/api/designs/${design.id}`, bo.cookie)).json();
    const parsed = yToDoc(toYDoc(opened.state));
    expect(parsed.ok && parsed.doc.title).toBe("Flyer");
    expect(parsed.ok && parsed.doc.pages[0]!.nodes.map((n) => n.id)).toEqual(["rect1"]);
    expect((await call("GET", `/api/designs/${d.id}`, ada.cookie)).json().design.title).toBe("P");
    expect((await call("POST", `/api/templates/${tpl.id}/use`, bo.cookie, { workspaceId: "x" })).statusCode).toBe(404);
  });

  it("doc returns a template's pages under the same rules as use, and writes nothing", async () => {
    const { ada, bo, ws } = await setup();
    const d = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d.id);
    const tpl = (await publish(ada.cookie, d.id, { name: "Flyer" })).json().template;
    const doc = (url: string, cookie?: string) => call("GET", url, cookie);
    const url = (id: string, w: string) => `/api/templates/${id}/doc?workspaceId=${w}`;
    const designs = async () => (await call("GET", `/api/workspaces/${ws}/designs`, ada.cookie)).json();
    const before = await designs();
    // owner and member of the workspace
    for (const cookie of [ada.cookie, bo.cookie]) {
      const res = await doc(url(tpl.id, ws), cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().doc.pages[0].nodes.map((n: { id: string }) => n.id)).toEqual(["rect1"]);
    }
    expect(await designs()).toEqual(before);
    expect((await doc(url(tpl.id, ws))).statusCode).toBe(401);
    expect((await doc(url(tpl.id, "x"), ada.cookie)).statusCode).toBe(404);
    expect((await doc(`/api/templates/${tpl.id}/doc`, ada.cookie)).statusCode).toBe(400);
    // an outsider can't see a workspace template, nor use it in their own workspace
    const dee = await signUp(t.app, "dee@example.com", "Dee");
    const ws2 = (await call("POST", "/api/workspaces", dee.cookie, { name: "Far", accessMode: "invite" })).json().workspace.id;
    expect((await doc(url(tpl.id, ws2), dee.cookie)).statusCode).toBe(404);
    expect((await doc(url(tpl.id, ws), dee.cookie)).statusCode).toBe(404);
    // a workspace template can't be read for another workspace, even by its owner
    const ws3 = (await call("POST", "/api/workspaces", ada.cookie, { name: "Other", accessMode: "invite" })).json().workspace.id;
    expect((await doc(url(tpl.id, ws3), ada.cookie)).statusCode).toBe(404);
    // a public template works in any workspace the user edits
    const pub = await pubPublic(ada.cookie, ws);
    expect((await doc(url(pub.id, ws2), dee.cookie)).statusCode).toBe(200);
  });

  it("doc: viewers get 403", async () => {
    const { ada, bo, ws } = await setup("viewer");
    const tpl = await pubWs(ada.cookie, ws);
    expect((await call("GET", `/api/templates/${tpl.id}/doc?workspaceId=${ws}`, bo.cookie)).statusCode).toBe(403);
  });

  it("doc: a pending template is refused until approved", async () => {
    const { ada, bo, ws } = await setup("editor");
    await newKit(ada.cookie, ws, true);
    const pending = await pubWs(bo.cookie, ws);
    expect(pending.status).toBe("pending");
    const url = `/api/templates/${pending.id}/doc?workspaceId=${ws}`;
    expect((await call("GET", url, bo.cookie)).statusCode).toBe(404);
    expect((await call("GET", url, ada.cookie)).statusCode).toBe(404);
    await call("POST", `/api/templates/${pending.id}/approve`, ada.cookie);
    expect((await call("GET", url, bo.cookie)).statusCode).toBe(200);
  });

  it("viewers can't use a template", async () => {
    const { ada, bo, ws } = await setup("viewer");
    const tpl = await pubWs(ada.cookie, ws);
    expect((await call("POST", `/api/templates/${tpl.id}/use`, bo.cookie, { workspaceId: ws })).statusCode).toBe(403);
  });

  it("public template used in another workspace drops the kit and links its visuals", async () => {
    const { ada, ws } = await setup();
    const asset = await insertAsset(ada.userId);
    const d = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d.id, asset);
    const tpl = (await publish(ada.cookie, d.id, { visibility: "public" })).json().template;
    expect(tpl.kitId).toBeNull();
    const dee = await signUp(t.app, "dee@example.com", "Dee");
    const ws2 = (await call("POST", "/api/workspaces", dee.cookie, { name: "Far", accessMode: "invite" })).json().workspace.id;
    const res = await call("POST", `/api/templates/${tpl.id}/use`, dee.cookie, { workspaceId: ws2 });
    expect(res.statusCode).toBe(201);
    expect(res.json().design.kitId).toBeNull();
    const uses = await t.db.select().from(assetUses).where(eq(assetUses.designId, res.json().design.id));
    expect(uses.map((u) => u.assetId)).toEqual([asset]);
    expect((await call("GET", `/api/assets/${asset}`, dee.cookie)).statusCode).toBe(200);
    // Once the uploader makes it private, the new design still reaches it through the recorded use.
    await t.db.update(assets).set({ visibility: "private" }).where(eq(assets.id, asset));
    expect((await call("GET", `/api/assets/${asset}`, dee.cookie)).statusCode).toBe(200);
  });

  it("use skips a visual that became private after publishing", async () => {
    const { ada, ws } = await setup();
    const asset = await insertAsset(ada.userId);
    const d = await newDesign(ada.cookie, ws);
    await fill(ada.cookie, d.id, asset);
    const tpl = (await publish(ada.cookie, d.id, { visibility: "public" })).json().template;
    await t.db.update(assets).set({ visibility: "private" }).where(eq(assets.id, asset));
    const dee = await signUp(t.app, "dee@example.com", "Dee");
    const ws2 = (await call("POST", "/api/workspaces", dee.cookie, { name: "Far", accessMode: "invite" })).json().workspace.id;
    const res = await call("POST", `/api/templates/${tpl.id}/use`, dee.cookie, { workspaceId: ws2 });
    expect(res.statusCode).toBe(201);
    expect(await t.db.select().from(assetUses).where(eq(assetUses.designId, res.json().design.id))).toEqual([]);
    expect((await call("GET", `/api/assets/${asset}`, dee.cookie)).statusCode).toBe(404);
  });

  it("an editor's template is pending whenever the workspace has a kit requiring approval", async () => {
    const { ada, bo, ws } = await setup("editor");
    expect((await pubWs(bo.cookie, ws)).status).toBe("published");
    await newKit(ada.cookie, ws, true);
    expect((await pubWs(bo.cookie, ws)).status).toBe("pending");
    expect((await pubPublic(bo.cookie, ws)).status).toBe("pending");
    expect((await pubWs(ada.cookie, ws)).status).toBe("published");
    expect((await pubPublic(ada.cookie, ws)).status).toBe("published");
  });

  it("workspace template can't be used in another workspace", async () => {
    const { ada, ws } = await setup();
    const tpl = await pubWs(ada.cookie, ws);
    const ws2 = (await call("POST", "/api/workspaces", ada.cookie, { name: "Other", accessMode: "invite" })).json().workspace.id;
    expect((await call("POST", `/api/templates/${tpl.id}/use`, ada.cookie, { workspaceId: ws2 })).statusCode).toBe(404);
    const dee = await signUp(t.app, "dee@example.com");
    expect((await call("GET", `/api/templates/${tpl.id}/thumb`, dee.cookie)).statusCode).toBe(404);
  });

  it("three reports hide a public template from others but not its author", async () => {
    const { ada, ws } = await setup();
    const tpl = await pubPublic(ada.cookie, ws);
    const reporters = [];
    for (const n of ["r1", "r2", "r3"]) reporters.push(await signUp(t.app, `${n}@example.com`));
    const watcher = await signUp(t.app, "w@example.com");
    const report = (c: string) => call("POST", "/api/reports", c, { targetType: "template", targetId: tpl.id, reason: "spam" });
    expect((await report(ada.cookie)).statusCode).toBe(400);
    for (const r of reporters) expect((await report(r.cookie)).statusCode).toBe(201);
    const pub = (c: string) => call("GET", "/api/templates?scope=public", c);
    expect(names(await pub(watcher.cookie))).toEqual([]);
    expect(names(await pub(ada.cookie))).toEqual(["Poster"]);
    // A workspace template can't be reported.
    const wsTpl = await pubWs(ada.cookie, ws);
    expect((await call("POST", "/api/reports", watcher.cookie,
      { targetType: "template", targetId: wsTpl.id, reason: "spam" })).statusCode).toBe(404);
  });

  it("creator or admin can delete; the thumb object goes too", async () => {
    const { ada, bo, ws } = await setup("editor");
    const cy = await signUp(t.app, "cy@example.com");
    const inv = await call("POST", `/api/workspaces/${ws}/invitations`, ada.cookie, { email: "cy@example.com", role: "editor" });
    await call("POST", `/api/invitations/${inv.json().token}/accept`, cy.cookie);
    const a = await pubWs(bo.cookie, ws);
    expect((await call("DELETE", `/api/templates/${a.id}`, cy.cookie)).statusCode).toBe(403);
    expect((await call("DELETE", `/api/templates/${a.id}`, bo.cookie)).statusCode).toBe(204);
    expect(t.storage.keys()).not.toContain(`template-thumbs/${a.id}.webp`);
    const b = await pubWs(bo.cookie, ws);
    expect((await call("DELETE", `/api/templates/${b.id}`, ada.cookie)).statusCode).toBe(204);
    expect(t.storage.keys().filter((k) => k.startsWith("template-thumbs/"))).toEqual([]);
    expect((await call("DELETE", `/api/templates/${b.id}`, ada.cookie)).statusCode).toBe(404);
    const stranger = await signUp(t.app, "z@example.com");
    const c = await pubWs(bo.cookie, ws);
    expect((await call("DELETE", `/api/templates/${c.id}`, stranger.cookie)).statusCode).toBe(404);
  });

  it("search and category filter the public list", async () => {
    const { ada, bo, ws } = await setup();
    await pubPublic(ada.cookie, ws, { name: "Summer Sale", category: "social" });
    await pubPublic(bo.cookie, ws, { name: "Menu 100%", category: "print" });
    await pubWs(ada.cookie, ws, { name: "Internal" });
    const q = (s: string) => call("GET", `/api/templates?scope=public&${s}`, ada.cookie);
    expect(names(await q(""))).toEqual(["Menu 100%", "Summer Sale"]);
    expect(names(await q("q=sale"))).toEqual(["Summer Sale"]);
    expect(names(await q("q=bo"))).toEqual(["Menu 100%"]);
    expect(names(await q("q=100%25"))).toEqual(["Menu 100%"]);
    expect(names(await q("q=%25"))).toEqual(["Menu 100%"]);
    expect(names(await q("category=social"))).toEqual(["Summer Sale"]);
    expect((await q("category=nope")).statusCode).toBe(400);
    expect((await call("GET", "/api/templates?scope=workspace", ada.cookie)).statusCode).toBe(400);
  });

  it("rejects empty string kitId with 400", async () => {
    const { ada, ws } = await setup();
    const d = await newDesign(ada.cookie, ws);
    const res = await publish(ada.cookie, d.id, { kitId: "" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });
});
