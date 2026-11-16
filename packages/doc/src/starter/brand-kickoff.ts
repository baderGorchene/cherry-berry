import { builder, page, starterDoc } from "./nodes";
import { BERRY, BLUSH, INK, MUTED, ORCHID, PETAL, WHITE } from "./palette";

const b = builder("brand-kickoff", "px");
const size = { width: 1920, height: 1080, unit: "px", colorMode: "rgb", bleed: 0 } as const;
const M = 144;

const goals = [
  ["Sharper identity", "A refreshed logo, palette and\ntype system that still feels\nunmistakably Bloom."],
  ["One voice everywhere", "Shared templates so every post,\ndeck and flyer sounds and\nlooks like us."],
  ["Launch by spring", "New site, packaging and launch\ncampaign live by 1 April,\nwith room to test first."],
] as const;

export default starterDoc("starter-brand-kickoff", "Brand kickoff deck", [
  page("brand-kickoff-p1", "Title", size, BERRY, [
    b.element("blob-organic", 1160, 220, 640, ORCHID, { rotation: 20 }),
    b.element("blob-organic", 1080, 160, 640, BLUSH),
    b.element("sparkle-four", 1600, 180, 120, WHITE),
    b.element("sparkle-four", 1120, 760, 60, PETAL),
    b.text("Kicker", M, M, 800, "BLOOM STUDIO  ·  KICKOFF",
      { family: "Space Grotesk", size: 18, weight: 600, letterSpacing: 4, color: PETAL }),
    b.text("Title", M, 330, 940, "Brand refresh\n2027", { family: "Playfair Display", size: 96, weight: 700, lineHeight: 1.05, color: WHITE }),
    b.text("Subtitle", M, 640, 900, "Goals, timeline and what we need from you", { family: "Inter", size: 24, lineHeight: 1.4, color: WHITE }),
    b.rect("Rule", M, 880, 80, 4, PETAL),
    b.text("Presenter", M, 910, 900, "Maya Ortiz  ·  12 January 2027", { family: "Inter", size: 16, weight: 500, color: PETAL }),
  ]),
  page("brand-kickoff-p2", "Goals", size, "#FFF8FB", [
    b.element("blob-halfmoon", 1516, 150, 260, PETAL),
    b.element("sparkle-four", 1624, 104, 64, BERRY),
    b.text("Kicker", M, 120, 800, "WHERE WE'RE GOING", { family: "Space Grotesk", size: 18, weight: 600, letterSpacing: 4, color: BERRY }),
    b.text("Title", M, 168, 1200, "Three goals for 2027", { family: "Playfair Display", size: 60, weight: 700, lineHeight: 1.1, color: INK }),
    ...goals.flatMap(([head, body], i) => {
      const x = M + i * 560;
      return [
        b.rect(`Card ${i + 1}`, x, 376, 512, 380, "#FFE6F1", 28),
        b.text(`Number ${i + 1}`, x + 48, 424, 416, `0${i + 1}`, { family: "Space Grotesk", size: 44, weight: 700, color: BERRY }),
        b.text(`Goal ${i + 1}`, x + 48, 536, 416, head, { family: "Inter", size: 24, weight: 600, lineHeight: 1.25, color: INK }),
        b.text(`Detail ${i + 1}`, x + 48, 600, 416, body, { family: "Inter", size: 17, lineHeight: 1.5, color: MUTED }),
      ];
    }),
    b.text("Footer", M, 960, 900, "Bloom Studio  ·  Brand refresh 2027", { family: "Inter", size: 14, weight: 500, color: MUTED }),
    b.text("Page number", 1576, 960, 200, "02", { family: "Space Grotesk", size: 14, weight: 600, align: "right", color: BERRY }),
  ]),
]);
