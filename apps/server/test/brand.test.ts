import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addNode, addPage, createShape, createText, getPageIds, removePage, updateNode } from "@cherry/doc";
import { assets } from "../src/db/schema";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const toYDoc = (state: string) => { const d = new Y.Doc(); Y.applyUpdate(d, Buffer.from(state, "base64")); return d; };

async function workspaceWith(role: "viewer" | "editor" | "admin") {
  const ada = await signUp(t.app, "ada@example.com");
  const bo = await signUp(t.app, "bo@example.com");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  return { ada, bo, ws: workspace.id as string };
}
const newKit = async (cookie: string, ws: string, extra: object = {}) =>
  (await call("POST", `/api/workspaces/${ws}/brand-kits`, cookie, { name: "Berry", ...extra })).json().kit;
const newDesign = async (cookie: string, ws: string) =>
  (await call("POST", `/api/workspaces/${ws}/designs`, cookie, { title: "P", width: 100, height: 100, unit: "px", colorMode: "rgb" })).json().design;
const insertAsset = async (createdBy: string, over: Record<string, unknown> = {}) => {
  const [a] = await t.db.insert(assets).values({
    createdBy, visibility: "private", title: "Logo", tags: [], license: "own", kind: "image", format: "png",
    width: 1, height: 1, bytes: 1, sha256: "x", ...over,
  } as typeof assets.$inferInsert).returning();
  return a!.id;
};

describe("brand kits", () => {
  it("creates a kit with defaults and lists it to members", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const res = await call("POST", `/api/workspaces/${ws}/brand-kits`, ada.cookie, { name: "  Berry  " });
    expect(res.statusCode).toBe(201);
    expect(res.json().kit).toMatchObject({ name: "Berry", workspaceId: ws, fonts: [], content: { colors: [], rules: { kitColorsOnly: true } } });
    const list = await call("GET", `/api/workspaces/${ws}/brand-kits`, bo.cookie);
    expect(list.json().kits.map((k: { name: string }) => k.name)).toEqual(["Berry"]);
    const one = await call("GET", `/api/brand-kits/${res.json().kit.id}`, bo.cookie);
    expect(one.json().kit.id).toBe(res.json().kit.id);
  });

  it("only owners and admins change kits", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const kit = await newKit(ada.cookie, ws);
    const cy = await signUp(t.app, "cy@example.com");
    const put = { name: "X", content: kit.content };
    expect((await call("POST", `/api/workspaces/${ws}/brand-kits`, bo.cookie, { name: "X" })).statusCode).toBe(403);
    expect((await call("PUT", `/api/brand-kits/${kit.id}`, bo.cookie, put)).statusCode).toBe(403);
    expect((await call("DELETE", `/api/brand-kits/${kit.id}`, bo.cookie)).statusCode).toBe(403);
    expect((await call("GET", `/api/workspaces/${ws}/brand-kits`, cy.cookie)).statusCode).toBe(404);
    expect((await call("POST", `/api/workspaces/${ws}/brand-kits`, cy.cookie, { name: "X" })).statusCode).toBe(404);
    expect((await call("GET", `/api/brand-kits/${kit.id}`, cy.cookie)).statusCode).toBe(404);
    expect((await call("PUT", `/api/brand-kits/${kit.id}`, cy.cookie, put)).statusCode).toBe(404);
    expect((await call("DELETE", `/api/brand-kits/${kit.id}`, cy.cookie)).statusCode).toBe(404);
  });

  it("rejects invalid content", async () => {
    const { ada, ws } = await workspaceWith("editor");
    const kit = await newKit(ada.cookie, ws);
    const color = (hex: string, role = "primary") => ({ id: "c", name: "C", role, hex });
    const bad = [
      { ...kit.content, colors: [color("red")] },
      { ...kit.content, colors: Array.from({ length: 41 }, () => color("#112233")) },
      { ...kit.content, colors: [color("#112233", "nope")] },
    ];
    for (const content of bad) {
      const res = await call("PUT", `/api/brand-kits/${kit.id}`, ada.cookie, { name: "X", content });
      expect([res.statusCode, res.json().error]).toEqual([400, "invalid_body"]);
    }
    expect((await call("POST", `/api/workspaces/${ws}/brand-kits`, ada.cookie, { name: "" })).json().error).toBe("invalid_body");
  });

  it("rejects a logo the workspace can't see", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const other = (await call("POST", "/api/workspaces", bo.cookie, { name: "Other", accessMode: "invite" })).json().workspace.id;
    const kit = await newKit(ada.cookie, ws);
    const put = (id: string) => call("PUT", `/api/brand-kits/${kit.id}`, ada.cookie, {
      name: "Berry", content: { ...kit.content, logos: { ...kit.content.logos, primary: id } },
    });
    for (const id of [
      await insertAsset(bo.userId),
      await insertAsset(bo.userId, { visibility: "workspace", workspaceId: other }),
      await insertAsset(bo.userId, { visibility: "public", license: "cc0", deletedAt: new Date() }),
      "not-a-uuid",
    ]) {
      const res = await put(id);
      expect([res.statusCode, res.json().error]).toEqual([400, "invalid_logo"]);
    }
    expect((await put(await insertAsset(bo.userId, { visibility: "public", license: "cc0" }))).statusCode).toBe(200);
    expect((await put(await insertAsset(bo.userId, { visibility: "workspace", workspaceId: ws }))).statusCode).toBe(200);
    const created = await call("POST", `/api/workspaces/${ws}/brand-kits`, ada.cookie, {
      name: "N", content: { ...kit.content, logos: { ...kit.content.logos, mark: await insertAsset(bo.userId) } },
    });
    expect(created.json().error).toBe("invalid_logo");
  });

  it("links a design to a kit in its workspace only", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const other = (await call("POST", "/api/workspaces", ada.cookie, { name: "Other", accessMode: "invite" })).json().workspace.id;
    const design = await newDesign(ada.cookie, ws);
    const kit = await newKit(ada.cookie, ws);
    const foreign = await newKit(ada.cookie, other);
    expect((await call("PATCH", `/api/designs/${design.id}`, ada.cookie, { kitId: foreign.id })).statusCode).toBe(404);
    const linked = await call("PATCH", `/api/designs/${design.id}`, bo.cookie, { kitId: kit.id });
    expect(linked.json().design.kitId).toBe(kit.id);
    expect((await call("GET", `/api/designs/${design.id}`, ada.cookie)).json().design.kitId).toBe(kit.id);
    expect((await call("GET", `/api/workspaces/${ws}/designs`, ada.cookie)).json().designs[0].kitId).toBe(kit.id);
    expect((await call("PATCH", `/api/designs/${design.id}`, ada.cookie, { kitId: null })).json().design.kitId).toBeNull();
  });

  it("deleting a kit unlinks designs", async () => {
    const { ada, ws } = await workspaceWith("editor");
    const design = await newDesign(ada.cookie, ws);
    const kit = await newKit(ada.cookie, ws);
    await call("PATCH", `/api/designs/${design.id}`, ada.cookie, { kitId: kit.id });
    expect((await call("DELETE", `/api/brand-kits/${kit.id}`, ada.cookie)).statusCode).toBe(204);
    expect((await call("GET", `/api/designs/${design.id}`, ada.cookie)).json().design.kitId).toBeNull();
  });
});

