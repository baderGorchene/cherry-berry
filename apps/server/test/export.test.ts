import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import WebSocket from "ws";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { addNode, getPageIds, replaceDocument, yToDoc, type CherryDocument, type CherryNode } from "@cherry/doc";
import { eq } from "drizzle-orm";
import { assets, brandFonts, designs } from "../src/db/schema";
import { exportInfo, fileBase } from "../src/export/service";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let url = "";
beforeAll(async () => {
  t = await setupTestApp();
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  url = `ws://127.0.0.1:${(t.app.server.address() as AddressInfo).port}/api/collab`;
});
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
const open: { destroy(): void }[] = [];
afterEach(() => { open.splice(0).forEach((p) => p.destroy()); });
afterAll(() => t.close());

type Method = "GET" | "POST" | "PUT" | "PATCH";
const call = (method: Method, path: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url: path, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });

const base = { name: "n", rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
const solid = (color: string, opacity = 1) => ({ type: "solid" as const, color, opacity });
const rect = (over: Partial<CherryNode> = {}) =>
  ({ ...base, id: crypto.randomUUID(), kind: "rect", x: 0, y: 0, width: 10, height: 10, cornerRadius: 0, fill: solid("#FF0000"), ...over }) as CherryNode;
const text = (over: Partial<CherryNode> = {}) =>
  ({ ...base, id: crypto.randomUUID(), kind: "text", x: 5, y: 5, width: 80, height: 20, text: "Hello berry", fontFamily: "Inter",
    fontSize: 12, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left", fill: solid("#22142A"), ...over }) as CherryNode;
const image = (assetId: string, over: Partial<CherryNode> = {}) =>
  ({ ...base, id: crypto.randomUUID(), kind: "image", x: 0, y: 0, width: 60, height: 30, assetId, ...over }) as CherryNode;

/** Ada owns the workspace, Cy is a viewer, Eve is not a member. */
async function team() {
  const ada = await signUp(t.app, "ada@example.com");
  const cy = await signUp(t.app, "cy@example.com");
  const eve = await signUp(t.app, "eve@example.com");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "cy@example.com", role: "viewer" });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, cy.cookie);
  return { ada, cy, eve, ws: workspace.id as string };
}

