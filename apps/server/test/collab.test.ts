import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import WebSocket from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { eq } from "drizzle-orm";
import { addNode, createShape, getPageIds, setTitle, updateNode, yToDoc, type CherryNode } from "@cherry/doc";
import { designs } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";
import type { AddressInfo } from "node:net";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let url: string;
beforeAll(async () => {
  t = await setupTestApp();
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = t.app.server.address();
  url = `ws://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/collab`;
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const open: { destroy(): void }[] = [];
const used = new Set<string>();
/** Destroys every provider and waits until the server has stored and unloaded each document. */
async function disconnectAll() {
  open.splice(0).forEach((p) => p.destroy());
  await vi.waitFor(() => { for (const id of used) expect(t.app.collab.liveState(id)).toBeNull(); }, { timeout: 3000 });
}
afterEach(async () => { await disconnectAll(); used.clear(); });

type Method = "GET" | "POST" | "PUT";
const call = (method: Method, path: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url: path, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

/** Ada owns the workspace; Bo is an editor, Cy a viewer, Eve not a member. */
async function team() {
  const ada = await signUp(t.app, "ada@example.com");
  const bo = await signUp(t.app, "bo@example.com");
  const cy = await signUp(t.app, "cy@example.com");
  const eve = await signUp(t.app, "eve@example.com");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  for (const [who, role] of [[bo, "editor"], [cy, "viewer"]] as const) {
    const email = who === bo ? "bo@example.com" : "cy@example.com";
    const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email, role });
    await call("POST", `/api/invitations/${inv.json().token}/accept`, who.cookie);
  }
  const design = (await call("POST", `/api/workspaces/${workspace.id}/designs`, ada.cookie,
    { title: "Poster", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design as { id: string };
  used.add(design.id);
  return { ada, bo, cy, eve, id: design.id };
}

/** Opens `name` with its own `doc` (pass one with local edits to send them as sync step 2) over a new or shared socket. */
function connect(cookie: string | undefined, name: string, opts: { doc?: Y.Doc; socket?: HocuspocusProviderWebsocket; url?: string } = {}) {
  const doc = opts.doc ?? new Y.Doc();
  class CookieSocket extends WebSocket {
    constructor(address: string) { super(address, cookie ? { headers: { cookie } } : {}); }
  }
  const closes: string[] = [];
  let denied: string | null = null;
  const socket = opts.socket ?? new HocuspocusProviderWebsocket({ url: opts.url ?? url, WebSocketPolyfill: CookieSocket });
  const provider = new HocuspocusProvider({
    websocketProvider: socket, name, document: doc,
    onClose: ({ event }) => { closes.push(event.reason); },
    onAuthenticationFailed: ({ reason }) => { denied = reason; },
  });
  provider.attach();
  open.push(provider, socket);
  return { provider, doc, socket, closes, denied: () => denied };
}
async function synced(...cs: ReturnType<typeof connect>[]) {
  await vi.waitFor(() => { for (const c of cs) expect(c.provider.synced).toBe(true); }, { timeout: 3000 });
  return getPageIds(cs[0]!.doc)[0]!;
}
const flushed = (c: ReturnType<typeof connect>) =>
  vi.waitFor(() => expect(c.provider.hasUnsyncedChanges).toBe(false), { timeout: 3000 });

const parse = (d: Y.Doc) => { const r = yToDoc(d); if (!r.ok) throw new Error(r.error); return r.doc; };
const nodes = (d: Y.Doc) => parse(d).pages[0]!.nodes;
const node = (d: Y.Doc, id: string) => nodes(d).find((n) => n.id === id);
const rect = (extra: Partial<CherryNode> = {}) => ({ ...createShape("rect", { x: 0, y: 0, width: 10, height: 10 }), ...extra }) as CherryNode;
const fromState = (s: Uint8Array) => { const d = new Y.Doc(); Y.applyUpdate(d, s); return d; };
const stored = async (id: string) => (await t.db.select().from(designs).where(eq(designs.id, id)))[0]!;
const live = (id: string) => fromState(t.app.collab.liveState(id)!);

describe("live collaboration", () => {
  it("two editors see each other's changes", async () => {
    const { ada, bo, id } = await team();
    const a = connect(ada.cookie, id), b = connect(bo.cookie, id);
    const page = await synced(a, b);
    const r = rect();
    addNode(a.doc, page, r);
    await vi.waitFor(() => expect(node(b.doc, r.id)).toBeDefined(), { timeout: 2000 });
  });

  it("concurrent edits to one node converge", async () => {
    const { ada, bo, id } = await team();
    const a = connect(ada.cookie, id), b = connect(bo.cookie, id);
    const page = await synced(a, b);
    const r = rect();
    addNode(a.doc, page, r);
    await vi.waitFor(() => expect(node(b.doc, r.id)).toBeDefined(), { timeout: 2000 });
    updateNode(a.doc, page, r.id, { x: 1 } as never);
    updateNode(b.doc, page, r.id, { x: 2 } as never);
    await vi.waitFor(() => expect(parse(a.doc)).toEqual(parse(b.doc)), { timeout: 3000 });
    expect([1, 2]).toContain(node(a.doc, r.id)!.x);
    expect([a.closes, b.closes]).toEqual([[], []]);
  });

  it("unauthenticated and non-member connections are refused", async () => {
    const { eve, id } = await team();
    const anon = connect(undefined, id), stranger = connect(eve.cookie, id), bogus = connect(eve.cookie, "not-a-uuid");
    await vi.waitFor(() => {
      expect(anon.denied()).toBe("unauthorized");
      expect(stranger.denied()).toBe("not_found");
      expect(bogus.denied()).toBe("not_found");
    }, { timeout: 3000 });
    expect(anon.provider.synced || stranger.provider.synced).toBe(false);
  });

  it("viewer updates are ignored", async () => {
    const { ada, cy, id } = await team();
    const a = connect(ada.cookie, id), v = connect(cy.cookie, id);
    const page = await synced(a, v);
    const sneaky = rect();
    addNode(v.doc, page, sneaky);
    const r = rect();
    addNode(a.doc, page, r);
    await vi.waitFor(() => expect(node(v.doc, r.id)).toBeDefined(), { timeout: 2000 });
    await new Promise((res) => setTimeout(res, 300));
    expect(node(a.doc, sneaky.id)).toBeUndefined();
    expect(node(live(id), sneaky.id)).toBeUndefined();
    await disconnectAll();
    const doc = fromState((await stored(id)).state);
    expect(node(doc, r.id)).toBeDefined();
    expect(node(doc, sneaky.id)).toBeUndefined();
  });

  it("editor update that breaks a brand lock closes the connection", async () => {
    const { ada, bo, id } = await team();
    const a = connect(ada.cookie, id), b = connect(bo.cookie, id);
    const page = await synced(a, b);
    const r = rect({ brandLock: "fixed" } as never);
    addNode(a.doc, page, r);
    await vi.waitFor(() => expect(node(b.doc, r.id)).toBeDefined(), { timeout: 2000 });
    updateNode(b.doc, page, r.id, { x: 5 } as never);
    await vi.waitFor(() => expect(b.closes).toContain("brand_locked"), { timeout: 3000 });
    expect(a.closes).toEqual([]);
    expect(node(a.doc, r.id)!.x).toBe(0);
    expect(node(live(id), r.id)!.x).toBe(0);
    await disconnectAll();
    expect(node(fromState((await stored(id)).state), r.id)!.x).toBe(0);
  });

  it("invalid document update closes the connection", async () => {
    const { ada, id } = await team();
    const a = connect(ada.cookie, id);
    const page = await synced(a);
    const r = rect();
    addNode(a.doc, page, r);
    await flushed(a);
    const ynodes = (a.doc.getMap("pages").get(page) as Y.Map<unknown>).get("nodes") as Y.Map<Y.Map<unknown>>;
    ynodes.get(r.id)!.set("x", "junk");
    await vi.waitFor(() => expect(a.closes).toContain("invalid_document"), { timeout: 3000 });
    // The rejected connection was the only one, so the document is already stored and unloaded.
    await disconnectAll();
    expect(node(fromState((await stored(id)).state), r.id)!.x).toBe(0);
  });

  it("last disconnect stores immediately", async () => {
    const { ada, id } = await team();
    const a = connect(ada.cookie, id);
    const page = await synced(a);
    const r = rect();
    addNode(a.doc, page, r);
    setTitle(a.doc, "Live title");
    await flushed(a);
    a.provider.destroy();
    await vi.waitFor(async () => {
      const row = await stored(id);
      expect(row.title).toBe("Live title");
      expect(node(fromState(row.state), r.id)).toBeDefined();
    }, { timeout: 500, interval: 25 });
  });

  it("PUT state merges into the live document", async () => {
    const { ada, bo, id } = await team();
    const a = connect(ada.cookie, id);
    await synced(a);
    const d = fromState(Buffer.from((await call("GET", `/api/designs/${id}`, bo.cookie)).json().state, "base64"));
    const r = rect();
    addNode(d, getPageIds(d)[0]!, r);
    const res = await call("PUT", `/api/designs/${id}/state`, bo.cookie, { state: b64(Y.encodeStateAsUpdate(d)) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ design: expect.objectContaining({ id }), state: expect.any(String) });
    await vi.waitFor(() => expect(node(a.doc, r.id)).toBeDefined(), { timeout: 2000 });
    expect(node(fromState((await stored(id)).state), r.id)).toBeDefined();
  });

  it("PUT state keeps the change live and answers 503 when the store fails", async () => {
    const { ada, id } = await team();
    const d = fromState(Buffer.from((await call("GET", `/api/designs/${id}`, ada.cookie)).json().state, "base64"));
    const r = rect();
    addNode(d, getPageIds(d)[0]!, r);
    const body = { state: b64(Y.encodeStateAsUpdate(d)) };
    const write = vi.spyOn(t.db, "update").mockImplementationOnce(() => { throw new Error("db down"); });
    const res = await call("PUT", `/api/designs/${id}/state`, ada.cookie, body);
    write.mockRestore();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "not_saved" });
    expect(t.app.collab.liveState(id)).not.toBeNull();
    expect(node(live(id), r.id)).toBeDefined();
    expect(node(fromState((await stored(id)).state), r.id)).toBeUndefined();
    // The next store writes the change that is still waiting.
    expect((await call("PUT", `/api/designs/${id}/state`, ada.cookie, body)).statusCode).toBe(200);
    expect(node(fromState((await stored(id)).state), r.id)).toBeDefined();
  });

  it("a cross-site websocket is refused", async () => {
    const { ada } = await team();
    const ws = new WebSocket(url, { headers: { cookie: ada.cookie, origin: "https://evil.example" } });
    const code = await new Promise<number>((res) => ws.on("close", (c) => res(c)));
    expect(code).toBe(1008);
  });

  it("an upper-case alias of the design id is refused", async () => {
    const { ada, id } = await team();
    const c = connect(ada.cookie, id.toUpperCase());
    await vi.waitFor(() => expect(c.denied()).toBe("not_found"), { timeout: 3000 });
  });

  it("changes sent as sync step 2 are checked too", async () => {
    const { ada, bo, id } = await team();
    const d = fromState(Buffer.from((await call("GET", `/api/designs/${id}`, ada.cookie)).json().state, "base64"));
    const page = getPageIds(d)[0]!;
    const r = rect({ brandLock: "fixed" } as never);
    addNode(d, page, r);
    expect((await call("PUT", `/api/designs/${id}/state`, ada.cookie, { state: b64(Y.encodeStateAsUpdate(d)) })).statusCode).toBe(200);

    // Bo moves the locked layer before connecting, so the move travels in his sync step 2.
    const moved = fromState(Y.encodeStateAsUpdate(d));
    updateNode(moved, page, r.id, { x: 5 } as never);
    const b = connect(bo.cookie, id, { doc: moved });
    await vi.waitFor(() => expect(b.closes).toContain("brand_locked"), { timeout: 3000 });

    // An owner's offline junk value travels the same way.
    const junk = fromState(Y.encodeStateAsUpdate(d));
    ((junk.getMap("pages").get(page) as Y.Map<unknown>).get("nodes") as Y.Map<Y.Map<unknown>>).get(r.id)!.set("x", "junk");
    const a = connect(ada.cookie, id, { doc: junk });
    await vi.waitFor(() => expect(a.closes).toContain("invalid_document"), { timeout: 3000 });

    await disconnectAll();
    expect(node(fromState((await stored(id)).state), r.id)!.x).toBe(0);
  });

  it("a socket open on one design cannot attach a design of another workspace", async () => {
    const { ada, eve, id } = await team();
    const { workspace } = (await call("POST", "/api/workspaces", eve.cookie, { name: "Elsewhere", accessMode: "invite" })).json();
    const other = (await call("POST", `/api/workspaces/${workspace.id}/designs`, eve.cookie,
      { title: "Secret", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design.id as string;
    const a = connect(ada.cookie, id);
    await synced(a);
    const b = connect(ada.cookie, other, { socket: a.socket });
    await vi.waitFor(() => expect(b.denied()).toBe("not_found"), { timeout: 3000 });
    expect(b.provider.synced).toBe(false);
    expect(t.app.collab.liveState(other)).toBeNull();
  });

  it("closing the app stores a document whose last store failed", async () => {
    const t2 = await setupTestApp();
    try {
      await t2.app.listen({ port: 0, host: "127.0.0.1" });
      const ada = await signUp(t2.app, "ada@example.com");
      const inject = (method: Method, path: string, payload?: object) =>
        t2.app.inject({ method, url: path, headers: { cookie: ada.cookie }, ...(payload ? { payload } : {}) });
      const { workspace } = (await inject("POST", "/api/workspaces", { name: "North", accessMode: "invite" })).json();
      const id = (await inject("POST", `/api/workspaces/${workspace.id}/designs`,
        { title: "Poster", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design.id as string;
      const a = connect(ada.cookie, id, { url: `ws://127.0.0.1:${(t2.app.server.address() as AddressInfo).port}/api/collab` });
      const page = await synced(a);
      const r = rect();
      addNode(a.doc, page, r);
      await flushed(a);
      const write = vi.spyOn(t2.db, "update").mockImplementationOnce(() => { throw new Error("db down"); });
      a.provider.destroy();
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 3000 });
      write.mockRestore();
      expect(t2.app.collab.liveState(id)).not.toBeNull();
      await t2.app.close();
      const [row] = await t2.db.select().from(designs).where(eq(designs.id, id));
      expect(node(fromState(row!.state), r.id)).toBeDefined();
    } finally {
      await t2.close();
    }
  });
});
