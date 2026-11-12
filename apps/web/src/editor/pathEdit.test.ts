import { describe, expect, it } from "vitest";
import {
  addNode, removeNodes, createDocument, createShape, createUndoManager, docToY, yToDoc, type CherryNode,
} from "@cherry/doc";
import { moveAnchors } from "@cherry/vector";
import type { Anchor } from "@cherry/vector";
import { combine, commitEdit, convertToPath, editModel, finishDraft } from "./pathEdit";

function setup() {
  const ydoc = docToY(createDocument({ title: "T", width: 100, height: 100, unit: "px", colorMode: "rgb" }));
  const undo = createUndoManager(ydoc);
  const act = (fn: () => void) => { undo.stopCapturing(); fn(); undo.stopCapturing(); };
  const page = () => { const r = yToDoc(ydoc); if (!r.ok) throw new Error("bad doc"); return r.doc.pages[0]!; };
  const rect = createShape("rect", { x: 10, y: 10, width: 20, height: 20 });
  const other = createShape("ellipse", { x: 50, y: 50, width: 10, height: 10 });
  act(() => { addNode(ydoc, page().id, other); addNode(ydoc, page().id, rect); });
  return { ydoc, undo, act, page, rect };
}

describe("commitEdit", () => {
  it("flattens a rect into a path with the same id and index, as one undo step", () => {
    const { ydoc, undo, act, page, rect } = setup();
    commitEdit(ydoc, page(), rect, editModel(rect)!, act);
    expect(page().nodes.map((n) => [n.id, n.kind])).toEqual([[page().nodes[0]!.id, "ellipse"], [rect.id, "path"]]);
    undo.undo();
    expect(page().nodes[1]).toMatchObject({ id: rect.id, kind: "rect" });
  });

  it("does nothing when the node is gone from the document (stale draft after undo or remote delete)", () => {
    const { ydoc, undo, act, page, rect } = setup();
    const stale = page();
    undo.undo(); // removes both shapes
    expect(page().nodes).toEqual([]);
    commitEdit(ydoc, stale, rect, editModel(rect)!, act);
    expect(page().nodes).toEqual([]);
    expect(undo.redoStack.length).toBe(1); // redo survives
    undo.redo();
    expect(page().nodes.map((n: CherryNode) => n.kind)).toEqual(["ellipse", "rect"]);
  });

  it("does nothing when the node is no longer the kind it was read as", () => {
    const { ydoc, undo, act, page, rect } = setup();
    commitEdit(ydoc, page(), rect, editModel(rect)!, act); // now a path
    const asPathNode = page().nodes[1]!;
    undo.undo(); // a rect again
    // A stale edit that widens the shape by 5 must not reach the rect.
    commitEdit(ydoc, page(), asPathNode, moveAnchors(editModel(asPathNode)!, [{ sub: 0, i: 0 }], -5, 0), act);
    expect(page().nodes[1]).toMatchObject({ id: rect.id, kind: "rect", x: 10, width: 20 });
  });
});

describe("nested and vanished nodes", () => {
  const nested = () => {
    const t = setup();
    const inner = createShape("rect", { x: 0, y: 0, width: 5, height: 5 });
    const group = { ...createShape("rect", { x: 0, y: 0, width: 5, height: 5 }), kind: "group", name: "G", children: [inner] } as unknown as CherryNode;
    t.act(() => addNode(t.ydoc, t.page().id, group));
    return { ...t, inner, group };
  };

  it("convertToPath and commitEdit leave a node inside a group alone", () => {
    const { ydoc, act, page, inner, group } = nested();
    convertToPath(ydoc, page().id, inner, act);
    commitEdit(ydoc, page(), inner, editModel(inner)!, act);
    const g = page().nodes.find((n) => n.id === group.id)!;
    expect(g.kind === "group" && g.children.map((c) => [c.id, c.kind])).toEqual([[inner.id, "rect"]]);
    expect(page().nodes.map((n) => n.kind)).toEqual(["ellipse", "rect", "group"]);
  });

  it("combine writes nothing and reports when an operand vanished", () => {
    const { ydoc, act, page } = setup();
    const ops = page().nodes;
    removeNodes(ydoc, page().id, [ops[1]!.id]);
    expect(combine(ydoc, page().id, "union", ops, act, () => {})).toBe("These shapes can't be combined.");
    expect(page().nodes.map((n) => n.id)).toEqual([ops[0]!.id]);
  });
});

describe("finishDraft", () => {
  const a = (x: number, y = 0): Anchor => ({ x, y, in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, kind: "corner" });
  const base = [a(0), a(1)];
  const draft = { anchors: [...base, a(2), a(3)], sub: 0, base };
  it("continues an unchanged subpath", () => {
    const m = [{ anchors: [a(0), a(1)], closed: false }];
    expect(finishDraft(m, draft, false)).toEqual({ model: [{ anchors: draft.anchors, closed: false }], sub: 0 });
  });
  it("appends a new subpath when the old one changed, leaving it untouched", () => {
    const m = [{ anchors: [a(0), a(9)], closed: false }];
    expect(finishDraft(m, draft, false)).toEqual({ model: [m[0], { anchors: [a(2), a(3)], closed: false }], sub: 1 });
  });
  it("appends a new subpath when the old one was removed", () => {
    expect(finishDraft([], draft, true)).toEqual({ model: [{ anchors: [a(2), a(3)], closed: true }], sub: 0 });
  });
});
