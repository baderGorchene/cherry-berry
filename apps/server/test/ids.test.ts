import { describe, expect, it } from "vitest";
import { makeWorkspacePublicId, normalizePublicId } from "../src/workspaces/ids";

describe("workspace ids", () => {
  it("slugifies name", () => {
    expect(makeWorkspacePublicId("North Studio!", () => "7Q4K")).toBe("north-studio-7Q4K");
  });
  it("falls back for empty slug", () => {
    expect(makeWorkspacePublicId("!!!", () => "AB23")).toBe("workspace-AB23");
  });
  it("normalizes typed ids", () => {
    expect(normalizePublicId(" North-7q4k ")).toBe("north-7Q4K");
  });
  it("default suffix uses the unambiguous alphabet", () => {
    expect(makeWorkspacePublicId("A")).toMatch(/^a-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });
});