describe("brand locks", () => {
  /** Ada (owner) seeds a fixed rect and a content-locked text; Bo then saves as `role`. */
  async function locked(role: "editor" | "admin") {
    const { ada, bo, ws } = await workspaceWith(role);
    const design = await newDesign(ada.cookie, ws);
    const url = `/api/designs/${design.id}/state`;
    const load = async () => (await call("GET", `/api/designs/${design.id}`, ada.cookie)).json().state as string;
    const seed = toYDoc(await load());
    const page = getPageIds(seed)[0]!;
    const rect = { ...createShape("rect", { x: 0, y: 0, width: 10, height: 10 }), brandLock: "fixed" } as ReturnType<typeof createShape>;
    const text = { ...createText({ x: 0, y: 20 }, 50), brandLock: "content" } as ReturnType<typeof createShape>;
    addNode(seed, page, rect);
    addNode(seed, page, text);
    expect((await call("PUT", url, ada.cookie, { state: b64(Y.encodeStateAsUpdate(seed)) })).statusCode).toBe(200);
    const before = await load();
    const edit = (fn: (d: Y.Doc, page: string) => void) => {
      const d = toYDoc(before);
      fn(d, page);
      return call("PUT", url, bo.cookie, { state: b64(Y.encodeStateAsUpdate(d)) });
    };
    return { edit, load, before, rect, text };
  }

  it("editor may change locked text content", async () => {
    const { edit, text } = await locked("editor");
    expect((await edit((d, p) => updateNode(d, p, text.id, { text: "Hello" } as never))).statusCode).toBe(200);
  });

  it("editor can't move a fixed layer", async () => {
    const { edit, rect, load, before } = await locked("editor");
    const res = await edit((d, p) => updateNode(d, p, rect.id, { x: 5 } as never));
    expect([res.statusCode, res.json().error]).toEqual([403, "brand_locked"]);
    expect(await load()).toBe(before);
  });

  it("rejects deleting a locked layer's page", async () => {
    const { edit } = await locked("editor");
    const res = await edit((d) => { addPage(d); removePage(d, getPageIds(d)[0]!); });
    expect(res.statusCode).toBe(403);
  });

  it("admin may change locked layers", async () => {
    const { edit, rect } = await locked("admin");
    expect((await edit((d, p) => updateNode(d, p, rect.id, { x: 5 } as never))).statusCode).toBe(200);
  });
});
