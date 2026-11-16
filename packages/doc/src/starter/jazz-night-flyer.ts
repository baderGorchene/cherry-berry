import { builder, page, starterDoc } from "./nodes";
import { BERRY, BLUSH, DEEP, INK, MUTED, PETAL, WHITE } from "./palette";

const b = builder("jazz-night-flyer", "mm");
const M = 18, COL = 64;

const details = [
  ["WHEN", "FRI 18 JULY", "7 pm – 11 pm"],
  ["WHERE", "THE GREENHOUSE", "42 Canal Road"],
  ["ENTRY", "FREE · ALL AGES", "Bar and food trucks"],
] as const;

export default starterDoc("starter-jazz-night-flyer", "Jazz night flyer", [
  page("jazz-night-flyer-p1", "Flyer", { width: 210, height: 297, unit: "mm", colorMode: "cmyk", bleed: 3 }, "#FFF4F9", [
    b.rect("Band", -3, -3, 216, 186, BERRY),
    b.element("sparkle-burst", 128, 16, 66, BLUSH, { rotation: 12 }),
    b.element("sparkle-four", 168, 104, 14, PETAL),
    b.element("sparkle-four", 186, 126, 8, PETAL),
    b.text("Kicker", M, 22, 120, "THE GREENHOUSE PRESENTS",
      { family: "Inter", size: 10, weight: 600, letterSpacing: 0.6, color: PETAL }),
    b.text("Headline", 16, 32, 170, "SUMMER\nJAZZ\nNIGHT", { family: "Bebas Neue", size: 124, lineHeight: 0.88, color: WHITE }),
    b.text("Tagline", 76, 146, 100, "live on the lawn",
      { family: "Dancing Script", size: 34, weight: 700, color: PETAL, rotation: -6 }),
    b.element("badge-scallop", 152, 162, 40, BLUSH),
    b.text("Badge label", 152, 176, 40, "FREE\nENTRY", { family: "Bebas Neue", size: 18, lineHeight: 0.95, align: "center", color: DEEP }),
    ...details.flatMap(([label, value, sub], i) => {
      const x = M + i * COL;
      return [
        b.text(`${label} label`, x, 200, COL - 6, label, { family: "Inter", size: 9, weight: 700, letterSpacing: 0.4, color: BERRY }),
        b.text(`${label} value`, x, 206, COL - 6, value, { family: "Bebas Neue", size: 22, lineHeight: 1.1, color: INK }),
        b.text(`${label} detail`, x, 216, COL - 6, sub, { family: "Inter", size: 9, lineHeight: 1.4, color: MUTED }),
      ];
    }),
    b.rect("Divider", M, 232, 174, 0.4, BLUSH),
    b.text("Body", M, 240, 174,
      "Bring a blanket, grab a drink from the garden bar and settle in\nfor an evening of swing, bossa nova and soul from the\nMarlow Street Quartet.",
      { family: "Inter", size: 11, lineHeight: 1.5, color: INK }),
    b.text("Footer", M, 276, 150, "greenhouse.example  ·  @thegreenhouse", { family: "Inter", size: 9, weight: 500, color: MUTED }),
    b.element("sparkle-four", 182, 271, 10, BERRY),
  ]),
]);
