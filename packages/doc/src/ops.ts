import * as Y from "yjs";
import type { CherryNode } from "./schema";
import { LOCAL, fromYNode, ordered, toYList, toYNode } from "./y";

type YMap = Y.Map<unknown>;
type List = Y.Map<YMap>;
type Located = { list: List; node: YMap };

const pagesOf = (ydoc: Y.Doc) => ydoc.getMap<YMap>("pages");
const pageOf = (ydoc: Y.Doc, pageId: string) => pagesOf(ydoc).get(pageId);
const nodesOf = (page: YMap) => page.get("nodes") as List;

function locate(list: List, id: string): Located | undefined {
  const node = list.get(id);
  if (node) return { list, node };
  for (const n of list.values()) {
    const kids = n.get("children");
    const hit = kids instanceof Y.Map ? locate(kids as List, id) : undefined;
    if (hit) return hit;
  }
}

/**
 * An `order` that sorts at `index` among `items` (already in order, without the item being placed).
 * ponytail: float midpoints; about 50 inserts into the same ever-shrinking gap run out of double
 * precision and the item then ties with a neighbour (broken by id). Renumber the list if that ever matters.
 */
function orderAt(items: YMap[], index: number): number {
  const o = (i: number) => items[i]!.get("order") as number;
  if (!items.length) return 0;
  if (index <= 0) return o(0) - 1;
  if (index >= items.length) return o(items.length - 1) + 1;
  return (o(index - 1) + o(index)) / 2;
}

/** Inserts `item` into `list` at `index` of the current order. */
function insertAt(list: List, id: string, item: YMap, index: number): void {
  item.set("order", orderAt(ordered(list), index));
  list.set(id, item);
}

/** Moves the item with `id` to `index` of the current order by changing only its `order`. */
function moveTo(list: List, id: string, index: number): void {
  const items = ordered(list);
  const from = items.findIndex((m) => m.get("id") === id);
  const to = Math.min(items.length - 1, Math.max(0, index));
  if (from < 0 || to === from) return;
  const item = items.splice(from, 1)[0]!;
  item.set("order", orderAt(items, to));
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

export const getPageIds = (ydoc: Y.Doc): string[] => ordered(pagesOf(ydoc)).map((p) => p.get("id") as string);

export function addNode(ydoc: Y.Doc, pageId: string, node: CherryNode, index?: number): void {
  withPage(ydoc, pageId, (page) => {
    const list = nodesOf(page);
    insertAt(list, node.id, toYNode(node), index ?? list.size);
  });
}

export function updateNode(ydoc: Y.Doc, pageId: string, nodeId: string, patch: Partial<CherryNode>): void {
  withPage(ydoc, pageId, (page) => {
    const hit = locate(nodesOf(page), nodeId);
    if (!hit) return;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id" || k === "kind" || k === "children" || k === "order") continue;
      if (v === undefined) hit.node.delete(k);
      else hit.node.set(k, v);
    }
  });
}

export function removeNodes(ydoc: Y.Doc, pageId: string, nodeIds: string[]): void {
  withPage(ydoc, pageId, (page) => {
    for (const id of nodeIds) locate(nodesOf(page), id)?.list.delete(id);
  });
}

export function reorderNode(
  ydoc: Y.Doc, pageId: string, nodeId: string, to: "forward" | "backward" | "front" | "back",
): void {
  withPage(ydoc, pageId, (page) => {
    const hit = locate(nodesOf(page), nodeId);
    if (!hit) return;
    const index = ordered(hit.list).indexOf(hit.node);
    const last = hit.list.size - 1;
    moveTo(hit.list, nodeId, { forward: index + 1, backward: index - 1, front: last, back: 0 }[to]);
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
      insertAt(hit.list, copy.id, toYNode(copy), ordered(hit.list).indexOf(hit.node) + 1);
      out.push(copy.id);
    }
    return out;
  }) ?? [];
}

export function addPage(ydoc: Y.Doc, opts: { after?: string; copyOf?: string } = {}): string {
  const id = crypto.randomUUID();
  ydoc.transact(() => {
    const pages = pagesOf(ydoc);
    const sorted = ordered(pages);
    const src = (opts.copyOf && pages.get(opts.copyOf)) || sorted.at(-1);
    const page = new Y.Map<unknown>();
    page.set("id", id);
    page.set("name", opts.copyOf && src ? `${src.get("name")} copy` : `Page ${pages.size + 1}`);
    for (const k of ["width", "height", "unit", "colorMode", "bleed"]) page.set(k, src?.get(k));
    page.set("background", structuredClone(src?.get("background")) ?? { type: "solid", color: "#FFFFFF", opacity: 1 });
    const nodes = opts.copyOf && src
      ? ordered(nodesOf(src)).map((n) => cloneFresh(fromYNode(n) as CherryNode))
      : [];
    page.set("nodes", toYList(nodes, toYNode));
    const afterIdx = opts.after ? sorted.findIndex((p) => p.get("id") === opts.after) : -1;
    insertAt(pages, id, page, afterIdx >= 0 ? afterIdx + 1 : sorted.length);
  }, LOCAL);
  return id;
}

export function removePage(ydoc: Y.Doc, pageId: string): boolean {
  const pages = pagesOf(ydoc);
  if (!pages.has(pageId) || pages.size <= 1) return false;
  ydoc.transact(() => pages.delete(pageId), LOCAL);
  return true;
}

export function renamePage(ydoc: Y.Doc, pageId: string, name: string): void {
  withPage(ydoc, pageId, (page) => page.set("name", name));
}

export function movePage(ydoc: Y.Doc, pageId: string, toIndex: number): void {
  ydoc.transact(() => moveTo(pagesOf(ydoc), pageId, toIndex), LOCAL);
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
