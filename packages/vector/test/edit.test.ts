import { describe, expect, it } from "vitest";
import type { CherryNode } from "@cherry/doc";
import {
  hitSegment, insertAnchor, moveAnchors, moveHandle, nodeToPath, normalizeEdit, parsePath, pathBounds,
  removeAnchors, setAnchorKind, setClosed, type PathModel, type PathNode,
} from "../src/index";

const circle = () => parsePath("M0 0 C0 -5 10 -5 10 0 C10 5 0 5 0 0 Z");
const smooth = (): PathModel => [{
  closed: false,
  anchors: [
    { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, kind: "corner" },
    { x: 10, y: 0, in: { x: -3, y: 0 }, out: { x: 6, y: 0 }, kind: "smooth" },
    { x: 20, y: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, kind: "corner" },
  ],
}];

describe("handles", () => {
  it("symmetric handle mirrors", () => {
    const m = circle();
    const before = JSON.stringify(m);
    const a = moveHandle(m, { sub: 0, i: 1 }, "out", { x: 0, y: 8 }, false)[0]!.anchors[1]!;
    expect(a.out).toEqual({ x: 0, y: 8 });
    expect(a.in.x).toBeCloseTo(0, 9);
    expect(a.in.y).toBeCloseTo(-8, 9);
    expect(JSON.stringify(m)).toBe(before);
  });
  it("smooth keeps the other length", () => {
    const a = moveHandle(smooth(), { sub: 0, i: 1 }, "out", { x: 0, y: 6 }, false)[0]!.anchors[1]!;
    expect(a.in.x).toBeCloseTo(0, 9);
    expect(a.in.y).toBeCloseTo(-3, 9);
    expect(a.kind).toBe("smooth");
  });
  it("alt breaks symmetry", () => {
    const a = moveHandle(smooth(), { sub: 0, i: 1 }, "out", { x: 0, y: 6 }, true)[0]!.anchors[1]!;
    expect(a.in).toEqual({ x: -3, y: 0 });
    expect(a.out).toEqual({ x: 0, y: 6 });
    expect(a.kind).toBe("corner");
  });
});

describe("anchor kinds", () => {
  const square = () => parsePath("M0 0 L10 0 L10 10 L0 10 Z");
  it("corner zeroes both handles", () => {
    const a = setAnchorKind(circle(), { sub: 0, i: 1 }, "corner")[0]!.anchors[1]!;
    expect(a).toMatchObject({ in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, kind: "corner" });
  });
  it("smooth from a corner runs along the bisector, a third of each neighbour distance", () => {
    // anchor 1 = (10,0); prev (0,0) at distance 10, next (10,10) at distance 10
    const a = setAnchorKind(square(), { sub: 0, i: 1 }, "smooth")[0]!.anchors[1]!;
    const k = 10 / 3 / Math.SQRT2;
    expect(a.kind).toBe("smooth");
    expect(a.out.x).toBeCloseTo(k, 9);
    expect(a.out.y).toBeCloseTo(k, 9);
    expect(a.in.x).toBeCloseTo(-k, 9);
    expect(a.in.y).toBeCloseTo(-k, 9);
  });
  it("symmetric from smooth averages the lengths", () => {
    const a = setAnchorKind(smooth(), { sub: 0, i: 1 }, "symmetric")[0]!.anchors[1]!;
    expect(a.in.x).toBeCloseTo(-4.5, 9);
    expect(a.out.x).toBeCloseTo(4.5, 9);
    expect(a.kind).toBe("symmetric");
  });
});

