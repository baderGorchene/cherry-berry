import { describe, expect, it } from "vitest";
import { alignBoxes, distributeBoxes, snapBox } from "./layout";

describe("snapBox", () => {
  it("snaps to page center and sibling edge within threshold", () => {
    const page = { width: 800, height: 600 };
    const sibling = { x: 100, y: 120, width: 80, height: 40 };
    const res = snapBox({ x: 358, y: 118, width: 80, height: 50 }, [sibling], page, 5);
    expect(res.dx).toBe(2); // 358 + 40 = 398 -> snaps to page center 400
    expect(res.dy).toBe(2); // 118 -> snaps to sibling top 120
    expect(res.guides).toEqual({ vertical: 400, horizontal: 120 });
  });

  it("returns zero delta when nothing is within threshold", () => {
    const res = snapBox({ x: 50, y: 50, width: 40, height: 40 }, [], { width: 800, height: 600 }, 5);
    expect(res).toEqual({ dx: 0, dy: 0, guides: {} });
  });
});

describe("alignBoxes", () => {
  const page = { width: 800, height: 600 };

  it("aligns a single box to the page", () => {
    const box = [{ id: "a", x: 10, y: 20, width: 100, height: 50 }];
    expect(alignBoxes(box, "center", page)).toEqual([{ id: "a", x: 350 }]);
    expect(alignBoxes(box, "bottom", page)).toEqual([{ id: "a", y: 550 }]);
  });

  it("aligns multiple boxes to their shared bounds", () => {
    const boxes = [
      { id: "a", x: 50, y: 10, width: 40, height: 20 },
      { id: "b", x: 110, y: 80, width: 60, height: 40 },
    ];
    expect(alignBoxes(boxes, "right", page)).toEqual([{ id: "a", x: 130 }, { id: "b", x: 110 }]);
    expect(alignBoxes(boxes, "middle", page)).toEqual([{ id: "a", y: 55 }, { id: "b", y: 45 }]);
  });
});

describe("distributeBoxes", () => {
  it("spaces 3+ boxes evenly while keeping outer two fixed", () => {
    const boxes = [
      { id: "a", x: 0, y: 0, width: 20, height: 10 },
      { id: "b", x: 30, y: 0, width: 20, height: 10 },
      { id: "c", x: 100, y: 0, width: 20, height: 10 },
    ];
    expect(distributeBoxes(boxes, "x")).toEqual([{ id: "b", x: 50 }]);
  });
});
