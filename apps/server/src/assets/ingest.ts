import { createHash } from "node:crypto";
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
function isSvg(bytes: Uint8Array): boolean {
  const s = new TextDecoder("utf-8").decode(bytes.subarray(0, 65536)); // the decoder drops a BOM
  let i = 0;
  for (;;) {
    while (i < s.length && /\s/.test(s.charAt(i))) i++;
    let end: number, len: number; // index of the closing token and its length
    if (s.startsWith("<?", i)) [end, len] = [s.indexOf("?>", i + 2), 2];
    else if (s.startsWith("<!--", i)) [end, len] = [s.indexOf("-->", i + 4), 3];
    else if (s.slice(i, i + 9).toLowerCase() === "<!doctype") {
      const sub = s.indexOf("[", i), gt = s.indexOf(">", i);
      [end, len] = [sub !== -1 && sub < gt ? s.indexOf(">", s.indexOf("]", sub)) : gt, 1];
    } else return /^<svg[\s>/]/i.test(s.slice(i, i + 5));
    if (end < 0) return false; // unterminated
    const close = end + len;
    i = close;
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
    // Backstop for the raster pipeline only; it does not interrupt librsvg (svg.ts caps text and <use>).
    const out = await sharp(input, opts).autoOrient().timeout({ seconds: 3 })
      .resize(THUMB, THUMB, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
    return new Uint8Array(out);
  } catch (e) { throw sharpError(e); }
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
    return { kind: "svg", format: "svg", contentType: "image/svg+xml", width, height, sha256, file, thumb: await thumbnail(file) };
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
