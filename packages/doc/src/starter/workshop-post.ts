import { builder, page, starterDoc } from "./nodes";

const b = builder("workshop-post", "px");
const PAPER = "#F4F6FB", NAVY = "#12264A", TEAL = "#0B6662", SEAFOAM = "#CFEDEA", APRICOT = "#FFD9A0", SLATE = "#3D4A63", GREY = "#5A6478";
const M = 64;

const details = [["DATE", "Thu 9 Oct"], ["TIME", "6 – 8 pm"], ["WHERE", "Online"]] as const;

export default starterDoc("starter-workshop-post", "Workshop announcement", [
  page("workshop-post-p1", "Post", { width: 1200, height: 627, unit: "px", colorMode: "rgb", bleed: 0 }, PAPER, [
    b.rect("Panel", 800, 0, 400, 627, TEAL),
    b.element("blob-pebble", 830, 330, 340, SEAFOAM, { opacity: 0.25 }),
    b.element("badge-scallop", 900, 150, 200, APRICOT, { rotation: 8 }),
    b.text("Badge label", 900, 216, 200, "FREE\nSEAT", { family: "Montserrat", size: 26, weight: 700, lineHeight: 1.05, align: "center", color: NAVY }),
    b.text("Kicker", M, 72, 700, "LIVE WORKSHOP  ·  2 HOURS", { family: "Montserrat", size: 14, weight: 700, letterSpacing: 3, color: TEAL }),
    b.text("Headline", M, 108, 700, "Design systems\nfor small teams", { family: "Montserrat", size: 44, weight: 700, lineHeight: 1.1, color: NAVY }),
    b.text("Body", M, 262, 700, "A hands-on session on tokens, components\nand keeping a tiny library tidy.",
      { family: "Inter", size: 18, lineHeight: 1.5, color: SLATE }),
    ...details.flatMap(([label, value], i) => [
      b.text(`${label} label`, M + i * 220, 392, 200, label, { family: "Inter", size: 12, weight: 600, letterSpacing: 2, color: GREY }),
      b.text(`${label} value`, M + i * 220, 414, 200, value, { family: "Montserrat", size: 20, weight: 600, color: NAVY }),
    ]),
    b.rect("Divider", M, 488, 676, 2, SEAFOAM),
    b.text("Footer", M, 520, 700, "Reserve a seat at northlight.example/workshop", { family: "Inter", size: 14, weight: 500, color: SLATE }),
  ]),
]);
