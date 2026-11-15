import { zipSync } from "fflate";
import { createRequire } from "node:module";
import PptxGenJS from "pptxgenjs";
import { Canvas } from "skia-canvas";
import { toPx, type Paint, type Page } from "@cherry/doc";
import type { FontMap } from "./fonts";
import { drawPage, nodePng, pagePx, type Images } from "./render";

export type Out = { bytes: Uint8Array; mime: string; ext: string };

/** CPU only, so a GPU host and a CPU host produce the same file. */
const canvas = (w: number, h: number) => new Canvas(w, h, { gpu: false });
// gifenc's ESM and CJS builds export differently (vitest picks one, Node the other); always load the CJS one.
const gifenc: typeof import("gifenc").default = createRequire(import.meta.url)("gifenc");
const MM_PT = 72 / 25.4;
const PX_PT = 0.75;

/** Pixel size of a raster page at `scale` (the trim, no bleed). */
export function rasterSize(page: Page, scale: number): { width: number; height: number } {
  const { width, height } = pagePx(page);
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}
export const RASTER_SIDE = 8192;
export const RASTER_AREA = 40_000_000;
export const rasterOk = ({ width, height }: { width: number; height: number }) =>
  width <= RASTER_SIDE && height <= RASTER_SIDE && width * height <= RASTER_AREA;

const zip = (files: [string, Uint8Array][]): Out =>
  ({ bytes: zipSync(Object.fromEntries(files)), mime: "application/zip", ext: "zip" });

export async function writePdf(pages: Page[], images: Images, print: boolean, cropMarks: boolean, fonts: FontMap = new Map()): Promise<Out> {
  let c: Canvas | undefined;
  for (const page of pages) {
    const { width, height, bleed } = pagePx(page);
    const marks = print && cropMarks ? 8 * MM_PT : 0;
    const off = print ? bleed * PX_PT + marks : 0; // trim origin, in pt
    const w = width * PX_PT + 2 * off, h = height * PX_PT + 2 * off;
    const ctx = c ? c.newPage(w, h) : (c = canvas(w, h)).getContext("2d");
    ctx.save();
    ctx.translate(off, off);
    ctx.scale(PX_PT, PX_PT);
    drawPage(ctx, page, images, { fonts });
    ctx.restore();
    if (marks) {
      // 0.25 pt lines along each trim edge, from bleed + 2 mm to bleed + 8 mm outside the trim.
      const b = bleed * PX_PT, near = b + 2 * MM_PT, far = b + 8 * MM_PT;
      const tw = width * PX_PT, th = height * PX_PT;
      ctx.save();
      ctx.translate(off, off);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 0.25;
      ctx.beginPath();
      for (const x of [0, tw]) for (const [from, to] of [[-near, -far], [th + near, th + far]] as const) { ctx.moveTo(x, from); ctx.lineTo(x, to); }
      for (const y of [0, th]) for (const [from, to] of [[-near, -far], [tw + near, tw + far]] as const) { ctx.moveTo(from, y); ctx.lineTo(to, y); }
      ctx.stroke();
      ctx.restore();
    }
  }
  return { bytes: await c!.toBuffer("pdf"), mime: "application/pdf", ext: "pdf" };
}

function rasterPage(page: Page, images: Images, scale: number, background: boolean, fonts: FontMap): Canvas {
  const size = rasterSize(page, scale);
  const c = canvas(size.width, size.height);
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  drawPage(ctx, page, images, { background, fonts });
  return c;
}

export async function writeRaster(
  pages: Page[], images: Images, kind: "png" | "jpg", scale: number, transparent: boolean, base: string, fonts: FontMap = new Map(),
): Promise<Out> {
  const files: [string, Uint8Array][] = [];
  for (const [i, page] of pages.entries()) {
    const c = rasterPage(page, images, scale, kind === "jpg" || !transparent, fonts);
    const bytes = kind === "png" ? await c.toBuffer("png") : await c.toBuffer("jpg", { quality: 0.9, matte: "#FFFFFF" });
    files.push([`${base}-${i + 1}.${kind}`, bytes]);
  }
  if (files.length > 1) return zip(files);
  return { bytes: files[0]![1], mime: kind === "png" ? "image/png" : "image/jpeg", ext: kind };
}

export async function writeSvg(pages: Page[], images: Images, base: string, fonts: FontMap = new Map()): Promise<Out> {
  const files: [string, Uint8Array][] = [];
  for (const [i, page] of pages.entries()) {
    const c = rasterPage(page, images, 1, true, fonts);
    files.push([`${base}-${i + 1}.svg`, await c.toBuffer("svg", { outline: true })]);
  }
  if (files.length > 1) return zip(files);
  return { bytes: files[0]![1], mime: "image/svg+xml", ext: "svg" };
}

