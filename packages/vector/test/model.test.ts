import { describe, expect, it } from "vitest";
import type { CherryNode } from "@cherry/doc";
import { InvalidPath, nodeToPath, parsePath, pathBounds, scalePath, scope, toPathData } from "../src/index";

const base = { id: "n", name: "n", x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, locked: false, hidden: false };
const rect = (o: object = {}) => ({ ...base, kind: "rect", cornerRadius: 0, ...o }) as CherryNode;

describe("path model", () => {
  it("parses and re-serializes absolute data", () => {
    expect(toPathData(parsePath("M0 0 L10 0 L10 10 Z"))).toBe("M0 0 L10 0 L10 10 L0 0 Z");
  });
  it("reads relative, H/V, S/Q/A and exponents", () => {
    expect(pathBounds(parsePath("m0 0 h10 v1e1 h-10 z"))).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(() => parsePath("M0 0 A5 5 0 0 1 10 0")).not.toThrow();
    expect(() => parsePath("M0 0 S5 5 10 0 Q15 5 20 0 T30 0")).not.toThrow();
  });
  it("derives anchor kinds", () => {
    expect(parsePath("M0 0 C0 -5 10 -5 10 0 C10 5 0 5 0 0 Z")[0]!.anchors[1]!.kind).toBe("symmetric");
    expect(parsePath("M0 0 L10 0")[0]!.anchors[0]!.kind).toBe("corner");
  });
  it("rejects garbage", () => {
    for (const d of ["", "hello", "M0 0 L NaN 1", "M0 0 L1 1".padEnd(100_001, " ")]) {
      expect(() => parsePath(d), d.slice(0, 20)).toThrow(InvalidPath);
    }
  });
  it("scalePath (moved from doc)", () => {
    expect(scalePath("M0 0 L10 20 C1 2 3 4 5 6 Z", 2, 3)).toBe("M0 0 L20 60 C2 6 6 12 10 18 L0 0 Z");
    expect(scalePath("m0 0 l1 1", 2, 2)).toBe("M0 0 L2 2");
  });
  it("rect to path honours corner radius", () => {
    const d = nodeToPath(rect({ cornerRadius: 10 }), "local")!.d;
    expect(pathBounds(parsePath(d))).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(d).toContain("C");
  });
  it("pill rect has no coincident consecutive anchors", () => {
    const d = nodeToPath(rect({ cornerRadius: 25 }), "local")!.d;
    expect(pathBounds(parsePath(d))).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    for (const { anchors, closed } of parsePath(d)) {
      const n = anchors.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = anchors[i]!, b = anchors[(i + 1) % n]!;
        expect(Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9, `anchors ${i},${(i + 1) % n}`).toBe(true);
      }
    }
  });
  it("page space applies rotation", () => {
    const b = pathBounds(parsePath(nodeToPath(rect({ rotation: 90 }), "page")!.d));
    expect(b.x).toBeCloseTo(25, 6);
    expect(b.y).toBeCloseTo(-25, 6);
    expect(b.width).toBeCloseTo(50, 6);
    expect(b.height).toBeCloseTo(100, 6);
  });
  it("text gives null", () => {
    const text = { ...base, kind: "text", text: "a", fontFamily: "Inter", fontSize: 12, fontWeight: 400, lineHeight: 1, letterSpacing: 0, align: "left" } as CherryNode;
    expect(nodeToPath(text, "local")).toBeNull();
  });
  it("never inserts items into the shared project", () => {
    nodeToPath(rect({ cornerRadius: 5, rotation: 30 }), "page");
    scalePath("M0 0 L1 1", 2, 2);
    expect(scope().project.activeLayer.children).toHaveLength(0);
  });
});
