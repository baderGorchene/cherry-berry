import { describe, expect, test, vi } from "vitest";
import { createShape, createText, type CherryNode } from "@cherry/doc";
import { loadPageFonts, pageFontFaces } from "./canvasFonts";

type TextNode = Extract<CherryNode, { kind: "text" }>;
const txt = (fontFamily: string, fontWeight: number) => ({ ...(createText({ x: 0, y: 0 }, 100) as TextNode), fontFamily, fontWeight });

describe("pageFontFaces", () => {
  test("collects unique weight+family faces from top-level and grouped text nodes", () => {
    const t1 = txt("Playfair Display", 700);
    const t2 = txt("Playfair Display", 700);
    const t3 = txt("Dancing Script", 400);
    const grp = {
      ...createShape("rect", { x: 0, y: 0, width: 100, height: 100 }),
      kind: "group",
      children: [t3],
    } as unknown as CherryNode;
    expect(pageFontFaces([t1, t2, grp])).toEqual([
      '700 16px "Playfair Display"',
      '400 16px "Dancing Script"',
    ]);
  });

  test("loadPageFonts calls loader for each unique face", async () => {
    const t = txt("Bebas Neue", 400);
    const load = vi.fn().mockResolvedValue([]);
    await loadPageFonts([t], { load });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('400 16px "Bebas Neue"');
  });
});
