import { describe, expect, test } from "vitest";
import { PRESENCE_COLORS, colorFor, initials, read, type AwarenessLike } from "./presence";

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

  test("read skips peers with malformed state", () => {
    const good = { user: { id: "u", name: "Ada", color: "#fff" }, selection: ["a"], cursor: { x: 1, y: 2 } };
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { id: "me", name: "Me", color: "#fff" } }],
      [2, good],
      [3, { ...good, user: { id: "x", name: 1, color: "#fff" } }],
      [4, { ...good, selection: "a" }],
      [5, { ...good, cursor: { x: "1", y: 2 } }],
      [6, { ...good, pageId: 7 }],
    ]);
    const peers = read({ clientID: 1, getStates: () => states } as unknown as AwarenessLike);
    expect(peers.map((p) => p.clientId)).toEqual([2]);
  });
});
