import { describe, expect, it } from "vitest";
import { PT_PX, UNIT_PX, createDocument, type CherryNode } from "@cherry/doc";
import { presetPair, presetText } from "./textPresets";

type TextNode = Extract<CherryNode, { kind: "text" }>;
const page = (width: number, height: number, unit: "px" | "mm" = "px") =>
  createDocument({ title: "T", width, height, unit, colorMode: "rgb" }).pages[0]!;
/** A rough measure: each character is 0.55 em wide. */
const measure = (text: string, _font: string, size: number) => text.length * size * 0.55;
const rendered = (n: TextNode, unit: "px" | "mm") => (n.fontSize * PT_PX) / UNIT_PX[unit];

describe("presetText", () => {
  it("sizes a heading to 8% of the page height in page units", () => {
    const p = page(1920, 1080);
    const n = presetText("heading", p, { x: 960, y: 540 }, measure) as TextNode;
    expect(rendered(n, "px")).toBeCloseTo(86.4, 0);
    expect(Math.abs(rendered(n, "px") - 86.4)).toBeLessThanOrEqual(1);
    expect(n.fontWeight).toBe(700);
    expect(rendered(presetText("subheading", p, { x: 0, y: 0 }, measure) as TextNode, "px")).toBeCloseTo(48.6, 0);
    expect((presetText("body", p, { x: 0, y: 0 }, measure) as TextNode).fontWeight).toBe(400);
  });

  it("uses the same convention on a mm page", () => {
    const p = page(210, 297, "mm");
    expect(rendered(presetText("heading", p, { x: 105, y: 148 }, measure) as TextNode, "mm")).toBeCloseTo(297 * 0.08, 1);
  });

  it("fits the box to the text and centres it", () => {
    const p = page(1920, 1080);
    const n = presetText("heading", p, { x: 960, y: 540 }, measure);
    expect(n.width).toBeLessThan(1920 * 0.6);
    expect(n.width).toBeGreaterThanOrEqual(measure((n as TextNode).text, "", rendered(n as TextNode, "px")));
    expect(n.x + n.width / 2).toBeCloseTo(960);
    expect(n.y + n.height / 2).toBeCloseTo(540);
  });

  it("keeps a 200-character body text inside the page", () => {
    const p = page(1080, 1350);
    const long = "x".repeat(200);
    const n = presetText("body", p, { x: 540, y: 675 }, measure, { text: long });
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.width).toBeLessThanOrEqual(1080);
    expect(n.y + n.height).toBeLessThanOrEqual(1350);
  });

  it("stays on the page when the click is near an edge", () => {
    const p = page(1080, 1080);
    const n = presetText("heading", p, { x: 1070, y: 5 }, measure);
    expect(n.x + n.width).toBeLessThanOrEqual(1080);
    expect(n.y).toBeGreaterThanOrEqual(0);
  });
});

describe("presetPair", () => {
  it("groups a heading and body text in two fonts, inside the page", () => {
    const p = page(1080, 1080);
    const g = presetPair(p, { x: 540, y: 540 }, measure, { fontFamily: "Playfair Display", fontWeight: 700 }, { fontFamily: "Inter", fontWeight: 400 });
    if (g.kind !== "group") throw new Error("not a group");
    expect(g.children.map((c) => (c as TextNode).fontFamily)).toEqual(["Playfair Display", "Inter"]);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThanOrEqual(1080);
    for (const c of g.children) expect(c.x + c.width).toBeLessThanOrEqual(g.width + 1e-9);
    expect(g.x + g.width / 2).toBeCloseTo(540);
  });
});
