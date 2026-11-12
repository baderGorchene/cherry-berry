import { describe, expect, it } from "vitest";
import { imageNode } from "./visuals";

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
  it("takes assetId and name from the asset", () => {
    const n = imageNode({ id: "a3", title: "Dot", width: 8, height: 8 }, page);
    expect(n.kind === "image" && n.assetId).toBe("a3");
    expect(n.name).toBe("Dot");
  });
});
