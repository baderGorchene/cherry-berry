import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("recipe-pin", "px");
const BUTTER = "#FFF6D6", OLIVE = "#4F5B1E", TOMATO = "#D9472B", BRICK = "#A8361C", INK = "#2E2A1F", LEMON = "#FFE14D", HONEY = "#F2D36B";
const M = 80, W = 1000 - 2 * M;

export default starterDoc("starter-recipe-pin", "Recipe pin", [
  page("recipe-pin-p1", "Pin", { width: 1000, height: 1500, unit: "px", colorMode: "rgb", bleed: 0 }, BUTTER, [
    b.text("Script", M, 80, W, "Quick lunch", { family: "Pacifico", size: 56, align: "center", color: TOMATO }),
    b.text("Headline", M, 220, W, "5-minute\nlemon pasta", { family: "DM Sans", size: 76, weight: 700, lineHeight: 1.05, align: "center", color: OLIVE }),
    b.ellipse("Plate rim", 250, 490, 500, 500, HONEY),
    b.ellipse("Plate", 300, 540, 400, 400, WHITE),
    b.ellipse("Lemon", 390, 630, 220, 220, LEMON),
    b.element("sparkle-flower", 435, 675, 130, BUTTER),
    b.element("sparkle-four", 760, 520, 70, TOMATO),
    b.text("List label", M, 1060, W, "YOU NEED", { family: "DM Sans", size: 18, weight: 700, letterSpacing: 4, color: BRICK }),
    b.text("List 1", M, 1104, 400, "Spaghetti\nLemon zest\nParmesan", { family: "DM Sans", size: 22, lineHeight: 1.5, color: INK }),
    b.text("List 2", 520, 1104, 400, "Butter\nBlack pepper\nFresh basil", { family: "DM Sans", size: 22, lineHeight: 1.5, color: INK }),
    b.element("badge-pill", 300, 1310, 400, OLIVE),
    b.text("Button", 300, 1366, 400, "Save for later", { family: "DM Sans", size: 26, weight: 700, align: "center", color: BUTTER }),
  ]),
]);
