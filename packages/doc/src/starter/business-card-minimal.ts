import { builder, page, starterDoc } from "./nodes";
import { WHITE } from "./palette";

const b = builder("business-card-minimal", "mm");
const size = { width: 85, height: 55, unit: "mm", colorMode: "cmyk", bleed: 3 } as const;
const TEAL = "#0E5E6F", MINT = "#D8F0EC", INK = "#1D2B30", GREY = "#4A5A60";

export default starterDoc("starter-business-card-minimal", "Minimal business card", [
  page("business-card-minimal-p1", "Front", size, WHITE, [
    b.rect("Strip", -3, -3, 22, 61, TEAL),
    b.element("sparkle-four", 4, 21.5, 12, MINT),
    b.text("Name", 27, 12, 54, "Noor Haddad", { family: "Space Grotesk", size: 14, weight: 700, color: INK }),
    b.text("Role", 27, 19, 54, "Landscape architect", { family: "Inter", size: 8, weight: 500, color: GREY }),
    b.rect("Rule", 27, 27, 10, 0.5, TEAL),
    b.text("Contact", 27, 32, 54, "+44 20 7946 0000\nnoor@fieldwork.example\nfieldwork.example",
      { family: "Inter", size: 7.5, lineHeight: 1.5, color: INK }),
  ]),
  page("business-card-minimal-p2", "Back", size, TEAL, [
    b.element("blob-pebble", 58, 32, 30, "#16707F"),
    b.text("Studio", 5, 19, 75, "Fieldwork", { family: "Space Grotesk", size: 24, weight: 700, align: "center", color: WHITE }),
    b.text("Tagline", 5, 29.5, 75, "Studio for public gardens", { family: "Inter", size: 8, weight: 500, align: "center", color: MINT }),
  ]),
]);
