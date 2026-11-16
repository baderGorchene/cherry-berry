import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("lesson-slides", "px");
const size = { width: 1024, height: 768, unit: "px", colorMode: "rgb", bleed: 0 } as const;
const CREAM = "#FBF7EC", LEAF = "#2F6B3A", SUN = "#F4B942", INK = "#23301F", MOSS = "#4C5A47", STRAW = "#F4E3B0";
const M = 72;

const plan = [
  ["0:00", "Warm-up quiz", "Five quick questions on last week"],
  ["0:10", "Leaf walk", "Collect three different leaves outside"],
  ["0:30", "Starch test", "Iodine drops on a leaf, in pairs"],
  ["0:50", "Wrap-up", "What did the sunlight do?"],
] as const;

export default starterDoc("starter-lesson-slides", "Lesson slides", [
  page("lesson-slides-p1", "Title", size, CREAM, [
    b.element("blob-organic", 640, 64, 320, SUN),
    b.element("sparkle-flower", 830, 300, 110, LEAF),
    b.text("Kicker", M, 96, 560, "SCIENCE  ·  YEAR 6  ·  LESSON 4", { family: "Poppins", size: 14, weight: 600, letterSpacing: 3, color: LEAF }),
    b.text("Title", M, 140, 560, "How plants\nmake food", { family: "Lora", size: 60, weight: 700, lineHeight: 1.1, color: INK }),
    b.text("Subtitle", M, 340, 560, "Photosynthesis in four steps", { family: "Poppins", size: 18, color: MOSS }),
    b.rect("Goals panel", M, 500, 880, 196, LEAF, 20),
    b.text("Goals label", M + 40, 532, 800, "TODAY WE WILL", { family: "Poppins", size: 14, weight: 600, letterSpacing: 3, color: STRAW }),
    b.text("Goals", M + 40, 568, 800, "•  Name the parts of a leaf\n•  Explain what sunlight is for",
      { family: "Poppins", size: 20, lineHeight: 1.5, color: WHITE }),
  ]),
  page("lesson-slides-p2", "Plan", size, CREAM, [
    b.text("Kicker", M, 64, 560, "LESSON PLAN", { family: "Poppins", size: 14, weight: 600, letterSpacing: 3, color: LEAF }),
    b.text("Title", M, 96, 800, "One hour, four parts", { family: "Lora", size: 44, weight: 700, color: INK }),
    ...plan.flatMap(([time, what, detail], i) => {
      const y = 220 + i * 120;
      return [
        b.rect(`Time chip ${i + 1}`, M, y, 120, 56, SUN, 14),
        b.text(`Time ${i + 1}`, M, y + 14, 120, time, { family: "Poppins", size: 18, weight: 600, align: "center", color: INK }),
        b.text(`Activity ${i + 1}`, M + 152, y, 700, what, { family: "Lora", size: 22, weight: 700, color: INK }),
        b.text(`Detail ${i + 1}`, M + 152, y + 36, 700, detail, { family: "Poppins", size: 14, color: MOSS }),
      ];
    }),
    b.element("sparkle-four", 900, 64, 52, LEAF),
  ]),
]);
