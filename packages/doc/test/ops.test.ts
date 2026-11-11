import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocument } from "../src/create";
import type { CherryNode } from "../src/schema";
import { docToY, yToDoc, REMOTE } from "../src/y";
import {
  addNode, addPage, createUndoManager, duplicateNodes, getPageIds, movePage,
  removeNodes, removePage, reorderNode, updateNode,
} from "../src/ops";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
const rect = (id: string, x = 0): CherryNode =>
  ({ ...base, id, name: id, kind: "rect", x, y: 0, width: 10, height: 10, cornerRadius: 0 }) as CherryNode;
const group = (id: string, children: CherryNode[]): CherryNode =>
  ({ ...base, id, name: "Group", kind: "group", x: 5, y: 5, width: 10, height: 10, children }) as CherryNode;

function setup(nodes: CherryNode[] = []) {
  const d = createDocument({ title: "T", width: 100, height: 200, unit: "px", colorMode: "rgb" });
  d.pages[0]!.nodes = nodes;
  const y = docToY(d);
  const doc = () => { const r = yToDoc(y); if (!r.ok) throw new Error(r.detail); return r.doc; };
  return { y, doc, pid: d.pages[0]!.id };
}
const ids = (ns: CherryNode[]) => ns.map((n) => n.id);

describe("ops", () => {
  it("add, update and remove a node", () => {
    const { y, doc, pid } = setup();
    addNode(y, pid, rect("a"));
    expect(ids(doc().pages[0]!.nodes)).toEqual(["a"]);
    updateNode(y, pid, "a", { x: 40, id: "hack" } as Partial<CherryNode>);
    expect(doc().pages[0]!.nodes[0]).toMatchObject({ id: "a", x: 40 });
    removeNodes(y, pid, ["a"]);
    expect(doc().pages[0]!.nodes).toEqual([]);
  });

  it("updates a node nested in groups", () => {
    const { y, doc, pid } = setup([group("g1", [group("g2", [rect("r")])])]);
    updateNode(y, pid, "r", { x: 9 });
    const g1 = doc().pages[0]!.nodes[0] as Extract<CherryNode, { kind: "group" }>;
    const g2 = g1.children[0] as Extract<CherryNode, { kind: "group" }>;
    expect(g2.children[0]).toMatchObject({ id: "r", x: 9 });
  });

  it("reorders within parent", () => {
    const { y, doc, pid } = setup([rect("a"), rect("b"), rect("c")]);
    reorderNode(y, pid, "b", "front");
    expect(ids(doc().pages[0]!.nodes)).toEqual(["a", "c", "b"]);
    reorderNode(y, pid, "a", "backward");
    expect(ids(doc().pages[0]!.nodes)).toEqual(["a", "c", "b"]);
  });

  it("duplicates deeply with fresh ids", () => {
    const { y, doc, pid } = setup([group("g", [rect("r")]), rect("z")]);
    const [nid] = duplicateNodes(y, pid, ["g"], 10);
    const ns = doc().pages[0]!.nodes;
    expect(ids(ns)).toEqual(["g", nid, "z"]);
    const copy = ns[1] as Extract<CherryNode, { kind: "group" }>;
    expect(copy).toMatchObject({ name: "Group copy", x: 15, y: 15 });
    expect(copy.children[0]!.id).not.toBe("r");
    expect(copy.children[0]).toMatchObject({ name: "r", x: 0, y: 0 });
  });

  it("pages", () => {
    const { y, doc, pid } = setup([rect("a")]);
    const p2 = addPage(y);
    expect(doc().pages.map((p) => p.name)).toEqual(["Page 1", "Page 2"]);
    expect(doc().pages[1]).toMatchObject({ id: p2, width: 100, height: 200, nodes: [] });
    const p3 = addPage(y, { copyOf: pid });
    expect(getPageIds(y)).toEqual([pid, p2, p3]);
    const copied = doc().pages[2]!;
    expect(copied.name).toBe("Page 1 copy");
    expect(copied.nodes).toHaveLength(1);
    expect(copied.nodes[0]!.id).not.toBe("a");
    movePage(y, p3, 0);
    expect(getPageIds(y)).toEqual([p3, pid, p2]);
    expect(removePage(y, p2)).toBe(true);
    expect(removePage(y, p3)).toBe(true);
    expect(removePage(y, pid)).toBe(false);
    expect(doc().pages).toHaveLength(1);
  });

  it("undo groups one gesture", () => {
    const { y, doc, pid } = setup([rect("a", 1)]);
    const um = createUndoManager(y);
    updateNode(y, pid, "a", { x: 2 });
    updateNode(y, pid, "a", { x: 3 });
    updateNode(y, pid, "a", { x: 4 });
    um.undo();
    expect(doc().pages[0]!.nodes[0]).toMatchObject({ x: 1 });
  });

  it("undo ignores remote changes", () => {
    const { y, doc, pid } = setup();
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(y));
    const um = createUndoManager(y);
    addNode(y, pid, rect("A"));
    const sv = Y.encodeStateVector(y);
    addNode(other, pid, rect("B"));
    Y.applyUpdate(y, Y.encodeStateAsUpdate(other, sv), REMOTE);
    expect(ids(doc().pages[0]!.nodes).sort()).toEqual(["A", "B"]);
    um.undo();
    expect(ids(doc().pages[0]!.nodes)).toEqual(["B"]);
  });
});
