import { builder, page, starterDoc } from "./nodes";

const b = builder("pitch-deck", "px");
const size = { width: 1920, height: 1080, unit: "px", colorMode: "rgb", bleed: 0 } as const;
const CHARCOAL = "#1B1B1F", CORAL = "#FF6B57", RUST = "#B23A28", CREAM = "#FFF1E8", STONE = "#B9B4AE", GRAPHITE = "#55504A";
const M = 144;

const pains = ["142 messages to pick one weekend", "Nobody knows who paid for what", "The best idea gets buried by lunch"];

export default starterDoc("starter-pitch-deck", "Startup pitch deck", [
  page("pitch-deck-p1", "Title", size, CHARCOAL, [
    b.element("sparkle-burst", 1440, 520, 340, CORAL, { rotation: 10 }),
    b.element("sparkle-four", 1380, 420, 72, CREAM),
    b.ellipse("Mark", M, 160, 64, 64, CORAL),
    b.text("Wordmark", M + 88, 166, 600, "Fernway", { family: "Space Grotesk", size: 32, weight: 700, color: CREAM }),
    b.text("Title", M, 340, 1240, "Plan trips\nyour whole group\nagrees on", { family: "Space Grotesk", size: 96, weight: 700, lineHeight: 1.02, color: CREAM }),
    b.text("Subtitle", M, 760, 1000, "Seed round  ·  2027", { family: "DM Sans", size: 28, weight: 500, color: STONE }),
    b.text("Footer", M, 960, 1000, "Confidential draft, not for distribution", { family: "DM Sans", size: 16, color: STONE }),
  ]),
  page("pitch-deck-p2", "Problem", size, CREAM, [
    b.text("Kicker", M, 144, 800, "THE PROBLEM", { family: "DM Sans", size: 18, weight: 700, letterSpacing: 4, color: RUST }),
    b.text("Title", M, 190, 1500, "Group trips die\nin the chat thread.", { family: "Space Grotesk", size: 72, weight: 700, lineHeight: 1.1, color: CHARCOAL }),
    ...pains.flatMap((pain, i) => {
      const y = 500 + i * 150;
      return [
        b.ellipse(`Number dot ${i + 1}`, M, y, 80, 80, CORAL),
        b.text(`Number ${i + 1}`, M, y + 14, 80, String(i + 1), { family: "Space Grotesk", size: 32, weight: 700, align: "center", color: CHARCOAL }),
        b.text(`Point ${i + 1}`, M + 120, y + 16, 900, pain, { family: "DM Sans", size: 28, color: CHARCOAL }),
      ];
    }),
    b.rect("Quote card", 1240, 480, 536, 440, CORAL, 32),
    b.text("Quote", 1288, 544, 460, "“We spent longer\nplanning than\ntravelling.”", { family: "Space Grotesk", size: 36, weight: 700, lineHeight: 1.2, color: CHARCOAL }),
    b.text("Quote source", 1288, 830, 460, "A beta tester", { family: "DM Sans", size: 20, weight: 500, color: CHARCOAL }),
    b.text("Page number", 1576, 980, 200, "02", { family: "DM Sans", size: 14, weight: 700, align: "right", color: GRAPHITE }),
  ]),
]);
