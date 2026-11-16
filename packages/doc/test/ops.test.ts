import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocument } from "../src/create";
import type { CherryNode } from "../src/schema";
import { docToY, yToDoc, REMOTE } from "../src/y";
import {
  addNode, addPage, createUndoManager, duplicateNodes, getPageIds, insertPages, movePage, nodeInfo,
  removeNodes, removePage, replaceDocument, reorderNode, updateNode, updatePage,
} from "../src/ops";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
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
  it("nodeInfo reads a node's current kind and sibling index", () => {
    const { y, pid } = setup([rect("a"), rect("b"), group("g", [rect("c")])]);
    expect(nodeInfo(y, pid, "b")).toEqual({ kind: "rect", index: 1 });
    expect(nodeInfo(y, pid, "g")).toEqual({ kind: "group", index: 2 });
    expect(nodeInfo(y, pid, "c")).toEqual({ kind: "rect", index: 0 });
    removeNodes(y, pid, ["b"]);
    expect(nodeInfo(y, pid, "b")).toBeUndefined();
    expect(nodeInfo(y, "nope", "a")).toBeUndefined();
  });

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

  it("updatePage changes a page's size, colour mode and background, and nothing else", () => {
    const { y, doc, pid } = setup([rect("a")]);
    updatePage(y, pid, { width: 300, colorMode: "cmyk", background: { type: "solid", color: "#FFC0DE", opacity: 1 } });
    const p = doc().pages[0]!;
    expect([p.width, p.height, p.colorMode, p.background.color, p.unit]).toEqual([300, 200, "cmyk", "#FFC0DE", "px"]);
    expect(ids(p.nodes)).toEqual(["a"]);
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

  it("copies drop brand locks unless keepLocks is set", () => {
    const locked = () => ({ ...group("g", [{ ...rect("c"), brandLock: "fixed" } as CherryNode]), brandLock: "content" }) as CherryNode;
    const lockOf = (n: CherryNode | undefined) => [n?.brandLock, n?.kind === "group" ? n.children[0]?.brandLock : undefined];
    for (const keep of [false, true]) {
      const want = keep ? ["content", "fixed"] : ["none", "none"];
      const a = setup([locked()]);
      const [copyId] = duplicateNodes(a.y, a.pid, ["g"], 0, keep);
      expect(lockOf(a.doc().pages[0]!.nodes.find((n) => n.id === copyId))).toEqual(want);
      const b = setup([locked()]);
      const pid2 = addPage(b.y, { copyOf: b.pid, keepLocks: keep });
      expect(lockOf(b.doc().pages.find((p) => p.id === pid2)!.nodes[0])).toEqual(want);
    }
  });

  it("insertPages adds pages of their own size after a page, with fresh ids, as one undo step", () => {
    const a4 = createDocument({ title: "A4", width: 210, height: 297, unit: "mm", colorMode: "cmyk", bleed: 3 });
    a4.pages[0]!.nodes = [rect("a")];
    const y = docToY(a4);
    const um = createUndoManager(y);
    const story = createDocument({ title: "Story", width: 1080, height: 1920, unit: "px", colorMode: "rgb" }).pages[0]!;
    story.nodes = [group("g", [rect("r")])];
    const tail = { ...structuredClone(story), id: "tail", name: "Tail", nodes: [] };
    const newIds = insertPages(y, [story, tail], a4.pages[0]!.id);
    const doc = () => { const r = yToDoc(y); if (!r.ok) throw new Error(r.detail); return r.doc; };
    const pages = doc().pages;
    expect(pages.map((p) => p.id)).toEqual([a4.pages[0]!.id, ...newIds]);
    expect(pages[0]).toMatchObject({ width: 210, height: 297, unit: "mm", colorMode: "cmyk", bleed: 3 });
    expect(pages[1]).toMatchObject({ width: 1080, height: 1920, unit: "px", colorMode: "rgb", bleed: 0, name: story.name });
    expect(newIds).not.toContain(story.id);
    expect(newIds).not.toContain("tail");
    const g = pages[1]!.nodes[0] as Extract<CherryNode, { kind: "group" }>;
    expect(g.id).not.toBe("g");
    expect(g.children[0]!.id).not.toBe("r");
    um.undo();
    expect(doc().pages.map((p) => p.id)).toEqual([a4.pages[0]!.id]);
  });

  it("replaceDocument swaps content in one transaction and keeps the Y.Doc", () => {
    const { y, doc } = setup([rect("a"), group("g", [rect("c")])]);
    const target = createDocument({ title: "Other", width: 300, height: 400, unit: "px", colorMode: "rgb" });
    target.pages[0]!.nodes = [rect("z", 7)];
    target.pages.push({ ...structuredClone(target.pages[0]!), id: "p2", nodes: [group("h", [rect("k")])] });
    let updates = 0;
    y.on("update", () => updates++);
    replaceDocument(y, target);
    expect(updates).toBe(1);
    expect(doc()).toEqual(target);
  });
});
