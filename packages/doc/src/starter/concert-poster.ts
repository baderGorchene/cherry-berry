import { builder, page, starterDoc } from "./nodes";

const b = builder("concert-poster", "mm");
const size = { width: 297, height: 420, unit: "mm", colorMode: "cmyk", bleed: 3 } as const;
const INDIGO = "#1E1B4B", ORANGE = "#FF7A1A", GLOW = "#FF9F4D", LAVENDER = "#C9C3FF", CREAM = "#FFF4E6";
const X = 24, W = 249;

export default starterDoc("starter-concert-poster", "Concert poster", [
  page("concert-poster-p1", "Poster", size, INDIGO, [
    b.ellipse("Glow", 64, 24, 210, 210, GLOW),
    b.ellipse("Sun", 89, 49, 160, 160, ORANGE),
    b.element("sparkle-four", 248, 30, 22, CREAM),
    b.element("sparkle-four", 40, 196, 12, LAVENDER),
    b.text("Kicker", X, 248, W, "THE ATTIC SESSIONS PRESENTS", { family: "Montserrat", size: 14, weight: 700, letterSpacing: 1.2, color: LAVENDER }),
    b.text("Headline", X - 2, 258, W + 4, "Night\nOwls", { family: "Abril Fatface", size: 148, lineHeight: 0.92, color: CREAM }),
    b.text("When", X, 360, W, "FRI 21 NOV  ·  DOORS 8 PM", { family: "Montserrat", size: 20, weight: 700, letterSpacing: 0.6, color: CREAM }),
    b.text("Where", X, 371, W, "The Lantern Hall  ·  9 Market Street", { family: "Montserrat", size: 14, weight: 500, color: LAVENDER }),
    b.rect("Rule", X, 384, W, 0.5, LAVENDER),
    b.text("Tickets", X, 390, W, "Tickets 12 at the door or online  ·  over 18s", { family: "Montserrat", size: 11, color: LAVENDER }),
  ]),
]);
