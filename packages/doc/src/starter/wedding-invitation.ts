import { builder, page, starterDoc } from "./nodes";
import { BERRY, BLUSH, INK, MUTED, ORCHID, PETAL } from "./palette";

const b = builder("wedding-invitation", "in");
const X = 0.5, W = 4;

export default starterDoc("starter-wedding-invitation", "Wedding invitation", [
  page("wedding-invitation-p1", "Invitation", { width: 5, height: 7, unit: "in", colorMode: "cmyk", bleed: 0.125 }, "#FFF8FB", [
    b.bleedFill({ width: 5, height: 7, bleed: 0.125 }, "#FFF8FB"),
    b.element("blob-organic", -0.125, -0.125, 2.1, PETAL),
    b.element("blob-pebble", 3.325, 5.613, 1.8, BLUSH),
    b.outline("Border", 0.3, 0.3, 4.4, 6.4, BERRY, 0.012),
    b.text("Kicker", X, 1.25, W, "TOGETHER WITH THEIR FAMILIES",
      { family: "Montserrat", size: 7.5, weight: 500, letterSpacing: 0.025, align: "center", color: BERRY }),
    b.text("Names", X, 1.55, W, "Amara\n& Theo",
      { family: "Dancing Script", size: 56, weight: 700, lineHeight: 1.05, align: "center", color: BERRY }),
    b.element("sparkle-four", 2.37, 3.32, 0.26, ORCHID),
    b.text("Invitation", X, 3.78, W, "request the pleasure of your company\nas they celebrate their marriage",
      { family: "Lora", size: 11.5, lineHeight: 1.55, align: "center", color: INK }),
    b.text("Date", X, 4.55, W, "SATURDAY, 20 SEPTEMBER 2027\nFOUR O'CLOCK IN THE AFTERNOON",
      { family: "Montserrat", size: 8, weight: 600, letterSpacing: 0.02, lineHeight: 1.7, align: "center", color: BERRY }),
    b.text("Venue", X, 5.12, W, "Larkspur Gardens\n14 Hill Road, Hudson, New York",
      { family: "Lora", size: 11, lineHeight: 1.5, align: "center", color: INK }),
    b.text("RSVP", X, 5.85, W, "Kindly reply by 1 August",
      { family: "Montserrat", size: 7, weight: 500, letterSpacing: 0.02, align: "center", color: MUTED }),
  ]),
]);
