import { contrast } from "@cherry/doc";
import { expect, test } from "vitest";

const ink = "#22142A", muted = "#5D4E66", berry = "#8E1EA2", deep = "#4A0E56", tint = "#FFF0F7", surface = "#FBF7FC";
const dSurface = "#121014", dElevated = "#1B181D", dInk = "#F2ECE4", dMuted = "#A9A1A8", dBerry = "#DE8FEE", dPetal = "#47304D";
const dTint = "#2A1D2E", dBlush = "#E9B3F3", dBerrySolid = "#9B2BB0", dCherry = "#F0606A", dSuccess = "#7BD8A0";
// .badge-kind on phone: rgba(34,20,42,.8) over the worst case, a white thumbnail
const mix = (a: number[], b: number[], t: number) => "#" + a.map((v, i) => Math.round(v * t + b[i]! * (1 - t)).toString(16).padStart(2, "0")).join("");
const phoneBadge = mix([34, 20, 42], [255, 255, 255], 0.8);

test.each([
  ["muted on white", muted, "#FFFFFF"], ["muted on surface", muted, surface], ["muted on tint", muted, tint],
  ["ink on white (chips, tiles)", ink, "#FFFFFF"], ["white on berry (pressed chip, primary button)", "#FFFFFF", berry],
  ["berry link on surface", berry, surface], ["white on deep (Built-in badge)", "#FFFFFF", deep],
  ["white on phone badge over white", "#FFFFFF", phoneBadge],
  ["dark ink on dark surface", dInk, dSurface], ["dark ink on dark elevated", dInk, dElevated],
  ["dark muted on dark surface", dMuted, dSurface], ["dark muted on dark elevated", dMuted, dElevated],
  ["dark berry link on dark surface", dBerry, dSurface], ["dark ink on dark petal badge", dInk, dPetal],
  ["dark blush on dark tint (kicker, badges)", dBlush, dTint], ["white on dark berry solid (primary button)", "#FFFFFF", dBerrySolid],
  ["dark cherry on dark surface", dCherry, dSurface], ["dark success on dark elevated", dSuccess, dElevated],
])("%s has at least 4.5:1 contrast", (_n, fg, bg) => {
  expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
});