type Size = { width: number; height: number; unit: "px" | "mm" | "in"; bleed?: number; title?: string };
async function design(cookie: string, ws: string, size: Size = { width: 100, height: 50, unit: "px" }) {
  const res = await call("POST", `/api/workspaces/${ws}/designs`, cookie, { title: "P", colorMode: "rgb", ...size });
  expect(res.statusCode).toBe(201);
  return res.json().design.id as string;
}
const ydocOf = async (cookie: string, id: string) => {
  const d = new Y.Doc();
  Y.applyUpdate(d, Buffer.from((await call("GET", `/api/designs/${id}`, cookie)).json().state, "base64"));
  return d;
};
const docOf = (d: Y.Doc) => { const r = yToDoc(d); if (!r.ok) throw new Error(r.error); return r.doc; };
/** Edits the stored document through the state route; returns the page ids. */
async function edit(cookie: string, id: string, change: (doc: CherryDocument) => void) {
  const d = await ydocOf(cookie, id);
  const doc = docOf(d);
  change(doc);
  replaceDocument(d, doc);
  const res = await call("PUT", `/api/designs/${id}/state`, cookie, { state: Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64") });
  expect(res.statusCode).toBe(200);
  return docOf(d).pages.map((p) => p.id);
}
const extraPage = (doc: CherryDocument) => { doc.pages.push({ ...doc.pages[0]!, id: crypto.randomUUID(), nodes: [] }); };
const nodes = (...ns: CherryNode[]) => (doc: CherryDocument) => { doc.pages[0]!.nodes.push(...ns); };
const exp = (cookie: string, id: string, body: object) => call("POST", `/api/designs/${id}/export`, cookie, body);

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}
const mediaBoxes = (pdf: Buffer) =>
  [...pdf.toString("latin1").matchAll(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
const PT = 72 / 25.4;

let shaN = 0;
async function insertAsset(createdBy: string, over: Partial<typeof assets.$inferInsert> = {}, color = { r: 0, g: 0, b: 255 }) {
  const sha256 = `sha${++shaN}`;
  await t.storage.put(`files/${sha256}`, await sharp({ create: { width: 4, height: 4, channels: 3, background: color } }).png().toBuffer(), "image/png");
  const [a] = await t.db.insert(assets).values({
    createdBy, visibility: "public", title: "Berry", tags: [], license: "cc0", attribution: "", kind: "image", format: "png",
    width: 4, height: 4, bytes: 1, sha256, ...over,
  } as typeof assets.$inferInsert).returning();
  return a!.id;
}

/** A kit in `ws` whose `family` (400) is the bundled @fontsource `pkg` latin-400 file. */
async function kitWith(who: { cookie: string; userId: string }, ws: string, family: string, pkg: "inter" | "space-grotesk") {
  const kit = (await call("POST", `/api/workspaces/${ws}/brand-kits`, who.cookie, { name: "Kit" })).json().kit.id as string;
  const file = readFileSync(new URL(`../node_modules/@fontsource/${pkg}/files/${pkg}-latin-400-normal.woff2`, import.meta.url));
  const sha256 = `font-${pkg}-${crypto.randomUUID()}`;
  await t.storage.put(`fonts/${sha256}`, file, "font/woff2");
  await t.db.insert(brandFonts).values({ kitId: kit, family, weight: 400, style: "normal", format: "woff2", sha256, bytes: file.length, createdBy: who.userId });
  return kit;
}

describe("export formats", () => {
  it("pdf digital page size", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws, { width: 210, height: 297, unit: "mm" });
    const pageIds = await edit(ada.cookie, id, nodes(text()));
    const res = await exp(ada.cookie, id, { format: "pdf", pageIds });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const [[w, h]] = mediaBoxes(res.rawPayload) as [[number, number]];
    expect(Math.abs(w - 595.28)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(h - 841.89)).toBeLessThanOrEqual(0.5);
  });

  it("pdf print adds bleed and crop marks", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws, { width: 210, height: 297, unit: "mm", bleed: 3 });
    const pageIds = await edit(ada.cookie, id, nodes(rect()));
    const marked = await exp(ada.cookie, id, { format: "pdf-print", pageIds });
    expect(marked.statusCode).toBe(200);
    expect(Math.abs(mediaBoxes(marked.rawPayload)[0]![0]! - (595.28 + 2 * 11 * PT))).toBeLessThanOrEqual(0.5);
    const plain = await exp(ada.cookie, id, { format: "pdf-print", pageIds, cropMarks: false });
    expect(Math.abs(mediaBoxes(plain.rawPayload)[0]![0]! - (595.28 + 2 * 3 * PT))).toBeLessThanOrEqual(0.5);
  });

  it("png scale and transparency", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, nodes(rect({ x: 0, y: 0, width: 10, height: 10 })));
    const clear = await exp(ada.cookie, id, { format: "png", pageIds, scale: 2, transparent: true });
    expect(clear.statusCode).toBe(200);
    expect(clear.headers["content-type"]).toBe("image/png");
    const meta = await sharp(clear.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([200, 100]);
    expect(await pixel(clear.rawPayload, 150, 80)).toEqual([0, 0, 0, 0]);
    expect(await pixel(clear.rawPayload, 10, 10)).toEqual([255, 0, 0, 255]);
    const filled = await exp(ada.cookie, id, { format: "png", pageIds });
    expect((await sharp(filled.rawPayload).metadata()).width).toBe(100);
    expect(await pixel(filled.rawPayload, 80, 40)).toEqual([255, 255, 255, 255]);
  });

  it("jpg is jpeg", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, (doc) => { doc.pages[0]!.background = solid("#000000", 0); });
    const res = await exp(ada.cookie, id, { format: "jpg", pageIds, transparent: true });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect((await sharp(res.rawPayload).metadata()).format).toBe("jpeg");
    const [r, g, b] = await pixel(res.rawPayload, 50, 25);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(245); // white behind transparency
  });

  it("two png pages download as a zip with two entries", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, (doc) => { extraPage(doc); });
    expect(pageIds).toHaveLength(2);
    const res = await exp(ada.cookie, id, { format: "png", pageIds });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain('filename="P.zip"');
    const files = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(files).sort()).toEqual(["P-1.png", "P-2.png"]);
    expect((await sharp(Buffer.from(files["P-2.png"]!)).metadata()).format).toBe("png");
  });

  it("svg outlines text", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, nodes(text()));
    const res = await exp(ada.cookie, id, { format: "svg", pageIds });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/svg+xml");
    expect(res.body).toContain("<svg");
    expect(res.body).not.toContain("<text");
    expect(res.body).toContain("<path");
  });

  it("gif has one frame per page", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, (doc) => { extraPage(doc); extraPage(doc); doc.pages[0]!.nodes.push(rect()); });
    const res = await exp(ada.cookie, id, { format: "gif", pageIds: pageIds.slice(0, 2), secondsPerPage: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/gif");
    const meta = await sharp(res.rawPayload, { animated: true }).metadata();
    expect(meta.pages).toBe(2);
    expect(meta.delay).toEqual([3000, 3000]);
    expect(meta.loop).toBe(0);
  });

  it("pptx is a zip with one slide per page and credits in notes", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const assetId = await insertAsset(ada.userId, { license: "cc-by", attribution: "Ana", title: "Berry" });
    const pageIds = await edit(ada.cookie, id, (doc) => {
      extraPage(doc);
      doc.pages[0]!.nodes.push(text({ text: "Editable words" }), image(assetId), rect({ rotation: 30, opacity: 0.5 }),
        { ...base, id: "g", kind: "group", x: 0, y: 0, width: 20, height: 20, children: [rect()] } as CherryNode);
    });
    const res = await exp(ada.cookie, id, { format: "pptx", pageIds });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const slides = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(2);
    const slide1 = strFromU8(files["ppt/slides/slide1.xml"]!);
    expect(slide1).toContain("Editable words"); // text stays text
    expect(slide1).toContain('rot="1800000"'); // rotation carried over
    const notes = Object.entries(files).filter(([f]) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)).map(([, b]) => strFromU8(b));
    expect(notes.some((n) => n.includes("by Ana, CC BY 4.0"))).toBe(true);
  });
});

