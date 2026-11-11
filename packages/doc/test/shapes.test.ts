import { describe, expect, it } from "vitest";
import { CherryNode } from "../src/schema";
import { createShape, createText, type BasicShape } from "../src/shapes";
import { fromPx, toPx } from "../src/units";

const kinds: BasicShape[] = ["rect", "ellipse", "triangle", "line", "star", "arrow"];
const box = { x: 1, y: 2, width: 100, height: 50 };

describe("shapes", () => {
  it("unit conversions", () => {
    expect(toPx(25.4, "mm")).toBe(96);
    expect(fromPx(96, "in")).toBe(1);
  });
  it("every basic shape validates", () => {
    for (const k of kinds) {
      const n = createShape(k, box);
      expect(CherryNode.safeParse(n).success).toBe(true);
      if (n.kind === "path") expect(n.d).not.toMatch(/[a-z]/);
    }
  });
  it("star has 10 points", () => {
    const n = createShape("star", box);
    if (n.kind !== "path") throw new Error("not path");
    expect(n.d.match(/M/g)).toHaveLength(1);
    expect(n.d.match(/L/g)).toHaveLength(9);
    expect(n.d.match(/Z/g)).toHaveLength(1);
  });
  it("line is a flat stroked path", () => {
    const n = createShape("line", box);
    expect(n).toMatchObject({ kind: "path", d: "M0 0 L100 0", height: 0, stroke: { width: 1 } });
    expect((n as { fill?: unknown }).fill).toBeUndefined();
  });
  it("text defaults", () => {
    const n = createText({ x: 5, y: 5 }, 300);
    expect(CherryNode.safeParse(n).success).toBe(true);
    expect(n).toMatchObject({
      kind: "text", name: "Text", text: "Add your text", fontFamily: "Inter", fontSize: 32,
      fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left", x: 5, y: 5, width: 300, height: 0,
      fill: { type: "solid", color: "#22142A", opacity: 1 },
    });
  });
});
