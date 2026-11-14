import { describe, expect, test } from "vitest";
import { PRESENCE_COLORS, colorFor, initials } from "./presence";

describe("presence", () => {
  test("colorFor is stable and in the list", () => {
    for (const id of ["a", "user-1", "9f2c"]) {
      expect(colorFor(id)).toBe(colorFor(id));
      expect(PRESENCE_COLORS).toContain(colorFor(id));
    }
  });

  test("initials", () => {
    expect(initials("Ada King")).toBe("AK");
    expect(initials("ada")).toBe("A");
    expect(initials("Ada Lovelace King")).toBe("AL");
  });
});
