import type { CherryDocument, CherryNode, Page } from "./schema";
import { toPx } from "./units";

export type ExportFormat = "pdf-print" | "pdf-x" | "plates" | "pdf" | "png" | "jpg" | "svg" | "gif" | "pptx" | "cherry";
export type ExportAsset = {
  id: string; title: string; license: "cc0" | "cc-by" | "own" | "workspace-only"; attribution: string;
  width: number; height: number; kind: "image" | "gif" | "svg"; available: boolean;
};
export type CheckId = "fonts" | "bleed" | "safe-area" | "resolution" | "licenses" | "color";
export type PreflightCheck = {
  id: CheckId; status: "pass" | "warn"; title: string; detail: string; nodes: { pageId: string; nodeId: string }[];
};
export type ExportBody = {
  format: Exclude<ExportFormat, "cherry">; pageIds: string[];
  scale?: 1 | 2 | 3; transparent?: boolean; cropMarks?: boolean; secondsPerPage?: number;
};

type Hit = { pageId: string; node: CherryNode; top: boolean };

function* walk(pageId: string, nodes: CherryNode[], top = true): Generator<Hit> {
  for (const node of nodes) {
    if (node.hidden) continue;
    yield { pageId, node, top };
    if (node.kind === "group") yield* walk(pageId, node.children, false);
  }
}

export function usedAssetIds(pages: Page[]): string[] {
  const ids = new Set<string>();
  for (const p of pages) for (const h of walk(p.id, p.nodes)) if (h.node.kind === "image") ids.add(h.node.assetId);
  return [...ids];
}

const ref = (h: Hit) => ({ pageId: h.pageId, nodeId: h.node.id });
const MM_PX = 96 / 25.4;
const hasText = (n: CherryNode): boolean => n.kind === "text" || (n.kind === "group" && n.children.some(hasText));

export function preflight(
  doc: CherryDocument,
  opts: { format: ExportFormat; pageIds: string[]; scale: number },
  env: { fonts: string[]; assets: ExportAsset[]; print?: boolean },
): PreflightCheck[] {
  const { format } = opts;
  const printed = format === "pdf-print" || format === "pdf-x" || format === "plates";
  const pages = doc.pages.filter((p) => opts.pageIds.includes(p.id));
  const hits = pages.flatMap((p) => [...walk(p.id, p.nodes)]);
  const out: PreflightCheck[] = [];
  const add = (id: CheckId, nodes: Hit[] | { pageId: string; nodeId: string }[], titles: [string, string], pass: string, warn: string) => {
    const refs = nodes.map((n) => ("node" in n ? ref(n) : n));
    out.push({ id, status: refs.length ? "warn" : "pass", title: refs.length ? titles[1] : titles[0], detail: refs.length ? warn : pass, nodes: refs });
  };

  if (format !== "pptx" && format !== "cherry") {
    const bad = hits.filter((h) => h.node.kind === "text" && !env.fonts.includes(h.node.fontFamily));
    const fam = [...new Set(bad.map((h) => (h.node as { fontFamily: string }).fontFamily))];
    const one = fam.length === 1;
    add("fonts", bad, ["Fonts available", "Font substituted"], "All fonts are available.",
      `${fam.join(", ")} ${one ? "isn't" : "aren't"} on this server, so ${one ? "it" : "they"} will be replaced.`);
  }

  if (printed) {
    const noBleed = pages.filter((p) => p.bleed === 0);
    out.push({
      id: "bleed", status: noBleed.length ? "warn" : "pass", title: noBleed.length ? "No bleed" : "Bleed covered",
      detail: noBleed.length ? "Printers usually need 3 mm of bleed. Set it in the page settings." : "Bleed is set.", nodes: [],
    });
    const near = hits.filter((h) => {
      if (!h.top || !hasText(h.node)) return false;
      const p = pages.find((q) => q.id === h.pageId)!;
      const m = 5 * MM_PX, n = h.node;
      const [x, y, w, hh] = [toPx(n.x, p.unit), toPx(n.y, p.unit), toPx(n.width, p.unit), toPx(n.height, p.unit)];
      return x < m || y < m || x + w > toPx(p.width, p.unit) - m || y + hh > toPx(p.height, p.unit) - m;
    });
    add("safe-area", near, ["Text inside safe area", "Text near the edge"], "Text sits inside the safe area.",
      `${near.length} text layer${near.length === 1 ? "" : "s"} sit${near.length === 1 ? "s" : ""} less than 5 mm from the trim.`);
  }

  const byId = new Map(env.assets.map((a) => [a.id, a]));
  if (format !== "cherry") {
    const need = printed ? 300 : format === "pdf" ? 150 : ["png", "jpg", "gif"].includes(format) ? 96 * opts.scale : 96;
    const low: { hit: Hit; asset: ExportAsset; ppi: number }[] = [];
    for (const h of hits) {
      if (h.node.kind !== "image") continue;
      const a = byId.get(h.node.assetId);
      if (!a || a.kind === "svg") continue;
      const p = pages.find((q) => q.id === h.pageId)!;
      const ppi = a.width / (toPx(h.node.width, p.unit) / 96);
      if (ppi < need) low.push({ hit: h, asset: a, ppi });
    }
    const first = low[0];
    const more = new Set(low.map((l) => l.asset.id)).size - 1;
    add("resolution", low.map((l) => l.hit), ["Images sharp", "Low-resolution image"], "Images are sharp enough.",
      first ? `"${first.asset.title}" is ${Math.round(first.ppi)} ppi at this size${more > 0 ? ` (and ${more} more)` : ""}. ${need} ppi is recommended.` : "");
  }

  {
    const imgs = hits.filter((h) => h.node.kind === "image");
    const problems: string[] = [];
    const bad: Hit[] = [];
    const seen = new Set<string>();
    for (const h of imgs) {
      const a = byId.get((h.node as { assetId: string }).assetId);
      if (!a) continue;
      const msg = !a.available ? `"${a.title}" is unavailable and will show as a placeholder.`
        : a.license === "workspace-only" ? `"${a.title}" is licensed for use inside this workspace only.` : "";
      if (!msg) continue;
      bad.push(h);
      if (!seen.has(a.id)) { seen.add(a.id); problems.push(msg); }
    }
    const credits = new Set(imgs.map((h) => byId.get((h.node as { assetId: string }).assetId)).filter((a) => a?.license === "cc-by").map((a) => a!.id)).size;
    add("licenses", bad, ["Licenses & attribution", "Licenses & attribution"],
      credits ? `${credits} CC BY visual${credits === 1 ? "" : "s"}: credit added to export notes` : "No credits needed", problems.join(" "));
  }

  if (format !== "cherry") {
    const cmyk = pages.some((p) => p.colorMode === "cmyk");
    const done = cmyk && env.print && (format === "pdf-x" || format === "plates");
    out.push({
      id: "color", status: cmyk && !done ? "warn" : "pass", title: done ? "Converted to CMYK" : cmyk ? "Exported as RGB" : "Colors",
      detail: done ? "Converted to CMYK with the print service"
        : cmyk && env.print ? "Exported as RGB. Choose PDF/X or Colour plates for CMYK."
        : cmyk ? "CMYK and PDF/X come with the print service; spot swatches aren't supported yet." : "Colors export as RGB.",
      nodes: [],
    });
  }
  return out;
}

export function creditsText(assets: ExportAsset[]): string {
  return assets.filter((a) => a.license === "cc-by").map((a) => `"${a.title}" by ${a.attribution}, CC BY 4.0`).join("\n");
}
