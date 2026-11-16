import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("yard-sale-poster", "in");
const size = { width: 8.5, height: 11, unit: "in", colorMode: "cmyk", bleed: 0.125 } as const;
const YELLOW = "#FFD60A", BLACK = "#111111";
const X = 0.6, W = 7.3;

export default starterDoc("starter-yard-sale-poster", "Yard sale poster", [
  page("yard-sale-poster-p1", "Poster", size, YELLOW, [
    b.bleedFill(size, YELLOW),
    b.rect("Band", -0.125, -0.125, 8.75, 5.125, BLACK),
    b.text("Kicker", X, 0.6, 5, "THIS SATURDAY ONLY", { family: "Inter", size: 14, weight: 700, letterSpacing: 0.04, color: YELLOW }),
    b.text("Headline", X - 0.05, 0.95, 5.2, "YARD\nSALE", { family: "Bebas Neue", size: 150, lineHeight: 0.86, color: YELLOW }),
    b.element("sparkle-burst", 5.3, 1.0, 2.6, WHITE, { rotation: 10 }),
    b.text("Burst label", 5.8, 2.0, 1.6, "EVERYTHING\n$5 OR LESS", { family: "Bebas Neue", size: 22, lineHeight: 1, align: "center", color: BLACK }),
    b.text("Items", X, 5.55, W, "Furniture  ·  Books  ·  Records\nPlants  ·  Kids' clothes  ·  Tools",
      { family: "Inter", size: 20, weight: 700, lineHeight: 1.4, align: "center", color: BLACK }),
    b.rect("Rule", 3.65, 6.6, 1.2, 0.04, BLACK),
    b.text("When", X, 6.9, W, "SAT 6 SEPT\n8 AM – 1 PM", { family: "Bebas Neue", size: 64, lineHeight: 0.95, align: "center", color: BLACK }),
    b.text("Where", X, 8.75, W, "27 Linden Lane, back garden", { family: "Inter", size: 22, weight: 600, align: "center", color: BLACK }),
    b.text("Footer", X, 9.4, W, "Cash and card welcome  ·  if it rains, we move to Sunday",
      { family: "Inter", size: 12, align: "center", color: BLACK }),
    b.element("doodle-wave", 3.5, 10.1, 1.5, BLACK),
  ]),
]);
