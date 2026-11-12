import { describe, expect, it } from "vitest";
import { imageNode, usableIn } from "./visuals";

const page = { width: 1080, height: 1080 };

describe("imageNode", () => {
  it("fits a wide asset inside 60% of the page and centres it", () => {
    const n = imageNode({ id: "a1", title: "Wide", width: 4000, height: 2000 }, page);
    expect([n.width, n.height, n.x, n.y, n.rotation]).toEqual([648, 324, 216, 378, 0]);
  });
  it("fits a tall asset by its height", () => {
    const n = imageNode({ id: "a2", title: "Tall", width: 100, height: 400 }, page);
    expect([n.width, n.height]).toEqual([162, 648]);
  });
  it("falls back to a square of 60% of the smaller page side for a zero-dimension asset", () => {
    const n = imageNode({ id: "a4", title: "Zero", width: 0, height: 0 }, { width: 1000, height: 500 });
    expect([n.width, n.height, n.x, n.y]).toEqual([300, 300, 350, 100]);
  });
  it("takes assetId and name from the asset", () => {
    const n = imageNode({ id: "a3", title: "Dot", width: 8, height: 8 }, page);
    expect(n.kind === "image" && n.assetId).toBe("a3");
    expect(n.name).toBe("Dot");
  });
});

describe("usableIn", () => {
  it("keeps private, public and this workspace's assets; hides other workspaces'", () => {
    const a = (visibility: "private" | "workspace" | "public", workspaceId: string | null) => ({ visibility, workspaceId });
    expect([a("private", null), a("public", null), a("workspace", "w1"), a("workspace", "w2")].map((x) => usableIn(x, "w1")))
      .toEqual([true, true, true, false]);
  });
});
