import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("flash-sale-story", "px");
const COBALT = "#1638D4", SUN = "#FFD23F";
const M = 96, W = 1080 - 2 * M;

export default starterDoc("starter-flash-sale-story", "Weekend sale story", [
  page("flash-sale-story-p1", "Story", { width: 1080, height: 1920, unit: "px", colorMode: "rgb", bleed: 0 }, COBALT, [
    b.element("sparkle-burst", 760, 120, 220, SUN, { rotation: 15 }),
    b.element("sparkle-four", 120, 1660, 90, SUN),
    b.text("Kicker", M, 330, W, "WEEKEND ONLY", { family: "Inter", size: 24, weight: 700, letterSpacing: 8, align: "center", color: SUN }),
    b.text("Discount", M, 400, W, "30%", { family: "Bebas Neue", size: 330, lineHeight: 0.9, align: "center", color: WHITE }),
    b.text("Headline", M, 820, W, "OFF\nEVERYTHING", { family: "Bebas Neue", size: 120, lineHeight: 0.95, align: "center", color: SUN }),
    b.element("badge-pill", 290, 1200, 500, WHITE),
    b.text("Button", 290, 1268, 500, "SHOP THE EDIT", { family: "Inter", size: 30, weight: 700, letterSpacing: 3, align: "center", color: COBALT }),
    b.text("Dates", M, 1470, W, "Friday to Sunday  ·  in store and online", { family: "Inter", size: 26, weight: 500, align: "center", color: WHITE }),
    b.text("Code", M, 1530, W, "Use code SUNNY30 at the till", { family: "Inter", size: 22, align: "center", color: SUN }),
    b.text("Hint", M, 1760, W, "Tap the link to shop  ↑", { family: "Inter", size: 18, weight: 600, align: "center", color: WHITE }),
  ]),
]);
