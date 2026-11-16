import { describe, expect, it } from "vitest";
import { FONTS } from "@cherry/doc";
import type { BrandKit } from "../api";
import { BUILT_IN_FONTS, kitFamilies } from "./fonts";

const kit = (families: string[]) => ({
  fonts: families.map((family, i) => ({ id: `f${i}`, kitId: "k", family, weight: 400, style: "normal", format: "woff2", bytes: 1 })),
}) as unknown as BrandKit;

describe("kitFamilies", () => {
  it("adds uploaded families to the built-in ones", () => {
    expect(kitFamilies(kit(["Fraunces"]))).toEqual([...BUILT_IN_FONTS, "Fraunces"]);
  });
  it("lists a family once, however many files carry it", () => {
    const out = kitFamilies(kit(["Inter", "Fraunces", "Fraunces"]));
    expect(out.filter((f) => f === "Inter")).toHaveLength(1);
    expect(out.filter((f) => f === "Fraunces")).toHaveLength(1);
  });
});

describe("BUILT_IN_FONTS", () => {
  it("starts with Inter and holds every catalogue family", () => {
    expect(BUILT_IN_FONTS[0]).toBe("Inter");
    for (const f of FONTS) expect(BUILT_IN_FONTS).toContain(f.family);
  });
});
