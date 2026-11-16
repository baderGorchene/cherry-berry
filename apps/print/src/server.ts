import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Transform, type Writable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AbortedError, DEFAULT_ICC, GsError, pdfxArgs, platesArgs, plateFiles, TimeoutError } from "./gs.ts";
import { BusyError, createQueue } from "./queue.ts";
import { TiffError, tiffGrayToPng } from "./tiff.ts";

export { TimeoutError };

/** Runs gs with `args`. Rejects TimeoutError after `timeoutMs`, AbortedError when `signal` fires (gs is killed), GsError on a non-zero exit. */
export type Run = (args: string[], timeoutMs: number, signal?: AbortSignal) => Promise<void>;

const MAX_BODY = 200 * 1024 * 1024;
const JOB_TIMEOUT_MS = 120_000;
const PDFX_DEF = join(dirname(fileURLToPath(import.meta.url)), "..", "PDFX_def.ps");

export const realRun: Run = (args, timeoutMs, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const child = spawn("gs", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let why: "timeout" | "abort" | undefined;
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    const kill = (w: "timeout" | "abort") => {
      why = w;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => kill("timeout"), timeoutMs);
    const onAbort = () => kill("abort");
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    child.on("error", (e) => {
      done();
      reject(e);
    });
    child.on("close", (code) => {
      done();
      if (why === "timeout") reject(new TimeoutError());
      else if (why === "abort") reject(new AbortedError());
      else if (code === 0) resolve();
      else reject(new GsError(`gs exited ${code}: ${stderr}`));
    });
  });

const realVersion = () =>
  new Promise<string>((resolve, reject) =>
    execFile("gs", ["--version"], (e, out) => (e ? reject(e) : resolve(out.trim()))),
  );

class TooLargeError extends Error {}

/** Streams the request body to the writable for `file`, enforcing the size limit and a PDF header in the first 1 KB. */
async function receivePdf(req: IncomingMessage, ws: Writable, max: number): Promise<void> {
  let size = 0;
  let head = Buffer.alloc(0);
  let checked = false;
  const check = () => {
    checked = true;
    if (head.indexOf("%PDF-") === -1) throw new GsError("not a PDF");
  };
  const guard = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        size += chunk.length;
        if (size > max) throw new TooLargeError();
        if (!checked) {
          head = Buffer.concat([head, chunk.subarray(0, 1024 - head.length)]);
          if (head.length >= 1024) check();
        }
        cb(null, chunk);
      } catch (e) {
        cb(e as Error);
      }
    },
    flush(cb) {
      try {
        if (!checked) check();
        cb();
      } catch (e) {
        cb(e as Error);
      }
    },
  });
  await pipeline(req, guard, ws); // write-stream errors (ENOSPC, EIO) reject here instead of crashing the process
}

function send(res: ServerResponse, status: number, body: object | Buffer, type = "application/json") {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": type, "content-length": buf.length });
  res.end(buf);
}

