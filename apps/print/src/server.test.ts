import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tiff } from "./fixture.ts";
import { createPrintServer, realRun, TimeoutError, type Run } from "./server.ts";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n");
const servers: { close(): void }[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function start(run: Run, opts: { version?: () => Promise<string>; maxWaiting?: number } = {}) {
  const server = createPrintServer({
    run,
    version: opts.version ?? (async () => "10.0.0"),
    icc: undefined,
    maxWaiting: opts.maxWaiting,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const inputOf = (args: string[]) => args.at(-1)!;
const outputOf = (args: string[]) => args.find((a) => a.startsWith("-sOutputFile="))!.slice("-sOutputFile=".length);
const post = (url: string, body: string | Buffer) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/pdf" }, body: body as string });

describe("print server", () => {
  it("GET /health reports gs version", async () => {
    const base = await start(async () => {}, { version: async () => "10.0.0" });
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: "ok", gs: "10.0.0" });
  });

  it("POST /pdfx returns the converted file", async () => {
    const base = await start(async (args) => {
      expect(readFileSync(inputOf(args)).toString()).toContain("%PDF-");
      writeFileSync(outputOf(args), "%PDF-X converted");
    });
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await res.text()).toBe("%PDF-X converted");
  });

  it("POST /plates returns base64 PNG plates", async () => {
    const base = await start(async (args) => {
      const dir = dirname(outputOf(args));
      writeFileSync(`${dir}/p1(Cyan).tif`, tiff(2, 1, [0, 255], 1));
      writeFileSync(`${dir}/p1.tif`, "composite is ignored");
    });
    const res = await post(`${base}/plates?dpi=100`, PDF);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plates: { page: number; name: string; png: string }[] };
    expect(body.plates).toHaveLength(1);
    expect(body.plates[0]).toMatchObject({ page: 1, name: "Cyan" });
    expect(Buffer.from(body.plates[0]!.png, "base64").subarray(1, 4).toString()).toBe("PNG");
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

  it("gs failure gives 422 gs_failed", async () => {
    const base = await start(async () => {
      throw new Error("gs exited 1");
    });
    const res = await post(`${base}/pdfx`, PDF);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "gs_failed" });
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
});

const hasGs = (() => {
  try {
    execFileSync("gs", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasGs)("real Ghostscript", () => {
  it("converts a one-page PDF to CMYK PDF/X", async () => {
    const base = await start(realRun);
    const stream = "1 0 0 rg 10 10 80 80 re f";
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]/Contents 4 0 R/Resources<<>>>>endobj\n" +
        `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\ntrailer<</Root 1 0 R/Size 5>>\n`,
    );
    const res = await post(`${base}/pdfx`, pdf);
    expect(res.status).toBe(200);
    const out = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(out).toContain("/GTS_PDFX");
    expect(out).toContain("/DeviceCMYK");
  }, 60_000);
});
