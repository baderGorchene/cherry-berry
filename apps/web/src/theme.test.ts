import { contrast } from "@cherry/doc";
import { expect, test } from "vitest";

const ink = "#22142A", muted = "#5D4E66", berry = "#8E1EA2", deep = "#4A0E56", tint = "#FFF0F7", surface = "#FBF7FC";
// .badge-kind on phone: rgba(34,20,42,.8) over the worst case, a white thumbnail
const mix = (a: number[], b: number[], t: number) => "#" + a.map((v, i) => Math.round(v * t + b[i]! * (1 - t)).toString(16).padStart(2, "0")).join("");
const phoneBadge = mix([34, 20, 42], [255, 255, 255], 0.8);

test.each([
  ["muted on white", muted, "#FFFFFF"], ["muted on surface", muted, surface], ["muted on tint", muted, tint],
  ["ink on white (chips, tiles)", ink, "#FFFFFF"], ["white on berry (pressed chip, primary button)", "#FFFFFF", berry],
  ["berry link on surface", berry, surface], ["white on deep (Built-in badge)", "#FFFFFF", deep],
  ["white on phone badge over white", "#FFFFFF", phoneBadge],
])("%s has at least 4.5:1 contrast", (_n, fg, bg) => {
  expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
});
