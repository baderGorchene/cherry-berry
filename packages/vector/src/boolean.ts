import type { CherryNode } from "@cherry/doc";
import type { PathNode } from "./edit";
import { fromItem, nodeToPath, parsePath, pathBounds, toItem, toPathData } from "./model";
import { scope } from "./paper";

export type BoolOp = "union" | "subtract" | "intersect" | "exclude";

const NAMES: Record<BoolOp, string> = { union: "Union", subtract: "Subtract", intersect: "Intersect", exclude: "Exclude" };
const METHOD = { union: "unite", subtract: "subtract", intersect: "intersect", exclude: "exclude" } as const;

const isClosed = (n: CherryNode) =>
  n.kind === "rect" || n.kind === "ellipse" || (n.kind === "path" && parsePath(n.d).every((sp) => sp.closed));

/** Page-space Paper item for a closed operand, honouring the node's fill rule. */
function operand(n: CherryNode): paper.CompoundPath | null {
  const p = isClosed(n) ? nodeToPath(n, "page") : null;
  if (!p) return null;
  const item = toItem(parsePath(p.d));
  item.fillRule = p.fillRule;
  return item;
}

/** `nodes` are bottom → top. Returns `null` for fewer than 2 usable operands or an empty result. */
export function booleanOp(op: BoolOp, nodes: CherryNode[]): PathNode | null {
  const used = nodes.filter(isClosed);
  const items = used.map(operand);
  if (items.length < 2 || items.some((i) => !i)) return null;
  const [first, ...rest] = items as paper.CompoundPath[];
  const opts = { insert: false };
  let result: paper.PathItem = first!;
  if (op === "subtract") {
    // bottom minus the union of all the others
    const top = rest.slice(1).reduce<paper.PathItem>((acc, i) => acc.unite(i, opts), rest[0]!);
    result = first!.subtract(top, opts);
  } else {
    for (const i of rest) result = result[METHOD[op]](i, opts);
  }
  const model = fromItem(result).filter((sp) => sp.anchors.length);
  if (!model.length) return null;
  const { x: bx, y: by } = pathBounds(model);
  const item = toItem(model);
  item.translate(new (scope().Point)(-bx, -by));
  const d = toPathData(fromItem(item));
  const b = pathBounds(parsePath(d));
  const bottom = used[0]! as PathNode; // rect/ellipse/path all carry fill and stroke
  return {
    id: crypto.randomUUID(),
    kind: "path",
    name: NAMES[op],
    x: bx + b.x,
    y: by + b.y,
    width: b.width,
    height: b.height,
    rotation: 0,
    opacity: bottom.opacity,
    locked: false,
    hidden: false,
    fill: bottom.fill,
    stroke: bottom.stroke,
    d,
    fillRule: op === "exclude" ? "evenodd" : "nonzero",
  } as PathNode;
}

export function flatten(n: CherryNode): PathNode | null {
  const p = nodeToPath(n, "local");
  if (!p) return null;
  return {
    id: n.id, kind: "path", name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation,
    opacity: n.opacity, locked: n.locked, hidden: n.hidden, fill: (n as PathNode).fill, stroke: (n as PathNode).stroke,
    d: p.d, fillRule: p.fillRule,
  } as PathNode;
}
