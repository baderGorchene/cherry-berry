import { toPx, type CherryNode, type Page } from "@cherry/doc";
import { scalePath } from "@cherry/vector";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Konva rotates around (x, y) minus offset, so put the origin at the box center. */
export function toKonvaAttrs(node: CherryNode) {
  const w = node.width / 2, h = node.height / 2;
  return { x: node.x + w, y: node.y + h, offsetX: w, offsetY: h, rotation: node.rotation };
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
