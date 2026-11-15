import "konva/skia-backend";
import Konva from "konva";
import { Canvas, Path2D, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import type { FontMap } from "./fonts";
import { PT_PX, UNIT_PX, toPx, type CherryNode, type Page, type Paint, type Stroke } from "@cherry/doc";

/** Decoded visuals by asset id; null = unavailable → placeholder. */
export type Images = Map<string, Image | null>;
type Ctx = CanvasRenderingContext2D;

export function pagePx(page: Page): { width: number; height: number; bleed: number } {
  return { width: toPx(page.width, page.unit), height: toPx(page.height, page.unit), bleed: toPx(page.bleed, page.unit) };
}

const paint = (p: Paint) => p.opacity < 1
  ? `rgba(${parseInt(p.color.slice(1, 3), 16)},${parseInt(p.color.slice(3, 5), 16)},${parseInt(p.color.slice(5, 7), 16)},${p.opacity})`
  : p.color;

/**
 * Draws the page with (0,0) at the trim's top-left, in CSS px; the caller sets the transform.
 * Background fills trim + bleed unless `background:false`.
 */
export function drawPage(ctx: Ctx, page: Page, images: Images, opts: { background?: boolean; fonts?: FontMap } = {}): void {
  ctx.save();
  ctx.scale(UNIT_PX[page.unit], UNIT_PX[page.unit]);
  if (opts.background !== false) {
    const b = page.bleed;
    ctx.fillStyle = paint(page.background);
    ctx.fillRect(-b, -b, page.width + 2 * b, page.height + 2 * b);
  }
  for (const n of page.nodes) drawNode(ctx, n, page.unit, images, 1, opts.fonts);
  ctx.restore();
}

/**
 * One node alone on a transparent canvas at `scale`, sized to its box (for PPTX).
 * Drawn unrotated and at full node opacity: the caller carries those over to the placed picture.
 */
export async function nodePng(node: CherryNode, page: Page, images: Images, scale: number, fonts?: FontMap): Promise<Buffer> {
  const s = UNIT_PX[page.unit] * scale;
  const canvas = new Canvas(Math.max(1, Math.ceil(node.width * s)), Math.max(1, Math.ceil(node.height * s)), { gpu: false });
  const ctx = canvas.getContext("2d");
  ctx.scale(s, s);
  drawNode(ctx, { ...node, x: 0, y: 0, rotation: 0, opacity: 1, hidden: false }, page.unit, images, 1, fonts);
  return canvas.toBuffer("png");
}

export async function loadImages(ids: string[], read: (id: string) => Promise<Uint8Array | null>): Promise<Images> {
  const unique = [...new Set(ids)];
  const loaded = await Promise.all(unique.map(async (id) => {
    const bytes = await read(id);
    return bytes ? loadImage(Buffer.from(bytes)).catch(() => null) : null;
  }));
  return new Map(unique.map((id, i) => [id, loaded[i]!]));
}

/**
 * The kit family from this design's map, else the name as written, except a name (or any entry of a list) that targets a
 * private kit family: every kit's fonts share one process-wide FontLibrary, so that would draw another design's font.
 */
const family = (name: string, fonts?: FontMap) => fonts?.get(name) ?? (/cb-kit-/i.test(name) ? "sans-serif" : name);

/** Mirrors the editor's NodeView: Konva shapes paint with globalAlpha = opacity multiplied down through groups. */
function drawNode(ctx: Ctx, n: CherryNode, unit: Page["unit"], images: Images, parentAlpha: number, fonts?: FontMap): void {
  if (n.hidden) return;
  const alpha = parentAlpha * n.opacity;
  ctx.save();
  // toKonvaAttrs: rotate around the box centre.
  ctx.translate(n.x + n.width / 2, n.y + n.height / 2);
  ctx.rotate((n.rotation * Math.PI) / 180);
  ctx.translate(-n.width / 2, -n.height / 2);
  ctx.globalAlpha = alpha;
  switch (n.kind) {
    case "rect":
      ctx.beginPath();
      if (n.cornerRadius) Konva.Util.drawRoundedRectPath(ctx as never, n.width, n.height, n.cornerRadius);
      else ctx.rect(0, 0, n.width, n.height);
      ctx.closePath();
      fillStroke(ctx, n.fill, n.stroke);
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(n.width / 2, n.height / 2, n.width / 2, n.height / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      fillStroke(ctx, n.fill, n.stroke);
      break;
    case "path": {
      const path = new Path2D(n.d);
      if (n.fill) { ctx.fillStyle = paint(n.fill); ctx.fill(path, n.fillRule); }
      if (n.stroke?.width) { ctx.lineWidth = n.stroke.width; ctx.strokeStyle = paint(n.stroke.paint); ctx.stroke(path); }
      break;
    }
    case "text": {
      const t = new Konva.Text({
        text: n.text, width: n.width, fontFamily: family(n.fontFamily, fonts), fontSize: (n.fontSize * PT_PX) / UNIT_PX[unit],
        fontStyle: String(n.fontWeight), lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, align: n.align,
      });
      drawText(ctx, t, n.fill ? paint(n.fill) : "black");
      break;
    }
    case "image": {
      const img = images.get(n.assetId);
      if (img) ctx.drawImage(img, 0, 0, n.width, n.height);
      else {
        ctx.fillStyle = "#D9D2DC";
        ctx.fillRect(0, 0, n.width, n.height);
        drawText(ctx, new Konva.Text({
          text: "Image unavailable", width: n.width, height: n.height, align: "center", verticalAlign: "middle",
          fontSize: Math.max(1, Math.min(n.width, n.height) / 6),
        }), "#5D4E66");
      }
      break;
    }
    case "group":
      for (const c of n.children) drawNode(ctx, c, unit, images, alpha, fonts);
      break;
  }
  ctx.restore();
}

// ponytail: Konva composites a fill+stroke shape with node opacity < 1 through a buffer (no double alpha
// where the stroke overlaps the fill); here both paint at that alpha. Add a layer when that band matters.
function fillStroke(ctx: Ctx, fill?: Paint, stroke?: Stroke) {
  if (fill) { ctx.fillStyle = paint(fill); ctx.fill(); }
  if (stroke?.width) { ctx.lineWidth = stroke.width; ctx.strokeStyle = paint(stroke.paint); ctx.stroke(); }
}

/** Konva.Text's own line breaking (`textArr`), drawn the way Konva.Text._sceneFunc positions each line. */
function drawText(ctx: Ctx, t: Konva.Text, fill: string) {
  if (!t.text()) return t.destroy();
  const lineHeight = t.lineHeight() * t.fontSize(), spacing = t.letterSpacing(), width = t.width(), align = t.align();
  const m = t.measureSize("M");
  let y = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + lineHeight / 2;
  ctx.save();
  ctx.font = t._getContextFont();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = fill;
  ctx.translate(0, t._getTextTop());
  for (const line of t.textArr) {
    let x = align === "right" ? width - line.width : align === "center" ? (width - line.width) / 2 : 0;
    if (spacing !== 0) {
      for (const { segment } of graphemes.segment(line.text)) {
        ctx.fillText(segment, x, y);
        x += ctx.measureText(segment).width + spacing;
      }
    } else ctx.fillText(line.text, x, y);
    if (t.textArr.length > 1) y += lineHeight;
  }
  ctx.restore();
  t.destroy();
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
