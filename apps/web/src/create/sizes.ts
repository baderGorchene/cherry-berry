import type { NewDesign } from "../api";

export type SizeCategory = "social" | "presentation" | "print" | "cards";
export type Size = { id: string; name: string; category: SizeCategory; width: number; height: number; unit: "px" | "mm" | "in"; colorMode: "rgb" | "cmyk"; bleed: number };
export type CreatePane = "for-you" | SizeCategory | "custom" | "open";

const px = (id: string, name: string, category: SizeCategory, width: number, height: number): Size =>
  ({ id, name, category, width, height, unit: "px", colorMode: "rgb", bleed: 0 });
const mm = (id: string, name: string, category: SizeCategory, width: number, height: number): Size =>
  ({ id, name, category, width, height, unit: "mm", colorMode: "cmyk", bleed: 3 });
const inch = (id: string, name: string, category: SizeCategory, width: number, height: number): Size =>
  ({ id, name, category, width, height, unit: "in", colorMode: "cmyk", bleed: 0.125 });

export const SIZES: Size[] = [
  px("instagram-post", "Instagram post", "social", 1080, 1350),
  px("social-post", "Social post", "social", 1080, 1080),
  px("story", "Story", "social", 1080, 1920),
  px("facebook-post", "Facebook post", "social", 1200, 630),
  px("facebook-cover", "Facebook cover", "social", 1640, 624),
  px("linkedin-post", "LinkedIn post", "social", 1200, 627),
  px("x-post", "X post", "social", 1600, 900),
  px("youtube-thumbnail", "YouTube thumbnail", "social", 1280, 720),
  px("pinterest-pin", "Pinterest pin", "social", 1000, 1500),
  px("presentation-16-9", "Presentation 16:9", "presentation", 1920, 1080),
  px("presentation-4-3", "Presentation 4:3", "presentation", 1024, 768),
  mm("a4-print", "A4 print", "print", 210, 297),
  mm("a4-landscape", "A4 landscape", "print", 297, 210),
  mm("a5", "A5", "print", 148, 210),
  inch("us-letter", "US Letter", "print", 8.5, 11),
  mm("a3-poster", "A3 poster", "print", 297, 420),
  inch("poster-18x24", "Poster 18 × 24 in", "print", 18, 24),
  mm("business-card", "Business card", "cards", 85, 55),
  inch("invitation", "Invitation", "cards", 5, 7),
  inch("postcard", "Postcard", "cards", 6, 4),
  inch("greeting-card", "Greeting card", "cards", 5, 7),
];

export const POPULAR = ["instagram-post", "story", "presentation-16-9", "a4-print", "business-card"];

export const CATEGORY_LABEL: Record<SizeCategory, string> = { social: "Social media", presentation: "Presentations", print: "Print", cards: "Cards & invites" };

export const filterSizes = (q: string): Size[] => {
  const s = q.trim().toLowerCase();
  return SIZES.filter((z) => z.name.toLowerCase().includes(s));
};

export const sizeLabel = (z: Size) => `${z.width} × ${z.height} ${z.unit}${z.colorMode === "cmyk" ? " · CMYK" : ""}`;

export const sizeBody = (z: Size): NewDesign =>
  ({ title: "Untitled design", width: z.width, height: z.height, unit: z.unit, colorMode: z.colorMode, ...(z.unit === "px" ? {} : { bleed: z.bleed }) });

const KEY = "cb.recentSizes";
const readIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
};
export const recentSizes = (): Size[] => readIds().flatMap((id) => SIZES.find((z) => z.id === id) ?? []);
export function rememberSize(id: string): void {
  try { localStorage.setItem(KEY, JSON.stringify([id, ...readIds().filter((x) => x !== id)].slice(0, 6))); } catch { /* storage unavailable */ }
}

/** Home's quick-create tiles. */
export const PRESETS: { name: string; size: string; w: number; h: number; bg: string; body: NewDesign }[] = [
  { name: "Social post", size: "1080 × 1080 px", w: 60, h: 60, bg: "var(--blush)",
    body: { title: "Untitled design", width: 1080, height: 1080, unit: "px", colorMode: "rgb" } },
  { name: "A4 print", size: "210 × 297 mm · CMYK", w: 44, h: 64, bg: "var(--orchid)",
    body: { title: "Untitled design", width: 210, height: 297, unit: "mm", colorMode: "cmyk", bleed: 3 } },
  { name: "Presentation", size: "1920 × 1080 px", w: 96, h: 54, bg: "var(--berry)",
    body: { title: "Untitled design", width: 1920, height: 1080, unit: "px", colorMode: "rgb" } },
  { name: "Story", size: "1080 × 1920 px", w: 40, h: 70, bg: "var(--petal)",
    body: { title: "Untitled design", width: 1080, height: 1920, unit: "px", colorMode: "rgb" } },
  { name: "Business card", size: "85 × 55 mm · CMYK", w: 84, h: 48, bg: "#fff",
    body: { title: "Untitled design", width: 85, height: 55, unit: "mm", colorMode: "cmyk", bleed: 3 } },
];
