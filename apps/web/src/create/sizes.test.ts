import { beforeEach, expect, test, vi } from "vitest";
import { POPULAR, SIZES, filterSizes, recentSizes, rememberSize } from "./sizes";

const dims = (name: string) => { const z = SIZES.find((s) => s.name === name)!; return [z.width, z.height, z.unit]; };

test("SIZES has every spec size with exact dimensions", () => {
  const want: [string, number, number, string][] = [
    ["Instagram post", 1080, 1350, "px"], ["Social post", 1080, 1080, "px"], ["Story", 1080, 1920, "px"],
    ["Facebook post", 1200, 630, "px"], ["Facebook cover", 1640, 624, "px"], ["LinkedIn post", 1200, 627, "px"],
    ["X post", 1600, 900, "px"], ["YouTube thumbnail", 1280, 720, "px"], ["Pinterest pin", 1000, 1500, "px"],
    ["Presentation 16:9", 1920, 1080, "px"], ["Presentation 4:3", 1024, 768, "px"],
    ["A4 print", 210, 297, "mm"], ["A4 landscape", 297, 210, "mm"], ["A5", 148, 210, "mm"],
    ["US Letter", 8.5, 11, "in"], ["A3 poster", 297, 420, "mm"], ["Poster 18 × 24 in", 18, 24, "in"],
    ["Business card", 85, 55, "mm"], ["Invitation", 5, 7, "in"], ["Postcard", 6, 4, "in"], ["Greeting card", 5, 7, "in"],
  ];
  expect(SIZES).toHaveLength(want.length);
  for (const [n, w, h, u] of want) expect(dims(n)).toEqual([w, h, u]);
});

test("print and cards are CMYK with bleed; ids are unique", () => {
  for (const z of SIZES.filter((s) => s.category === "print" || s.category === "cards")) {
    expect(z.colorMode).toBe("cmyk");
    expect(z.bleed).toBe(z.unit === "in" ? 0.125 : 3);
  }
  expect(new Set(SIZES.map((z) => z.id)).size).toBe(SIZES.length);
  expect(POPULAR.map((id) => SIZES.find((z) => z.id === id)?.name)).toEqual(["Instagram post", "Story", "Presentation 16:9", "A4 print", "Business card"]);
});

test("filterSizes matches names case-insensitively", () => {
  const r = filterSizes("POST");
  expect(r.length).toBeGreaterThan(3);
  expect(r.every((z) => z.name.toLowerCase().includes("post"))).toBe(true);
});

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});

test("rememberSize dedupes, keeps 6, and survives a throwing localStorage", () => {
  for (const id of ["story", "a5", "story", "postcard", "invitation", "x-post", "social-post", "a3-poster"]) rememberSize(id);
  expect(recentSizes().map((z) => z.id)).toEqual(["a3-poster", "social-post", "x-post", "invitation", "postcard", "story"]);
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } });
  expect(() => rememberSize("a5")).not.toThrow();
  expect(recentSizes()).toEqual([]);
});
