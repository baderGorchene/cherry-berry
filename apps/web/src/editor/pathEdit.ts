import * as Y from "yjs";
import { LOCAL, addNode, nodeInfo, removeNodes, updateNode, type CherryNode, type Page } from "@cherry/doc";
import { InvalidPath, flatten, normalizeEdit, parsePath, type Anchor, type AnchorRef, type PathModel, type PathNode, type Pt } from "@cherry/vector";

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

/**
 * Writes `model` (plus `patch`) to `node` as one undo step. A rect or ellipse is flattened into a path with the same id
 * at the same index; an empty model removes the node. `node` may be stale (a pen draft committed on unmount), so the
 * document is read afresh: if the node is gone or is no longer that kind, nothing is written and the redo stack survives.
 */
export function commitEdit(
  ydoc: Y.Doc, page: Page, node: CherryNode, model: PathModel, act: (fn: () => void) => void, patch: Partial<PathNode> = {},
) {
  act(() => ydoc.transact(() => {
    const now = nodeInfo(ydoc, page.id, node.id);
    if (now?.kind !== node.kind) return;
    if (!model.length) return removeNodes(ydoc, page.id, [node.id]);
    const base = asPath(node);
    const geo = { ...normalizeEdit(base, model), ...patch };
    if (node.kind === "path") return updateNode(ydoc, page.id, node.id, geo);
    removeNodes(ydoc, page.id, [node.id]);
    addNode(ydoc, page.id, { ...base, ...geo }, now.index);
  }, LOCAL));
}
