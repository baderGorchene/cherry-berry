import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocument } from "../src/create";
import type { CherryDocument, CherryNode } from "../src/schema";
import { docToY, yToDoc, REMOTE } from "../src/y";
import { addPage, createUndoManager, getPageIds, movePage, reorderNode, updateNode } from "../src/ops";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
const rect = (id: string): CherryNode =>
  ({ ...base, id, name: id, kind: "rect", x: 0, y: 0, width: 10, height: 10, cornerRadius: 0 }) as CherryNode;

/** Two replicas of one stored design (page 1: a, b, c; page 2 empty), as two tabs would load it. */
function diverge() {
  const d = createDocument({ title: "T", width: 100, height: 100, unit: "px", colorMode: "rgb" });
  d.pages[0]!.nodes = [rect("a"), rect("b"), rect("c")];
  const stored = docToY(d);
  addPage(stored);
  const s = Y.encodeStateAsUpdate(stored);
  const load = () => { const y = new Y.Doc(); Y.applyUpdate(y, s, REMOTE); return y; };
  return { a: load(), b: load(), stored: s, pid: d.pages[0]!.id };
}

/** Merges like the server PUT: stored state, then each tab's full state in turn. */
function merge(stored: Uint8Array, ...tabs: Y.Doc[]): CherryDocument {
  const m = new Y.Doc();
  Y.applyUpdate(m, stored);
  for (const t of tabs) Y.applyUpdate(m, Y.encodeStateAsUpdate(t));
  const r = yToDoc(m);
  if (!r.ok) throw new Error(r.detail);
  return r.doc;
}
const ids = (ns: { id: string }[]) => ns.map((n) => n.id);

describe("concurrent edits merge", () => {
  it("reorder on one side and an edit on the other both survive", () => {
    const { a, b, stored, pid } = diverge();
    reorderNode(a, pid, "a", "front");
    updateNode(b, pid, "a", { x: 42 });
    const nodes = merge(stored, a, b).pages[0]!.nodes;
    expect(ids(nodes)).toEqual(["b", "c", "a"]);
    expect(nodes[2]).toMatchObject({ id: "a", x: 42 });
  });

  it("both sides reorder the same node: it appears once", () => {
    const { a, b, stored, pid } = diverge();
    reorderNode(a, pid, "a", "front");
    reorderNode(b, pid, "a", "forward");
    const got = ids(merge(stored, a, b).pages[0]!.nodes);
    expect(got.sort()).toEqual(["a", "b", "c"]);
  });

  it("both sides move the same page: it appears once", () => {
    const { a, b, stored, pid } = diverge();
    movePage(a, pid, 1);
    movePage(b, pid, 1);
    const pages = merge(stored, a, b).pages;
    expect(pages).toHaveLength(2);
    expect(pages[1]!.id).toBe(pid);
  });

  it("movePage on one side and a node edit on that page on the other both survive", () => {
    const { a, b, stored, pid } = diverge();
    movePage(a, pid, 1);
    updateNode(b, pid, "b", { x: 77 });
    const pages = merge(stored, a, b).pages;
    expect(pages[1]!.id).toBe(pid);
    expect(pages[1]!.nodes.find((n) => n.id === "b")).toMatchObject({ x: 77 });
  });

  it("undo of a reorder is one step", () => {
    const { a, pid } = diverge();
    const um = createUndoManager(a);
    reorderNode(a, pid, "a", "front");
    const order = () => { const r = yToDoc(a); if (!r.ok) throw new Error(r.detail); return ids(r.doc.pages[0]!.nodes); };
    expect(order()).toEqual(["b", "c", "a"]);
    um.undo();
    expect(order()).toEqual(["a", "b", "c"]);
    expect(getPageIds(a)[0]).toBe(pid);
  });
});
