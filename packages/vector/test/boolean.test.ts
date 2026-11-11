import { describe, expect, it } from "vitest";
import type { CherryNode } from "@cherry/doc";
import { booleanOp, flatten, parsePath, pathBounds } from "../src/index";

const fillA = { type: "solid" as const, color: "#112233", opacity: 1 };
const fillB = { type: "solid" as const, color: "#445566", opacity: 1 };
const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
const rect = (id: string, x: number, y: number, width: number, height: number, extra = {}): CherryNode =>
  ({ ...base, id, name: id, kind: "rect", x, y, width, height, cornerRadius: 0, fill: fillA, ...extra }) as CherryNode;
const A = rect("a", 0, 0, 100, 100);
const B = rect("b", 50, 50, 100, 100, { fill: fillB });
const box = (n: { x: number; y: number; width: number; height: number }) => ({ x: n.x, y: n.y, width: n.width, height: n.height });

describe("booleanOp", () => {
  it("union of two overlapping rects", () => {
    const r = booleanOp("union", [A, B])!;
    expect(box(r)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
    expect(r.name).toBe("Union");
    expect(r.fill).toEqual(fillA);
    expect(r.fillRule).toBe("nonzero");
  });
  it("subtract is bottom minus the rest", () => {
    const r = booleanOp("subtract", [A, B])!;
    expect(box(r)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(pathBounds(parsePath(r.d))).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
  it("subtract removes the union of all others", () => {
    const r = booleanOp("subtract", [A, rect("c", 0, 0, 100, 50), rect("d", 0, 50, 100, 50)]);
    expect(r).toBeNull();
  });
  it("intersect of disjoint shapes is null", () => {
    expect(booleanOp("intersect", [A, rect("c", 200, 200, 10, 10)])).toBeNull();
  });
  it("exclude uses evenodd", () => {
    const r = booleanOp("exclude", [A, B])!;
    expect(r.fillRule).toBe("evenodd");
    expect(r.name).toBe("Exclude");
  });
  it("rotated operand lands where it was drawn", () => {
    const r = booleanOp("union", [rect("r", 0, 0, 100, 50, { rotation: 90 }), rect("s", 74, 0, 2, 1)])!;
    const b = box(r);
    expect(b.x).toBeCloseTo(25, 6);
    expect(b.y).toBeCloseTo(-25, 6);
    expect(b.width).toBeCloseTo(51, 6);
    expect(b.height).toBeCloseTo(100, 6);
  });
  it("text and lines are ignored", () => {
    const text = { ...base, id: "t", name: "t", kind: "text", x: 0, y: 0, width: 10, height: 10, text: "x", fontFamily: "Inter", fontSize: 12, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left" } as CherryNode;
    const line = { ...base, id: "l", name: "l", kind: "path", x: 0, y: 0, width: 100, height: 0, d: "M0 0 L100 0", fillRule: "nonzero" } as CherryNode;
    expect(booleanOp("union", [A, text])).toBeNull();
    expect(box(booleanOp("union", [A, line, B])!)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
  });
});

describe("flatten", () => {
  it("keeps identity and geometry", () => {
    const e = { ...base, id: "e", name: "Oval", kind: "ellipse", x: 5, y: 6, width: 40, height: 20, rotation: 30, fill: fillA } as CherryNode;
    const p = flatten(e)!;
    expect(p.kind).toBe("path");
    expect([p.id, p.name, p.rotation, p.x, p.y]).toEqual(["e", "Oval", 30, 5, 6]);
    expect(pathBounds(parsePath(p.d))).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });
  it("returns null for non-shapes", () => {
    expect(flatten({ ...base, id: "i", name: "i", kind: "image", x: 0, y: 0, width: 1, height: 1, assetId: "z" } as CherryNode)).toBeNull();
  });
});
