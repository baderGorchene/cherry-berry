import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("quarterly-review", "px");
const size = { width: 1920, height: 1080, unit: "px", colorMode: "rgb", bleed: 0 } as const;
const NAVY = "#0E1B3D", DUSK = "#1C2F66", AMBER = "#F2A33A", BRONZE = "#8A5205", MIST = "#C9D1E6", PAPER = "#F5F7FB", SLATE = "#4A5571";
const M = 144;

const stats = [
  ["+18%", "Revenue", "Against Q2, led by repeat\norders from small studios."],
  ["2.4", "Days to deliver", "Down from 3.1 days after the\nnew courier routes went live."],
  ["94%", "Happy customers", "Of 1,200 replies to the\npost-order survey."],
] as const;

export default starterDoc("starter-quarterly-review", "Quarterly review deck", [
  page("quarterly-review-p1", "Title", size, NAVY, [
    b.ellipse("Large circle", 1440, 560, 360, 360, AMBER),
    b.ellipse("Small circle", 1300, 760, 220, 220, DUSK),
    b.rect("Accent", M, 200, 12, 96, AMBER),
    b.text("Kicker", M + 40, 228, 1000, "Q3 REVIEW  ·  OPERATIONS", { family: "Montserrat", size: 18, weight: 700, letterSpacing: 5, color: AMBER }),
    b.text("Title", M, 340, 1300, "Steady growth,\nfewer surprises", { family: "Montserrat", size: 96, weight: 700, lineHeight: 1.08, color: WHITE }),
    b.text("Subtitle", M, 640, 1100, "Results, lessons and the plan for Q4", { family: "Inter", size: 26, color: MIST }),
    b.text("Footer", M, 940, 1000, "Prepared by the operations team  ·  October", { family: "Inter", size: 16, weight: 500, color: MIST }),
  ]),
  page("quarterly-review-p2", "Numbers", size, PAPER, [
    b.text("Kicker", M, 144, 1000, "BY THE NUMBERS", { family: "Montserrat", size: 18, weight: 700, letterSpacing: 5, color: BRONZE }),
    b.text("Title", M, 190, 1400, "Three numbers that matter", { family: "Montserrat", size: 60, weight: 700, lineHeight: 1.1, color: NAVY }),
    ...stats.flatMap(([value, label, detail], i) => {
      const x = M + i * 560;
      return [
        b.rect(`Card ${i + 1}`, x, 380, 512, 440, WHITE, 24),
        b.text(`Value ${i + 1}`, x + 48, 424, 440, value, { family: "Montserrat", size: 80, weight: 700, color: NAVY }),
        b.rect(`Bar ${i + 1}`, x + 48, 590, 64, 6, AMBER),
        b.text(`Label ${i + 1}`, x + 48, 620, 440, label, { family: "Inter", size: 24, weight: 600, color: NAVY }),
        b.text(`Detail ${i + 1}`, x + 48, 670, 440, detail, { family: "Inter", size: 18, lineHeight: 1.5, color: SLATE }),
      ];
    }),
    b.text("Footer", M, 960, 900, "Quarterly review  ·  Q3", { family: "Inter", size: 14, weight: 500, color: SLATE }),
    b.text("Page number", 1576, 960, 200, "02", { family: "Montserrat", size: 14, weight: 700, align: "right", color: NAVY }),
  ]),
]);
