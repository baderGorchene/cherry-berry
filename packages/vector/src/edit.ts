import type { CherryNode } from "@cherry/doc";
import { parsePath, pathBounds, toAnchor, toItem, toPathData, type Anchor, type PathModel, type Pt } from "./model";
import { scope } from "./paper";

export type AnchorRef = { sub: number; i: number };
export type PathNode = Extract<CherryNode, { kind: "path" }>;

const ZERO: Pt = { x: 0, y: 0 };
const len = (p: Pt) => Math.hypot(p.x, p.y);
const scaled = (p: Pt, k: number): Pt => ({ x: p.x * k, y: p.y * k });
/** `p` resized to length `l` (zero stays zero). */
const withLength = (p: Pt, l: number): Pt => (len(p) ? scaled(p, l / len(p)) : ZERO);

/** Copies the model and applies `f` to each referenced anchor. */
function mapAnchors(m: PathModel, refs: AnchorRef[], f: (a: Anchor, sub: number, i: number) => Anchor): PathModel {
  const hit = new Set(refs.map((r) => `${r.sub}:${r.i}`));
  return m.map((sp, s) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((a, i) => (hit.has(`${s}:${i}`) ? f(a, s, i) : { ...a })),
  }));
}

const copy = (m: PathModel) => mapAnchors(m, [], (a) => a);

export const moveAnchors = (m: PathModel, refs: AnchorRef[], dx: number, dy: number): PathModel =>
  mapAnchors(m, refs, (a) => ({ ...a, x: a.x + dx, y: a.y + dy }));

/** `to` is relative to the anchor. The opposite handle follows the anchor's kind; `breakSymmetry` makes it a corner first. */
export function moveHandle(m: PathModel, ref: AnchorRef, which: "in" | "out", to: Pt, breakSymmetry: boolean): PathModel {
  return mapAnchors(m, [ref], (a) => {
    const kind = breakSymmetry ? "corner" : a.kind;
    const other = which === "in" ? "out" : "in";
    const opposite =
      kind === "symmetric" ? scaled(to, -1)
      : kind === "smooth" ? withLength(scaled(to, -1), len(a[other]))
      : a[other];
    return { ...a, kind, [which]: { ...to }, [other]: { ...opposite } };
  });
}

export function setAnchorKind(m: PathModel, ref: AnchorRef, kind: Anchor["kind"]): PathModel {
  const sp = m[ref.sub]!;
  return mapAnchors(m, [ref], (a) => {
    if (kind === "corner") return { ...a, kind, in: ZERO, out: ZERO };
    if (a.kind !== "corner" && len(a.in) && len(a.out)) {
      if (kind === "smooth") return { ...a, kind };
      const l = (len(a.in) + len(a.out)) / 2;
      return { ...a, kind, in: withLength(a.in, l), out: withLength(a.out, l) };
    }
    // From a corner: tangent perpendicular to the angle bisector, each handle a third of the way to its neighbour.
    const n = sp.anchors.length, i = ref.i;
    const prev = i > 0 || sp.closed ? sp.anchors[(i - 1 + n) % n] : undefined;
    const next = i < n - 1 || sp.closed ? sp.anchors[(i + 1) % n] : undefined;
    const toPrev = prev && prev !== a ? { x: prev.x - a.x, y: prev.y - a.y } : ZERO;
    const toNext = next && next !== a ? { x: next.x - a.x, y: next.y - a.y } : ZERO;
    const u = withLength(toPrev, 1), v = withLength(toNext, 1);
    let t = withLength({ x: v.x - u.x, y: v.y - u.y }, 1);
    if (!len(t)) t = { x: -v.y, y: v.x }; // neighbours in the same direction: any perpendicular
    let lin = len(toPrev) / 3, lout = len(toNext) / 3;
    if (kind === "symmetric") lin = lout = (lin + lout) / 2;
    return { ...a, kind, in: scaled(t, -lin), out: scaled(t, lout) };
  });
}

