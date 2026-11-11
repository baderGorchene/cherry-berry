import * as Y from "yjs";
import { CherryDocument, type CherryNode } from "./schema";
import type { ParseResult } from "./io";

export const LOCAL = "local";
export const REMOTE = "remote";

const META_KEYS = ["format", "version", "id", "title", "createdAt"] as const;
const PAGE_KEYS = ["id", "name", "width", "height", "unit", "colorMode", "bleed", "background"] as const;

export function toYNode(node: CherryNode): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(node)) {
    if (k === "children") m.set(k, Y.Array.from((v as CherryNode[]).map(toYNode)));
    else if (v !== undefined) m.set(k, v);
  }
  return m;
}

export function fromYNode(m: Y.Map<unknown>): unknown {
  const out: Record<string, unknown> = {};
  m.forEach((v, k) => {
    out[k] = v instanceof Y.Array ? v.map((c) => fromYNode(c as Y.Map<unknown>)) : v;
  });
  return out;
}

export function docToY(doc: CherryDocument, ydoc: Y.Doc = new Y.Doc()): Y.Doc {
  ydoc.transact(() => {
    const meta = ydoc.getMap("meta");
    for (const k of META_KEYS) meta.set(k, doc[k]);
    ydoc.getArray("pages").push(doc.pages.map((p) => {
      const pm = new Y.Map<unknown>();
      for (const k of PAGE_KEYS) pm.set(k, p[k]);
      pm.set("nodes", Y.Array.from(p.nodes.map(toYNode)));
      return pm;
    }));
  }, REMOTE);
  return ydoc;
}

export function yToDoc(ydoc: Y.Doc): ParseResult {
  try {
    const raw = {
      ...ydoc.getMap("meta").toJSON(),
      pages: ydoc.getArray("pages").map((p) => {
        const pm = p as Y.Map<unknown>;
        const { nodes, ...rest } = Object.fromEntries(pm.entries());
        return { ...rest, nodes: (nodes as Y.Array<Y.Map<unknown>> | undefined)?.map(fromYNode) };
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
