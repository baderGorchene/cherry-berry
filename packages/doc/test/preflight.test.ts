import { describe, expect, it } from "vitest";
import { createDocument } from "../src/create";
import type { CherryNode } from "../src/schema";
import { creditsText, preflight, usedAssetIds, type ExportAsset } from "../src/preflight";

const base = { rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const };
const text = (id: string, fontFamily: string, x = 20, extra: Partial<CherryNode> = {}): CherryNode =>
  ({ ...base, id, name: id, kind: "text", x, y: 20, width: 30, height: 10, text: "hi", fontFamily, fontSize: 12, ...extra }) as CherryNode;
const image = (id: string, assetId: string, width = 50.8, extra: Partial<CherryNode> = {}): CherryNode =>
  ({ ...base, id, name: id, kind: "image", x: 20, y: 20, width, height: 10, assetId, ...extra }) as CherryNode;
const group = (id: string, children: CherryNode[]): CherryNode =>
  ({ ...base, id, name: id, kind: "group", x: 20, y: 20, width: 30, height: 30, children }) as CherryNode;
const asset = (id: string, extra: Partial<ExportAsset> = {}): ExportAsset =>
  ({ id, title: id, license: "own", attribution: "", width: 600, height: 600, kind: "image", available: true, ...extra });

function mk(nodes: CherryNode[], bleed = 3) {
  const d = createDocument({ title: "T", width: 210, height: 297, unit: "mm", colorMode: "rgb", bleed });
  d.pages[0]!.nodes = nodes;
  return d;
}
const run = (d: ReturnType<typeof mk>, format: Parameters<typeof preflight>[1]["format"], assets: ExportAsset[] = [], scale = 1, fonts = ["Inter"]) =>
  preflight(d, { format, pageIds: [d.pages[0]!.id], scale }, { fonts, assets });
const get = (cs: ReturnType<typeof run>, id: string) => cs.find((c) => c.id === id);

describe("preflight", () => {
  it("fonts check names missing families", () => {
    const d = mk([text("a", "Georgia"), text("b", "Inter")]);
    const c = get(run(d, "pdf"), "fonts")!;
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("Georgia");
    expect(c.detail).not.toContain("Inter");
    expect(c.nodes).toEqual([{ pageId: d.pages[0]!.id, nodeId: "a" }]);
  });

  it("bleed and safe area only for print", () => {
    const d = mk([text("a", "Inter", 2)], 0);
    const png = run(d, "png");
    expect(get(png, "bleed")).toBeUndefined();
    expect(get(png, "safe-area")).toBeUndefined();
    const print = run(d, "pdf-print");
    expect(get(print, "bleed")!.status).toBe("warn");
    expect(get(print, "safe-area")!.status).toBe("warn");
  });

  it("resolution uses ppi per format", () => {
    const small = mk([image("i", "a", 50.8)]);
    const big = mk([image("i", "a", 101.6)]);
    const a = [asset("a")];
    expect(get(run(small, "pdf-print", a), "resolution")!.status).toBe("pass");
    const w = get(run(big, "pdf-print", a), "resolution")!;
    expect(w.status).toBe("warn");
    expect(w.detail).toContain("150 ppi");
    expect(get(run(big, "png", a, 2), "resolution")!.status).toBe("warn");
    expect(get(run(small, "png", a, 2), "resolution")!.status).toBe("pass");
  });

  it("svg assets never warn on resolution", () => {
    const d = mk([image("i", "a", 500)]);
    expect(get(run(d, "pdf-print", [asset("a", { kind: "svg" })]), "resolution")!.status).toBe("pass");
  });

  it("licenses reports unavailable and workspace-only", () => {
    const d = mk([image("i", "a"), image("j", "b"), image("k", "c")]);
    const assets = [asset("a", { available: false }), asset("b", { license: "workspace-only" }), asset("c", { license: "cc-by", attribution: "Ann" })];
    const c = get(run(d, "png", assets), "licenses")!;
    expect(c.status).toBe("warn");
    expect(c.detail).toContain('"a" is unavailable and will show as a placeholder.');
    expect(c.detail).toContain('"b" is licensed for use inside this workspace only.');
    expect(c.nodes.map((n) => n.nodeId)).toEqual(["i", "j"]);
    const ok = get(run(mk([image("k", "c")]), "png", assets), "licenses")!;
    expect(ok).toMatchObject({ status: "pass", detail: "1 CC BY visual: credit added to export notes" });
    expect(get(run(mk([]), "png"), "licenses")!.detail).toBe("No credits needed");
    expect(creditsText([...assets, asset("d", { license: "cc-by", title: "Sun", attribution: "Bo" })])).toBe(
      '"c" by Ann, CC BY 4.0\n"Sun" by Bo, CC BY 4.0');
    expect(creditsText([asset("x")])).toBe("");
  });

  it("hidden nodes and unexported pages are ignored", () => {
    const d = mk([text("a", "Georgia", 20, { hidden: true }), group("g", [text("h", "Georgia", 20, { hidden: true })])]);
    d.pages.push({ ...structuredClone(d.pages[0]!), id: "p2", nodes: [text("z", "Georgia")] });
    const cs = run(d, "pdf");
    expect(get(cs, "fonts")!.status).toBe("pass");
    expect(get(cs, "color")).toBeDefined();
  });

  it("usedAssetIds finds nested images once", () => {
    const d = mk([image("i", "a"), group("g", [image("j", "b"), image("k", "a"), image("h", "z", 1, { hidden: true })])]);
    expect(usedAssetIds(d.pages)).toEqual(["a", "b"]);
  });
});