describe("export service", () => {
  it("export reads the live document", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, () => {});
    class CookieSocket extends WebSocket {
      constructor(address: string) { super(address, { headers: { cookie: ada.cookie } }); }
    }
    const doc = new Y.Doc();
    const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: CookieSocket });
    const provider = new HocuspocusProvider({ websocketProvider: socket, name: id, document: doc });
    provider.attach();
    open.push(provider, socket);
    await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 3000 });
    addNode(doc, getPageIds(doc)[0]!, rect({ width: 100, height: 50, fill: solid("#00FF00") }));
    await vi.waitFor(() => {
      const live = new Y.Doc();
      Y.applyUpdate(live, t.app.collab.liveState(id)!);
      expect(docOf(live).pages[0]!.nodes).toHaveLength(1);
    }, { timeout: 3000 });
    const res = await exp(ada.cookie, id, { format: "png", pageIds });
    expect(res.statusCode).toBe(200);
    expect(await pixel(res.rawPayload, 50, 25)).toEqual([0, 255, 0, 255]);
    // The stored row still lacks the edit, so the file came from the live document.
    const stored = await t.db.select({ state: designs.state }).from(designs).where(eq(designs.id, id));
    const fromRow = new Y.Doc();
    Y.applyUpdate(fromRow, stored[0]!.state);
    expect(docOf(fromRow).pages[0]!.nodes).toHaveLength(0);
    open.splice(0).forEach((p) => p.destroy());
    await vi.waitFor(() => expect(t.app.collab.liveState(id)).toBeNull(), { timeout: 3000 });
  });

  it("unknown font still exports", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, nodes(text({ fontFamily: "Nope Sans" })));
    for (const format of ["png", "pdf", "svg"]) expect((await exp(ada.cookie, id, { format, pageIds })).statusCode).toBe(200);
  });

  it("a kit font that can't be fetched is skipped", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const kit = (await call("POST", `/api/workspaces/${ws}/brand-kits`, ada.cookie, { name: "Berry" })).json().kit.id as string;
    await t.db.insert(brandFonts).values({ kitId: kit, family: "Gone Sans", weight: 400, style: "normal", format: "woff2",
      sha256: "missing", bytes: 1, createdBy: ada.userId });
    expect((await call("PATCH", `/api/designs/${id}`, ada.cookie, { kitId: kit })).statusCode).toBe(200);
    const info = (await call("GET", `/api/designs/${id}/export/info`, ada.cookie)).json();
    expect(info.fonts).toEqual(expect.arrayContaining(["Inter", "Space Grotesk", "Gone Sans"]));
    const pageIds = await edit(ada.cookie, id, nodes(text({ fontFamily: "Gone Sans" })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await exp(ada.cookie, id, { format: "png", pageIds })).statusCode).toBe(200);
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("kit fonts stay inside their own design", async () => {
    const { ada, eve, ws } = await team();
    const eveWs = (await call("POST", "/api/workspaces", eve.cookie, { name: "South", accessMode: "invite" })).json().workspace.id as string;
    const big = (fontFamily: string) => nodes(text({ fontFamily, fontSize: 24, width: 400, height: 60, text: "Hello berry" }));
    const render = async (cookie: string, workspace: string, fontFamily: string, kitId?: string) => {
      const id = await design(cookie, workspace, { width: 400, height: 80, unit: "px" });
      if (kitId) expect((await call("PATCH", `/api/designs/${id}`, cookie, { kitId })).statusCode).toBe(200);
      const res = await exp(cookie, id, { format: "png", pageIds: await edit(cookie, id, big(fontFamily)) });
      expect(res.statusCode).toBe(200);
      return sharp(res.rawPayload).raw().toBuffer();
    };
    const interRef = await render(ada.cookie, ws, "Inter");
    const groteskRef = await render(ada.cookie, ws, "Space Grotesk");
    expect(interRef.equals(groteskRef)).toBe(false);

    // Same family name in two workspaces, different files: each design renders with its own kit's file.
    const a = await render(ada.cookie, ws, "Brand Sans", await kitWith(ada, ws, "Brand Sans", "inter"));
    const b = await render(eve.cookie, eveWs, "Brand Sans", await kitWith(eve, eveWs, "Brand Sans", "space-grotesk"));
    expect(a.equals(interRef)).toBe(true);
    expect(b.equals(groteskRef)).toBe(true);
    // ...and a design without a kit never picks either one up by name.
    expect((await render(ada.cookie, ws, "Brand Sans")).equals(a)).toBe(false);

    // A kit family named "Inter" applies to its own design only; the built-in Inter is unchanged for everyone else.
    const shadow = await render(eve.cookie, eveWs, "Inter", await kitWith(eve, eveWs, "Inter", "space-grotesk"));
    expect(shadow.equals(groteskRef)).toBe(true);
    expect((await render(ada.cookie, ws, "Inter")).equals(interRef)).toBe(true);
  });

  it("unreadable visual renders the placeholder", async () => {
    const { ada, eve, ws } = await team();
    const id = await design(ada.cookie, ws);
    const secret = await insertAsset(eve.userId, { visibility: "private", title: "Eve's secret", license: "cc-by", attribution: "Eve" }, { r: 255, g: 0, b: 0 });
    const mine = await insertAsset(ada.userId, { title: "Mine" });
    const pageIds = await edit(ada.cookie, id, (doc) => {
      doc.pages[0]!.nodes.push(image(secret));
      extraPage(doc);
    });
    // The visual on a page that isn't exported is still reported.
    await edit(ada.cookie, id, (doc) => { doc.pages[1]!.nodes.push(image(mine), image("not-a-uuid")); });
    const get = vi.spyOn(t.storage, "get");
    const res = await exp(ada.cookie, id, { format: "png", pageIds: [pageIds[0]!] });
    expect(res.statusCode).toBe(200);
    expect(await pixel(res.rawPayload, 2, 15)).toEqual([0xd9, 0xd2, 0xdc, 255]);
    expect(get.mock.calls.map((c) => c[0])).not.toContain("files/sha" + (shaN - 1));
    get.mockRestore();

    const info = await call("GET", `/api/designs/${id}/export/info`, ada.cookie);
    expect(info.statusCode).toBe(200);
    expect(info.json().assets).toEqual([
      { id: secret, title: "Unavailable visual", license: "cc0", attribution: "", width: 0, height: 0, kind: "image", available: false },
      { id: mine, title: "Mine", license: "cc0", attribution: "", width: 4, height: 4, kind: "image", available: true },
      expect.objectContaining({ id: "not-a-uuid", available: false }),
    ]);
    const direct = await exportInfo(t.db, t.storage, t.app.collab, ada.userId, id);
    expect(direct.assets.map((a) => a.available)).toEqual([false, true, false]);
  });

  it("an image storage outage is a server error", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const assetId = await insertAsset(ada.userId);
    const pageIds = await edit(ada.cookie, id, nodes(image(assetId)));
    const get = vi.spyOn(t.storage, "get").mockRejectedValue(new Error("S3 down"));
    try { expect((await exp(ada.cookie, id, { format: "png", pageIds })).statusCode).toBe(500); } finally { get.mockRestore(); }
  });

  it("oversized raster export is refused", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws, { width: 5000, height: 5000, unit: "mm" });
    const pageIds = await edit(ada.cookie, id, () => {});
    for (const format of ["png", "jpg", "gif"]) {
      const res = await exp(ada.cookie, id, { format, pageIds, scale: 3 });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "export_too_large" });
    }
  });

  it("filename is safe for any title", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, (doc) => { doc.title = 'a/b "c" ü'; });
    const res = await exp(ada.cookie, id, { format: "png", pageIds });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="a-b -c- _.png"; filename*=UTF-8''a-b%20-c-%20%C3%BC.png`);
    await edit(ada.cookie, id, (doc) => { doc.title = "x\u0001y"; });
    expect((await exp(ada.cookie, id, { format: "png", pageIds })).headers["content-disposition"]).toContain('filename="x-y.png"');
    await edit(ada.cookie, id, (doc) => { doc.title = "   "; });
    expect((await exp(ada.cookie, id, { format: "png", pageIds })).headers["content-disposition"]).toContain('filename="design.png"');
    // 100 code points ending in an emoji: a UTF-16 cut at 100 would split its surrogate pair.
    await edit(ada.cookie, id, (doc) => { doc.title = "a".repeat(99) + "😀" + "tail"; });
    const emoji = await exp(ada.cookie, id, { format: "png", pageIds });
    expect(emoji.statusCode).toBe(200);
    expect(emoji.headers["content-disposition"]).toBe(
      `attachment; filename="${"a".repeat(99)}_.png"; filename*=UTF-8''${"a".repeat(99)}%F0%9F%98%80.png`);
    for (const [title, base] of [["x\uD800", "x-"], ["\uDC00y", "-y"]] as const) {
      expect(fileBase(title)).toBe(base);
      expect(() => encodeURIComponent(fileBase(title))).not.toThrow();
    }
  });

  it("huge pages export as vector without rasterising", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws, { width: 5000, height: 5000, unit: "mm", bleed: 3 });
    const pageIds = await edit(ada.cookie, id, nodes(rect({ width: 4000, height: 4000 }), text({ width: 2000, height: 500, fontSize: 400 })));
    // A raster of this page at 96 dpi would be 18898 × 18898 px (≈1.4 GB of RGBA).
    for (const format of ["svg", "pdf", "pdf-print"]) {
      const before = process.memoryUsage().rss, started = Date.now();
      const res = await exp(ada.cookie, id, { format, pageIds });
      expect(res.statusCode).toBe(200);
      expect(process.memoryUsage().rss - before).toBeLessThan(300 * 1024 * 1024);
      expect(Date.now() - started).toBeLessThan(10_000);
    }
  });

  it("viewer can export; outsider gets 404", async () => {
    const { ada, cy, eve, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, () => {});
    expect((await exp(cy.cookie, id, { format: "png", pageIds })).statusCode).toBe(200);
    expect((await call("GET", `/api/designs/${id}/export/info`, cy.cookie)).statusCode).toBe(200);
    expect((await exp(eve.cookie, id, { format: "png", pageIds })).statusCode).toBe(404);
    expect((await call("GET", `/api/designs/${id}/export/info`, eve.cookie)).statusCode).toBe(404);
    expect((await exp("", id, { format: "png", pageIds })).statusCode).toBe(401);
    expect((await exp(ada.cookie, "not-a-uuid", { format: "png", pageIds })).statusCode).toBe(404);
  });

  it("unknown page id is invalid_pages", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, () => {});
    const res = await exp(ada.cookie, id, { format: "png", pageIds: [...pageIds, "nope"] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_pages" });
  });

  it("bad bodies are 400", async () => {
    const { ada, ws } = await team();
    const id = await design(ada.cookie, ws);
    const pageIds = await edit(ada.cookie, id, () => {});
    for (const body of [
      { format: "cherry", pageIds }, { format: "png", pageIds: [] }, { format: "png", pageIds, scale: 4 },
      { format: "gif", pageIds, secondsPerPage: 11 }, {},
    ]) {
      const res = await exp(ada.cookie, id, body);
      expect(res.statusCode).toBe(400);
    }
    const many = await exp(ada.cookie, id, { format: "pdf", pageIds: Array(101).fill(pageIds[0]) });
    expect(many.json()).toEqual({ error: "export_too_large" });
  });
});
