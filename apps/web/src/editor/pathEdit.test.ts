import { describe, expect, it } from "vitest";
import {
  addNode, createDocument, createShape, createUndoManager, docToY, yToDoc, type CherryNode,
} from "@cherry/doc";
import { moveAnchors } from "@cherry/vector";
import { commitEdit, editModel } from "./pathEdit";

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
