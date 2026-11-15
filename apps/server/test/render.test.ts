import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "konva/skia-backend";
import Konva from "konva";
import { Canvas, FontLibrary, loadImage, type Image } from "skia-canvas";
import { PT_PX, UNIT_PX, toPx, type CherryNode, type Page } from "@cherry/doc";
import { drawPage, loadImages, nodePng, pagePx } from "../src/export/render";
import { availableFamilies, kitFamily, registerBuiltInFonts, useKitFonts } from "../src/export/fonts";

registerBuiltInFonts();

const base = { name: "n", rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
const solid = (color: string, opacity = 1) => ({ type: "solid" as const, color, opacity });
const page = (nodes: CherryNode[], over: Partial<Page> = {}): Page => ({
  id: "p", name: "P", width: 400, height: 300, unit: "px", colorMode: "rgb", bleed: 0, background: solid("#FBF7FC"), nodes, ...over,
});

const NODES: CherryNode[] = [
  { ...base, id: "r", kind: "rect", x: 20, y: 20, width: 120, height: 80, rotation: 15, cornerRadius: 12,
    fill: solid("#8E1EA2"), stroke: { paint: solid("#22142A"), width: 4 } },
  { ...base, id: "e", kind: "ellipse", x: 180, y: 20, width: 100, height: 60, fill: solid("#ED96D7", 0.8),
    stroke: { paint: solid("#C654C3"), width: 2 } },
  { ...base, id: "p", kind: "path", x: 300, y: 20, width: 80, height: 80, d: "M0 0H80V80H0Z M20 20H60V60H20Z",
    fillRule: "evenodd", fill: solid("#1E7A46") },
  { ...base, id: "t", kind: "text", x: 20, y: 140, width: 200, height: 80, text: "Cherry Berry renders wrapped centred text",
    fontFamily: "Inter", fontSize: 14, fontWeight: 600, lineHeight: 1.3, letterSpacing: 1.5, align: "center", fill: solid("#22142A") },
  { ...base, id: "i", kind: "image", x: 240, y: 140, width: 60, height: 60, assetId: "img" },
  { ...base, id: "g", kind: "group", x: 300, y: 160, width: 80, height: 100, opacity: 0.5, children: [
    { ...base, id: "gr", kind: "rect", x: 10, y: 10, width: 60, height: 60, cornerRadius: 0, fill: solid("#B45309") },
  ] },
];

const rgba = (p: { color: string; opacity: number }) =>
  `rgba(${parseInt(p.color.slice(1, 3), 16)},${parseInt(p.color.slice(3, 5), 16)},${parseInt(p.color.slice(5, 7), 16)},${p.opacity})`;
const paint = (p?: { color: string; opacity: number }) => p && (p.opacity < 1 ? rgba(p) : p.color);

/** The oracle: the editor's NodeView, built imperatively with Konva. */
function konvaNode(n: CherryNode, unit: Page["unit"], images: Map<string, Image | null>): Konva.Node {
  const w = n.width / 2, h = n.height / 2;
  const common = { x: n.x + w, y: n.y + h, offsetX: w, offsetY: h, rotation: n.rotation, opacity: n.opacity, visible: !n.hidden };
  const stroke = (s?: { paint: { color: string; opacity: number }; width: number }) => s ? { stroke: paint(s.paint), strokeWidth: s.width } : {};
  switch (n.kind) {
    case "rect": return new Konva.Rect({ ...common, width: n.width, height: n.height, cornerRadius: n.cornerRadius, fill: paint(n.fill), ...stroke(n.stroke) });
    case "ellipse": return new Konva.Ellipse({ ...common, offsetX: 0, offsetY: 0, radiusX: w, radiusY: h, fill: paint(n.fill), ...stroke(n.stroke) });
    case "path": return new Konva.Path({ ...common, data: n.d, fill: paint(n.fill), fillRule: n.fillRule, ...stroke(n.stroke) });
    case "text": return new Konva.Text({
      ...common, text: n.text, width: n.width, fontFamily: n.fontFamily, fontSize: (n.fontSize * PT_PX) / UNIT_PX[unit],
      fontStyle: String(n.fontWeight), lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, align: n.align, fill: paint(n.fill),
    });
    case "image": {
      const g = new Konva.Group(common), img = images.get(n.assetId);
      if (img) g.add(new Konva.Image({ image: img as unknown as HTMLImageElement, width: n.width, height: n.height }));
      else {
        g.add(new Konva.Rect({ width: n.width, height: n.height, fill: "#D9D2DC" }));
        g.add(new Konva.Text({ text: "Image unavailable", width: n.width, height: n.height, align: "center", verticalAlign: "middle",
          fontSize: Math.max(1, Math.min(n.width, n.height) / 6), fill: "#5D4E66" }));
      }
      return g;
    }
    case "group": {
      const g = new Konva.Group(common);
      n.children.forEach((c) => g.add(konvaNode(c, unit, images) as Konva.Group));
      return g;
    }
  }
}

function oracle(p: Page, images: Map<string, Image | null>) {
  const u = toPx(1, p.unit), width = Math.ceil(pagePx(p).width), height = Math.ceil(pagePx(p).height);
  Konva.pixelRatio = 1;
  const stage = new Konva.Stage({ width, height } as Konva.StageConfig);
  const layer = new Konva.Layer();
  const g = new Konva.Group({ scaleX: u, scaleY: u });
  g.add(new Konva.Rect({ width: p.width, height: p.height, fill: paint(p.background) }));
  p.nodes.forEach((n) => g.add(konvaNode(n, p.unit, images) as Konva.Group));
  layer.add(g);
  stage.add(layer);
  layer.draw();
  // The layer's own canvas: stage.toCanvas() re-composites and adds antialiasing differences of its own.
  const c = layer.getNativeCanvasElement() as unknown as Canvas;
  const data = c.getContext("2d").getImageData(0, 0, width, height).data;
  stage.destroy();
  return data;
}

function ours(p: Page, images: Map<string, Image | null>, opts?: { background?: boolean }) {
  const width = Math.ceil(pagePx(p).width), height = Math.ceil(pagePx(p).height);
  const ctx = new Canvas(width, height).getContext("2d");
  drawPage(ctx, p, images, opts);
  return ctx.getImageData(0, 0, width, height).data;
}

async function twoByTwo() {
  const c = new Canvas(2, 2), ctx = c.getContext("2d");
  ctx.fillStyle = "#FF0000"; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#0000FF"; ctx.fillRect(1, 0, 1, 1);
  ctx.fillStyle = "#00FF00"; ctx.fillRect(0, 1, 2, 1);
  return new Uint8Array(await c.toBuffer("png"));
}

const px = (d: ArrayLike<number> & { slice(a: number, b: number): ArrayLike<number> }, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

describe("render", () => {
  it("matches Konva for every node kind", async () => {
    const png = await twoByTwo();
    const images = await loadImages(["img", "img"], async (id) => (id === "img" ? png : null));
    expect(images.get("img")).toBeTruthy();
    const p = page(NODES);
    const a = ours(p, images), b = oracle(p, images);
    let bad = 0;
    for (let i = 0; i < a.length; i += 4) {
      if ([0, 1, 2, 3].some((k) => Math.abs(a[i + k]! - b[i + k]!) > 16)) bad++;
    }
    const share = bad / (a.length / 4);
    console.log(`pixels differing by >16: ${bad} (${(share * 100).toFixed(3)}%)`);
    expect(share).toBeLessThan(0.01);
  });

  it("matches Konva on an mm page with a placeholder", async () => {
    const mmNodes: CherryNode[] = [
      { ...base, id: "t", kind: "text", x: 5, y: 5, width: 60, height: 20, text: "Left aligned text that wraps onto lines",
        fontFamily: "Space Grotesk", fontSize: 12, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0, align: "right", fill: solid("#8E1EA2", 0.7) },
      { ...base, id: "i", kind: "image", x: 70, y: 5, width: 30, height: 20, rotation: 30, assetId: "gone" },
    ];
    const p = page(mmNodes, { width: 105, height: 74, unit: "mm" });
    const images = await loadImages(["gone"], async () => null);
    const a = ours(p, images), b = oracle(p, images);
    let bad = 0;
    for (let i = 0; i < a.length; i += 4) if ([0, 1, 2, 3].some((k) => Math.abs(a[i + k]! - b[i + k]!) > 16)) bad++;
    console.log(`mm page pixels differing by >16: ${bad}`);
    expect(bad / (a.length / 4)).toBeLessThan(0.01);
  });

  it("unavailable image draws the placeholder", async () => {
    const p = page([{ ...base, id: "i", kind: "image", x: 100, y: 100, width: 120, height: 60, assetId: "x" }]);
    const images = await loadImages(["x"], async () => new Uint8Array([1, 2, 3])); // undecodable → unavailable
    expect(images.get("x")).toBeNull();
    const d = ours(p, images);
    expect(px(d, 400, 104, 130)).toEqual([0xd9, 0xd2, 0xdc, 255]);
  });

  it("hidden nodes are skipped", () => {
    const p = page([{ ...base, id: "r", kind: "rect", x: 0, y: 0, width: 400, height: 300, cornerRadius: 0, fill: solid("#000000"), hidden: true }]);
    expect(px(ours(p, new Map()), 400, 200, 150)).toEqual([0xfb, 0xf7, 0xfc, 255]);
  });

  it("background:false leaves transparent pixels", () => {
    const p = page([{ ...base, id: "r", kind: "rect", x: 0, y: 0, width: 10, height: 10, cornerRadius: 0, fill: solid("#000000") }]);
    const d = ours(p, new Map(), { background: false });
    expect(px(d, 400, 200, 150)[3]).toBe(0);
    expect(px(d, 400, 5, 5)).toEqual([0, 0, 0, 255]);
  });

  it("background fills the bleed", () => {
    const p = page([], { bleed: 10 });
    const ctx = new Canvas(420, 320).getContext("2d");
    ctx.translate(10, 10);
    drawPage(ctx, p, new Map());
    expect(px(ctx.getImageData(0, 0, 420, 320).data, 420, 2, 2)).toEqual([0xfb, 0xf7, 0xfc, 255]);
  });

  it("nodePng is sized to the node box at scale", async () => {
    const buf = await nodePng(NODES[2]!, page(NODES), new Map(), 2);
    const img = await loadImage(buf);
    expect([img.width, img.height]).toEqual([160, 160]);
  });

  it("built-in fonts draw ASCII with their own glyphs", () => {
    const ctx = new Canvas(10, 10, { gpu: false }).getContext("2d");
    const width = (family: string) => { ctx.font = `400 20px "${family}"`; return ctx.measureText("Hello").width; };
    for (const pkg of ["inter", "space-grotesk"] as const) {
      const family = pkg === "inter" ? "Inter" : "Space Grotesk";
      FontLibrary.use(`only-${pkg}`, [fileURLToPath(new URL(`../node_modules/@fontsource/${pkg}/files/${pkg}-latin-400-normal.woff2`, import.meta.url))]);
      expect(width(family)).toBeCloseTo(width(`only-${pkg}`), 3);
    }
  });

  it("kit font registers once", async () => {
    const font = (await import("node:fs")).readFileSync(
      new URL("../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", import.meta.url));
    let reads = 0;
    const id = randomUUID();
    const kitId = randomUUID();
    const kit = [{ id, kitId, family: "Kit Sans", format: "woff2", bytes: async () => { reads++; return new Uint8Array(font); } }];
    expect(await useKitFonts(kit)).toEqual(new Map([["Kit Sans", kitFamily(kitId, "Kit Sans")]]));
    expect(await useKitFonts(kit)).toEqual(new Map([["Kit Sans", kitFamily(kitId, "Kit Sans")]]));
    expect(reads).toBe(1);
    // Registered under its private family only: no other design can pick it up by name.
    expect(FontLibrary.has("Inter") && FontLibrary.has("Space Grotesk") && FontLibrary.has(kitFamily(kitId, "Kit Sans"))).toBe(true);
    expect(FontLibrary.has("Kit Sans")).toBe(false);
    expect(kitFamily(randomUUID(), "Kit Sans")).not.toBe(kitFamily(kitId, "Kit Sans"));
    expect(availableFamilies(["Kit Sans"])).toEqual(["Inter", "Space Grotesk", "Kit Sans"]);
  });

  it("a corrupt cached kit font is replaced by the real bytes", async () => {
    const font = readFileSync(new URL("../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", import.meta.url));
    const id = randomUUID(), kitId = randomUUID();
    const dir = join(tmpdir(), "cherry-fonts"), file = join(dir, `${id}.woff2`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from("wOF2 truncated"));
    const map = await useKitFonts([{ id, kitId, family: "Torn Sans", format: "woff2", bytes: async () => new Uint8Array(font) }]);
    expect(map).toEqual(new Map([["Torn Sans", kitFamily(kitId, "Torn Sans")]]));
    expect(readFileSync(file).equals(font)).toBe(true);
  });

  it("a text layer can't name another design's private kit family", async () => {
    const font = readFileSync(new URL("../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2", import.meta.url));
    const kitId = randomUUID();
    await useKitFonts([{ id: randomUUID(), kitId, family: "Other Sans", format: "woff2", bytes: async () => new Uint8Array(font) }]);
    const leak = kitFamily(kitId, "Other Sans");
    const textAs = (fontFamily: string) => ours(page([{ ...base, id: "t", kind: "text", x: 10, y: 10, width: 380, height: 80,
      text: "Hello berry", fontFamily, fontSize: 30, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left", fill: solid("#000000") }]), new Map());
    const fallback = Buffer.from(textAs("sans-serif"));
    expect(Buffer.from(textAs("Inter")).equals(fallback)).toBe(false);
    expect(Buffer.from(textAs(leak)).equals(fallback)).toBe(true);
    expect(Buffer.from(textAs(leak.toUpperCase())).equals(fallback)).toBe(true);
    expect(Buffer.from(textAs(`Nope Sans, ${leak}`)).equals(fallback)).toBe(true);
  });
});
