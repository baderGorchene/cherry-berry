import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("podcast-thumbnail", "px");
const NIGHT = "#111111", LIME = "#C6F432", GREY = "#A8A8A8";
const M = 72;

export default starterDoc("starter-podcast-thumbnail", "Podcast episode thumbnail", [
  page("podcast-thumbnail-p1", "Thumbnail", { width: 1280, height: 720, unit: "px", colorMode: "rgb", bleed: 0 }, NIGHT, [
    b.ellipse("Disc", 820, 80, 420, 420, LIME),
    b.element("badge-bubble", 900, 150, 260, WHITE, { rotation: -6 }),
    b.text("Bubble label", 900, 222, 260, "NEW!", { family: "Space Grotesk", size: 44, weight: 700, align: "center", color: NIGHT }),
    b.text("Episode", M, 72, 600, "EP. 042", { family: "JetBrains Mono", size: 30, weight: 700, color: LIME }),
    b.text("Title", M, 136, 720, "Slow\nmornings", { family: "Space Grotesk", size: 96, weight: 700, lineHeight: 1, color: WHITE }),
    b.text("Guests", M, 420, 720, "with the Morning Shift crew", { family: "Space Grotesk", size: 28, weight: 500, color: GREY }),
    b.rect("Strip", 0, 620, 1280, 100, LIME),
    b.text("Strip label", M, 654, 1136, "NEW EPISODES EVERY TUESDAY", { family: "JetBrains Mono", size: 20, weight: 700, letterSpacing: 2, color: NIGHT }),
  ]),
]);
