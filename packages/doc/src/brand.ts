import { z } from "zod";
import type { CherryDocument, CherryNode, Page } from "./schema";

export const ColorRole = z.enum(["primary", "secondary", "accent", "highlight", "surface", "text", "other"]);
export const KitColor = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(40),
  role: ColorRole,
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export const TextStyle = z.object({
  fontFamily: z.string().trim().min(1).max(60),
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().positive().max(500), // pt
  lineHeight: z.number().min(0.5).max(4),
});
const Logo = z.string().nullable();
const Typography = z.object({ heading: TextStyle, subheading: TextStyle, body: TextStyle });
const Rules = z.object({
  kitColorsOnly: z.boolean(), warnOffBrandFonts: z.boolean(), lockLogos: z.boolean(),
  flagContrast: z.boolean(), requireApproval: z.boolean(),
});
export const BrandKitContent = z.object({
  colors: z.array(KitColor).max(40),
  typography: Typography,
  logos: z.object({ primary: Logo, onDark: Logo, mark: Logo, wordmark: Logo }),
  rules: Rules,
});
export type BrandKitContent = z.infer<typeof BrandKitContent>;

export const defaultKitContent = (): BrandKitContent => ({
  colors: [],
  typography: {
    heading: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 32, lineHeight: 1.1 },
    subheading: { fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 20, lineHeight: 1.2 },
    body: { fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: 1.5 },
  },
  logos: { primary: null, onDark: null, mark: null, wordmark: null },
  rules: { kitColorsOnly: true, warnOffBrandFonts: true, lockLogos: true, flagContrast: true, requireApproval: false },
});

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const [R, G, B] = [r, g, b].map((v) => { const c = (v ?? 0) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

export const contrast = (a: string, b: string): number => ratio(rgb(a), rgb(b));

export function colorBadge(hex: string): "AAA text" | "AA text" | "Large text only" | "Background only" {
  const r = contrast(hex, "#FFFFFF");
  return r >= 7 ? "AAA text" : r >= 4.5 ? "AA text" : r >= 3 ? "Large text only" : "Background only";
}

export const isLargeText = (fontSizePt: number, fontWeight: number): boolean =>
  fontSizePt >= 18 || (fontSizePt >= 14 && fontWeight >= 700);

export type BrandIssue = { nodeId: string; kind: "off_kit_color" | "off_brand_font" | "low_contrast"; message: string };

export function brandIssues(page: Page, kit: BrandKitContent): BrandIssue[] {
  const out: BrandIssue[] = [];
  const colors = new Set(kit.colors.map((c) => c.hex.toLowerCase()));
  const fonts = new Set(Object.values(kit.typography).map((t) => t.fontFamily));
  const bg = rgb(page.background.color);
  const walk = (nodes: CherryNode[]) => {
    for (const n of nodes) {
      if (n.kind === "group") { walk(n.children); continue; }
      if (kit.rules.kitColorsOnly && colors.size > 0 && n.kind !== "image") {
        const hexes = ["fill" in n ? n.fill?.color : undefined, "stroke" in n ? n.stroke?.paint.color : undefined];
        for (const h of hexes) {
          if (h && !colors.has(h.toLowerCase())) out.push({ nodeId: n.id, kind: "off_kit_color", message: `${h} is not a brand color` });
        }
      }
      if (n.kind !== "text") continue;
      if (kit.rules.warnOffBrandFonts && !fonts.has(n.fontFamily))
        out.push({ nodeId: n.id, kind: "off_brand_font", message: `${n.fontFamily} is not a brand font` });
      if (kit.rules.flagContrast && n.fill) {
        const a = n.opacity * n.fill.opacity;
        const fg = rgb(n.fill.color).map((v, i) => v * a + bg[i]! * (1 - a));
        const need = isLargeText(n.fontSize, n.fontWeight) ? 3 : 4.5;
        const r = ratio(fg, bg);
        if (r < need) out.push({ nodeId: n.id, kind: "low_contrast", message: `Contrast ${r.toFixed(2)} is below ${need}` });
      }
    }
  };
  walk(page.nodes);
  return out;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function flatten(nodes: CherryNode[], into: Map<string, CherryNode>) {
  for (const n of nodes) { into.set(n.id, n); if (n.kind === "group") flatten(n.children, into); }
  return into;
}
const all = (d: CherryDocument) => d.pages.reduce((m, p) => flatten(p.nodes, m), new Map<string, CherryNode>());

export function brandLockViolation(before: CherryDocument, after: CherryDocument): boolean {
  const next = all(after);
  for (const old of all(before).values()) {
    if (old.brandLock === "none") continue;
    const now = next.get(old.id);
    if (!now || now.brandLock !== old.brandLock) return true;
    if (old.brandLock === "fixed") { if (!eq(old, now)) return true; continue; }
    const strip = (n: CherryNode) => {
      const { name: _n, ...rest } = n as CherryNode & Record<string, unknown>;
      delete rest.text; delete rest.assetId;
      return rest;
    };
    if (!eq(strip(old), strip(now))) return true;
  }
  return false;
}

export const serializeKitFile = (name: string, content: BrandKitContent): string =>
  JSON.stringify({ format: "cherry-kit", version: 1, name, colors: content.colors, typography: content.typography, rules: content.rules }, null, 2);

const KitFile = z.object({
  format: z.literal("cherry-kit"), version: z.literal(1), name: z.string().trim().min(1).max(80),
  colors: BrandKitContent.shape.colors, typography: Typography, rules: Rules,
});

export function parseKitFile(text: string): { ok: true; name: string; content: BrandKitContent } | { ok: false } {
  try {
    const r = KitFile.safeParse(JSON.parse(text));
    if (!r.success) return { ok: false };
    const { name, colors, typography, rules } = r.data;
    return { ok: true, name, content: { colors, typography, rules, logos: defaultKitContent().logos } };
  } catch { return { ok: false }; }
}
