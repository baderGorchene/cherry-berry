import { describe, expect, it } from "vitest";
import { CherryDocument, type CherryNode, type Page } from "../src/schema";
import { contrast } from "../src/brand";
import { FONTS } from "../src/fonts";
import { parseCherry, serializeCherry } from "../src/io";
import { toPx } from "../src/units";
import { STARTER_TEMPLATES } from "../src/starter";

type Text = Extract<CherryNode, { kind: "text" }>;
/** Every node with its absolute origin (group children are placed relative to their group). */
function walk(nodes: CherryNode[], ox = 0, oy = 0): { n: CherryNode; x: number; y: number }[] {
  return nodes.flatMap((n) => [
    { n, x: ox + n.x, y: oy + n.y },
    ...(n.kind === "group" ? walk(n.children, ox + n.x, oy + n.y) : []),
  ]);
}
const families = new Set(FONTS.map((f) => f.family));

/** Axis-aligned bounds of a placed box rotated about its centre. */
function bounds({ n, x, y }: { n: CherryNode; x: number; y: number }) {
  const a = (n.rotation * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = n.width * c + n.height * s, h = n.width * s + n.height * c;
  const cx = x + n.width / 2, cy = y + n.height / 2;
  return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
}

/** `top` at `alpha` composited over `under` (both #RRGGBB). */
function over(top: string, alpha: number, under: string): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(ch(top, i) * alpha + ch(under, i) * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

/**
 * The colour directly behind a text node: the page background with every earlier filled shape whose box contains the
 * text box composited over it. ponytail: box containment, not the shape's outline; the rendered contact sheet covers that.
 */
function behind(p: Page, placed: { n: CherryNode; x: number; y: number }[], i: number): string {
  const t = bounds(placed[i]!), e = 1e-6;
  let color = p.background.color;
  for (const w of placed.slice(0, i)) {
    const fill = w.n.kind === "rect" || w.n.kind === "ellipse" || w.n.kind === "path" ? w.n.fill : undefined;
    const s = bounds(w);
    if (fill && !w.n.hidden && s.l <= t.l + e && s.t <= t.t + e && s.r >= t.r - e && s.b >= t.b - e)
      color = over(fill.color, fill.opacity * w.n.opacity, color);
  }
  return color;
}

/** Size values from apps/web/src/create/sizes.ts (SIZES), copied: @cherry/doc can't import from the web app. */
const SIZES: [number, number, Page["unit"]][] = [
  [1080, 1350, "px"], [1080, 1080, "px"], [1080, 1920, "px"], [1200, 630, "px"], [1640, 624, "px"], [1200, 627, "px"],
  [1600, 900, "px"], [1280, 720, "px"], [1000, 1500, "px"], [1920, 1080, "px"], [1024, 768, "px"],
  [210, 297, "mm"], [297, 210, "mm"], [148, 210, "mm"], [8.5, 11, "in"], [297, 420, "mm"], [18, 24, "in"],
  [85, 55, "mm"], [5, 7, "in"], [6, 4, "in"],
];
/** Brand names (and the editor this must not copy) that no starter's copy may mention. */
const DENY = /canva|instagram|facebook|tiktok|youtube|pinterest|linkedin|twitter|google|apple|spotify|netflix|amazon|nike|starbucks|adobe|figma/i;

describe("STARTER_TEMPLATES", () => {
  it("has at least 16 entries (target 24), ≥ 3 per category, and one category with more than 6", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(16);
    const per = new Map<string, number>();
    for (const t of STARTER_TEMPLATES) per.set(t.category, (per.get(t.category) ?? 0) + 1);
    expect([...per.keys()].sort()).toEqual(["cards", "presentation", "print", "social"]);
    for (const [c, n] of per) expect(n, c).toBeGreaterThanOrEqual(3);
    expect(Math.max(...per.values())).toBeGreaterThan(6); // exercises the Templates page's "See all" (6 per section)
  });

  it("uses only Create-dialog sizes, at least 4 distinct ones", () => {
    const used = new Set<string>();
    for (const t of STARTER_TEMPLATES) for (const p of t.doc.pages) {
      expect(SIZES.some(([w, h, u]) => w === p.width && h === p.height && u === p.unit), `${t.id} ${p.width}×${p.height} ${p.unit}`).toBe(true);
      used.add(`${p.width}×${p.height} ${p.unit}`);
    }
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it("uses at least 8 catalogue fonts across the set", () => {
    const used = new Set(STARTER_TEMPLATES.flatMap((t) => t.doc.pages.flatMap((p) => walk(p.nodes).map((w) => w.n))
      .filter((n): n is Text => n.kind === "text").map((n) => n.fontFamily)));
    expect(used.size).toBeGreaterThanOrEqual(8);
  });

  it("has unique starter-<slug> ids and unique names", () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id), names = STARTER_TEMPLATES.map((t) => t.name);
    for (const id of ids) expect(id).toMatch(/^starter-[a-z0-9-]+$/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  describe.each(STARTER_TEMPLATES.map((t) => [t.id, t] as const))("%s", (_, t) => {
    const all = t.doc.pages.flatMap((p) => walk(p.nodes).map((w) => ({ ...w, p })));
    const texts = all.map((w) => w.n).filter((n): n is Text => n.kind === "text");

    it("is a valid CherryDocument", () => expect(CherryDocument.safeParse(t.doc).success).toBe(true));

    it("has no image nodes", () => expect(all.filter((w) => w.n.kind === "image")).toEqual([]));

    it("uses only catalogue fonts, at least 2 families", () => {
      for (const n of texts) expect(families, n.fontFamily).toContain(n.fontFamily);
      expect(new Set(texts.map((n) => n.fontFamily)).size).toBeGreaterThanOrEqual(2);
    });

    it("uses only weights its font family ships", () => {
      for (const n of texts) expect(FONTS.find((f) => f.family === n.fontFamily)?.weights, n.id).toContain(n.fontWeight);
    });

    it("keeps every node's box within the page (bleed allowed)", () => {
      for (const w of all) {
        const { l, t: top, r, b } = bounds(w), p = w.p, e = 1e-6;
        expect(l, w.n.id).toBeGreaterThanOrEqual(-p.bleed - e);
        expect(top, w.n.id).toBeGreaterThanOrEqual(-p.bleed - e);
        expect(r, w.n.id).toBeLessThanOrEqual(p.width + p.bleed + e);
        expect(b, w.n.id).toBeLessThanOrEqual(p.height + p.bleed + e);
      }
    });

    // Ruling: body text ≥ 4.5:1 against the fill directly behind it; large display text (≥ 24 pt) may use ≥ 3:1.
    it("sets text at ≥ 4.5:1 contrast on what is behind it (≥ 3:1 for display text of 24 pt and up)", () => {
      for (const p of t.doc.pages) {
        const placed = walk(p.nodes);
        placed.forEach(({ n }, i) => {
          if (n.kind !== "text" || !n.fill) return;
          const min = n.fontSize >= 24 ? 3 : 4.5, bg = behind(p, placed, i);
          expect(contrast(n.fill.color, bg), `${n.id} ${n.fill.color} on ${bg}`).toBeGreaterThanOrEqual(min);
        });
      }
    });

    // Ruling: a print page's background must reach the cut, so one shape covers the whole bleed box.
    it("covers the full bleed box with a background shape on every page with bleed", () => {
      for (const p of t.doc.pages) {
        if (p.bleed <= 0) continue;
        const e = 1e-6;
        expect(p.nodes.some((n) => n.kind === "rect" && n.fill && n.rotation === 0 && n.x <= -p.bleed + e && n.y <= -p.bleed + e
          && n.x + n.width >= p.width + p.bleed - e && n.y + n.height >= p.height + p.bleed - e), p.id).toBe(true);
      }
    });

    it("mentions no brand names in its copy", () => {
      for (const n of texts) expect(n.text, n.id).not.toMatch(DENY);
      expect(t.name).not.toMatch(DENY);
    });

    it("prints in CMYK with ≥ 3 mm bleed when print or cards", () => {
      if (t.category !== "print" && t.category !== "cards") return;
      for (const p of t.doc.pages) {
        expect(p.colorMode).toBe("cmyk");
        expect(toPx(p.bleed, p.unit)).toBeGreaterThanOrEqual(toPx(3, "mm") - 1e-9);
      }
    });

    it("round-trips through serializeCherry → parseCherry", () => {
      expect(parseCherry(serializeCherry(t.doc))).toEqual({ ok: true, doc: t.doc });
    });
  });
});
