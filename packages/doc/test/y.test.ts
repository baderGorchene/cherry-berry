import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { docToY, yToDoc } from "../src/y";
import type { CherryDocument } from "../src/schema";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
const red = { type: "solid" as const, color: "#FF0000", opacity: 1 };
const doc: CherryDocument = {
  format: "cherry", version: 1, id: "d1", title: "T", createdAt: "2026-01-01T00:00:00.000Z",
  pages: [{
    id: "p1", name: "Page 1", width: 100, height: 200, unit: "px", colorMode: "rgb", bleed: 0,
    background: { type: "solid", color: "#FFFFFF", opacity: 1 },
    nodes: [
      { ...base, id: "r", name: "r", kind: "rect", x: 1, y: 2, width: 3, height: 4, fill: red, stroke: { paint: red, width: 2 }, cornerRadius: 0 },
      { ...base, id: "t", name: "t", kind: "text", x: 0, y: 0, width: 10, height: 10, text: "hi", fontFamily: "Inter", fontSize: 12, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left", fill: red },
      { ...base, id: "g1", name: "g1", kind: "group", x: 0, y: 0, width: 5, height: 5, children: [
        { ...base, id: "g2", name: "g2", kind: "group", x: 0, y: 0, width: 5, height: 5, children: [
          { ...base, id: "e", name: "e", kind: "ellipse", x: 0, y: 0, width: 5, height: 5 },
        ] },
      ] },
    ],
  }],
};

describe("yjs binding", () => {
  it("roundtrips a document through Yjs", () => {
    expect(yToDoc(docToY(doc))).toEqual({ ok: true, doc });
  });
  it("survives encode/decode", () => {
    const y2 = new Y.Doc();
    Y.applyUpdate(y2, Y.encodeStateAsUpdate(docToY(doc)));
    expect(yToDoc(y2)).toEqual({ ok: true, doc });
  });
  it("reports invalid content", () => {
    const y = docToY(doc);
    y.getArray("pages").delete(0, 1);
    expect(yToDoc(y)).toMatchObject({ ok: false, error: "invalid_document" });
  });
  it("empty Y.Doc is invalid, not a throw", () => {
    expect(yToDoc(new Y.Doc()).ok).toBe(false);
  });
});
