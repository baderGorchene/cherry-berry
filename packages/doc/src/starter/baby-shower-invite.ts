import { builder, page, starterDoc } from "./nodes";

const b = builder("baby-shower-invite", "in");
const size = { width: 5, height: 7, unit: "in", colorMode: "cmyk", bleed: 0.125 } as const;
const PEACH = "#FFE8DC", BLUSH = "#F6C9B4", SAGE = "#7FA58C", PINE = "#2F4F3E", TERRACOTTA = "#C8664A";
const X = 0.9, W = 3.2;

export default starterDoc("starter-baby-shower-invite", "Baby shower invitation", [
  page("baby-shower-invite-p1", "Invitation", size, PEACH, [
    b.element("blob-arch", X, 0.8, W, BLUSH),
    b.element("blob-pebble", -0.125, 5.9, 1.4, SAGE),
    b.element("sparkle-four", 4.15, 0.45, 0.4, SAGE),
    b.element("sparkle-four", 0.45, 1.2, 0.25, TERRACOTTA),
    b.text("Kicker", X, 1.55, W, "JOIN US FOR A BABY SHOWER", { family: "Montserrat", size: 8, weight: 600, letterSpacing: 0.015, align: "center", color: PINE }),
    b.text("Headline", X, 1.85, W, "Oh baby!", { family: "Dancing Script", size: 56, weight: 700, align: "center", color: PINE }),
    b.text("Honouring", X, 2.95, W, "honouring Priya Shah", { family: "Montserrat", size: 12, weight: 500, align: "center", color: PINE }),
    b.element("sparkle-heart", 2.25, 3.45, 0.5, TERRACOTTA),
    b.text("Details", X, 4.05, W, "SUNDAY 12 OCTOBER  ·  2 PM\n18 ORCHARD ROW",
      { family: "Montserrat", size: 9, weight: 600, letterSpacing: 0.015, lineHeight: 1.7, align: "center", color: PINE }),
    b.text("Note", X - 0.4, 5.15, W + 0.8, "Brunch, games and a little sprinkle of love",
      { family: "Montserrat", size: 10, align: "center", color: PINE }),
    b.text("RSVP", X, 5.55, W, "RSVP to Leah by 1 October", { family: "Montserrat", size: 8, weight: 500, align: "center", color: PINE }),
  ]),
]);
