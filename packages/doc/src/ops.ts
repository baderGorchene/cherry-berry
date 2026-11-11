import * as Y from "yjs";
import type { CherryNode } from "./schema";
import { LOCAL, fromYNode, toYNode } from "./y";

type YMap = Y.Map<unknown>;
type Located = { arr: Y.Array<YMap>; index: number; node: YMap };

const pagesOf = (ydoc: Y.Doc) => ydoc.getArray<YMap>("pages");
const pageOf = (ydoc: Y.Doc, pageId: string) => pagesOf(ydoc).toArray().find((p) => p.get("id") === pageId);
const nodesOf = (page: YMap) => page.get("nodes") as Y.Array<YMap>;

function locate(arr: Y.Array<YMap>, id: string): Located | undefined {
  for (let i = 0; i < arr.length; i++) {
    const node = arr.get(i);
    if (node.get("id") === id) return { arr, index: i, node };
    const kids = node.get("children");
    if (kids instanceof Y.Array) {
      const hit = locate(kids as Y.Array<YMap>, id);
      if (hit) return hit;
    }
  }
}

function withPage<T>(ydoc: Y.Doc, pageId: string, fn: (page: YMap) => T): T | undefined {
  let out: T | undefined;
  ydoc.transact(() => {
    const page = pageOf(ydoc, pageId);
    if (page) out = fn(page);
  }, LOCAL);
  return out;
}

/** Deep copy with fresh ids; plain objects (fill, stroke…) are cloned so copies share nothing. */
function cloneFresh(node: CherryNode): CherryNode {
  const copy = structuredClone(node) as CherryNode;
  const renew = (n: CherryNode) => {
    n.id = crypto.randomUUID();
    if (n.kind === "group") n.children.forEach(renew);
  };
  renew(copy);
  return copy;
}

export const getPageIds = (ydoc: Y.Doc): string[] => pagesOf(ydoc).map((p) => p.get("id") as string);

export function addNode(ydoc: Y.Doc, pageId: string, node: CherryNode, index?: number): void {
  withPage(ydoc, pageId, (page) => {
    const arr = nodesOf(page);
    arr.insert(index ?? arr.length, [toYNode(node)]);
  });
}

export function updateNode(ydoc: Y.Doc, pageId: string, nodeId: string, patch: Partial<CherryNode>): void {
  withPage(ydoc, pageId, (page) => {
    const hit = locate(nodesOf(page), nodeId);
    if (!hit) return;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id" || k === "kind" || k === "children") continue;
      if (v === undefined) hit.node.delete(k);
      else hit.node.set(k, v);
    }
  });
}

export function removeNodes(ydoc: Y.Doc, pageId: string, nodeIds: string[]): void {
  withPage(ydoc, pageId, (page) => {
    for (const id of nodeIds) {
      const hit = locate(nodesOf(page), id);
      if (hit) hit.arr.delete(hit.index, 1);
    }
  });
}

export function reorderNode(
  ydoc: Y.Doc, pageId: string, nodeId: string, to: "forward" | "backward" | "front" | "back",
): void {
  withPage(ydoc, pageId, (page) => {
    const hit = locate(nodesOf(page), nodeId);
    if (!hit) return;
    const last = hit.arr.length - 1;
    const target = { forward: hit.index + 1, backward: hit.index - 1, front: last, back: 0 }[to];
    const clamped = Math.min(last, Math.max(0, target));
    if (clamped === hit.index) return;
    const copy = fromYNode(hit.node) as CherryNode;
    hit.arr.delete(hit.index, 1);
    hit.arr.insert(clamped, [toYNode(copy)]);
  });
}

export function duplicateNodes(ydoc: Y.Doc, pageId: string, nodeIds: string[], offset: number): string[] {
  return withPage(ydoc, pageId, (page) => {
    const out: string[] = [];
    for (const id of nodeIds) {
      const hit = locate(nodesOf(page), id);
      if (!hit) continue;
      const copy = cloneFresh(fromYNode(hit.node) as CherryNode);
      copy.name += " copy";
      copy.x += offset;
      copy.y += offset;
      hit.arr.insert(hit.index + 1, [toYNode(copy)]);
      out.push(copy.id);
    }
    return out;
  }) ?? [];
}

export function addPage(ydoc: Y.Doc, opts: { after?: string; copyOf?: string } = {}): string {
  const id = crypto.randomUUID();
  ydoc.transact(() => {
    const pages = pagesOf(ydoc);
    const src = (opts.copyOf && pageOf(ydoc, opts.copyOf)) || pages.get(pages.length - 1);
    const page = new Y.Map<unknown>();
    page.set("id", id);
    page.set("name", opts.copyOf && src ? `${src.get("name")} copy` : `Page ${pages.length + 1}`);
    for (const k of ["width", "height", "unit", "colorMode", "bleed"]) page.set(k, src?.get(k));
    page.set("background", structuredClone(src?.get("background")) ?? { type: "solid", color: "#FFFFFF", opacity: 1 });
    const nodes = opts.copyOf && src
      ? nodesOf(src).map((n) => toYNode(cloneFresh(fromYNode(n) as CherryNode)))
      : [];
    page.set("nodes", Y.Array.from(nodes));
    const afterIdx = opts.after ? pages.toArray().findIndex((p) => p.get("id") === opts.after) : -1;
    pages.insert(afterIdx >= 0 ? afterIdx + 1 : pages.length, [page]);
  }, LOCAL);
  return id;
}

export function removePage(ydoc: Y.Doc, pageId: string): boolean {
  const pages = pagesOf(ydoc);
  const idx = pages.toArray().findIndex((p) => p.get("id") === pageId);
  if (idx < 0 || pages.length <= 1) return false;
  ydoc.transact(() => pages.delete(idx, 1), LOCAL);
  return true;
}

export function renamePage(ydoc: Y.Doc, pageId: string, name: string): void {
  withPage(ydoc, pageId, (page) => page.set("name", name));
}

export function movePage(ydoc: Y.Doc, pageId: string, toIndex: number): void {
  ydoc.transact(() => {
    const pages = pagesOf(ydoc);
    const idx = pages.toArray().findIndex((p) => p.get("id") === pageId);
    if (idx < 0) return;
    const to = Math.min(pages.length - 1, Math.max(0, toIndex));
    if (to === idx) return;
    // A Y type cannot be re-inserted, so rebuild the page from plain data.
    const src = pages.get(idx);
    const page = new Y.Map<unknown>();
    src.forEach((v, k) => {
      if (k === "nodes") page.set(k, Y.Array.from(nodesOf(src).map((n) => toYNode(fromYNode(n) as CherryNode))));
      else page.set(k, structuredClone(v));
    });
    pages.delete(idx, 1);
    pages.insert(to, [page]);
  }, LOCAL);
}

export function setTitle(ydoc: Y.Doc, title: string): void {
  ydoc.transact(() => ydoc.getMap("meta").set("title", title), LOCAL);
}

export function createUndoManager(ydoc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([ydoc.getMap("meta"), pagesOf(ydoc)], {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 400,
  });
}
