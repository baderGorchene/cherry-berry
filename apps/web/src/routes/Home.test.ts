import { expect, test } from "vitest";
import { edited } from "./Home";

test("edited shows a relative time", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const ago = (s: number) => edited(new Date(now - s * 1000).toISOString(), now);
  expect(ago(5)).toBe("Edited just now");
  expect(ago(120)).toBe("Edited 2 minutes ago");
  expect(ago(3 * 3600)).toBe("Edited 3 hours ago");
  expect(ago(86400)).toBe("Edited yesterday");
  expect(ago(400 * 86400)).toBe("Edited last year");
});
