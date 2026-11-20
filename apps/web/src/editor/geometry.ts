import { toPx, type CherryNode, type Page } from "@cherry/doc";
import { scalePath } from "@cherry/vector";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
export const clampZoom =(z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Konva rotates around (x, y) minus offset, so put the origin at the box center. */
export function toKonvaAttrs(node: CherryNode) {
  const w = node.width / 2, h = node.height / 2;
  return { x: node.x + w, y: node.y + h, offsetX: w, offsetY: h, rotation: node.rotation };
}

/** Scales group children proportionally when the group box is resized. */
export function scaleChildren(children: CherryNode[], sx: number, sy: number): CherryNode[] {
  return children.map((c) => {
    const base = { ...c, x: c.x * sx, y: c.y * sy, width: c.width * sx, height: c.height * sy };
    if (base.kind === "path") return { ...base, d: scalePath(base.d, sx, sy) };
    if (base.kind === "rect") return { ...base, cornerRadius: base.cornerRadius * Math.min(sx, sy) };
    if (base.kind === "text") return { ...base, fontSize: Math.max(1, base.fontSize * sy) };
    if (base.kind === "group") return { ...base, children: scaleChildren(base.children, sx, sy) };
    return base;
  });
}

/** Bake a Konva drag/transform back into page-unit geometry (the caller resets the Konva scale). */
export function fromKonvaTransform(
  node: CherryNode, t: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
): Partial<CherryNode> {
  const width = Math.abs(node.width * t.scaleX);
  const height = Math.abs(node.height * t.scaleY); // text never gets here: Canvas folds it with foldTextScale/textBox
  const out: Record<string, unknown> = {
    x: t.x - width / 2, y: t.y - height / 2, width, height, rotation: ((t.rotation % 360) + 360) % 360,
  };
  if (node.kind === "path" && (t.scaleX !== 1 || t.scaleY !== 1)) out.d = scalePath(node.d, t.scaleX, t.scaleY);
  if (node.kind === "group" && (t.scaleX !== 1 || t.scaleY !== 1)) {
    const sx = node.width ? width / node.width : 1, sy = node.height ? height / node.height : 1;
    out.children = scaleChildren(node.children, sx, sy);
  }
  return out as Partial<CherryNode>;
}

/** A Konva text node's live attrs (page units, rotation in degrees). */
export type TextAttrs = {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number; offsetX: number; offsetY: number; width: number; fontSize: number;
};

/**
 * Folds a text transform's scale into the type instead of stretching it: scaleX re-wraps (width), scaleY resizes
 * (fontSize), and the scale goes back to 1. The scaled box keeps its top-left corner, so the text grows from where
 * the transformer put it. Run on every `transform` frame and the drag shows the reflowed text live.
 */
export function foldTextScale(k: TextAttrs): TextAttrs {
  // A side handle leaves the other scale at 1 ± float noise; that must not nudge the font size.
  const snap = (s: number) => (Math.abs(Math.abs(s) - 1) < 1e-6 ? 1 : Math.abs(s));
  const sx = snap(k.scaleX), sy = snap(k.scaleY), r = (k.rotation * Math.PI) / 180;
  const dy = -k.offsetY * (sy - 1); // offsetY stays, so shift the origin along the rotated y axis to keep the top edge
  return {
    x: k.x - Math.sin(r) * dy, y: k.y + Math.cos(r) * dy, rotation: k.rotation, scaleX: 1, scaleY: 1,
    offsetX: k.offsetX * sx, offsetY: k.offsetY, width: Math.max(1, k.width * sx), fontSize: Math.max(0.1, k.fontSize * sy),
  };
}

/** The document box (unrotated top-left, rotation about the centre) of a folded text whose laid-out height is `height`. */
export function textBox(k: TextAttrs, height: number) {
  const r = (k.rotation * Math.PI) / 180, lx = k.width / 2 - k.offsetX, ly = height / 2 - k.offsetY;
  const cx = k.x + lx * Math.cos(r) - ly * Math.sin(r), cy = k.y + lx * Math.sin(r) + ly * Math.cos(r);
  return { x: cx - k.width / 2, y: cy - height / 2, width: k.width, height, rotation: ((k.rotation % 360) + 360) % 360 };
}

/** Zoom at which the page plus bleed fits the viewport with `padding` px on every side. */
export function fitZoom(
  page: Pick<Page, "width" | "height" | "unit"> & { bleed?: number },
  viewport: { width: number; height: number }, padding = 48,
): number {
  const b = 2 * (page.bleed ?? 0);
  return clampZoom(Math.min(
    (viewport.width - 2 * padding) / toPx(page.width + b, page.unit),
    (viewport.height - 2 * padding) / toPx(page.height + b, page.unit),
  ));
}

/** Every node id on a page, including group children. */
export const allIds = (nodes: CherryNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...(n.kind === "group" ? allIds(n.children) : [])]);
