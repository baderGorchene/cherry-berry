import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { IngestError } from "./errors";
import { prescan } from "./svg";

export { IngestError };

export type Ingested = {
  kind: "image" | "gif" | "svg";
  format: "png" | "jpeg" | "webp" | "gif" | "svg";
  contentType: string;
  width: number;
  height: number;
  sha256: string;
  file: Uint8Array;
  thumb: Uint8Array;
};

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 100_000_000;
const THUMB = 480;
const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;
const MAGIC = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x47, 0x49, 0x46, 0x38]]; // png, jpeg, gif
const looksRaster = (b: Uint8Array) =>
  MAGIC.some((m) => m.every((v, i) => b[i] === v)) ||
  (b.length > 12 && String.fromCharCode(...Array.from(b.subarray(0, 4)), ...Array.from(b.subarray(8, 12))) === "RIFFWEBP");

// Linear scan: skip whitespace, <?...?>, <!DOCTYPE ...> and <!--...-->, then expect <svg.
// Every skip must find its terminator and move forward, otherwise the prolog is not SVG.
function isSvg(bytes: Uint8Array): boolean {
  const s = new TextDecoder("utf-8").decode(bytes.subarray(0, 65536)); // the decoder drops a BOM
  let i = 0;
  for (;;) {
    while (i < s.length && /\s/.test(s.charAt(i))) i++;
    let next: number;
    if (s.startsWith("<?", i)) { const e = s.indexOf("?>", i + 2); next = e < 0 ? -1 : e + 2; }
    else if (s.startsWith("<!--", i)) { const e = s.indexOf("-->", i + 4); next = e < 0 ? -1 : e + 3; }
    else if (s.slice(i, i + 9).toLowerCase() === "<!doctype") {
      const sub = s.indexOf("[", i), gt = s.indexOf(">", i);
      let e = gt;
      if (sub !== -1 && (gt === -1 || sub < gt)) { const rb = s.indexOf("]", sub); e = rb < 0 ? -1 : s.indexOf(">", rb); }
      next = e < 0 ? -1 : e + 1;
    } else return /^<svg[\s>/]/i.test(s.slice(i, i + 5));
    if (next <= i) return false; // unterminated
    i = next;
  }
}

type Meta = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
const opts = { limitInputPixels: MAX_PIXELS, failOn: "error" } as const;

function sharpError(e: unknown): IngestError {
  const m = e instanceof Error ? e.message : "";
  return new IngestError(/pixel limit/i.test(m) ? "too_large" : "invalid_image", m);
}

async function thumbnail(input: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(input, opts).autoOrient()
      .resize(THUMB, THUMB, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
    return new Uint8Array(out);
  } catch (e) { throw sharpError(e); }
}

// Parsing, sanitizing and rendering an SVG can each run for minutes on a small hostile file and
// cannot be interrupted in-process, so they happen in a child process that is killed after RENDER_MS.
const RENDER_MS = 5000;
const RENDER_SCRIPT = fileURLToPath(new URL("./render.mjs", import.meta.url));
const MAX_RENDERS = 2;
export const renderStats = { active: 0, max: 0 }; // max is for tests
const waiting: (() => void)[] = [];
type SvgResult = { file: Uint8Array; width: number; height: number; thumb: Uint8Array };
async function processSvg(svg: Uint8Array): Promise<SvgResult> {
  // Wait for a slot; a render's 5 s clock starts only when it hands its own child the work.
  if (renderStats.active >= MAX_RENDERS) await new Promise<void>((go) => waiting.push(go));
  else renderStats.active++;
  renderStats.max = Math.max(renderStats.max, renderStats.active);
  try { return await runChild(svg); }
  finally {
    const next = waiting.shift();
    if (next) next(); // hand the slot over without releasing it
    else renderStats.active--;
  }
}

// One child is kept started and idle, so the next SVG usually does not wait for it to load jsdom (~1.5 s);
// either way that load is not billed to the job, whose clock starts on the child's ready signal.
// ponytail: one spare, replaced when taken; SVGs arriving back to back (or two at once) can still meet a
// child that is mid-start (~1.5 s). A pool of reusable children would fix that if upload latency matters.
type Child = { proc: ChildProcessWithoutNullStreams; ready: Promise<void>; done: Promise<{ out: Buffer; err: string }> };
// Limits and the idle spare, exported so tests can force a cold child or shorten the clocks.
export const svgChild: { jobMs: number; readyMs: number; spare?: Child } = { jobMs: RENDER_MS, readyMs: 10_000 };
const READY = "\u0006ready\n"; // render.mjs writes this on stderr once jsdom is loaded
function startChild(): Child {
  const proc = spawn(process.execPath, [RENDER_SCRIPT, String(THUMB), String(MAX_PIXELS)], { stdio: ["pipe", "pipe", "pipe"] });
  const out: Buffer[] = [];
  let err = "";
  let isReady = false, onReady = () => {};
  const ready = new Promise<void>((go) => { onReady = go; });
  proc.stdout.on("data", (c: Buffer) => out.push(c));
  proc.stderr.on("data", (c: Buffer) => {
    // Uncapped until ready (only a few bytes then), so the marker is always seen.
    if (!isReady || err.length < 1000) err += c;
    if (!isReady && err.includes(READY)) { isReady = true; err = err.replace(READY, ""); onReady(); }
  });
  proc.stdin.on("error", () => {}); // the child may die before reading
  const done = new Promise<{ out: Buffer; err: string }>((resolve) => {
    proc.on("error", (e) => resolve({ out: Buffer.alloc(0), err: e.message }));
    proc.on("close", () => resolve({ out: Buffer.concat(out), err }));
  });
  // An idle spare must not keep the process alive.
  proc.unref();
  for (const s of [proc.stdin, proc.stdout, proc.stderr]) (s as unknown as { unref(): void }).unref();
  return { proc, ready, done };
}
function takeChild(): Child {
  const { spare } = svgChild;
  const c = spare && spare.proc.exitCode === null && !spare.proc.killed ? spare : startChild();
  svgChild.spare = startChild();
  return claim(c);
}
function claim(c: Child): Child {
  c.proc.ref();
  for (const s of [c.proc.stdin, c.proc.stdout, c.proc.stderr]) (s as unknown as { ref(): void }).ref();
  return c;
}

