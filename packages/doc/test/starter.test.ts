import { describe, expect, it } from "vitest";
import { CherryDocument, type CherryNode } from "../src/schema";
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

describe("STARTER_TEMPLATES", () => {
  it("has 4 entries, one per category", () => {
    expect(STARTER_TEMPLATES).toHaveLength(4);
    expect(STARTER_TEMPLATES.map((t) => t.category).sort()).toEqual(["cards", "presentation", "print", "social"]);
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

    it("keeps every node's box within the page (bleed allowed)", () => {
      for (const { n, x, y, p } of all) {
        // Axis-aligned bounds of the box rotated about its centre.
        const a = (n.rotation * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
        const w = n.width * c + n.height * s, h = n.width * s + n.height * c;
        const cx = x + n.width / 2, cy = y + n.height / 2, e = 1e-6;
        expect(cx - w / 2, n.id).toBeGreaterThanOrEqual(-p.bleed - e);
        expect(cy - h / 2, n.id).toBeGreaterThanOrEqual(-p.bleed - e);
        expect(cx + w / 2, n.id).toBeLessThanOrEqual(p.width + p.bleed + e);
        expect(cy + h / 2, n.id).toBeLessThanOrEqual(p.height + p.bleed + e);
      }
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