/** One frame per page at the first page's size; other pages are scaled to fit and centred on white. Loops forever. */
export async function writeGif(pages: Page[], images: Images, scale: number, secondsPerPage: number, fonts: FontMap = new Map()): Promise<Out> {
  const { GIFEncoder, quantize, applyPalette } = gifenc;
  const { width: W, height: H } = rasterSize(pages[0]!, scale);
  const gif = GIFEncoder();
  for (const page of pages) {
    const c = canvas(W, H), ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    const { width, height } = pagePx(page);
    const k = Math.min(W / width, H / height);
    ctx.translate((W - width * k) / 2, (H - height * k) / 2);
    ctx.scale(k, k);
    drawPage(ctx, page, images, { fonts });
    const data = ctx.getImageData(0, 0, W, H).data as Uint8ClampedArray; // default srgb 8-bit
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: secondsPerPage * 1000, repeat: 0 });
  }
  gif.finish();
  return { bytes: gif.bytes(), mime: "image/gif", ext: "gif" };
}

const hex = (p: Paint) => p.color.slice(1).toUpperCase();
const clear = (alpha: number) => Math.round((1 - alpha) * 100);

/**
 * Text, rects and ellipses stay native (editable); images, paths and groups become a PNG of the node at 2×.
 * Slide size = the first page; other pages are scaled to fit and centred. notes[i] = speaker notes for slide i.
 */
export async function writePptx(pages: Page[], images: Images, notes: string[], fonts: FontMap = new Map()): Promise<Out> {
  const pptx = new PptxGenJS();
  const inch = (v: number, p: Page) => toPx(v, p.unit) / 96;
  const first = pages[0]!;
  const W = inch(first.width, first), H = inch(first.height, first);
  pptx.defineLayout({ name: "cherry", width: W, height: H });
  pptx.layout = "cherry";
  for (const [i, page] of pages.entries()) {
    const slide = pptx.addSlide();
    const k = Math.min(W / inch(page.width, page), H / inch(page.height, page));
    const ox = (W - inch(page.width, page) * k) / 2, oy = (H - inch(page.height, page) * k) / 2;
    const at = (v: number) => inch(v, page) * k;
    const pt = (v: number) => toPx(v, page.unit) * PX_PT * k;
    slide.background = { color: hex(page.background), transparency: clear(page.background.opacity) };
    for (const n of page.nodes) {
      if (n.hidden) continue;
      const box = { x: ox + at(n.x), y: oy + at(n.y), w: at(n.width), h: at(n.height), rotate: n.rotation };
      const fill = (p?: Paint) => p && { color: hex(p), transparency: clear(p.opacity * n.opacity) };
      if (n.kind === "rect" || n.kind === "ellipse") {
        slide.addShape(n.kind === "ellipse" ? pptx.ShapeType.ellipse : n.cornerRadius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          ...box, fill: fill(n.fill),
          line: n.stroke?.width ? { ...fill(n.stroke.paint), width: pt(n.stroke.width) } : undefined,
          ...(n.kind === "rect" && n.cornerRadius ? { rectRadius: at(n.cornerRadius) } : {}),
        });
      } else if (n.kind === "text") {
        const f = fill(n.fill) ?? { color: "000000", transparency: clear(n.opacity) };
        slide.addText(n.text, {
          ...box, ...f, fontFace: n.fontFamily, fontSize: n.fontSize * k, bold: n.fontWeight >= 600,
          align: n.align, valign: "top", margin: 0, fit: "none", lineSpacingMultiple: n.lineHeight,
          ...(n.letterSpacing ? { charSpacing: pt(n.letterSpacing) } : {}),
        });
      } else {
        // ponytail: images are re-encoded as a PNG of the box at 2× rather than embedding the original file.
        const px = toPx(n.width, page.unit), py = toPx(n.height, page.unit);
        const s = Math.min(2, RASTER_SIDE / Math.max(px, py, 1), Math.sqrt(RASTER_AREA / Math.max(px * py, 1)));
        const png = await nodePng(n, page, images, s, fonts);
        slide.addImage({ ...box, data: `image/png;base64,${png.toString("base64")}`, transparency: clear(n.opacity) });
      }
    }
    if (notes[i]) slide.addNotes(notes[i]!);
  }
  const bytes = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array;
  return { bytes, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" };
}
