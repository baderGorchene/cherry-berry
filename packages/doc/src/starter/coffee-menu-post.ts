import { builder, page, starterDoc } from "./nodes";

const b = builder("coffee-menu-post", "px");
const CREAM = "#F6EBDD", CLAY = "#C8643B", RUST = "#9E4521", ESPRESSO = "#3B2418", PEACH = "#F2C49B";
const M = 88;

const items = [["Maple latte", "Oat milk and maple", "4.20"], ["Chai bun", "Cardamom glaze", "3.60"], ["Pear tart", "Brown butter", "4.80"]] as const;

export default starterDoc("starter-coffee-menu-post", "Autumn menu post", [
  page("coffee-menu-post-p1", "Post", { width: 1080, height: 1080, unit: "px", colorMode: "rgb", bleed: 0 }, CREAM, [
    b.ellipse("Sun", 560, 72, 440, 440, CLAY),
    b.element("sparkle-flower", 760, 360, 190, PEACH, { rotation: 12 }),
    b.text("Kicker", M, 104, 420, "NEW THIS WEEK", { family: "Poppins", size: 18, weight: 600, letterSpacing: 4, color: RUST }),
    b.text("Headline", M, 150, 440, "Autumn\nmenu\nis here", { family: "Lora", size: 84, weight: 700, lineHeight: 1.02, color: ESPRESSO }),
    b.text("Body", M, 560, 640, "Toasted, spiced and baked fresh\nevery morning until it sells out.",
      { family: "Poppins", size: 20, lineHeight: 1.5, color: ESPRESSO }),
    b.rect("Menu card", M, 708, 904, 240, ESPRESSO, 28),
    ...items.flatMap(([name, note, price], i) => {
      const x = M + 48 + i * 288;
      return [
        b.text(`Item ${i + 1}`, x, 752, 260, name, { family: "Lora", size: 26, weight: 700, color: CREAM }),
        b.text(`Note ${i + 1}`, x, 806, 260, note, { family: "Poppins", size: 14, color: CREAM }),
        b.text(`Price ${i + 1}`, x, 862, 260, price, { family: "Poppins", size: 22, weight: 600, color: PEACH }),
      ];
    }),
    b.text("Footer", M, 990, 904, "Corner Bean Café  ·  open daily 7 am – 4 pm", { family: "Poppins", size: 16, weight: 500, color: ESPRESSO }),
  ]),
]);
