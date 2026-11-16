import { PT_PX, UNIT_PX, createText, type CherryNode, type Page } from "@cherry/doc";

export type TextPreset = "heading" | "subheading" | "body";
/** Measured width of one line of `text` at `size` (page units), in page units. */
export type Measure = (text: string, font: string, size: number, weight: number) => number;

const PRESETS: Record<TextPreset, { ratio: number; weight: number; text: string }> = {
  heading: { ratio: 0.08, weight: 700, text: "Add a heading" },
  subheading: { ratio: 0.045, weight: 600, text: "Add a subheading" },
  body: { ratio: 0.025, weight: 400, text: "Add a little bit of body text" },
};
const LINE_HEIGHT = 1.2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A text node sized relative to the page: its font height is `ratio` of the page height in page units
 * (`fontSize` is stored in points, like `createText`, so it is converted through PT_PX and the page unit).
 * The box is the measured text plus a little padding, at most the page width minus 5% margins, centred on
 * `center` and kept inside the page.
 */
export function presetText(
  kind: TextPreset, page: Page, center: { x: number; y: number }, measure: Measure,
  opts: { text?: string; fontFamily?: string; fontWeight?: number } = {},
): CherryNode {
  const p = PRESETS[kind];
  const text = opts.text ?? p.text;
  const fontFamily = opts.fontFamily ?? "Inter";
  const fontWeight = opts.fontWeight ?? p.weight;
  const size = p.ratio * page.height; // page units
  const maxWidth = page.width * 0.9;
  const natural = measure(text, fontFamily, size, fontWeight) + size * 0.5;
  const width = Math.min(natural, maxWidth);
  const height = Math.min(page.height, Math.ceil(natural / width) * size * LINE_HEIGHT);
  const base = createText({ x: 0, y: 0 }, width) as Extract<CherryNode, { kind: "text" }>;
  return {
    ...base, name: text.slice(0, 40), text, fontFamily, fontWeight, lineHeight: LINE_HEIGHT,
    fontSize: (size * UNIT_PX[page.unit]) / PT_PX,
    width, height,
    x: clamp(center.x - width / 2, 0, page.width - width),
    y: clamp(center.y - height / 2, 0, page.height - height),
  };
}

/** A heading over a line of body text in two fonts, as one group centred on `center` (children are relative to the group). */
export function presetPair(
  page: Page, center: { x: number; y: number }, measure: Measure,
  heading: { fontFamily: string; fontWeight: number }, body: { fontFamily: string; fontWeight: number },
): CherryNode {
  const h = presetText("heading", page, { x: 0, y: 0 }, measure, { ...heading, text: "Your big idea" });
  const b = presetText("body", page, { x: 0, y: 0 }, measure, { ...body, text: "A line of supporting text to go with it" });
  const gap = b.height * 0.5;
  const width = Math.max(h.width, b.width), height = h.height + gap + b.height;
  return {
    id: crypto.randomUUID(), kind: "group", name: `${heading.fontFamily} and ${body.fontFamily}`,
    x: clamp(center.x - width / 2, 0, page.width - width), y: clamp(center.y - height / 2, 0, page.height - height),
    width, height, rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none",
    children: [{ ...h, x: (width - h.width) / 2, y: 0 }, { ...b, x: (width - b.width) / 2, y: h.height + gap }],
  };
}
