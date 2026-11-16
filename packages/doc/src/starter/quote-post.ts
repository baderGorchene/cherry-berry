import { builder, page, starterDoc } from "./nodes";

const b = builder("quote-post", "px");
const FOREST = "#1F3A2E", CREAM = "#F3EDE0", MINT = "#9FD8B5", SOFT = "#C9D6CC";
const M = 96;

export default starterDoc("starter-quote-post", "Quote of the week post", [
  page("quote-post-p1", "Post", { width: 1080, height: 1350, unit: "px", colorMode: "rgb", bleed: 0 }, FOREST, [
    b.element("blob-pebble", 640, 980, 360, "#2A4A3B"),
    b.text("Kicker", M, 112, 888, "QUOTE OF THE WEEK", { family: "DM Sans", size: 18, weight: 700, letterSpacing: 4, color: MINT }),
    b.text("Quote mark", M - 8, 150, 300, "“", { family: "Playfair Display", size: 200, weight: 700, lineHeight: 1, color: MINT }),
    b.text("Quote", M, 420, 888, "Small steps,\ntaken daily,\nbecome the long\nway home.",
      { family: "Playfair Display", size: 54, weight: 700, lineHeight: 1.22, color: CREAM }),
    b.rect("Rule", M, 840, 96, 4, MINT),
    b.text("Source", M, 872, 888, "A note to self, every Monday", { family: "DM Sans", size: 22, weight: 500, color: CREAM }),
    b.element("sparkle-four", 880, 160, 80, MINT),
    b.element("doodle-wave", M, 1180, 200, MINT),
    b.text("Handle", M, 1240, 600, "@slowpages.studio", { family: "DM Sans", size: 18, weight: 500, color: SOFT }),
  ]),
]);
