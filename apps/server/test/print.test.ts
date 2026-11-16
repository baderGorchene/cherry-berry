import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { MAX_EXPORTS } from "../src/export/service";
import { setupTestApp, signUp } from "./helpers";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let stub: Server;
let stubUrl = "";
let t: Awaited<ReturnType<typeof setupTestApp>>;      // with PRINT_URL
let down: Awaited<ReturnType<typeof setupTestApp>>;   // PRINT_URL points at a closed port
let off: Awaited<ReturnType<typeof setupTestApp>>;    // no PRINT_URL

beforeAll(async () => {
  stub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const path = new URL(req.url!, "http://x").pathname;
      if (path === "/pdfx") {
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end(Buffer.concat([Buffer.from("%PDF-1.4 CMYK-MARKER "), Buffer.concat(chunks).subarray(0, 5)]));
      } else if (path === "/plates") {
        const png = PNG.toString("base64");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ plates: ["Cyan", "Magenta", "Yellow", "Black"].map((name) => ({ page: 1, name, png })) }));
      } else { res.writeHead(404); res.end(); }
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  const closed = createServer();
  await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
  const closedUrl = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
  await new Promise((r) => closed.close(r));
  t = await setupTestApp({ printUrl: stubUrl });
  down = await setupTestApp({ printUrl: closedUrl });
  off = await setupTestApp();
});
afterAll(async () => {
  await t.close(); await down.close(); await off.close();
  await new Promise((r) => stub.close(r));
});

type App = typeof t;
/** A signed-in user with a one-page design, on `app`. */
async function setup(app: App) {
  await app.reset();
  const u = await signUp(app.app, "ada@example.com");
  const { workspace } = (await app.app.inject({ method: "POST", url: "/api/workspaces", headers: { cookie: u.cookie }, payload: { name: "North", accessMode: "invite" } })).json();
  const d = (await app.app.inject({ method: "POST", url: `/api/workspaces/${workspace.id}/designs`, headers: { cookie: u.cookie },
    payload: { title: "P", colorMode: "cmyk", width: 100, height: 50, unit: "mm", bleed: 3 } })).json().design.id as string;
  const info = (await app.app.inject({ method: "GET", url: `/api/designs/${d}/export/info`, headers: { cookie: u.cookie } })).json();
  return { cookie: u.cookie, id: d, info };
}

describe("print exports", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  let pageIds: string[];
  const run = (app: App, format: string, who = s) => app.app.inject({
    method: "POST", url: `/api/designs/${who.id}/export`, headers: { cookie: who.cookie }, payload: { format, pageIds },
  });

  beforeEach(async () => { s = await setup(t); pageIds = await firstPage(t, s); });

  it("pdf-x export returns the converted PDF", async () => {
    const res = await run(t, "pdf-x");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain('filename="P.pdf"');
    expect(res.rawPayload.toString("latin1")).toContain("CMYK-MARKER %PDF-");
  });

  it("plates export returns a zip of pngs", async () => {
    const res = await run(t, "plates");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("P-plates.zip");
    const files = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(files).sort()).toEqual(["p1-Black.png", "p1-Cyan.png", "p1-Magenta.png", "p1-Yellow.png"]);
    expect(strFromU8(files["p1-Cyan.png"]!.subarray(1, 4))).toBe("PNG");
  });

  it("print formats need PRINT_URL", async () => {
    const o = await setup(off);
    const ids2 = await firstPage(off, o);
    for (const format of ["pdf-x", "plates"]) {
      const res = await off.app.inject({ method: "POST", url: `/api/designs/${o.id}/export`, headers: { cookie: o.cookie }, payload: { format, pageIds: ids2 } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_body");
    }
  });

  it("print service down gives print_unavailable and frees the slot", async () => {
    const d = await setup(down);
    const dp = await firstPage(down, d);
    for (let i = 0; i < MAX_EXPORTS + 2; i++) {
      for (const format of ["pdf-x", "plates"]) {
        const res = await down.app.inject({ method: "POST", url: `/api/designs/${d.id}/export`, headers: { cookie: d.cookie }, payload: { format, pageIds: dp } });
        expect(res.statusCode).toBe(503);
        expect(res.json().error).toBe("print_unavailable");
      }
    }
    const ok = await down.app.inject({ method: "POST", url: `/api/designs/${d.id}/export`, headers: { cookie: d.cookie }, payload: { format: "png", pageIds: dp } });
    expect(ok.statusCode).toBe(200);
  });

  it("export info reports print", async () => {
    expect(s.info.print).toBe(true);
    expect((await setup(off)).info.print).toBe(false);
  });
});

/** The design's page ids, read through the collab-free export of its stored state. */
async function firstPage(app: App, s: { cookie: string; id: string }): Promise<string[]> {
  const { designs } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const Y = await import("yjs");
  const { yToDoc } = await import("@cherry/doc");
  const [row] = await app.db.select({ state: designs.state }).from(designs).where(eq(designs.id, s.id));
  const y = new Y.Doc();
  Y.applyUpdate(y, row!.state);
  const parsed = yToDoc(y);
  if (!parsed.ok) throw new Error("bad doc");
  return parsed.doc.pages.map((p) => p.id);
}
