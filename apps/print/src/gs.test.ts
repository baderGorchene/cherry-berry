import { describe, expect, it } from "vitest";
import { pdfxArgs, platesArgs, plateFiles } from "./gs.ts";

describe("gs args", () => {
  it("pdfxArgs asks for CMYK PDF/X-3 with the profile", () => {
    const a = pdfxArgs("in.pdf", "out.pdf", "/icc/fogra39.icc");
    for (const f of [
      "-dPDFX=3",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sOutputICCProfile=/icc/fogra39.icc",
      "--permit-file-read=/icc/fogra39.icc",
      "-sOutputFile=out.pdf",
    ]) {
      expect(a).toContain(f);
    }
    expect(a.at(-1)).toBe("in.pdf");
  });

  it("pdfxArgs without a profile uses the bundled default", () => {
    expect(pdfxArgs("in.pdf", "out.pdf", undefined).some((x) => x.includes("ICC"))).toBe(false);
  });

  it("platesArgs clamps dpi to 72..300", () => {
    expect(platesArgs("in.pdf", "/o", 10)).toContain("-r72");
    expect(platesArgs("in.pdf", "/o", 9999)).toContain("-r300");
    expect(platesArgs("in.pdf", "/o", 150.4)).toContain("-r150");
    expect(platesArgs("in.pdf", "/o", Number.NaN)).toContain("-r150");
    expect(platesArgs("in.pdf", "/o", 150)).toContain("-sDEVICE=tiffsep");
  });

  it("plateFiles maps names to pages and plates", () => {
    const got = plateFiles(["p2(Black).tif", "p1.tif", "p1(Cyan).tif", "p1(PANTONE 185 C).tif", "p10(Cyan).tif", "notes.txt"]);
    expect(got).toEqual([
      { page: 1, name: "Cyan", file: "p1(Cyan).tif" },
      { page: 1, name: "PANTONE 185 C", file: "p1(PANTONE 185 C).tif" },
      { page: 2, name: "Black", file: "p2(Black).tif" },
      { page: 10, name: "Cyan", file: "p10(Cyan).tif" },
    ]);
  });
});