describe("anchors", () => {
  it("moveAnchors moves handles with their anchors", () => {
    const a = moveAnchors(circle(), [{ sub: 0, i: 1 }], 5, 1)[0]!.anchors[1]!;
    expect(a).toMatchObject({ x: 15, y: 1, in: { x: 0, y: -5 }, out: { x: 0, y: 5 } });
  });
  it("insertAnchor keeps the shape", () => {
    const m = circle();
    const { model, ref } = insertAnchor(m, 0, 0, 0.5);
    expect(ref).toEqual({ sub: 0, i: 1 });
    expect(model[0]!.anchors).toHaveLength(m[0]!.anchors.length + 1);
    const b0 = pathBounds(m), b1 = pathBounds(model);
    for (const k of ["x", "y", "width", "height"] as const) expect(b1[k]).toBeCloseTo(b0[k], 6);
  });
  it("insertAnchor demotes shortened symmetric neighbours to smooth", () => {
    const { model } = insertAnchor(circle(), 0, 0, 0.5);
    expect(model[0]!.anchors[0]!.kind).toBe("smooth");
    expect(model[0]!.anchors[2]!.kind).toBe("smooth");
  });
  it("removeAnchors to nothing", () => {
    expect(removeAnchors(parsePath("M0 0 L10 0"), [{ sub: 0, i: 0 }, { sub: 0, i: 1 }])).toEqual([]);
  });
  it("setClosed", () => {
    expect(setClosed(parsePath("M0 0 L10 0 L10 10"), 0, true)[0]!.closed).toBe(true);
  });
  it("hitSegment", () => {
    const m = parsePath("M0 0 L100 0");
    const hit = hitSegment(m, { x: 50, y: 3 }, 4)!;
    expect(hit).toMatchObject({ sub: 0, segment: 0 });
    expect(hit.t).toBeCloseTo(0.5, 6);
    expect(hitSegment(m, { x: 50, y: 10 }, 4)).toBeNull();
  });
});

describe("normalizeEdit", () => {
  it("keeps untouched points on the page (rotated)", () => {
    const node = {
      id: "p", name: "p", kind: "path", x: 10, y: 20, width: 100, height: 100, rotation: 30,
      opacity: 1, locked: false, hidden: false, d: "M0 0 L100 0 L100 100 L0 100 Z", fillRule: "nonzero",
    } as PathNode;
    // Node transform: rotate clockwise (y-down) about the box centre, then place at x,y.
    const toPage = (n: PathNode) => {
      const a = parsePath(n.d)[0]!.anchors[2]!;
      const r = (n.rotation * Math.PI) / 180, vx = a.x - n.width / 2, vy = a.y - n.height / 2;
      return { x: n.x + n.width / 2 + vx * Math.cos(r) - vy * Math.sin(r), y: n.y + n.height / 2 + vx * Math.sin(r) + vy * Math.cos(r) };
    };
    // Same rotation sense as nodeToPath(n, "page") (which rounds to 4 decimals).
    const viaNodeToPath = (n: CherryNode) => parsePath(nodeToPath(n, "page")!.d)[0]!.anchors[2]!;
    const before = toPage(node);
    expect(viaNodeToPath(node).x).toBeCloseTo(before.x, 3);
    expect(viaNodeToPath(node).y).toBeCloseTo(before.y, 3);
    const out = normalizeEdit(node, moveAnchors(parsePath(node.d), [{ sub: 0, i: 0 }], -20, -20));
    const edited = { ...node, ...out };
    const after = toPage(edited);
    expect(viaNodeToPath(edited).x).toBeCloseTo(after.x, 3);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(out.width).toBeCloseTo(120, 9);
    expect(out.height).toBeCloseTo(120, 9);
    const b = pathBounds(parsePath(out.d));
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });
  it("returned d's bounds are exactly 0 0 width height (curved, rotated)", () => {
    const node = {
      id: "p", name: "p", kind: "path", x: 3.3, y: 7.7, width: 10, height: 10, rotation: 17,
      opacity: 1, locked: false, hidden: false, d: "M0 0 C3.3333 -1.7 7.1111 1.3 10 0 L10 10 Z", fillRule: "nonzero",
    } as PathNode;
    let m = moveHandle(parsePath(node.d), { sub: 0, i: 0 }, "out", { x: 1.23456789, y: -7.3456789 }, true);
    m = moveAnchors(m, [{ sub: 0, i: 1 }], 0.123456789, 0.987654321);
    const out = normalizeEdit(node, m);
    const b = pathBounds(parsePath(out.d));
    expect({ width: b.width, height: b.height }).toEqual({ width: out.width, height: out.height });
    // The interior curve extreme is off the 4-decimal grid, so 0 holds only to rounding.
    expect(Math.abs(b.x)).toBeLessThan(5e-5);
    expect(Math.abs(b.y)).toBeLessThan(5e-5);
  });
});
