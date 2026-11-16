import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { tiff } from "./fixture.ts";
import { DEFAULT_ICC, GsError } from "./gs.ts";
import { createPrintServer, realRun, TimeoutError, type Run } from "./server.ts";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n");
const servers: { close(): void; closeAllConnections(): void }[] = [];
afterEach(() => servers.splice(0).forEach((s) => (s.closeAllConnections(), s.close())));

async function start(
  run: Run,
  opts: { version?: () => Promise<string>; maxWaiting?: number; maxBody?: number; icc?: string; openFile?: (f: string) => Writable; shutdown?: AbortSignal } = {},
) {
  const server = createPrintServer({
    run,
    version: opts.version ?? (async () => "10.0.0"),
    icc: opts.icc,
    maxWaiting: opts.maxWaiting,
    maxBody: opts.maxBody,
    openFile: opts.openFile,
    shutdown: opts.shutdown,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const inputOf = (args: string[]) => args.at(-1)!;
const outputOf = (args: string[]) => args.find((a) => a.startsWith("-sOutputFile="))!.slice("-sOutputFile=".length);
const post = (url: string, body: string | Buffer, signal?: AbortSignal) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/pdf" }, body: body as string, signal });

describe("print server", () => {
  it("GET /health reports gs version, cached after the first call", async () => {
    let calls = 0;
    const base = await start(async () => {}, { version: async () => `10.0.${++calls}` });
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: "ok", gs: "10.0.1" });
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: "ok", gs: "10.0.1" });
  });

  it("POST /pdfx returns the converted file, using the default profile and def file", async () => {
    let seen: string[] = [];
    const base = await start(async (args) => {
      seen = args;
      expect(readFileSync(inputOf(args)).toString()).toContain("%PDF-");
      writeFileSync(outputOf(args), "%PDF-X converted");
    });
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await res.text()).toBe("%PDF-X converted");
    expect(seen).toContain(`-sOutputICCProfile=${DEFAULT_ICC}`);
    expect(seen.at(-2)).toMatch(/PDFX_def\.ps$/);
  });

  it("POST /plates returns base64 PNG plates at the requested dpi", async () => {
    let seen: string[] = [];
    const base = await start(async (args) => {
      seen = args;
      const dir = dirname(outputOf(args));
      writeFileSync(`${dir}/p1(Cyan).tif`, tiff(2, 1, [0, 255], 1, { extras: true }));
      writeFileSync(`${dir}/p1.tif`, "composite is ignored");
    });
    const res = await post(`${base}/plates?dpi=100`, PDF);
    expect(res.status).toBe(200);
    expect(seen).toContain("-r100");
    const body = (await res.json()) as { plates: { page: number; name: string; png: string }[] };
    expect(body.plates).toHaveLength(1);
    expect(body.plates[0]).toMatchObject({ page: 1, name: "Cyan" });
    expect(Buffer.from(body.plates[0]!.png, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("an empty dpi gives the default 150", async () => {
    let seen: string[] = [];
    const base = await start(async (args) => {
      seen = args;
      writeFileSync(`${dirname(outputOf(args))}/p1(Black).tif`, tiff(1, 1, [0], 1));
    });
    expect((await post(`${base}/plates?dpi=`, PDF)).status).toBe(200);
    expect(seen).toContain("-r150");
  });

  it("timeout gives 504 and cleans the temp dir", async () => {
    let input = "";
    const base = await start(async (args) => {
      input = inputOf(args);
      throw new TimeoutError();
    });
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "timeout" });
    expect(input).not.toBe("");
    expect(existsSync(input)).toBe(false);
    expect(existsSync(dirname(input))).toBe(false);
  });

  it("gs failure gives 422 gs_failed; an unexpected error gives 500", async () => {
    const bad = await start(async () => {
      throw new GsError("gs exited 1");
    });
    const res = await post(`${bad}/pdfx`, PDF);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "gs_failed" });
    const boom = await start(async () => {
      throw new Error("boom");
    });
    expect((await post(`${boom}/pdfx`, PDF)).status).toBe(500);
  });

  it("gs exiting 0 without output gives 422 (pdfx: missing or empty file, plates: none)", async () => {
    const none = await start(async () => {});
    expect((await post(`${none}/pdfx`, PDF)).status).toBe(422);
    expect((await post(`${none}/plates`, PDF)).status).toBe(422);
    const empty = await start(async (args) => writeFileSync(outputOf(args), ""));
    expect((await post(`${empty}/pdfx`, PDF)).status).toBe(422);
  });

  it("a corrupt plate TIFF gives 422, not 500", async () => {
    const base = await start(async (args) => writeFileSync(`${dirname(outputOf(args))}/p1(Cyan).tif`, "garbage"));
    expect((await post(`${base}/plates`, PDF)).status).toBe(422);
  });

  it("a write-stream error gives 500 and the server stays up", async () => {
    let first = true;
    const base = await start(
      async (args) => writeFileSync(outputOf(args), "%PDF-ok"),
      {
        openFile: (f) => {
          if (!first) return createWriteStream(f);
          first = false;
          return new Writable({ write: (_c, _e, cb) => cb(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" })) });
        },
      },
    );
    expect((await post(`${base}/pdfx`, PDF)).status).toBe(500);
    expect((await post(`${base}/pdfx`, PDF)).status).toBe(200);
  });

  it("shutdown aborts a running job", async () => {
    const shutdown = new AbortController();
    let fired!: () => void;
    const sawAbort = new Promise<void>((r) => (fired = r));
    const base = await start(
      async (_a, _t, signal) => {
        signal?.addEventListener("abort", () => fired());
        await new Promise((r) => setTimeout(r, 2000));
      },
      { shutdown: shutdown.signal },
    );
    void post(`${base}/pdfx`, PDF).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
    shutdown.abort();
    await sawAbort;
  });

  it("non-PDF body gives 422", async () => {
    let ran = false;
    const base = await start(async () => {
      ran = true;
    });
    const res = await post(`${base}/pdfx`, "hello");
    expect(res.status).toBe(422);
    expect(ran).toBe(false);
  });

  it("a body over the limit gives 413 before gs runs", async () => {
    let ran = false;
    const base = await start(
      async () => {
        ran = true;
      },
      { maxBody: 10 },
    );
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
    expect(ran).toBe(false);
  });

  it("more than the allowed waiting gives 429 busy", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = await start(
      async (args) => {
        await gate;
        writeFileSync(outputOf(args), "%PDF-ok");
      },
      { maxWaiting: 1 },
    );
    const inflight = [post(`${base}/pdfx`, PDF), post(`${base}/pdfx`, PDF)]; // 1 running + 1 waiting
    await new Promise((r) => setTimeout(r, 150));
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "busy" });
    release();
    expect((await Promise.all(inflight)).map((r) => r.status)).toEqual([200, 200]);
  });

  it("a client that aborts while queued never reaches gs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const base = await start(async (args) => {
      calls++;
      await gate;
      writeFileSync(outputOf(args), "%PDF-ok");
    });
    const first = post(`${base}/pdfx`, PDF);
    await new Promise((r) => setTimeout(r, 100));
    const ac = new AbortController();
    const second = post(`${base}/pdfx`, PDF, ac.signal).catch(() => "aborted");
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    expect(await second).toBe("aborted");
    await new Promise((r) => setTimeout(r, 100));
    release();
    expect((await first).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
  });

  it("run receives an abort signal that fires when the client disconnects mid-job", async () => {
    let fired!: () => void;
    const sawAbort = new Promise<void>((r) => (fired = r));
    const base = await start(async (_args, _t, signal) => {
      signal?.addEventListener("abort", () => fired());
      await new Promise((r) => setTimeout(r, 2000));
    });
    const ac = new AbortController();
    const req = post(`${base}/pdfx`, PDF, ac.signal).catch(() => "aborted");
    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await req;
    await sawAbort;
  });
});

const hasGs = (() => {
  try {
    execFileSync("gs", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const icc = process.env.PRINT_ICC_PROFILE || DEFAULT_ICC;

describe.skipIf(!hasGs || !existsSync(icc))("real Ghostscript", () => {
  it("converts a one-page PDF to CMYK PDF/X with an output intent", async () => {
    const base = await start(realRun, { icc });
    const stream = "1 0 0 rg 10 10 80 80 re f";
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]/Contents 4 0 R/Resources<<>>>>endobj\n" +
        `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\ntrailer<</Root 1 0 R/Size 5>>\n`,
    );
    const res = await post(`${base}/pdfx`, pdf);
    expect(res.status).toBe(200);
    const out = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(out).toContain("/OutputIntents");
    expect(out).toMatch(/\/S\s*\/GTS_PDFX/);
    expect(out).toContain("/DeviceCMYK");
  }, 60_000);
});
