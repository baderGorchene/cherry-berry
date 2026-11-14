import { describe, expect, it } from "vitest";
import {
  CherryNode, brandIssues, brandLockViolation, colorBadge, contrast, createDocument, defaultKitContent,
  parseKitFile, serializeKitFile, type BrandKitContent, type CherryDocument,
} from "../src/index";

const common = { rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
const rect = (id: string, o: object = {}) =>
  ({ ...common, id, name: id, kind: "rect", x: 0, y: 0, width: 10, height: 10, cornerRadius: 0, ...o }) as CherryNode;
const text = (id: string, color: string, o: object = {}) =>
  ({
    ...common, id, name: id, kind: "text", x: 0, y: 0, width: 50, height: 20, text: "hi", fontFamily: "Inter",
    fontSize: 12, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left",
    fill: { type: "solid", color, opacity: 1 }, ...o,
  }) as CherryNode;
const image = (id: string, o: object = {}) =>
  ({ ...common, id, name: id, kind: "image", x: 0, y: 0, width: 10, height: 10, assetId: "a1", ...o }) as CherryNode;
const group = (id: string, children: CherryNode[], o: object = {}) =>
  ({ ...common, id, name: id, kind: "group", x: 0, y: 0, width: 10, height: 10, children, ...o }) as CherryNode;
const docOf = (...nodes: CherryNode[]): CherryDocument => {
  const d = createDocument({ title: "T", width: 100, height: 100, unit: "px", colorMode: "rgb" });
  d.pages[0]!.id = "p1";
  d.pages[0]!.nodes = nodes;
  return d;
};
const kit = (over: Partial<BrandKitContent["rules"]> = {}, colors: string[] = []): BrandKitContent => {
  const k = defaultKitContent();
  k.colors = colors.map((hex, i) => ({ id: `c${i}`, name: `C${i}`, role: "primary" as const, hex }));
  Object.assign(k.rules, over);
  return k;
};
const page = (...nodes: CherryNode[]) => docOf(...nodes).pages[0]!;
const kinds = (p: ReturnType<typeof page>, k: BrandKitContent) => brandIssues(p, k).map((i) => `${i.nodeId}:${i.kind}`);

describe("brand", () => {
  it("rates colors against white", () => {
    expect(contrast("#8E1EA2", "#FFFFFF")).toBeCloseTo(7.3, 1);
    expect(colorBadge("#8E1EA2")).toBe("AAA text");
    expect(colorBadge("#C654C3")).toBe("Large text only");
    expect(colorBadge("#FFC0DE")).toBe("Background only");
    expect(colorBadge("#22142A")).toBe("AAA text");
  });

  it("old documents get brandLock none", () => {
    const { brandLock: _b, ...old } = rect("r") as CherryNode & { brandLock: string };
    expect(CherryNode.parse(old).brandLock).toBe("none");
  });

  it("flags low-contrast text, honouring large text and opacity", () => {
    expect(kinds(page(text("t", "#ED96D7")), kit())).toEqual(["t:low_contrast"]);
    expect(kinds(page(text("t", "#C654C3", { fontSize: 24 })), kit())).toEqual([]);
    expect(kinds(page(text("t", "#8E1EA2", { opacity: 0.3 })), kit())).toEqual(["t:low_contrast"]);
    expect(kinds(page(text("t", "#ED96D7")), kit({ flagContrast: false }))).toEqual([]);
  });

  it("flags off-kit colors and off-brand fonts only when their rule is on", () => {
    const p = page(rect("r", { fill: { type: "solid", color: "#123456", opacity: 1 } }), text("t", "#22142A", { fontFamily: "Comic" }));
    expect(kinds(p, kit({}, ["#22142a"]))).toEqual(["r:off_kit_color", "t:off_brand_font"]);
    expect(kinds(p, kit({ kitColorsOnly: false, warnOffBrandFonts: false }, ["#22142a"]))).toEqual([]);
    const ok = page(rect("r", { stroke: { paint: { type: "solid", color: "#22142A", opacity: 1 }, width: 1 } }));
    expect(kinds(ok, kit({}, ["#22142a"]))).toEqual([]);
  });

  it("skips the color check for a kit with no colors", () => {
    expect(kinds(page(rect("r", { fill: { type: "solid", color: "#123456", opacity: 1 } })), kit())).toEqual([]);
  });

  it("finds issues inside groups", () => {
    expect(kinds(page(group("g", [text("t", "#ED96D7")])), kit())).toEqual(["t:low_contrast"]);
  });

  it("lets content-locked text and images change content but nothing else", () => {
    const before = docOf(text("t", "#000000", { brandLock: "content" }), image("i", { brandLock: "content" }));
    const edit = (id: string, o: object) =>
      docOf(...before.pages[0]!.nodes.map((n) => (n.id === id ? ({ ...n, ...o } as CherryNode) : n)));
    expect(brandLockViolation(before, edit("t", { text: "new", name: "n" }))).toBe(false);
    expect(brandLockViolation(before, edit("t", { x: 5 }))).toBe(true);
    expect(brandLockViolation(before, edit("t", { fill: { type: "solid", color: "#111111", opacity: 1 } }))).toBe(true);
    expect(brandLockViolation(before, edit("i", { assetId: "a2" }))).toBe(false);
    expect(brandLockViolation(before, edit("i", { width: 99 }))).toBe(true);
  });

  it("blocks any change, removal or unlock of a fixed node, at any depth", () => {
    const fixed = rect("f", { brandLock: "fixed" });
    const before = docOf(fixed, group("g", [rect("c", { brandLock: "fixed" })]));
    expect(brandLockViolation(before, before)).toBe(false);
    expect(brandLockViolation(before, docOf({ ...fixed, x: 1 } as CherryNode, group("g", [rect("c", { brandLock: "fixed" })])))).toBe(true);
    expect(brandLockViolation(before, docOf(group("g", [rect("c", { brandLock: "fixed" })])))).toBe(true);
    expect(brandLockViolation(before, docOf({ ...fixed, brandLock: "none" as const } as CherryNode, group("g", [rect("c", { brandLock: "fixed" })])))).toBe(true);
    expect(brandLockViolation(before, docOf(fixed, group("g", [rect("c", { brandLock: "fixed", x: 3 })])))).toBe(true);
  });

  it("blocks structural bypasses and new locks", () => {
    const f = rect("f", { brandLock: "fixed" });
    const before = docOf(f, group("g", [rect("c", { brandLock: "fixed" })]));
    const twoPages = (p1: CherryNode[], p2: CherryNode[]) => {
      const d = docOf(...p1);
      d.pages.push({ ...structuredClone(d.pages[0]!), id: "p2", nodes: p2 });
      return d;
    };
    const cases: [string, CherryDocument, CherryDocument][] = [
      ["wrap in a moved group", before, docOf(group("w", [f], { x: 40 }), group("g", [rect("c", { brandLock: "fixed" })]))],
      ["wrap in a hidden group", before, docOf(group("w", [f], { hidden: true }), group("g", [rect("c", { brandLock: "fixed" })]))],
      ["cross-page move", before, (() => { const d = twoPages([f], []); d.pages[0]!.nodes = [group("g", [rect("c", { brandLock: "fixed" })])]; d.pages[1]!.nodes = [f]; return d; })()],
      ["ancestor group moved", before, docOf(f, group("g", [rect("c", { brandLock: "fixed" })], { x: 7 }))],
      ["lock raised none to fixed", docOf(rect("u")), docOf(rect("u", { brandLock: "fixed" }))],
      ["lock raised to content", docOf(text("t", "#000000")), docOf(text("t", "#000000", { brandLock: "content" }))],
      ["new node created locked", docOf(rect("u")), docOf(rect("u"), rect("n", { brandLock: "fixed" }))],
    ];
    for (const [name, b, a] of cases) expect(brandLockViolation(b, a), name).toBe(true);
    // Moving an unlocked sibling and adding unlocked nodes stay fine.
    expect(brandLockViolation(before, docOf(f, group("g", [rect("c", { brandLock: "fixed" }), rect("n")]), rect("m")))).toBe(false);
  });

  it("ignores unlocked nodes and z-order", () => {
    const f = rect("f", { brandLock: "fixed" });
    const before = docOf(f, rect("u"));
    expect(brandLockViolation(before, docOf(rect("u", { x: 9 }), f))).toBe(false);
    expect(brandLockViolation(before, docOf(f))).toBe(false);
  });

  it("round-trips a kit file and rejects junk", () => {
    const c = kit({}, ["#22142A"]);
    const r = parseKitFile(serializeKitFile("Acme", c));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("Acme");
    expect(r.content).toEqual(c);
    expect(Object.values(r.content.logos).every((l) => l === null)).toBe(true);
    expect(parseKitFile("{}").ok).toBe(false);
    expect(parseKitFile("nope").ok).toBe(false);
  });
});
