import { builder, page, starterDoc } from "./nodes";

const b = builder("certificate", "mm");
const size = { width: 297, height: 210, unit: "mm", colorMode: "cmyk", bleed: 3 } as const;
const IVORY = "#FFFDF6", NAVY = "#1C2B4A", GOLD = "#B8892B", PALE_GOLD = "#E8C66A", OCHRE = "#7A5A12", SLATE = "#33405C";
const X = 20, W = 257;

export default starterDoc("starter-certificate", "Certificate of achievement", [
  page("certificate-p1", "Certificate", size, IVORY, [
    b.bleedFill(size, IVORY),
    b.outline("Border", 10, 10, 277, 190, NAVY, 1.2),
    b.outline("Inner border", 14, 14, 269, 182, GOLD, 0.4),
    b.text("Kicker", X, 34, W, "CERTIFICATE OF ACHIEVEMENT", { family: "Montserrat", size: 12, weight: 600, letterSpacing: 1.5, align: "center", color: OCHRE }),
    b.text("Presented", X, 50, W, "This certificate is presented to", { family: "Playfair Display", size: 16, align: "center", color: NAVY }),
    b.text("Name", X, 62, W, "Jordan Ellis", { family: "Dancing Script", size: 56, weight: 700, align: "center", color: NAVY }),
    b.rect("Name rule", 88, 94, 121, 0.5, GOLD),
    b.text("Reason", X, 102, W, "for completing the Community Garden Leadership course\nwith care, patience and an excellent compost heap.",
      { family: "Montserrat", size: 12, lineHeight: 1.6, align: "center", color: SLATE }),
    b.element("badge-scallop", 131, 128, 35, PALE_GOLD),
    b.text("Seal", 131, 141.9, 35, "2027", { family: "Playfair Display", size: 14, weight: 700, align: "center", color: NAVY }),
    b.text("Signature", 40, 162, 70, "R. Okafor", { family: "Dancing Script", size: 24, weight: 700, align: "center", color: NAVY }),
    b.rect("Signature line", 40, 174, 70, 0.4, NAVY),
    b.text("Signature label", 40, 177, 70, "Course lead", { family: "Montserrat", size: 9, weight: 500, align: "center", color: SLATE }),
    b.text("Date", 187, 165, 70, "14 June 2027", { family: "Playfair Display", size: 14, align: "center", color: NAVY }),
    b.rect("Date line", 187, 174, 70, 0.4, NAVY),
    b.text("Date label", 187, 177, 70, "Date", { family: "Montserrat", size: 9, weight: 500, align: "center", color: SLATE }),
  ]),
]);
