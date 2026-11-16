import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("open-studio-poster", "in");
const size = { width: 18, height: 24, unit: "in", colorMode: "cmyk", bleed: 0.125 } as const;
const PAPER = "#F7F3EC", RED = "#D7263D", BLUE = "#1B4B9B", BLACK = "#151515";
const X = 1;

export default starterDoc("starter-open-studio-poster", "Open studio poster", [
  page("open-studio-poster-p1", "Poster", size, PAPER, [
    b.bleedFill(size, PAPER),
    b.rect("Red block", -0.125, -0.125, 9.125, 12.125, RED),
    b.ellipse("Blue circle", 9.6, 1.4, 7.6, 7.6, BLUE),
    b.element("sparkle-four", 14.6, 9.6, 1.8, BLACK),
    b.text("Dates", X, 1, 7.4, "2 – 3 MAY", { family: "Montserrat", size: 80, weight: 700, color: WHITE }),
    b.text("Intro", X, 8.9, 7.4, "Twelve artists open\ntheir doors for one\nweekend.", { family: "Montserrat", size: 32, weight: 500, lineHeight: 1.25, color: WHITE }),
    b.text("Headline", X - 0.15, 12.7, 16.4, "OPEN\nSTUDIO", { family: "Bebas Neue", size: 300, lineHeight: 0.84, color: BLACK }),
    b.rect("Rule", X, 20.3, 16, 0.06, BLACK),
    b.text("When", X, 20.7, 16, "Saturday and Sunday  ·  11 am – 6 pm", { family: "Montserrat", size: 36, weight: 600, color: BLACK }),
    b.text("Where", X, 21.55, 16, "Ropewalk Studios, Unit 4  ·  free entry, all welcome", { family: "Montserrat", size: 26, color: BLACK }),
    b.text("Web", X, 22.6, 16, "ropewalk.example", { family: "Inter", size: 20, weight: 600, color: BLUE }),
  ]),
]);
