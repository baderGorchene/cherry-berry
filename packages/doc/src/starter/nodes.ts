import { ELEMENTS } from "../elements";
import { CHERRY_FORMAT_VERSION, type CherryDocument, type CherryNode, type Page, type Paint } from "../schema";
import { PT_PX, UNIT_PX } from "../units";

/** Shared builders for the starter templates: deterministic ids, text boxes sized from font size and line count. */

export const solid = (color: string, opacity = 1): Paint => ({ type: "solid", color, opacity });
const round = (v: number) => Number(v.toFixed(3));

/**
 * Uniformly scales a catalogue path (absolute M/L/C/A/Z, space-separated, as in ELEMENTS).
 * ponytail: catalogue syntax only; use @cherry/vector's scalePath if templates ever need arbitrary SVG paths.
 */
export function scaleD(d: string, s: number): string {
  let cmd = "", i = 0;
  return d.trim().split(/\s+/).map((tok) => {
    if (/^[A-Za-z]$/.test(tok)) { cmd = tok.toUpperCase(); i = 0; return tok; }
    const k = i++ % 7;
    return cmd === "A" && k >= 2 && k <= 4 ? tok : String(round(Number(tok) * s)); // arc rotation and flags stay
  }).join(" ");
}

type Unit = Page["unit"];
type Look = { opacity?: number; rotation?: number };
export type TextStyle = {
  family: string; size: number; color: string; weight?: number; lineHeight?: number; letterSpacing?: number;
  align?: "left" | "center" | "right";
} & Look;

/** Node builders for one page unit; ids are `<slug>-<n>` so a template is the same data on every load. */
export function builder(slug: string, unit: Unit) {
  let n = 0;
  const base = (name: string, x: number, y: number, width: number, height: number, look: Look = {}) => ({
    id: `${slug}-${++n}`, name, x: round(x), y: round(y), width: round(width), height: round(height),
    rotation: look.rotation ?? 0, opacity: look.opacity ?? 1, locked: false, hidden: false, brandLock: "none" as const,
  });
  return {
    rect: (name: string, x: number, y: number, w: number, h: number, color: string, radius = 0, look?: Look): CherryNode =>
      ({ ...base(name, x, y, w, h, look), kind: "rect", fill: solid(color), cornerRadius: radius }),
    outline: (name: string, x: number, y: number, w: number, h: number, color: string, width: number): CherryNode =>
      ({ ...base(name, x, y, w, h), kind: "rect", stroke: { paint: solid(color), width }, cornerRadius: 0 }),
    ellipse: (name: string, x: number, y: number, w: number, h: number, color: string, look?: Look): CherryNode =>
      ({ ...base(name, x, y, w, h, look), kind: "ellipse", fill: solid(color) }),
    /** A catalogue element whose width is `w`, keeping its aspect ratio. */
    element: (id: string, x: number, y: number, w: number, color: string, look?: Look): CherryNode => {
      const el = ELEMENTS.find((e) => e.id === id);
      if (!el) throw new Error(`unknown element ${id}`);
      const s = w / el.width;
      return { ...base(el.name, x, y, w, el.height * s, look), kind: "path", d: scaleD(el.d, s), fillRule: el.fillRule, fill: solid(color) };
    },
    /** Lines break only at "\n"; the box is as tall as those lines. */
    text: (name: string, x: number, y: number, w: number, text: string, t: TextStyle): CherryNode => {
      const lineHeight = t.lineHeight ?? 1.2;
      const h = text.split("\n").length * lineHeight * (t.size * PT_PX) / UNIT_PX[unit];
      return {
        ...base(name, x, y, w, h, t), kind: "text", text, fontFamily: t.family, fontSize: t.size, fontWeight: t.weight ?? 400,
        lineHeight, letterSpacing: t.letterSpacing ?? 0, align: t.align ?? "left", fill: solid(t.color),
      };
    },
  };
}

export function page(
  id: string, name: string, size: { width: number; height: number; unit: Unit; colorMode: Page["colorMode"]; bleed: number },
  background: string, nodes: CherryNode[],
): Page {
  return { id, name, ...size, background: solid(background), nodes };
}

export function starterDoc(id: string, title: string, pages: Page[]): CherryDocument {
  return { format: "cherry", version: CHERRY_FORMAT_VERSION, id, title, createdAt: "2026-11-16T00:00:00.000Z", pages };
}
