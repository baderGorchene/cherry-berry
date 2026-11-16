import type { Paint, Stroke } from "./schema";

export type ElementCategory = "Blobs" | "Sparkles" | "Badges" | "Doodles";

/** A built-in vector element: `d` is drawn in a `width`×`height` box from (0,0). */
export type ElementPreset = {
  id: string;
  name: string;
  category: ElementCategory;
  tags: string[];
  d: string;
  width: number;
  height: number;
  fillRule: "nonzero" | "evenodd";
  fill?: Paint;
  stroke?: Stroke;
};

export const ELEMENT_CATEGORIES: ElementCategory[] = ["Blobs", "Sparkles", "Badges", "Doodles"];

/** Curated aesthetic vector elements (100×100 viewBox). */
export const ELEMENTS: ElementPreset[] = [
  {
    id: "blob-organic", name: "Organic blob", category: "Blobs", tags: ["organic", "blob", "boho", "abstract"],
    width: 100, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#ED96D7", opacity: 1 },
    d: "M 54 8 C 78 6 95 24 92 49 C 89 74 71 94 46 92 C 21 90 6 70 9 45 C 12 20 30 10 54 8 Z",
  },
  {
    id: "blob-pebble", name: "Soft pebble", category: "Blobs", tags: ["minimal", "organic", "shape", "boho"],
    width: 100, height: 84, fillRule: "nonzero", fill: { type: "solid", color: "#FFC0DE", opacity: 1 },
    d: "M 22 10 C 48 2 84 12 94 36 C 102 58 84 82 52 82 C 20 82 4 64 4 40 C 4 22 10 14 22 10 Z",
  },
  {
    id: "blob-arch", name: "Boho arch", category: "Blobs", tags: ["boho", "arch", "frame", "minimal"],
    width: 80, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#C654C3", opacity: 1 },
    d: "M 0 40 A 40 40 0 0 1 80 40 L 80 100 L 0 100 Z",
  },
  {
    id: "blob-halfmoon", name: "Half moon", category: "Blobs", tags: ["boho", "minimal", "geometric"],
    width: 100, height: 50, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 0 50 A 50 50 0 0 1 100 50 Z",
  },
  {
    id: "sparkle-four", name: "Sparkle", category: "Sparkles", tags: ["sparkle", "y2k", "cute", "star"],
    width: 100, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 50 0 C 55 36 64 45 100 50 C 64 55 55 64 50 100 C 45 64 36 55 0 50 C 36 45 45 36 50 0 Z",
  },
  {
    id: "sparkle-burst", name: "Sunburst", category: "Sparkles", tags: ["retro", "burst", "sticker", "badge"],
    width: 100, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#C654C3", opacity: 1 },
    d: "M 50 0 L 58 26 L 82 12 L 70 38 L 98 42 L 74 56 L 92 80 L 64 74 L 62 100 L 46 78 L 24 94 L 30 68 L 2 66 L 26 50 L 8 28 L 36 34 L 36 6 Z",
  },
  {
    id: "sparkle-flower", name: "Daisy", category: "Sparkles", tags: ["retro", "flower", "cute", "y2k"],
    width: 100, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#ED96D7", opacity: 1 },
    d: "M 50 10 C 62 10 68 24 58 34 C 72 26 88 34 86 48 C 84 60 70 60 60 54 C 70 66 68 84 54 88 C 42 90 36 76 42 64 C 28 74 12 66 14 52 C 16 40 30 40 40 46 C 30 34 32 16 46 12 Z",
  },
  {
    id: "sparkle-heart", name: "Heart", category: "Sparkles", tags: ["cute", "love", "sticker", "social"],
    width: 100, height: 90, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 50 88 C 50 88 4 56 4 28 C 4 12 16 2 30 2 C 40 2 47 8 50 16 C 53 8 60 2 70 2 C 84 2 96 12 96 28 C 96 56 50 88 50 88 Z",
  },
  {
    id: "badge-scallop", name: "Seal badge", category: "Badges", tags: ["badge", "sticker", "retro", "label"],
    width: 100, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 50 4 C 58 4 62 10 68 8 C 76 6 82 14 86 20 C 92 24 96 32 92 40 C 98 46 98 54 92 60 C 96 68 92 76 86 80 C 82 86 76 94 68 92 C 62 90 58 96 50 96 C 42 96 38 90 32 92 C 24 94 18 86 14 80 C 8 76 4 68 8 60 C 2 54 2 46 8 40 C 4 32 8 24 14 20 C 18 14 24 6 32 8 C 38 10 42 4 50 4 Z",
  },
  {
    id: "badge-bubble", name: "Speech bubble", category: "Badges", tags: ["quote", "social", "sticker", "ui"],
    width: 100, height: 86, fillRule: "nonzero", fill: { type: "solid", color: "#FFC0DE", opacity: 1 },
    d: "M 16 4 L 84 4 A 12 12 0 0 1 96 16 L 96 56 A 12 12 0 0 1 84 68 L 40 68 L 20 84 L 24 68 L 16 68 A 12 12 0 0 1 4 56 L 4 16 A 12 12 0 0 1 16 4 Z",
  },
  {
    id: "badge-ribbon", name: "Banner ribbon", category: "Badges", tags: ["banner", "label", "retro", "quote"],
    width: 120, height: 48, fillRule: "nonzero", fill: { type: "solid", color: "#C654C3", opacity: 1 },
    d: "M 0 8 L 110 8 L 120 24 L 110 40 L 0 40 L 10 24 Z",
  },
  {
    id: "badge-pill", name: "Pill tag", category: "Badges", tags: ["minimal", "ui", "badge", "label"],
    width: 120, height: 44, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 22 0 L 98 0 A 22 22 0 0 1 98 44 L 22 44 A 22 22 0 0 1 22 0 Z",
  },
  {
    id: "doodle-wave", name: "Wave divider", category: "Doodles", tags: ["pattern", "wave", "abstract", "minimal"],
    width: 120, height: 32, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 0 18 C 20 2 40 30 60 16 C 80 2 100 30 120 14 L 120 26 C 100 40 80 12 60 26 C 40 40 20 12 0 26 Z",
  },
  {
    id: "doodle-cloud", name: "Cloud", category: "Doodles", tags: ["cute", "doodle", "sticker"],
    width: 100, height: 64, fillRule: "nonzero", fill: { type: "solid", color: "#FFC0DE", opacity: 1 },
    d: "M 24 60 L 78 60 A 18 18 0 0 0 80 24 A 24 24 0 0 0 34 16 A 20 20 0 0 0 24 60 Z",
  },
  {
    id: "doodle-bolt", name: "Lightning", category: "Doodles", tags: ["y2k", "sticker", "doodle", "retro"],
    width: 72, height: 100, fillRule: "nonzero", fill: { type: "solid", color: "#8E1EA2", opacity: 1 },
    d: "M 42 0 L 4 56 L 34 56 L 26 100 L 68 42 L 38 42 Z",
  },
];
