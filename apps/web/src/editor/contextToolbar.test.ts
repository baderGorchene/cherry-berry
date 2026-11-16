import { describe, expect, it } from "vitest";
import { createDocument, type CherryNode } from "@cherry/doc";
import { boldWeight, docColors, freshCopies, groupNodes, toolbarKind, ungroupNode } from "./selection";

const base = { name: "n", x: 10, y: 20, width: 40, height: 30, rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" } as const;
const fill = (color: string) => ({ type: "solid", color, opacity: 1 }) as const;
const rect = (id: string, x = 10, y = 20): CherryNode => ({ ...base, id, x, y, kind: "rect", cornerRadius: 0, fill: fill("#8E1EA2") });
const text: CherryNode = {
  ...base, id: "t", kind: "text", text: "Hi", fontFamily: "Inter", fontSize: 12, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left", fill: fill("#22142A"),
} as CherryNode;
const of = (kind: string) => ({ ...rect("x"), kind }) as unknown as CherryNode;

describe("toolbarKind", () => {
  it("names the toolbar for each selection", () => {
    expect(toolbarKind([])).toBe("none");
    expect(toolbarKind([text])).toBe("text");
    expect(toolbarKind([rect("a")])).toBe("shape");
    expect(toolbarKind([of("ellipse")])).toBe("shape");
    expect(toolbarKind([of("path")])).toBe("path");
    expect(toolbarKind([of("image")])).toBe("image");
    expect(toolbarKind([of("group")])).toBe("group");
    expect(toolbarKind([rect("a"), text])).toBe("multi");
  });
});

describe("boldWeight", () => {
  it("toggles between 400 and 700 within the family's weights", () => {
    expect(boldWeight(400, [400, 700])).toBe(700);
    expect(boldWeight(700, [400, 700])).toBe(400);
    expect(boldWeight(400, [400])).toBe(400);
    expect(boldWeight(500, [400, 500, 600])).toBe(600);
    expect(boldWeight(600, [400, 500, 600])).toBe(400);
    expect(boldWeight(400, [300, 400, 600])).toBe(600);
  });
});

describe("docColors", () => {
  it("lists each fill, stroke and background colour once", () => {
    const doc = createDocument({ title: "T", width: 100, height: 100, unit: "px", colorMode: "rgb" });
    doc.pages[0]!.nodes = [rect("a"), { ...rect("b"), stroke: { paint: fill("#c654c3"), width: 1 } } as CherryNode, text];
    expect(docColors(doc)).toEqual([doc.pages[0]!.background.color.toUpperCase(), "#8E1EA2", "#C654C3", "#22142A"]);
  });
});

describe("groupNodes / ungroupNode", () => {
  it("round-trips the children's page positions", () => {
    const g = groupNodes([rect("a", 10, 20), rect("b", 100, 60)], "Group");
    expect(g).toMatchObject({ kind: "group", x: 10, y: 20, width: 130, height: 70 });
    const kids = g.kind === "group" ? g.children : [];
    expect(kids.map((k) => [k.x, k.y])).toEqual([[0, 0], [90, 40]]);
    expect(ungroupNode(g).map((k) => [k.id, k.x, k.y])).toEqual([["a", 10, 20], ["b", 100, 60]]);
  });

  it("bakes the group's rotation and opacity into its children", () => {
    const g = { ...groupNodes([rect("a", 0, 0), rect("b", 60, 0)], "Group"), rotation: 180, opacity: 0.5 };
    const [a, b] = ungroupNode(g);
    expect(a!.x).toBeCloseTo(60);
    expect(b!.x).toBeCloseTo(0);
    expect(a!.rotation).toBe(180);
    expect(a!.opacity).toBe(0.5);
  });
});

describe("freshCopies", () => {
  it("renews every id, offsets and drops brand locks unless kept", () => {
    const g = groupNodes([{ ...rect("a"), brandLock: "fixed" }], "Group");
    const [c] = freshCopies([g], 5, false);
    expect(c!.id).not.toBe(g.id);
    expect(c!.x).toBe(g.x + 5);
    const kid = c!.kind === "group" ? c!.children[0]! : c!;
    expect(kid.id).not.toBe("a");
    expect(kid.brandLock).toBe("none");
    expect((freshCopies([g], 0, true)[0] as Extract<CherryNode, { kind: "group" }>).children[0]!.brandLock).toBe("fixed");
  });
});
