import { createHash } from "node:crypto";
import sharp from "sharp";
import { sanitizeSvg } from "./svg";

export class IngestError extends Error {
  constructor(public code: "unsupported_type" | "invalid_image" | "too_large", message: string = code) {
    super(message);
  }
}

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
const SNIFF = /^(?:\s|<\?xml[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>|<!--[\s\S]*?-->)*<svg[\s>/]/i;

function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 65536)); // the decoder drops a BOM
  return SNIFF.test(head);
}

const opts = { limitInputPixels: MAX_PIXELS, failOn: "error" } as const;

function sharpError(e: unknown): IngestError {
  const m = e instanceof Error ? e.message : "";
  return new IngestError(/pixel limit/i.test(m) ? "too_large" : "invalid_image", m);
}

function svgSize(svg: string): { width: number; height: number } {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const num = (n: string) => {
    const v = root.match(new RegExp(`\\s${n}\\s*=\\s*["']\\s*([0-9.]+)(?:px)?\\s*["']`, "i"));
    return v ? Math.round(Number(v[1])) : 0;
  };
  let [width, height] = [num("width"), num("height")];
  if (!(width > 0 && height > 0)) {
    const vb = root.match(/\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
    [width, height] = vb ? [Math.round(Number(vb[1])), Math.round(Number(vb[2]))] : [0, 0];
  }
  return width > 0 && height > 0 ? { width, height } : { width: 300, height: 150 };
}

async function thumbnail(input: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(input, opts).autoOrient()
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
    const { width, height } = svgSize(clean);
    if (width * height > MAX_PIXELS) throw new IngestError("too_large");
    return { kind: "svg", format: "svg", contentType: "image/svg+xml", width, height, sha256, file, thumb: await thumbnail(file) };
  }

  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
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
