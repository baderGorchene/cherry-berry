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
  const height = node.kind === "text" ? node.height : Math.abs(node.height * t.scaleY);
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
