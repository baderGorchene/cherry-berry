import { builder, page, starterDoc } from "./nodes";
import { BERRY, INK, MUTED, ORCHID, PETAL, WHITE } from "./palette";

const b = builder("saturday-market", "px");
const W = 1080, M = 96;

export default starterDoc("starter-saturday-market", "Saturday market post", [
  page("saturday-market-p1", "Post", { width: W, height: 1350, unit: "px", colorMode: "rgb", bleed: 0 }, "#FFF4F9", [
    b.text("Kicker", M, M, W - 2 * M, "SATURDAY MARKET  ·  NO. 12",
      { family: "Space Grotesk", size: 18, weight: 600, letterSpacing: 4, align: "center", color: BERRY }),
    b.element("blob-arch", 180, 190, 720, PETAL),
    b.element("sparkle-four", 796, 318, 96, BERRY),
    b.element("sparkle-four", 232, 432, 44, ORCHID),
    b.text("Headline", 180, 500, 720, "Fresh\nfinds",
      { family: "Abril Fatface", size: 120, lineHeight: 0.95, align: "center", color: BERRY }),
    b.text("Body", 180, 830, 720, "Local makers, slow coffee\nand vintage treasures.",
      { family: "Inter", size: 22, lineHeight: 1.45, align: "center", color: INK }),
    b.element("badge-pill", 400, 1040, 280, BERRY),
    b.text("Badge label", 400, 1077, 280, "FREE ENTRY",
      { family: "Space Grotesk", size: 18, weight: 700, letterSpacing: 3, align: "center", color: WHITE }),
    b.text("Date", M, 1176, W - 2 * M, "Sunday 14 June  ·  9 am – 2 pm",
      { family: "Space Grotesk", size: 24, weight: 500, align: "center", color: BERRY }),
    b.text("Place", M, 1226, W - 2 * M, "Old Mill Yard, Riverside",
      { family: "Inter", size: 15, align: "center", color: MUTED }),
  ]),
]);
