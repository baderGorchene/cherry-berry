import { builder, page, starterDoc } from "./nodes";

const b = builder("business-card-bold", "mm");
const size = { width: 85, height: 55, unit: "mm", colorMode: "cmyk", bleed: 3 } as const;
const BLACK = "#121212", CORAL = "#FF5A4E", CREAM = "#FFF3E6";

export default starterDoc("starter-business-card-bold", "Bold business card", [
  page("business-card-bold-p1", "Card", size, BLACK, [
    b.bleedFill(size, BLACK),
    b.element("sparkle-burst", 56, 5, 24, CORAL, { rotation: 12 }),
    b.text("Name", 6, 6, 50, "MIKA\nRUIZ", { family: "Bebas Neue", size: 46, lineHeight: 0.86, color: CORAL }),
    b.text("Role", 6, 35, 73, "SOUND DESIGNER", { family: "DM Sans", size: 8, weight: 700, letterSpacing: 0.5, color: CREAM }),
    b.text("Contact", 6, 41, 73, "mika@ruizsound.example  ·  07700 900123\nStudio visits by appointment, Thu – Sat",
      { family: "DM Sans", size: 7, lineHeight: 1.45, color: CREAM }),
  ]),
]);
