import type { Paint, Stroke } from "@cherry/doc";
import { scope } from "./paper";
import { fromItem, toItem, toPathData } from "./model";

export class InvalidSvg extends Error {
  constructor(readonly code: "too_large" | "no_shapes" | "too_complex") {
    super(code);
    this.name = "InvalidSvg";
  }
}

export type SvgPath = { d: string; fill?: Paint; stroke?: Stroke; fillRule: "nonzero" | "evenodd" };

const MAX_LENGTH = 1_000_000;
const MAX_PATHS = 2000;
const DEFAULT_FILL: Paint = { type: "solid", color: "#22142A", opacity: 1 };

const BANNED = new Set(["script", "foreignobject", "image", "use", "style"]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

/** Parses to a detached DOM (nothing runs), then drops everything that can execute or fetch. Names are matched case-insensitively because Paper lowercases them. */
function sanitize(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.querySelector("parsererror")) throw new InvalidSvg("no_shapes");
  let shapes = 0;
  const walk = (e: Element) => {
    for (const a of [...e.attributes]) {
      const href = /^(xlink:)?href$/i.test(a.name) && !a.value.trim().startsWith("#");
      if (/^on/i.test(a.name) || href || /url\(\s*(?!#)/i.test(a.value)) e.removeAttribute(a.name);
    }
    for (const c of [...e.children]) {
      const n = c.localName.toLowerCase();
      if (BANNED.has(n)) { c.remove(); continue; }
      if (SHAPES.has(n) && ++shapes > MAX_PATHS) throw new InvalidSvg("too_complex");
      walk(c);
    }
  };
  walk(root);
  return root;
}

function solid(c: paper.Color | null | undefined): Paint | undefined {
  if (!c || c.type !== "rgb") return undefined;
  return { type: "solid", color: c.toCSS(true).toUpperCase(), opacity: c.alpha };
}

/** Browser only (needs DOMParser). Returns every shape in SVG user units, transforms applied. */
export function svgToPaths(svg: string): SvgPath[] {
  if (svg.length > MAX_LENGTH) throw new InvalidSvg("too_large");
  const found: paper.PathItem[] = [];
  const walk = (it: paper.Item) => {
    if (it.clipMask || it.visible === false) return;
    if (it instanceof scope().Path || it instanceof scope().CompoundPath) found.push(it);
    else it.children?.forEach(walk);
  };
  const root = scope().project.importSVG(sanitize(svg) as SVGElement, { expandShapes: true, insert: false });
  walk(root);
  if (found.length > MAX_PATHS) throw new InvalidSvg("too_complex");

  const out: SvgPath[] = [];
  for (const it of found) {
    const flat = toItem(fromItem(it)); // segments only, identity matrix
    flat.transform(it.globalMatrix);
    const d = toPathData(fromItem(flat));
    if (!d) continue;
    let fill = solid(it.fillColor);
    const paint = solid(it.strokeColor);
    const scale = Math.sqrt(Math.abs(it.globalMatrix.a * it.globalMatrix.d - it.globalMatrix.b * it.globalMatrix.c));
    const w = (it.strokeWidth || 0) * scale;
    const stroke = paint && w > 0 ? { paint, width: w } : undefined;
    if (!fill && !stroke) fill = DEFAULT_FILL;
    out.push({ d, fillRule: it.fillRule === "evenodd" ? "evenodd" : "nonzero", ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}) });
  }
  if (!out.length) throw new InvalidSvg("no_shapes");
  return out;
}
