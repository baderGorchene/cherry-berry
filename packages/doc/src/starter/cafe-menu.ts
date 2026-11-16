import { builder, page, starterDoc } from "./nodes";

const b = builder("cafe-menu", "mm");
const size = { width: 148, height: 210, unit: "mm", colorMode: "cmyk", bleed: 3 } as const;
const CREAM = "#FBF4EA", ESPRESSO = "#3A2318", CARAMEL = "#C98A4B", BISCUIT = "#F1DFC8", RUST = "#8A4B1C", MUTED = "#6B5446";
const X = 16, W = 116;

const sections = [
  ["COFFEE", 58, [["Espresso", "2.40"], ["Flat white", "3.20"], ["Cardamom latte", "3.80"], ["Cold brew", "3.50"]]],
  ["BAKERY", 106, [["Butter croissant", "2.90"], ["Cinnamon knot", "3.40"], ["Almond loaf slice", "3.20"], ["Seeded rye toast", "4.50"]]],
  ["LUNCH", 154, [["Soup of the day", "6.50"], ["Leek and cheddar tart", "8.00"], ["Market salad bowl", "9.50"]]],
] as const;

export default starterDoc("starter-cafe-menu", "Café menu", [
  page("cafe-menu-p1", "Menu", size, CREAM, [
    b.element("blob-halfmoon", 108, -3, 43, BISCUIT, { rotation: 180 }),
    b.element("blob-pebble", -3, 186, 30, BISCUIT),
    b.text("Kicker", X, 14, W, "THE LITTLE CORNER CAFÉ", { family: "Inter", size: 8, weight: 600, letterSpacing: 0.8, align: "center", color: RUST }),
    b.text("Title", X, 19, W, "Menu", { family: "Playfair Display", size: 40, weight: 700, align: "center", color: ESPRESSO }),
    b.element("doodle-wave", 62, 40, 24, CARAMEL),
    ...sections.flatMap(([label, y, items]) => [
      b.text(`${label} label`, X, y, W, label, { family: "Inter", size: 8, weight: 700, letterSpacing: 0.8, color: RUST }),
      b.rect(`${label} rule`, X, y + 4.4, W, 0.3, CARAMEL),
      ...items.flatMap(([name, price], i) => [
        b.text(`${name}`, X, y + 7 + i * 8.5, 90, name, { family: "Playfair Display", size: 12, color: ESPRESSO }),
        b.text(`${name} price`, X + W - 26, y + 7.4 + i * 8.5, 26, price, { family: "Inter", size: 10, weight: 600, align: "right", color: ESPRESSO }),
      ]),
    ]),
    b.text("Footer", X, 194, W, "Oat milk at no extra charge  ·  ask us about allergens",
      { family: "Inter", size: 7.5, align: "center", color: MUTED }),
  ]),
]);
