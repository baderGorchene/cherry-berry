import * as Y from "yjs";
import { CherryDocument, type CherryNode } from "./schema";
import type { ParseResult } from "./io";

export const LOCAL = "local";
export const REMOTE = "remote";

const META_KEYS = ["format", "version", "id", "title", "createdAt"] as const;
const PAGE_KEYS = ["id", "name", "width", "height", "unit", "colorMode", "bleed", "background"] as const;

type YMap = Y.Map<unknown>;

/**
 * Ordered collections (pages, a page's nodes, a group's children) are Y.Maps of id → item Y.Map,
 * each item carrying a numeric `order`. Moving an item only sets its `order`, so concurrent moves
 * and edits merge cleanly. Readers sort by (order, id).
 */
export function ordered(list: Y.Map<YMap>): YMap[] {
  return [...list.values()].sort((a, b) =>
    (a.get("order") as number) - (b.get("order") as number) || ((a.get("id") as string) < (b.get("id") as string) ? -1 : 1));
}

/** Builds an ordered collection from items already in order. */
export function toYList<T extends { id: string }>(items: T[], toY: (item: T) => YMap): Y.Map<YMap> {
  const list = new Y.Map<YMap>();
  items.forEach((item, i) => {
    const m = toY(item);
    m.set("order", i);
    list.set(item.id, m);
  });
  return list;
}

export function toYNode(node: CherryNode): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(node)) {
    if (k === "children") m.set(k, toYList(v as CherryNode[], toYNode));
    else if (v !== undefined) m.set(k, v);
  }
  return m;
}

export function fromYNode(m: Y.Map<unknown>): unknown {
  const out: Record<string, unknown> = {};
  m.forEach((v, k) => {
    if (k === "order") return;
    out[k] = v instanceof Y.Map ? ordered(v as Y.Map<YMap>).map(fromYNode) : v;
  });
  return out;
}

export function docToY(doc: CherryDocument, ydoc: Y.Doc = new Y.Doc()): Y.Doc {
  ydoc.transact(() => {
    const meta = ydoc.getMap("meta");
    for (const k of META_KEYS) meta.set(k, doc[k]);
    const pages = ydoc.getMap<YMap>("pages");
    doc.pages.forEach((p, i) => {
      const pm = new Y.Map<unknown>();
      for (const k of PAGE_KEYS) pm.set(k, p[k]);
      pm.set("nodes", toYList(p.nodes, toYNode));
      pm.set("order", i);
      pages.set(p.id, pm);
    });
  }, REMOTE);
  return ydoc;
}

export function yToDoc(ydoc: Y.Doc): ParseResult {
  try {
    const raw = {
      ...ydoc.getMap("meta").toJSON(),
      pages: ordered(ydoc.getMap<YMap>("pages")).map((pm) => {
        const { nodes, order: _, ...rest } = Object.fromEntries(pm.entries());
        return { ...rest, nodes: nodes instanceof Y.Map ? ordered(nodes as Y.Map<YMap>).map(fromYNode) : undefined };
      }),
    };
    const r = CherryDocument.safeParse(raw);
    if (r.success) return { ok: true, doc: r.data };
    const i = r.error.issues[0]!;
    return { ok: false, error: "invalid_document", detail: `${i.path.join(".")}: ${i.message}` };
  } catch {
    return { ok: false, error: "invalid_document", detail: "unreadable or too deeply nested" };
  }
}
