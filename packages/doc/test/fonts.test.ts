import { describe, expect, it } from "vitest";
import { FONTS } from "../src/fonts";

describe("FONTS", () => {
  it("is a sane catalogue", () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(12);
    const names = FONTS.map((f) => f.family);
    expect(names).toContain("Inter");
    expect(names).toContain("Space Grotesk");
    expect(new Set(names).size).toBe(names.length);
    for (const role of ["sans", "serif", "display", "script", "mono"]) expect(FONTS.some((f) => f.role === role)).toBe(true);
    for (const f of FONTS) {
      expect(f.weights.length).toBeGreaterThan(0);
      for (const w of f.weights) expect([400, 500, 600, 700]).toContain(w);
    }
  });
});