export function createPrintServer(opts: {
  run: Run;
  version: () => Promise<string>;
  /** Output ICC profile path inside the container; defaults to Ghostscript's bundled CMYK profile. */
  icc?: string;
  pdfxDef?: string;
  maxWaiting?: number;
  timeoutMs?: number;
  maxBody?: number;
  /** Test seam: where the upload is written. */
  openFile?: (file: string) => Writable;
  /** Aborting this kills running gs jobs (graceful shutdown). */
  shutdown?: AbortSignal;
}): Server {
  const maxWaiting = opts.maxWaiting ?? 4;
  const queue = createQueue(maxWaiting);
  const timeoutMs = opts.timeoutMs ?? JOB_TIMEOUT_MS;
  const maxBody = opts.maxBody ?? MAX_BODY;
  const icc = opts.icc || DEFAULT_ICC;
  const pdfxDef = opts.pdfxDef ?? PDFX_DEF;
  let pending = 0; // requests holding a slot: uploading, queued or running
  let gsVersion: string | undefined;

  return createServer(async (req, res) => {
    const ac = new AbortController();
    const onShutdown = () => ac.abort();
    opts.shutdown?.addEventListener("abort", onShutdown, { once: true });
    res.on("close", () => opts.shutdown?.removeEventListener("abort", onShutdown));
    res.on("close", () => {
      if (!res.writableFinished) ac.abort();
    });
    let dir: string | undefined;
    let counted = false;
    const cleanup = async () => {
      const d = dir;
      dir = undefined;
      if (d) await rm(d, { recursive: true, force: true });
    };
    // temp files are removed before the response goes out
    const reply = async (...a: Parameters<typeof send> extends [unknown, ...infer R] ? R : never) => {
      await cleanup();
      send(res, ...a);
    };
    try {
      const url = new URL(req.url ?? "/", "http://print");
      if (req.method === "GET" && url.pathname === "/health") {
        gsVersion ??= await opts.version();
        return send(res, 200, { status: "ok", gs: gsVersion });
      }
      if (req.method !== "POST" || (url.pathname !== "/pdfx" && url.pathname !== "/plates")) {
        return reply(404, { error: "not_found" });
      }
      if (Number(req.headers["content-length"] ?? 0) > maxBody) throw new TooLargeError();
      if (pending > maxWaiting) throw new BusyError(); // 1 running + maxWaiting waiting, counted before reading the body
      pending++;
      counted = true;

      dir = await mkdtemp(join(tmpdir(), "cherry-print-"));
      const input = join(dir, "in.pdf");
      await receivePdf(req, (opts.openFile ?? createWriteStream)(input), maxBody);
      const jobDir = dir;
      const run = async (args: string[]) => {
        if (ac.signal.aborted) throw new AbortedError(); // client left while queued: never start gs
        await opts.run(args, timeoutMs, ac.signal);
      };

      if (url.pathname === "/pdfx") {
        const output = join(jobDir, "out.pdf");
        const out = await queue(async () => {
          await run(pdfxArgs(input, output, icc, pdfxDef));
          const s = await stat(output).catch(() => undefined);
          if (!s || s.size === 0) throw new GsError("gs produced no output");
          return readFile(output);
        });
        return reply(200, out, "application/pdf");
      }

      const dpi = Number(url.searchParams.get("dpi") || 150);
      const outDir = join(jobDir, "plates");
      const plates = await queue(async () => {
        await mkdir(outDir);
        await run(platesArgs(input, outDir, dpi));
        const found = plateFiles(await readdir(outDir));
        if (!found.length) throw new GsError("gs produced no plates");
        const done: { page: number; name: string; png: string }[] = [];
        for (const p of found) {
          // one at a time, to bound memory
          done.push({ page: p.page, name: p.name, png: tiffGrayToPng(await readFile(join(outDir, p.file))).toString("base64") });
        }
        return done;
      });
      return reply(200, { plates });
    } catch (e) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) return res.destroy();
      if (e instanceof AbortedError) return res.destroy();
      if (e instanceof BusyError) return reply(429, { error: "busy" });
      if (e instanceof TimeoutError) return reply(504, { error: "timeout" });
      if (e instanceof TooLargeError) {
        res.setHeader("connection", "close");
        return reply(413, { error: "too_large" });
      }
      if (e instanceof GsError || e instanceof TiffError) return reply(422, { error: "gs_failed" });
      console.error(e);
      return reply(500, { error: "internal" });
    } finally {
      if (counted) pending--;
      await cleanup();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080);
  const shutdown = new AbortController();
  const server = createPrintServer({ shutdown: shutdown.signal, run: realRun, version: realVersion, icc: process.env.PRINT_ICC_PROFILE || undefined });
  server.listen(port, "0.0.0.0", () => console.log(`print service listening on :${port}`));
  process.on("SIGTERM", () => {
    shutdown.abort(); // kills any running gs
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
