import { builder, page, starterDoc } from "./nodes";

const b = builder("thank-you-postcard", "in");
const size = { width: 6, height: 4, unit: "in", colorMode: "cmyk", bleed: 0.125 } as const;
const SAGE = "#DCE5D3", FOREST = "#2E4A33", CLAY = "#C4704F", CREAM = "#F7F4EC";

export default starterDoc("starter-thank-you-postcard", "Thank-you postcard", [
  page("thank-you-postcard-p1", "Postcard", size, SAGE, [
    b.rect("Panel", -0.125, -0.125, 3.125, 4.25, FOREST),
    b.element("sparkle-flower", 1.95, 2.75, 0.8, CLAY),
    b.text("Headline", 0.35, 0.7, 2.4, "Thank\nyou", { family: "Lora", size: 48, weight: 700, lineHeight: 1, color: CREAM }),
    b.text("Subline", 0.35, 2.2, 2.4, "for being part of it", { family: "DM Sans", size: 13, weight: 500, color: SAGE }),
    b.text("Label", 3.4, 0.55, 2.3, "A NOTE FROM THE TEAM", { family: "DM Sans", size: 8, weight: 700, letterSpacing: 0.02, color: FOREST }),
    b.text("Note", 3.4, 0.85, 2.3, "Your support kept our\nlittle bakery going\nall year long.",
      { family: "Lora", size: 12, lineHeight: 1.5, color: FOREST }),
    b.rect("Line 1", 3.4, 2.15, 2.2, 0.01, FOREST),
    b.rect("Line 2", 3.4, 2.6, 2.2, 0.01, FOREST),
    b.text("Sign-off", 3.4, 3.05, 2.3, "Hearth & Crumb Bakery", { family: "DM Sans", size: 10, weight: 700, color: FOREST }),
  ]),
]);
