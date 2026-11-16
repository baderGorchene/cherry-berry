import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocument, createShape, getPageIds, serializeCherry, yToDoc, type CherryDocument, type CherryNode } from "@cherry/doc";
import { assetUses, assets, designs } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const call = (method: "GET" | "POST", url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
async function setup(role: "viewer" | "editor" = "editor") {
  const ada = await signUp(t.app, "ada@example.com", "Ada");
  const bo = await signUp(t.app, "bo@example.com", "Bo");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  return { ada, bo, ws: workspace.id as string };
}
const doc = (): CherryDocument => {
  const d = createDocument({ title: "Imported", width: 210, height: 297, unit: "mm", colorMode: "cmyk" });
  const p2 = { ...d.pages[0]!, id: "p2", name: "Page 2", nodes: [] as CherryNode[] };
  d.pages[0]!.nodes.push({ ...createShape("rect", { x: 0, y: 0, width: 5, height: 5 }), id: "r1" } as CherryNode);
  d.pages.push(p2);
  return d;
};
const deep = () => {
  const n = 3000, g = '{"kind":"group","id":"g","children":[';
  const d = doc(); d.pages[0]!.nodes = [];
  return JSON.stringify(d).replace('"nodes":[]', `"nodes":[${g.repeat(n)}${"]}".repeat(n)}]`);
};
const img = (assetId: string) => {
  const { fill: _f, cornerRadius: _c, ...r } = createShape("rect", { x: 1, y: 1, width: 5, height: 5 }) as Record<string, unknown>;
  return { ...r, id: "i1", kind: "image", assetId } as unknown as CherryNode;
};
const post = (cookie: string, ws: string, text: string) => call("POST", `/api/workspaces/${ws}/designs/import`, cookie, { text });
const total = async () => (await t.db.select({ n: count() }).from(designs))[0]!.n;

describe("POST /api/workspaces/:id/designs/import", () => {
  it("imports a two-page document under a fresh id", async () => {
    const { bo, ws } = await setup();
    const src = doc();
    const r = await post(bo.cookie, ws, serializeCherry(src));
    expect(r.statusCode).toBe(201);
    const d = r.json().design;
    expect(d).toMatchObject({ title: "Imported", width: 210, height: 297, unit: "mm", colorMode: "cmyk" });
    const open = (await call("GET", `/api/designs/${d.id}`, bo.cookie)).json();
    const y = new Y.Doc(); Y.applyUpdate(y, Buffer.from(open.state, "base64"));
    const parsed = yToDoc(y);
    expect(parsed.ok && parsed.doc.pages.length).toBe(2);
    expect(parsed.ok && parsed.doc.pages[0]!.nodes.length).toBe(1);
    expect(parsed.ok && parsed.doc.id).not.toBe(src.id);
    expect(getPageIds(y)).toHaveLength(2);
  });

  it.each([
    ["{", "invalid_json"],
    [JSON.stringify({ ...doc(), version: 99 }), "newer_version"],
    [JSON.stringify({ ...doc(), pages: undefined }), "invalid_document"],
    [deep(), "invalid_document"],
  ])("rejects bad input with %#", async (text, code) => {
    const { bo, ws } = await setup();
    const r = await post(bo.cookie, ws, text);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: code });
    expect(await total()).toBe(0);
  });

  it("403 for viewers, 404 for non-members", async () => {
    const { bo, ws } = await setup("viewer");
    const cy = await signUp(t.app, "cy@example.com", "Cy");
    expect((await post(bo.cookie, ws, serializeCherry(doc()))).statusCode).toBe(403);
    expect((await post(cy.cookie, ws, serializeCherry(doc()))).statusCode).toBe(404);
    expect(await total()).toBe(0);
  });

  it("413 over 10 MB", async () => {
    const { bo, ws } = await setup();
    const r = await post(bo.cookie, ws, "x".repeat(10 * 1024 * 1024 + 1));
    expect(r.statusCode).toBe(413);
    expect(r.json()).toEqual({ error: "too_large" });
    expect(await total()).toBe(0);
  });

  it("links only usable assets", async () => {
    const { ada, bo, ws } = await setup();
    const [a] = await t.db.insert(assets).values({
      createdBy: ada.userId, visibility: "public", title: "Pic", tags: [], license: "cc0", kind: "image", format: "png",
      width: 1, height: 1, bytes: 1, sha256: "x1",
    } as typeof assets.$inferInsert).returning();
    const unknown = "00000000-0000-4000-8000-000000000000";
    const d = doc(); d.pages[0]!.nodes.push(img(a!.id), { ...img(unknown), id: "i2" });
    const r = await post(bo.cookie, ws, serializeCherry(d));
    expect(r.statusCode).toBe(201);
    const uses = await t.db.select().from(assetUses).where(eq(assetUses.designId, r.json().design.id));
    expect(uses.map((u) => u.assetId)).toEqual([a!.id]);
  });
});
