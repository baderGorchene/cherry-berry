import { describe, expect, it } from "vitest";
import type { Page } from "@cherry/doc";
import type { Shape } from "../api";
import { readSvg, shapeNode, thumbBox } from "./ShapesPanel";

const page = { width: 400, height: 200 } as Page;
const shape = (o: Partial<Shape>): Shape => ({
  id: "s", name: "S", tags: [], visibility: "private", workspaceId: null, d: "M0 0 L20 0 L20 10 L0 10 Z",
  width: 20, height: 10, fillRule: "nonzero", fill: null, stroke: null, createdBy: "u", createdAt: "", mine: true, ...o,
});
const stroke = { paint: { type: "solid" as const, color: "#112233", opacity: 1 }, width: 2 };

describe("shapeNode", () => {
  it("stroke-only has no fill", () => {
    const n = shapeNode(shape({ stroke }), page);
    expect("fill" in n && n.fill).toBeFalsy();
    expect(n.kind === "path" && n.stroke?.width).toBe(5);
  });
  it("neither fill nor stroke gets the default fill", () => {
    const n = shapeNode(shape({}), page);
    expect(n.kind === "path" && n.fill?.color).toBe("#8E1EA2");
    expect(n.kind === "path" && n.stroke).toBeUndefined();
  });
  it("scales the longer side to 25% of the shorter page side and centres", () => {
    const n = shapeNode(shape({}), page); // factor 50/20 = 2.5
    expect([n.width, n.height, n.x, n.y]).toEqual([50, 25, 175, 87.5]);
  });
});

describe("thumbBox", () => {
  it("pads a zero-height line", () => {
    const [, y, w, h] = thumbBox(shape({ width: 20, height: 0 })).split(" ").map(Number);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(y! + h! / 2).toBe(0);
  });
});

describe("readSvg", () => {
  it("refuses an oversized file without reading it", async () => {
    const file = { size: 2_000_000, text: () => { throw new Error("read"); } } as unknown as File;
    expect(await readSvg(file)).toEqual({ error: "That file is too large (1 MB max)." });
  });
});
