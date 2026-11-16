import { builder, page, starterDoc } from "./nodes";

const b = builder("book-club-cover", "px");
const MIST = "#E9F1EE", TEAL = "#1D4E55", CORAL = "#E5735C", INK = "#2B3A3D", SAND = "#F4D8C4";

export default starterDoc("starter-book-club-cover", "Book club cover", [
  page("book-club-cover-p1", "Cover", { width: 1640, height: 624, unit: "px", colorMode: "rgb", bleed: 0 }, MIST, [
    b.element("blob-arch", 1240, 72, 320, TEAL),
    b.element("blob-halfmoon", 1120, 440, 240, CORAL),
    b.ellipse("Moon", 1320, 140, 160, 160, SAND),
    b.element("sparkle-four", 1170, 96, 64, CORAL),
    b.element("sparkle-four", 1580, 420, 36, TEAL),
    b.text("Kicker", 120, 140, 900, "MONTHLY  ·  SINCE 2019", { family: "Montserrat", size: 16, weight: 700, letterSpacing: 4, color: TEAL }),
    b.text("Title", 120, 180, 960, "Riverside\nBook Club", { family: "Lora", size: 80, weight: 700, lineHeight: 1.05, color: TEAL }),
    b.text("Details", 120, 440, 960, "First Thursdays  ·  7 pm  ·  the library reading room",
      { family: "Montserrat", size: 20, weight: 500, color: INK }),
  ]),
]);
