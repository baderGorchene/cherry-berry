import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { IngestError } from "./errors";
import { sanitizeSvg } from "./svg";

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

// SVG rendering can run for minutes on a small hostile file and cannot be interrupted in-process,
// so it happens in a child process that is killed after RENDER_MS.
const RENDER_MS = 5000;
const RENDER_SCRIPT = fileURLToPath(new URL("./render.mjs", import.meta.url));
const MAX_RENDERS = 2;
export const renderStats = { active: 0, max: 0 }; // max is for tests
const waiting: (() => void)[] = [];
async function renderSvgThumb(svg: Uint8Array): Promise<Uint8Array> {
  // Wait for a slot; a render's 5 s clock starts only when its own child starts.
  if (renderStats.active >= MAX_RENDERS) await new Promise<void>((go) => waiting.push(go));
  else renderStats.active++;
  renderStats.max = Math.max(renderStats.max, renderStats.active);
  try { return await spawnRender(svg); }
  finally {
    const next = waiting.shift();
    if (next) next(); // hand the slot over without releasing it
    else renderStats.active--;
  }
}
function spawnRender(svg: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RENDER_SCRIPT, String(THUMB), String(MAX_PIXELS)], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, RENDER_MS);
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => { if (err.length < 1000) err += c; });
    child.stdin.on("error", () => {}); // the child may die before reading
    child.on("error", (e) => { clearTimeout(timer); reject(new IngestError("invalid_image", e.message)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new IngestError("too_large", "render timed out"));
      else if (code === 0) resolve(new Uint8Array(Buffer.concat(out)));
      else reject(new IngestError(/pixel limit/i.test(err) ? "too_large" : "invalid_image", err));
    });
    child.stdin.end(svg);
  });
}

export async function ingest(bytes: Uint8Array): Promise<Ingested> {
  if (bytes.length === 0) throw new IngestError("unsupported_type");
  if (bytes.length > MAX_BYTES) throw new IngestError("too_large");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (isSvg(bytes)) {
    if (bytes.length > MAX_SVG_BYTES) throw new IngestError("too_large", "svg over 2 MB");
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    const file = new TextEncoder().encode(clean);
    // Size comes from the renderer itself, so it agrees with the thumbnail.
    let sm: Meta;
    try { sm = await sharp(file, opts).metadata(); } catch (e) { throw sharpError(e); }
    const [width, height] = [sm.width ?? 0, sm.height ?? 0];
    if (!(width > 0 && height > 0)) throw new IngestError("invalid_image");
    if (width * height > MAX_PIXELS) throw new IngestError("too_large");
    return { kind: "svg", format: "svg", contentType: "image/svg+xml", width, height, sha256, file, thumb: await renderSvgThumb(file) };
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
