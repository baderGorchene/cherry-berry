import { describe, expect, test } from "vitest";
import { createDocument, createShape, createText, docToY, updateNode, yToDoc, type CherryNode } from "@cherry/doc";
import { scalePath } from "@cherry/vector";
import { allIds, fitZoom, fromKonvaTransform, toKonvaAttrs } from "./geometry";

const rect = { ...createShape("rect", { x: 10, y: 20, width: 100, height: 50 }), rotation: 30 } as CherryNode;

describe("geometry", () => {
  test("center-based attrs", () => {
    expect(toKonvaAttrs(rect)).toEqual({ x: 60, y: 45, offsetX: 50, offsetY: 25, rotation: 30 });
  });

  test("resize keeps the center math", () => {
    expect(fromKonvaTransform(rect, { x: 60, y: 45, rotation: 30, scaleX: 2, scaleY: 1 }))
      .toEqual({ x: -40, y: 20, width: 200, height: 50, rotation: 30 });
  });

  test("normalizes rotation", () => {
    expect(fromKonvaTransform(rect, { x: 60, y: 45, rotation: -90, scaleX: 1, scaleY: 1 }).rotation).toBe(270);
    expect(fromKonvaTransform(rect, { x: 60, y: 45, rotation: 360, scaleX: 1, scaleY: 1 }).rotation).toBe(0);
  });

  test("scales path data on resize", () => {
    const star = createShape("star", { x: 0, y: 0, width: 100, height: 100 });
    const out = fromKonvaTransform(star, { x: 50, y: 50, rotation: 0, scaleX: 2, scaleY: 0.5 });
    expect(out).toMatchObject({ width: 200, height: 50, x: -50, y: 25 });
    expect((out as { d: string }).d).toBe(scalePath((star as { d: string }).d, 2, 0.5));
  });

  test("text resize changes width only", () => {
    const text = { ...createText({ x: 0, y: 0 }, 200), height: 40 } as CherryNode;
    const out = fromKonvaTransform(text, { x: 100, y: 20, rotation: 0, scaleX: 1.5, scaleY: 1.5 });
    expect(out).toEqual({ x: -50, y: 0, width: 300, height: 40, rotation: 0 });
  });

  test("line keeps height 0", () => {
    const line = createShape("line", { x: 0, y: 0, width: 100, height: 100 });
    expect(fromKonvaTransform(line, { x: 50, y: 0, rotation: 0, scaleX: 2, scaleY: 3 }).height).toBe(0);
  });

  test("fit zoom", () => {
    expect(fitZoom({ width: 1080, height: 1080, unit: "px" }, { width: 1000, height: 800 })).toBeCloseTo((800 - 96) / 1080);
    // Bleed widens the page on both sides; mm pages are converted to px.
    expect(fitZoom({ width: 100, height: 100, unit: "mm", bleed: 5 }, { width: 1000, height: 1000 }))
      .toBeCloseTo((1000 - 96) / (110 * 96 / 25.4));
  });
});

describe("allIds", () => {
  test("includes group children", () => {
    const a = createShape("rect", { x: 0, y: 0, width: 1, height: 1 }), b = createShape("rect", { x: 0, y: 0, width: 1, height: 1 });
    const g = { ...createShape("rect", { x: 0, y: 0, width: 1, height: 1 }), kind: "group", children: [b] } as unknown as CherryNode;
    expect(allIds([a, g])).toEqual([a.id, g.id, b.id]);
  });

  test("fromKonvaTransform scales group children proportionally and persists through updateNode", () => {
    const r = createShape("rect", { x: 10, y: 20, width: 30, height: 40 });
    const g = {
      ...createShape("rect", { x: 100, y: 200, width: 50, height: 60 }),
      kind: "group",
      children: [r],
    } as unknown as CherryNode;
    const doc = createDocument({ title: "G", width: 800, height: 600, unit: "px", colorMode: "rgb" });
    doc.pages[0]!.nodes.push(g);
    const ydoc = docToY(doc);
    const patch = fromKonvaTransform(g, { x: 150, y: 260, rotation: 0, scaleX: 2, scaleY: 2 });
    updateNode(ydoc, doc.pages[0]!.id, g.id, patch);
    const parsed = yToDoc(ydoc);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const updated = parsed.doc.pages[0]!.nodes[0]!;
    expect(updated.width).toBe(100);
    expect(updated.height).toBe(120);
    expect(updated.kind === "group" && updated.children[0]).toMatchObject({ x: 20, y: 40, width: 60, height: 80 });
  });
});
