import { expect, test } from "vitest";
import { formatBytes, KIND_BADGE, LICENSES } from "./assets";

test("formatBytes", () => {
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(5_242_880)).toBe("5 MB");
});

test("every license has both labels, every kind a badge", () => {
  expect(LICENSES.map((l) => l.value)).toEqual(["cc0", "cc-by", "own", "workspace-only"]);
  for (const l of LICENSES) { expect(l.label).toBeTruthy(); expect(l.badge).toBeTruthy(); }
  expect(KIND_BADGE).toEqual({ image: "IMG", gif: "GIF", svg: "SVG" });
});