async function runChild(svg: Uint8Array): Promise<SvgResult> {
  const first = await runOnce(takeChild(), svg);
  // A spare can die unnoticed (exitCode stays null until 'close'): its reply is empty. Retry once on a
  // fresh child. A timeout never gets here, so a hostile job is not run twice to its limit.
  if (first.out.length > 0) return parseReply(first);
  return parseReply(await runOnce(claim(startChild()), svg));
}

// Two clocks: up to readyMs for the child to load its imports, then jobMs for the job itself.
async function runOnce({ proc, ready, done }: Child, svg: Uint8Array) {
  let timedOut: IngestError | undefined, finished = false;
  const kill = (e: IngestError) => { timedOut = e; proc.kill("SIGKILL"); };
  proc.stdin.end(svg); // the child reads stdin only after it is ready
  // Not ready in time is our failure, not the file's size, so it maps to invalid_image.
  let timer = setTimeout(() => kill(new IngestError("invalid_image", "svg worker did not start")), svgChild.readyMs);
  void ready.then(() => {
    clearTimeout(timer);
    if (!timedOut && !finished) timer = setTimeout(() => kill(new IngestError("too_large", "svg processing timed out")), svgChild.jobMs);
  });
  const reply = await done;
  finished = true;
  clearTimeout(timer);
  if (timedOut) throw timedOut;
  return reply;
}

function parseReply({ out, err }: { out: Buffer; err: string }): SvgResult {
  // Frame: 4-byte header length, JSON header, sanitized svg (head.svg bytes), webp thumbnail.
  try {
    const n = out.readUInt32BE(0);
    const head: { error?: IngestError["code"]; message?: string; width: number; height: number; svg: number } = JSON.parse(out.subarray(4, 4 + n).toString("utf8"));
    if (head.error) throw new IngestError(head.error, head.message);
    const file = new Uint8Array(out.subarray(4 + n, 4 + n + head.svg));
    const thumb = new Uint8Array(out.subarray(4 + n + head.svg));
    if (file.length > MAX_SVG_BYTES) throw new IngestError("too_large", "sanitized svg too large");
    if (!(head.width > 0 && head.height > 0) || thumb.length === 0) throw new IngestError("invalid_image");
    if (head.width * head.height > MAX_PIXELS) throw new IngestError("too_large");
    return { file, width: head.width, height: head.height, thumb };
  } catch (e) {
    throw e instanceof IngestError ? e : new IngestError("invalid_image", err || String(e));
  }
}

export async function ingest(bytes: Uint8Array): Promise<Ingested> {
  if (bytes.length === 0) throw new IngestError("unsupported_type");
  if (bytes.length > MAX_BYTES) throw new IngestError("too_large");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (isSvg(bytes)) {
    if (bytes.length > MAX_SVG_BYTES) throw new IngestError("too_large", "svg over 2 MB");
    prescan(new TextDecoder().decode(bytes));
    const { file, width, height, thumb } = await processSvg(bytes);
    return { kind: "svg", format: "svg", contentType: "image/svg+xml", width, height, sha256, file, thumb };
  }

  if (!looksRaster(bytes)) throw new IngestError("unsupported_type");
  let meta: Meta;
  try { meta = await sharp(bytes, opts).metadata(); }
  catch (e) {
    throw /unsupported image format/i.test(String((e as Error).message)) ? new IngestError("unsupported_type") : sharpError(e);
  }
  const format = meta.format as string;
  if (format !== "png" && format !== "jpeg" && format !== "webp" && format !== "gif") throw new IngestError("unsupported_type");
  const { width, height } = meta.autoOrient ?? { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!(width > 0 && height > 0)) throw new IngestError("invalid_image");
  if (width * height > MAX_PIXELS) throw new IngestError("too_large");
  // A full decode proves the file is more than a plausible header.
  const thumb = await thumbnail(bytes);
  return {
    kind: format === "gif" && (meta.pages ?? 1) > 1 ? "gif" : "image",
    format, contentType: TYPES[format], width, height, sha256, file: bytes, thumb,
  };
}
