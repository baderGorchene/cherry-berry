import type { CherryNode } from "@cherry/doc";
import { scope } from "./paper";

export type Pt = { x: number; y: number };
/** Handles are relative to the anchor; `{0,0}` means no handle. */
export type Anchor = { x: number; y: number; in: Pt; out: Pt; kind: "corner" | "smooth" | "symmetric" };
export type SubPath = { anchors: Anchor[]; closed: boolean };
export type PathModel = SubPath[];
export type Box = { x: number; y: number; width: number; height: number };
export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

export class InvalidPath extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPath";
  }
}

const MAX_LENGTH = 100_000;
// Paper silently drops tokens it can't read (e.g. "NaN"), so whitelist SVG path syntax up front.
const PATH_CHARS = /^[\sMmLlHhVvCcSsQqTtAaZz\d.,+\-eE]*$/;
const COLLINEAR = Math.cos((179 * Math.PI) / 180); // handles opposite within 1°

const num = (n: number) => String(Number(n.toFixed(4)));
const isZero = (p: Pt) => p.x === 0 && p.y === 0;

function anchorKind(i: Pt, o: Pt): Anchor["kind"] {
  if (isZero(i) || isZero(o)) return "corner";
  const li = Math.hypot(i.x, i.y), lo = Math.hypot(o.x, o.y);
  if ((i.x * o.x + i.y * o.y) / (li * lo) > COLLINEAR) return "corner";
  return Math.abs(li - lo) <= 1e-6 ? "symmetric" : "smooth";
}

function fromItem(item: paper.PathItem): PathModel {
  const paths = (item instanceof scope().CompoundPath ? item.children : [item]) as paper.Path[];
  return paths.map((p) => ({
    closed: p.closed,
    anchors: p.segments.map((s) => {
      const i = { x: s.handleIn.x, y: s.handleIn.y }, o = { x: s.handleOut.x, y: s.handleOut.y };
      return { x: s.point.x, y: s.point.y, in: i, out: o, kind: anchorKind(i, o) };
    }),
  }));
}

function toItem(m: PathModel): paper.CompoundPath {
  const s = scope();
  return new s.CompoundPath({
    insert: false,
    children: m.map((sp) => new s.Path({
      insert: false,
      closed: sp.closed,
      segments: sp.anchors.map((a) => new s.Segment(new s.Point(a.x, a.y), new s.Point(a.in.x, a.in.y), new s.Point(a.out.x, a.out.y))),
    })),
  });
}

/** Parses any valid SVG path data. Throws `InvalidPath` on empty, unreadable or oversized input. */
export function parsePath(d: string): PathModel {
  if (d.length > MAX_LENGTH) throw new InvalidPath("path data too long");
  if (!d.trim() || !PATH_CHARS.test(d)) throw new InvalidPath("invalid path data");
  let model: PathModel;
  try {
    model = fromItem(new (scope().CompoundPath)({ pathData: d, insert: false }));
  } catch (e) {
    throw new InvalidPath(`invalid path data: ${(e as Error).message}`);
  }
  const anchors = model.flatMap((sp) => sp.anchors);
  if (!anchors.length) throw new InvalidPath("path has no anchors");
  const finite = anchors.every((a) => [a.x, a.y, a.in.x, a.in.y, a.out.x, a.out.y].every(Number.isFinite));
  if (!finite) throw new InvalidPath("path has non-finite numbers");
  return model;
}

/** Absolute `M L C Z` only, 4 decimals, space separated. */
export function toPathData(m: PathModel): string {
  const pt = (p: Pt) => `${num(p.x)} ${num(p.y)}`;
  const seg = (a: Anchor, b: Anchor) =>
    isZero(a.out) && isZero(b.in)
      ? `L${pt(b)}`
      : `C${pt({ x: a.x + a.out.x, y: a.y + a.out.y })} ${pt({ x: b.x + b.in.x, y: b.y + b.in.y })} ${pt(b)}`;
  const out: string[] = [];
  for (const { anchors, closed } of m) {
    if (!anchors.length) continue;
    out.push(`M${pt(anchors[0]!)}`);
    for (let i = 1; i < anchors.length; i++) out.push(seg(anchors[i - 1]!, anchors[i]!));
    if (closed) out.push(seg(anchors[anchors.length - 1]!, anchors[0]!), "Z");
  }
  return out.join(" ");
}

/** Tight curve bounds (Paper's `bounds`). */
export function pathBounds(m: PathModel): Box {
  const { x, y, width, height } = toItem(m).bounds;
  return { x, y, width, height };
}

export function transformPath(d: string, m: Matrix): string {
  const item = toItem(parsePath(d));
  item.transform(new (scope().Matrix)(...m));
  return toPathData(fromItem(item));
}

export const scalePath = (d: string, sx: number, sy: number): string => transformPath(d, [sx, 0, 0, sy, 0, 0]);

/** Outline of a rect, ellipse or path node; `null` for anything else. */
export function nodeToPath(n: CherryNode, space: "local" | "page"): { d: string; fillRule: "nonzero" | "evenodd" } | null {
  const s = scope();
  const rectangle = new s.Rectangle(0, 0, n.width, n.height);
  let item: paper.PathItem;
  if (n.kind === "rect") {
    const radius = Math.min(n.cornerRadius, n.width / 2, n.height / 2);
    item = new s.Path.Rectangle({ rectangle, radius, insert: false });
  } else if (n.kind === "ellipse") {
    item = new s.Path.Ellipse({ rectangle, insert: false });
  } else if (n.kind === "path") {
    item = toItem(parsePath(n.d));
  } else {
    return null;
  }
  if (space === "page") {
    item.rotate(n.rotation, rectangle.center);
    item.translate(new s.Point(n.x, n.y));
  }
  return { d: toPathData(fromItem(item)), fillRule: n.kind === "path" ? (n.fillRule ?? "nonzero") : "nonzero" };
}
