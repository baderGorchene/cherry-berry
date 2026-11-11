import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addNode, createDocument, createShape, docToY, setTitle, yToDoc } from "@cherry/doc";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

type Method = "GET" | "POST" | "PUT";
const call = (method: Method, url: string, cookie?: string, payload?: object | string) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const toYDoc = (state: string) => { const d = new Y.Doc(); Y.applyUpdate(d, Buffer.from(state, "base64")); return d; };
const nodeIds = (d: Y.Doc) => { const r = yToDoc(d); if (!r.ok) throw new Error(r.error); return r.doc.pages[0]!.nodes.map((n) => n.id); };

async function setup() {
  const owner = await signUp(t.app, "ada@example.com");
  const { workspace } = (await call("POST", "/api/workspaces", owner.cookie, { name: "North", accessMode: "invite" })).json();
  const created = await call("POST", `/api/workspaces/${workspace.id}/designs`, owner.cookie, {
    title: "Poster", width: 297, height: 420, unit: "mm", colorMode: "cmyk", bleed: 3,
  });
  return { owner, workspace, design: created.json().design, created };
}

describe("designs", () => {
  it("creates, lists and opens a design", async () => {
    const { owner, workspace, design, created } = await setup();
    expect(created.statusCode).toBe(201);
    const list = await call("GET", `/api/workspaces/${workspace.id}/designs`, owner.cookie);
    expect(list.json().designs).toEqual([expect.objectContaining({ id: design.id, title: "Poster", width: 297, unit: "mm" })]);
    const got = await call("GET", `/api/designs/${design.id}`, owner.cookie);
    expect(got.statusCode).toBe(200);
    expect(got.json().role).toBe("owner");
    const r = yToDoc(toYDoc(got.json().state));
    expect(r.ok && r.doc.pages[0]!.width).toBe(297);
    expect(r.ok && r.doc.pages[0]!.bleed).toBe(3);
  });

  it("non-members get not_found", async () => {
    const { workspace, design } = await setup();
    const eve = await signUp(t.app, "eve@example.com");
    for (const [m, url] of [
      ["GET", `/api/workspaces/${workspace.id}/designs`], ["GET", `/api/designs/${design.id}`],
      ["PUT", `/api/designs/${design.id}/state`],
    ] as const) {
      const res = await call(m, url, eve.cookie, m === "PUT" ? { state: "" } : undefined);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    }
    expect((await call("GET", "/api/designs/not-a-uuid", eve.cookie)).json()).toEqual({ error: "not_found" });
  });

  it("viewer can open but not save", async () => {
    const { owner, workspace, design } = await setup();
    const bo = await signUp(t.app, "bo@example.com");
    const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, owner.cookie, { email: "bo@example.com", role: "viewer" });
    await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
    const got = await call("GET", `/api/designs/${design.id}`, bo.cookie);
    expect(got.statusCode).toBe(200);
    expect(got.json().role).toBe("viewer");
    const put = await call("PUT", `/api/designs/${design.id}/state`, bo.cookie, { state: got.json().state });
    expect(put.statusCode).toBe(403);
    expect(put.json()).toEqual({ error: "forbidden" });
  });

  it("save merges concurrent edits", async () => {
    const { owner, design } = await setup();
    const load = async () => (await call("GET", `/api/designs/${design.id}`, owner.cookie)).json().state as string;
    const a = toYDoc(await load());
    const b = toYDoc(await load());
    const pageId = (yToDoc(a) as { ok: true; doc: { pages: { id: string }[] } }).doc.pages[0]!.id;
    const r1 = createShape("rect", { x: 0, y: 0, width: 10, height: 10 });
    const r2 = createShape("rect", { x: 5, y: 5, width: 10, height: 10 });
    addNode(a, pageId, r1);
    addNode(b, pageId, r2);
    expect((await call("PUT", `/api/designs/${design.id}/state`, owner.cookie, { state: b64(Y.encodeStateAsUpdate(a)) })).statusCode).toBe(200);
    const put = await call("PUT", `/api/designs/${design.id}/state`, owner.cookie, { state: b64(Y.encodeStateAsUpdate(b)) });
    expect(put.statusCode).toBe(200);
    expect(nodeIds(toYDoc(put.json().state))).toEqual(expect.arrayContaining([r1.id, r2.id]));
    expect(nodeIds(toYDoc(await load()))).toEqual(expect.arrayContaining([r1.id, r2.id]));
  });

  it("rejects garbage and invalid documents", async () => {
    const { owner, design } = await setup();
    const url = `/api/designs/${design.id}/state`;
    const before = (await call("GET", `/api/designs/${design.id}`, owner.cookie)).json().state as string;
    let res = await call("PUT", url, owner.cookie, { state: "not-base64!!" });
    expect([res.statusCode, res.json()]).toEqual([400, { error: "invalid_body" }]);
    res = await call("PUT", url, owner.cookie, { state: Buffer.from([1, 2, 3, 250, 9, 8, 7, 200]).toString("base64") });
    expect([res.statusCode, res.json()]).toEqual([400, { error: "invalid_document" }]);
    const d = toYDoc(before);
    d.transact(() => d.getArray("pages").delete(0, 1));
    res = await call("PUT", url, owner.cookie, { state: b64(Y.encodeStateAsUpdate(d)) });
    expect([res.statusCode, res.json()]).toEqual([400, { error: "invalid_document" }]);
    const after = (await call("GET", `/api/designs/${design.id}`, owner.cookie)).json().state as string;
    expect(nodeIds(toYDoc(after))).toEqual(nodeIds(toYDoc(before)));
    expect(yToDoc(toYDoc(after)).ok).toBe(true);
  });

  it("title and size follow the document", async () => {
    const { owner, workspace, design } = await setup();
    const d = toYDoc((await call("GET", `/api/designs/${design.id}`, owner.cookie)).json().state);
    setTitle(d, "Flyer");
    const put = await call("PUT", `/api/designs/${design.id}/state`, owner.cookie, { state: b64(Y.encodeStateAsUpdate(d)) });
    expect(put.json().design.title).toBe("Flyer");
    const list = await call("GET", `/api/workspaces/${workspace.id}/designs`, owner.cookie);
    expect(list.json().designs[0]).toEqual(expect.objectContaining({ title: "Flyer", width: 297, height: 420 }));
  });

  it("too large", async () => {
    const { owner, design } = await setup();
    const big = JSON.stringify({ state: "A".repeat(10 * 1024 * 1024 + 4) });
    const res = await t.app.inject({
      method: "PUT", url: `/api/designs/${design.id}/state`,
      headers: { cookie: owner.cookie, "content-type": "application/json" }, payload: big,
    });
    expect([res.statusCode, res.json()]).toEqual([413, { error: "too_large" }]);
  });
});
