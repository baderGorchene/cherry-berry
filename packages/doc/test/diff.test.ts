import { describe, expect, it } from "vitest";
import { createDocument } from "../src/create";
import { diffDocs, summarizeDiff } from "../src/diff";
import type { CherryDocument, CherryNode } from "../src/schema";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
const rect = (id: string, x = 0): CherryNode =>
  ({ ...base, id, name: id.toUpperCase(), kind: "rect", x, y: 0, width: 10, height: 10, cornerRadius: 0 }) as CherryNode;
const group = (id: string, children: CherryNode[]): CherryNode =>
  ({ ...base, id, name: "Group", kind: "group", x: 0, y: 0, width: 10, height: 10, children }) as CherryNode;
const text = (id: string): CherryNode => ({ ...rect(id), kind: "text" } as unknown as CherryNode);
const mk = (...nodes: CherryNode[]): CherryDocument => {
  const d = createDocument({ title: "T", width: 100, height: 200, unit: "px", colorMode: "rgb" });
  d.pages[0]!.id = "p1"; // same page across docs, so only layers differ
  d.pages[0]!.nodes = nodes;
  return d;
};
const clone = (d: CherryDocument) => structuredClone(d);

describe("diffDocs", () => {
  it("finds added, removed and changed nodes", () => {
    const a = mk(rect("a"), rect("b"), text("t"));
    const b = clone(a);
    b.pages[0]!.nodes = [rect("a", 50), rect("b"), rect("e")];
    expect(diffDocs(a, b)).toEqual({ added: ["e"], removed: ["t"], changed: ["a"] });
  });

  it("moving a node into a group or to another page is a change", () => {
    const a = mk(rect("a"), group("g", []), rect("b"));
    const b = clone(a);
    b.pages[0]!.nodes = [group("g", [rect("a")]), rect("b")];
    expect(diffDocs(a, b)).toEqual({ added: [], removed: [], changed: ["a"] });
    const c = clone(a);
    const p2 = { ...clone(a).pages[0]!, id: "p2", nodes: [rect("b")] };
    c.pages[0]!.nodes = [rect("a"), group("g", [])];
    c.pages.push(p2);
    expect(diffDocs(a, c).changed).toEqual(["b"]);
  });

  it("page resize is reported as a page change", () => {
    const a = mk(rect("a"));
    const b = clone(a);
    b.pages[0]!.width = 500;
    expect(diffDocs(a, b)).toEqual({ added: [], removed: [], changed: [a.pages[0]!.id] });
  });
});

describe("summarizeDiff", () => {
  it("names layers and caps at three", () => {
    const a = mk();
    const b = mk(...["a", "b", "c", "d", "e"].map((i) => rect(i)));
    expect(summarizeDiff(diffDocs(a, b), a, b)).toBe("Added A, B, C and 2 more");
  });

  it("joins groups and uses the old name for removed layers", () => {
    const a = mk(rect("x"), rect("y"));
    const b = mk(rect("y", 9), rect("z"));
    expect(summarizeDiff(diffDocs(a, b), a, b)).toBe("Added Z; changed Y; removed X");
  });

  it('identical documents summarize as "No changes"', () => {
    const a = mk(rect("a"));
    expect(summarizeDiff(diffDocs(a, clone(a)), a, a)).toBe("No changes");
  });
});
