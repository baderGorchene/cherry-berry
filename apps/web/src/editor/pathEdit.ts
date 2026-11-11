import * as Y from "yjs";
import { LOCAL, addNode, nodeInfo, removeNodes, updateNode, yToDoc, type CherryNode, type Page } from "@cherry/doc";
import { InvalidPath, booleanOp, flatten, normalizeEdit, parsePath, type Anchor, type AnchorRef, type BoolOp, type PathModel, type PathNode, type Pt } from "@cherry/vector";

export const asPath = (n: CherryNode): PathNode => (n.kind === "path" ? n : flatten(n)!);

/** Anchor model of a path, rect or ellipse; `null` when the node can't be point-edited (other kinds, unreadable `d`). */
export function editModel(n: CherryNode): PathModel | null {
  if (n.kind !== "path" && n.kind !== "rect" && n.kind !== "ellipse") return null;
  try {
    return parsePath(asPath(n).d);
  } catch (e) {
    if (e instanceof InvalidPath) return null;
    throw e;
  }
}

export const rot = (v: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
/** Node-local point → page point (rotation about the box centre). */
export function toPage(n: CherryNode, p: Pt): Pt {
  const v = rot({ x: p.x - n.width / 2, y: p.y - n.height / 2 }, n.rotation);
  return { x: n.x + n.width / 2 + v.x, y: n.y + n.height / 2 + v.y };
}
export function toLocal(n: CherryNode, p: Pt): Pt {
  const v = rot({ x: p.x - n.x - n.width / 2, y: p.y - n.y - n.height / 2 }, -n.rotation);
  return { x: v.x + n.width / 2, y: v.y + n.height / 2 };
}

export const anchorAt = (m: PathModel, r: AnchorRef): Anchor | undefined => m[r.sub]?.anchors[r.i];
export const validRefs = (m: PathModel, refs: AnchorRef[]) => refs.filter((r) => anchorAt(m, r));

/** Fresh `{kind, index}` of a node that sits directly in the page's list; `undefined` if gone or nested in a group. */
function topInfo(ydoc: Y.Doc, pageId: string, id: string) {
  const info = nodeInfo(ydoc, pageId, id);
  const r = yToDoc(ydoc);
  const top = r.ok && r.doc.pages.find((p) => p.id === pageId)?.nodes.some((n) => n.id === id);
  return info && top ? info : undefined;
}

/**
 * Writes `model` (plus `patch`) to `node` as one undo step. A rect or ellipse is flattened into a path with the same id
 * at the same index; an empty model removes the node. `node` may be stale (a pen draft committed on unmount), so the
 * document is read afresh: if the node is gone or is no longer that kind, nothing is written and the redo stack survives.
 */
export function commitEdit(
  ydoc: Y.Doc, page: Page, node: CherryNode, model: PathModel, act: (fn: () => void) => void, patch: Partial<PathNode> = {},
) {
  act(() => ydoc.transact(() => {
    const now = topInfo(ydoc, page.id, node.id);
    if (now?.kind !== node.kind) return;
    if (!model.length) return removeNodes(ydoc, page.id, [node.id]);
    const base = asPath(node);
    const geo = { ...normalizeEdit(base, model), ...patch };
    if (node.kind === "path") return updateNode(ydoc, page.id, node.id, geo);
    replaceNodes(ydoc, page.id, [node.id], { ...base, ...geo }, now.index);
  }, LOCAL));
}

/** Removes `ids`, then puts `node` at `index` (the position the first removed node had, so earlier siblings don't shift). */
function replaceNodes(ydoc: Y.Doc, pageId: string, ids: string[], node: CherryNode, index: number) {
  removeNodes(ydoc, pageId, ids);
  addNode(ydoc, pageId, node, index);
}

/** A top-level node that boolean ops accept: unlocked, visible, and a rect, ellipse or fully closed path. */
export function combinable(n: CherryNode): boolean {
  if (n.locked || n.hidden) return false;
  if (n.kind === "rect" || n.kind === "ellipse") return true;
  if (n.kind !== "path") return false;
  try {
    return parsePath(n.d).every((sp) => sp.closed);
  } catch (e) {
    if (e instanceof InvalidPath) return false;
    throw e;
  }
}

/** Runs `fn` as one undo step; returns the message to show when it can't, else `undefined`. */
function guarded(act: (fn: () => void) => void, bad: string, fn: () => string | undefined): string | undefined {
  let msg: string | undefined;
  try {
    act(() => { msg = fn(); });
  } catch (e) {
    if (e instanceof InvalidPath) return bad;
    throw e;
  }
  return msg;
}

/** Combines `operands` (page order, bottom → top) into one path at the bottom-most operand's index and selects it. */
export function combine(
  ydoc: Y.Doc, pageId: string, op: BoolOp, operands: CherryNode[], act: (fn: () => void) => void, select: (ids: string[]) => void,
): string | undefined {
  let result: CherryNode | null = null;
  const msg = guarded(act, "These shapes can't be combined.", () => {
    const now = operands.map((n) => topInfo(ydoc, pageId, n.id));
    if (now.some((i, k) => i?.kind !== operands[k]!.kind)) return "These shapes can't be combined.";
    result = booleanOp(op, operands);
    if (!result) return "These shapes don't overlap.";
    ydoc.transact(() => {
      const index = now[0]!.index;
      replaceNodes(ydoc, pageId, operands.map((n) => n.id), result!, index);
    }, LOCAL);
  });
  if (!msg && result) select([(result as CherryNode).id]);
  return msg;
}

/** Turns a rect or ellipse into a path with the same id at the same index (one undo step). */
export function convertToPath(ydoc: Y.Doc, pageId: string, node: CherryNode, act: (fn: () => void) => void): string | undefined {
  return guarded(act, "This shape can't be converted.", () => {
    const path = flatten(node);
    const now = topInfo(ydoc, pageId, node.id);
    if (!path || !now) return "This shape can't be converted.";
    ydoc.transact(() => replaceNodes(ydoc, pageId, [node.id], path, now.index), LOCAL);
  });
}
