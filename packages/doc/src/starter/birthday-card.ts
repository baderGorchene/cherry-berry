import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("birthday-card", "in");
const size = { width: 5, height: 7, unit: "in", colorMode: "cmyk", bleed: 0.125 } as const;
const SKY = "#DFF1FF", SUN = "#FFC93C", TOMATO = "#E2483D", NAVY = "#1B2A4E", MINT = "#6CC5A0";
const X = 0.4, W = 4.2;

const confetti = [
  [0.6, 6.3, SUN, 30], [1.3, 6.55, TOMATO, -20], [2.1, 6.25, MINT, 60], [3.0, 6.5, SUN, -40], [3.8, 6.3, TOMATO, 15],
  [4.3, 1.9, MINT, 45], [0.5, 1.95, TOMATO, -30],
] as const;

export default starterDoc("starter-birthday-card", "Birthday card", [
  page("birthday-card-p1", "Front", size, SKY, [
    b.bleedFill(size, SKY),
    b.element("doodle-cloud", 0.35, 0.45, 1.6, WHITE),
    b.element("doodle-cloud", 3.1, 0.95, 1.4, WHITE),
    b.ellipse("Sun", 2.05, 0.5, 0.9, 0.9, SUN),
    b.element("sparkle-four", 3.9, 0.35, 0.4, SUN),
    ...confetti.map(([x, y, c, r], i) => b.rect(`Confetti ${i + 1}`, x, y, 0.28, 0.1, c, 0.02, { rotation: r })),
    b.text("Greeting", X, 2.25, W, "Happy\nbirthday!", { family: "Pacifico", size: 48, lineHeight: 1.25, align: "center", color: NAVY }),
    b.element("sparkle-heart", 2.2, 4.2, 0.6, TOMATO),
    b.text("Message", X, 5.0, W, "Another lap around the sun.\nHope it's a bright one.",
      { family: "Poppins", size: 12, lineHeight: 1.5, align: "center", color: NAVY }),
    b.text("From", X, 5.75, W, "WITH LOVE FROM ALL OF US", { family: "Poppins", size: 8, weight: 600, letterSpacing: 0.02, align: "center", color: NAVY }),
  ]),
]);
