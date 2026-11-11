import type { CherryNode, Paint } from "./schema";

export type BasicShape = "rect" | "ellipse" | "triangle" | "line" | "star" | "arrow";
type Box = { x: number; y: number; width: number; height: number };

const solid = (color: string): Paint => ({ type: "solid", color, opacity: 1 });
const num = (n: number) => String(Number(n.toFixed(4)));
const poly = (pts: [number, number][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${num(x)} ${num(y)}`).join(" ") + " Z";

function base(name: string, b: Box) {
  return {
    id: crypto.randomUUID(), name, x: b.x, y: b.y, width: b.width, height: b.height,
    rotation: 0, opacity: 1, locked: false, hidden: false,
  };
}

function starPoints(w: number, h: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.5 : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)];
  });
}

export function createShape(kind: BasicShape, box: Box): CherryNode {
  const { width: w, height: h } = box;
  const fill = solid("#8E1EA2");
  const path = (name: string, d: string) =>
    ({ ...base(name, box), kind: "path", d, fill, fillRule: "nonzero" }) as CherryNode;
  switch (kind) {
    case "rect":
      return { ...base("Rectangle", box), kind: "rect", fill, cornerRadius: 0 };
    case "ellipse":
      return { ...base("Ellipse", box), kind: "ellipse", fill };
    case "triangle":
      return path("Triangle", poly([[w / 2, 0], [w, h], [0, h]]));
    case "star":
      return path("Star", poly(starPoints(w, h)));
    case "arrow":
      return path("Arrow", poly([[0, 0.3 * h], [0.6 * w, 0.3 * h], [0.6 * w, 0], [w, 0.5 * h], [0.6 * w, h], [0.6 * w, 0.7 * h], [0, 0.7 * h]]));
    case "line":
      return {
        ...base("Line", { ...box, height: 0 }), kind: "path", d: `M0 0 L${num(w)} 0`,
        stroke: { paint: solid("#22142A"), width: w / 100 }, fillRule: "nonzero",
      };
  }
}

export function createText(at: { x: number; y: number }, width: number): CherryNode {
  return {
    ...base("Text", { ...at, width, height: 0 }), kind: "text", text: "Add your text",
    fontFamily: "Inter", fontSize: 32, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0,
    align: "left", fill: solid("#22142A"),
  };
}