/** Splits curve `segment` of subpath `sub` at time `t` without changing its shape. */
export function insertAnchor(m: PathModel, sub: number, segment: number, t: number): { model: PathModel; ref: AnchorRef } {
  const sp = m[sub]!, n = sp.anchors.length;
  const path = toItem([sp]).children[0] as paper.Path;
  if (!path.curves[segment]?.divideAtTime(t)) {
    // t at (or beyond) an end: that end's anchor already exists.
    return { model: copy(m), ref: { sub, i: t < 0.5 ? segment : (segment + 1) % n } };
  }
  // Read the segments directly (no collapse) and keep the user's kinds on the existing anchors,
  // except that the split shortens the neighbours' facing handles: a symmetric neighbour becomes smooth.
  const anchors = path.segments.map((s, j) => {
    const a = toAnchor(s);
    if (j === segment + 1) return a;
    const kind = sp.anchors[j <= segment ? j : j - 1]!.kind;
    const unequal = Math.abs(len(a.in) - len(a.out)) > 1e-6;
    return { ...a, kind: kind === "symmetric" && unequal ? "smooth" : kind };
  });
  const model = copy(m);
  model[sub]!.anchors = anchors;
  return { model, ref: { sub, i: segment + 1 } };
}

/** Drops subpaths left with fewer than 2 anchors. */
export function removeAnchors(m: PathModel, refs: AnchorRef[]): PathModel {
  const gone = new Set(refs.map((r) => `${r.sub}:${r.i}`));
  return m
    .map((sp, s) => ({ closed: sp.closed, anchors: sp.anchors.filter((_, i) => !gone.has(`${s}:${i}`)).map((a) => ({ ...a })) }))
    .filter((sp) => sp.anchors.length >= 2);
}

export function setClosed(m: PathModel, sub: number, closed: boolean): PathModel {
  const model = copy(m);
  model[sub]!.closed = closed;
  return model;
}

/** Nearest curve location within `tolerance`, or `null`. */
export function hitSegment(m: PathModel, p: Pt, tolerance: number): { sub: number; segment: number; t: number } | null {
  const point = new (scope().Point)(p.x, p.y);
  let best: { sub: number; segment: number; t: number } | null = null;
  let bestDist = tolerance;
  (toItem(m).children as paper.Path[]).forEach((path, sub) => {
    const loc = path.getNearestLocation(point);
    if (!loc) return;
    const dist = loc.point.getDistance(point);
    if (dist <= bestDist) {
      bestDist = dist;
      best = { sub, segment: loc.curve.index, t: loc.time };
    }
  });
  return best;
}

/**
 * Re-bases `m` so its bounds start at 0,0 and picks `x,y` so every point keeps its page position
 * under the node's unchanged rotation (degrees clockwise about the box centre, y-down).
 */
export function normalizeEdit(node: PathNode, m: PathModel): { d: string; x: number; y: number; width: number; height: number } {
  const { x: bx, y: by } = pathBounds(m);
  const all = m.flatMap((sp, sub) => sp.anchors.map((_, i) => ({ sub, i })));
  const d = toPathData(moveAnchors(m, all, -bx, -by));
  // width/height are measured on the serialized (4-decimal) d, so they equal its bounds exactly.
  // Its min is 0 exactly when the extremes sit on anchors; a curve's interior extreme is off the
  // 1e-4 grid, so there it can be off 0 by < 5e-5 (no shift of a rounded d can remove that).
  const { width: bw, height: bh } = pathBounds(parsePath(d));
  const r = (node.rotation * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const vx = bx + bw / 2 - node.width / 2, vy = by + bh / 2 - node.height / 2; // l1 − l0
  const cx = node.x + node.width / 2 + vx * cos - vy * sin;
  const cy = node.y + node.height / 2 + vx * sin + vy * cos;
  return { d, x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh };
}
