import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import WebSocket from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { eq, sql } from "drizzle-orm";
import { addNode, createShape, getPageIds, yToDoc, type CherryNode } from "@cherry/doc";
import { assetUses, assets, designs } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

type App = Awaited<ReturnType<typeof setupTestApp>>;
let t: App;
let url: string;
const listen = async (app: App) => {
  await app.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.app.server.address();
  return `ws://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/collab`;
};
beforeAll(async () => { t = await setupTestApp(); url = await listen(t); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const open: { destroy(): void }[] = [];
const used = new Set<string>();
afterEach(async () => {
  open.splice(0).forEach((p) => p.destroy());
  await vi.waitFor(() => { for (const id of used) expect(t.app.collab.liveState(id)).toBeNull(); }, { timeout: 3000 });
  used.clear();
});

type Method = "GET" | "POST" | "PATCH";
const callOn = (app: App, method: Method, path: string, cookie?: string, payload?: object) =>
  app.app.inject({ method, url: path, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const call = (method: Method, path: string, cookie?: string, payload?: object) => callOn(t, method, path, cookie, payload);

const rect = (extra: Partial<CherryNode> = {}) => ({ ...createShape("rect", { x: 0, y: 0, width: 10, height: 10 }), ...extra }) as CherryNode;
const fromState = (s: Uint8Array) => { const d = new Y.Doc(); Y.applyUpdate(d, s); return d; };
const parse = (d: Y.Doc) => { const r = yToDoc(d); if (!r.ok) throw new Error(r.error); return r.doc; };
const stored = async (app: App, id: string) => (await app.db.select().from(designs).where(eq(designs.id, id)))[0]!;
const pageOf = async (app: App, id: string) => getPageIds(fromState((await stored(app, id)).state))[0]!;
/** Adds `node` through the live document, as a collaborator would; it is stored when this returns. */
const draw = async (app: App, id: string, node: CherryNode, by?: string) => {
  const page = await pageOf(app, id);
  await app.app.collab.withDocument(id, (d) => addNode(d, page, node), by);
};
const versions = async (id: string, cookie: string) => (await call("GET", `/api/designs/${id}/versions`, cookie)).json().versions as
  { id: string; kind: string; name: string | null; summary: string; createdBy: { id: string; name: string } | null; branchDesignId: string | null }[];

/** Ada owns the workspace; Bo is an editor, Cy a viewer, Eve not a member. */
async function team(app: App = t) {
  const ada = await signUp(app.app, "ada@example.com");
  const bo = await signUp(app.app, "bo@example.com");
  const cy = await signUp(app.app, "cy@example.com");
  const eve = await signUp(app.app, "eve@example.com");
  const { workspace } = (await callOn(app, "POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  for (const [who, email, role] of [[bo, "bo@example.com", "editor"], [cy, "cy@example.com", "viewer"]] as const) {
    const inv = await callOn(app, "POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email, role });
    await callOn(app, "POST", `/api/invitations/${inv.json().token}/accept`, who.cookie);
  }
  const design = (await callOn(app, "POST", `/api/workspaces/${workspace.id}/designs`, ada.cookie,
    { title: "Poster", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design as { id: string };
  used.add(design.id);
  return { ada, bo, cy, eve, id: design.id, workspaceId: workspace.id as string };
}
const nameIt = async (cookie: string, id: string, name: string) =>
  (await call("POST", `/api/designs/${id}/versions`, cookie, { name })).json().version as { id: string };

describe("versions", () => {
  it("name the current version and list it", async () => {
    const { ada, id } = await team();
    await draw(t, id, rect({ name: "Berry cluster" }), undefined);
    const res = await call("POST", `/api/designs/${id}/versions`, ada.cookie, { name: "  First draft  " });
    expect(res.statusCode).toBe(201);
    expect(res.json().version).toMatchObject({ kind: "named", name: "First draft", createdBy: { id: ada.userId, name: "ada" }, branchDesignId: null });
    const list = await versions(id, ada.cookie);
    expect(list[0]).toMatchObject({ id: res.json().version.id, name: "First draft" });
    expect(list[0]).not.toHaveProperty("state");
    expect((await call("POST", `/api/designs/${id}/versions`, ada.cookie, { name: "" })).statusCode).toBe(400);
    expect((await call("POST", `/api/designs/${id}/versions`, ada.cookie, { name: "x".repeat(81) })).statusCode).toBe(400);
  });

  it("rename and un-name a version; viewers cannot", async () => {
    const { ada, cy, id } = await team();
    const v = await nameIt(ada.cookie, id, "One");
    const renamed = await call("PATCH", `/api/versions/${v.id}`, ada.cookie, { name: "Two" });
    expect(renamed.json().version).toMatchObject({ kind: "named", name: "Two" });
    const un = await call("PATCH", `/api/versions/${v.id}`, ada.cookie, { name: null });
    expect(un.json().version).toMatchObject({ kind: "auto", name: null });
    expect((await call("PATCH", `/api/versions/${v.id}`, ada.cookie, { name: "Again" })).json().version).toMatchObject({ kind: "named", name: "Again" });
    const denied = await call("PATCH", `/api/versions/${v.id}`, cy.cookie, { name: "Nope" });
    expect([denied.statusCode, denied.json().error]).toEqual([403, "forbidden"]);
  });

  it("viewer can list and read but not name, restore or branch", async () => {
    const { ada, cy, id } = await team();
    const v = await nameIt(ada.cookie, id, "One");
    expect((await versions(id, cy.cookie)).map((x) => x.name)).toEqual(["One"]);
    const state = await call("GET", `/api/versions/${v.id}/state`, cy.cookie);
    expect(state.statusCode).toBe(200);
    expect(state.json().state).toBe(Buffer.from((await stored(t, id)).state).toString("base64"));
    expect((await call("POST", `/api/designs/${id}/versions`, cy.cookie, { name: "x" })).statusCode).toBe(403);
    expect((await call("POST", `/api/versions/${v.id}/restore`, cy.cookie)).statusCode).toBe(403);
    expect((await call("POST", `/api/versions/${v.id}/branch`, cy.cookie, { name: "x" })).statusCode).toBe(403);
    expect(await versions(id, ada.cookie)).toHaveLength(1);
  });

  it("restore replaces the live document for connected editors and keeps a Before restore version", async () => {
    const { ada, bo, id } = await team();
    const v = await nameIt(ada.cookie, id, "Empty");
    const r = rect({ name: "Late layer" });
    await draw(t, id, r);

    class CookieSocket extends WebSocket {
      constructor(address: string) { super(address, { headers: { cookie: bo.cookie } }); }
    }
    const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: CookieSocket });
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ websocketProvider: socket, name: id, document: doc });
    provider.attach();
    open.push(provider, socket);
    await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 3000 });
    expect(parse(doc).pages[0]!.nodes.map((n) => n.id)).toEqual([r.id]);

    const res = await call("POST", `/api/versions/${v.id}/restore`, bo.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().design.id).toBe(id);
    await vi.waitFor(() => expect(parse(doc).pages[0]!.nodes).toEqual([]), { timeout: 3000 });

    const list = await versions(id, ada.cookie);
    expect(list.slice(0, 2)).toMatchObject([{ kind: "restore", name: "Before restore" }, { kind: "named", name: "Empty" }]);
    const before = await call("GET", `/api/versions/${list[0]!.id}/state`, ada.cookie);
    expect(parse(fromState(Buffer.from(before.json().state, "base64"))).pages[0]!.nodes.map((n) => n.id)).toEqual([r.id]);
  });

  it("editor restore across a brand lock is refused and changes nothing", async () => {
    const { ada, bo, id } = await team();
    const v = await nameIt(ada.cookie, id, "Empty");
    await draw(t, id, rect({ brandLock: "fixed" } as never), ada.userId);
    const count = (await versions(id, ada.cookie)).length;
    const state = (await stored(t, id)).state;

    const res = await call("POST", `/api/versions/${v.id}/restore`, bo.cookie);
    expect([res.statusCode, res.json().error]).toEqual([403, "brand_locked"]);
    expect(await versions(id, ada.cookie)).toHaveLength(count);
    expect(Buffer.from((await stored(t, id)).state).equals(Buffer.from(state))).toBe(true);

    expect((await call("POST", `/api/versions/${v.id}/restore`, ada.cookie)).statusCode).toBe(200);
  });

  it("branch creates a linked design and a marker in the source history", async () => {
    const { ada, bo, id, workspaceId } = await team();
    const kit = (await call("POST", `/api/workspaces/${workspaceId}/brand-kits`, ada.cookie, { name: "Berry" })).json().kit;
    await call("PATCH", `/api/designs/${id}`, ada.cookie, { kitId: kit.id });
    await draw(t, id, rect({ name: "Berry cluster" }));
    const v = await nameIt(ada.cookie, id, "Base");

    const res = await call("POST", `/api/versions/${v.id}/branch`, bo.cookie, { name: "Dark mode" });
    expect(res.statusCode).toBe(201);
    const { design } = res.json();
    expect(design).toMatchObject({ title: "Poster — Dark mode", kitId: kit.id, workspaceId });
    const row = await stored(t, design.id);
    expect([row.parentDesignId, row.parentVersionId]).toEqual([id, v.id]);
    // Same content as the version; only the title carries the branch name.
    const want = parse(fromState((await stored(t, id)).state));
    expect(parse(fromState(row.state))).toEqual({ ...want, title: "Poster — Dark mode" });

    expect((await versions(id, ada.cookie))[0]).toMatchObject({
      kind: "branch", name: "Dark mode", summary: "Branched from Base", branchDesignId: design.id, createdBy: { id: bo.userId },
    });
    expect((await call("POST", `/api/versions/${v.id}/branch`, bo.cookie, { name: "x".repeat(61) })).statusCode).toBe(400);
  });

  it("auto version after the interval, with a summary", async () => {
    const auto = await setupTestApp({}, { autoVersionMs: 0 });
    try {
      const { ada, id } = await team(auto);
      const list = async () => (await callOn(auto, "GET", `/api/designs/${id}/versions`, ada.cookie)).json().versions as { kind: string; name: string | null; summary: string; createdBy: { id: string } | null }[];
      await draw(auto, id, rect({ name: "Berry cluster" }), ada.userId);
      expect(await list()).toHaveLength(1);
      expect((await list())[0]).toMatchObject({ kind: "auto", name: null, summary: "Added Berry cluster", createdBy: { id: ada.userId } });
      // A real store that leaves the layers unchanged (the title) adds nothing.
      await auto.app.collab.withDocument(id, (d) => d.getMap("meta").set("title", "Renamed"), ada.userId);
      expect((await stored(auto, id)).title).toBe("Renamed");
      expect(await list()).toHaveLength(1);
      // A second layer after the interval adds a second version.
      await draw(auto, id, rect({ name: "Leaf" }), ada.userId);
      const after = await list();
      expect(after).toHaveLength(2);
      expect(after[0]).toMatchObject({ kind: "auto", summary: "Added Leaf" });
    } finally {
      await auto.close();
    }
  });

  it("no second auto version inside the default interval", async () => {
    const { ada, id } = await team();
    await draw(t, id, rect({ name: "One" }), ada.userId);
    await draw(t, id, rect({ name: "Two" }), ada.userId);
    const list = await versions(id, ada.cookie);
    expect(list.map((v) => [v.kind, v.summary])).toEqual([["auto", "Added One"]]);
  });

  it("branch copies asset uses, and a failing marker leaves no orphan design", async () => {
    const { ada, id, workspaceId } = await team();
    const [asset] = await t.db.insert(assets).values({
      createdBy: ada.userId, visibility: "public", title: "Pic", tags: [], license: "cc0", kind: "image", format: "png",
      width: 1, height: 1, bytes: 1, sha256: "v" + Math.random(),
    } as typeof assets.$inferInsert).returning();
    const { fill: _f, cornerRadius: _c, ...img } = rect() as Record<string, unknown>;
    await draw(t, id, { ...img, id: "img1", kind: "image", assetId: asset!.id } as unknown as CherryNode);
    const v = await nameIt(ada.cookie, id, "Base");

    const { design } = (await call("POST", `/api/versions/${v.id}/branch`, ada.cookie, { name: "Copy" })).json();
    const uses = await t.db.select().from(assetUses).where(eq(assetUses.designId, design.id));
    expect(uses.map((u) => u.assetId)).toEqual([asset!.id]);

    const count = async () => (await t.db.select().from(designs).where(eq(designs.workspaceId, workspaceId))).length;
    const before = await count();
    await t.db.execute(sql`create function fail_branch() returns trigger language plpgsql as $$ begin raise exception 'no'; end $$`);
    await t.db.execute(sql`create trigger fail_branch before insert on design_versions for each row when (new.kind = 'branch') execute function fail_branch()`);
    try {
      expect((await call("POST", `/api/versions/${v.id}/branch`, ada.cookie, { name: "Fails" })).statusCode).toBe(500);
    } finally {
      await t.db.execute(sql`drop trigger fail_branch on design_versions`);
      await t.db.execute(sql`drop function fail_branch()`);
    }
    expect(await count()).toBe(before);
  });

  it("versions of another workspace's design are 404", async () => {
    const { ada, eve, id } = await team();
    const v = await nameIt(ada.cookie, id, "One");
    for (const [m, p, body] of [
      ["GET", `/api/designs/${id}/versions`], ["POST", `/api/designs/${id}/versions`, { name: "x" }],
      ["PATCH", `/api/versions/${v.id}`, { name: "x" }], ["GET", `/api/versions/${v.id}/state`],
      ["POST", `/api/versions/${v.id}/restore`], ["POST", `/api/versions/${v.id}/branch`, { name: "x" }],
    ] as const) {
      const res = await call(m, p, eve.cookie, body);
      expect([m, p, res.statusCode]).toEqual([m, p, 404]);
    }
    expect((await call("GET", "/api/versions/not-a-uuid/state", ada.cookie)).statusCode).toBe(404);
  });
});
