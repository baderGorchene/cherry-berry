import { describe, expect, it } from "vitest";
import { FONTS } from "@cherry/doc";
import type { BrandKit } from "../api";
import { BUILT_IN_FONTS, kitFamilies, queryLocalFamilies } from "./fonts";

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

describe("theme.css Google Fonts URL", () => {
  it("loads every catalogue weight of Inter and Space Grotesk", async () => {
    const { readFileSync } = await import("node:fs");
    const url = readFileSync(new URL("../theme.css", import.meta.url), "utf8").split("\n")[0]!;
    for (const f of FONTS.filter((f) => ["Inter", "Space Grotesk"].includes(f.family))) {
      const m = new RegExp(`family=${f.family.replace(" ", "[+]")}:wght@([0-9;]+)`).exec(url);
      expect(m, f.family).not.toBeNull();
      expect(m![1]!.split(";").map(Number)).toEqual(expect.arrayContaining(f.weights));
    }
  });
});

describe("queryLocalFamilies", () => {
  it("lists each installed family once, sorted", async () => {
    const q = async () => [{ family: "Zed" }, { family: "Arial" }, { family: "Zed" }];
    expect(await queryLocalFamilies(q)).toEqual({ families: ["Arial", "Zed"] });
  });
  it("falls back clearly when the API is missing or permission is refused", async () => {
    expect(await queryLocalFamilies(undefined)).toEqual({ error: "unsupported" });
    expect(await queryLocalFamilies(async () => { throw new DOMException("no", "NotAllowedError"); })).toEqual({ error: "denied" });
  });
});
