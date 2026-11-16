import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pdfxArgs, platesArgs, plateFiles } from "./gs.ts";
import { BusyError, createQueue } from "./queue.ts";
import { tiffGrayToPng } from "./tiff.ts";

export type Run = (args: string[], timeoutMs: number) => Promise<void>;

export class TimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}

const MAX_BODY = 200 * 1024 * 1024;
const JOB_TIMEOUT_MS = 120_000;

/** Runs the `gs` CLI; rejects with TimeoutError after `timeoutMs` (the process is killed) or Error on a non-zero exit. */
export const realRun: Run = (args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn("gs", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new TimeoutError());
      else if (code === 0) resolve();
      else reject(new Error(`gs exited ${code}: ${stderr}`));
    });
  });

const realVersion = () =>
  new Promise<string>((resolve, reject) =>
    execFile("gs", ["--version"], (e, out) => (e ? reject(e) : resolve(out.trim()))),
  );

class TooLargeError extends Error {}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new TooLargeError();
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: object | Buffer, type = "application/json") {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": type, "content-length": buf.length });
  res.end(buf);
}

export function createPrintServer(opts: {
  run: Run;
  version: () => Promise<string>;
  icc: string | undefined;
  maxWaiting?: number;
  timeoutMs?: number;
}): Server {
  const queue = createQueue(opts.maxWaiting ?? 4);
  const timeoutMs = opts.timeoutMs ?? JOB_TIMEOUT_MS;

  /** Writes the body to a per-job temp dir, runs `job(dir, inputPath)`, and always removes the dir. */
  async function withJob<T>(pdf: Buffer, job: (dir: string, input: string) => Promise<T>): Promise<T> {
    return queue(async () => {
      const dir = await mkdtemp(join(tmpdir(), "cherry-print-"));
      try {
        const input = join(dir, "in.pdf");
        await writeFile(input, pdf);
        return await job(dir, input);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://print");
      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, { status: "ok", gs: await opts.version() });
      }
      if (req.method !== "POST" || (url.pathname !== "/pdfx" && url.pathname !== "/plates")) {
        return send(res, 404, { error: "not_found" });
      }
      const body = await readBody(req);
      if (body.subarray(0, 1024).indexOf("%PDF-") === -1) return send(res, 422, { error: "gs_failed" });

      if (url.pathname === "/pdfx") {
        const out = await withJob(body, async (dir, input) => {
          const output = join(dir, "out.pdf");
          await opts.run(pdfxArgs(input, output, opts.icc), timeoutMs);
          return readFile(output);
        });
        return send(res, 200, out, "application/pdf");
      }

      const dpi = Number(url.searchParams.get("dpi") ?? 150);
      const plates = await withJob(body, async (dir, input) => {
        const outDir = join(dir, "plates");
        await mkdir(outDir);
        await opts.run(platesArgs(input, outDir, dpi), timeoutMs);
        const found = plateFiles(await readdir(outDir));
        return Promise.all(
          found.map(async (p) => ({
            page: p.page,
            name: p.name,
            png: tiffGrayToPng(await readFile(join(outDir, p.file))).toString("base64"),
          })),
        );
      });
      return send(res, 200, { plates });
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof BusyError) return send(res, 429, { error: "busy" });
      if (e instanceof TimeoutError) return send(res, 504, { error: "timeout" });
      if (e instanceof TooLargeError) return send(res, 413, { error: "too_large" });
      if (e instanceof Error && /^gs exited|^TIFF|^not a TIFF|^unsupported TIFF/.test(e.message)) {
        return send(res, 422, { error: "gs_failed" });
      }
      console.error(e);
      return send(res, 500, { error: "internal" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080);
  createPrintServer({ run: realRun, version: realVersion, icc: process.env.PRINT_ICC_PROFILE || undefined }).listen(
    port,
    "0.0.0.0",
    () => console.log(`print service listening on :${port}`),
  );
}
