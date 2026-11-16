import { FONTS, type CherryDocument, type CherryNode } from "@cherry/doc";
import type { BrandKit } from "../api";
import { toPage } from "./pathEdit";

export type ToolbarKind = "none" | "text" | "shape" | "path" | "image" | "group" | "multi";

/** Which context toolbar a selection gets. */
export function toolbarKind(nodes: CherryNode[]): ToolbarKind {
  if (nodes.length === 0) return "none";
  if (nodes.length > 1) return "multi";
  const k = nodes[0]!.kind;
  return k === "rect" || k === "ellipse" ? "shape" : k;
}

/** Bold on (toward 700) or off (toward 400), landing on the weight the family has that is nearest. */
export function boldWeight(current: number, available: number[]): number {
  const target = current >= 600 ? 400 : 700;
  return available.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), current);
}

/** The weights a family can draw: the catalogue's, a kit font's, or regular and bold for system fonts. */
export function fontWeights(family: string, kit: BrandKit | null): number[] {
  const builtIn = FONTS.find((f) => f.family === family)?.weights;
  const fromKit = kit?.fonts.filter((f) => f.family === family).map((f) => f.weight);
  return builtIn ?? (fromKit?.length ? [...new Set(fromKit)].sort((a, b) => a - b) : [400, 700]);
}

/** Every colour the document uses (page backgrounds, fills, strokes), upper-case, each once. */
export function docColors(doc: CherryDocument, max = 16): string[] {
  const out = new Set<string>();
  const walk = (nodes: CherryNode[]) => nodes.forEach((n) => {
    if ("fill" in n && n.fill) out.add(n.fill.color.toUpperCase());
    if ("stroke" in n && n.stroke) out.add(n.stroke.paint.color.toUpperCase());
    if (n.kind === "group") walk(n.children);
  });
  for (const p of doc.pages) { out.add(p.background.color.toUpperCase()); walk(p.nodes); }
  return [...out].slice(0, max);
}

/** One group around `nodes` (in their order); children are stored relative to the group's box. */
export function groupNodes(nodes: CherryNode[], name: string): CherryNode {
  const x = Math.min(...nodes.map((n) => n.x)), y = Math.min(...nodes.map((n) => n.y));
  const width = Math.max(...nodes.map((n) => n.x + n.width)) - x, height = Math.max(...nodes.map((n) => n.y + n.height)) - y;
  return {
    id: crypto.randomUUID(), kind: "group", name, x, y, width, height, rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none",
    children: nodes.map((n) => ({ ...n, x: n.x - x, y: n.y - y })),
  };
}

/** A group's children placed back on the page, with the group's rotation and opacity baked in. */
export function ungroupNode(g: CherryNode): CherryNode[] {
  if (g.kind !== "group") return [];
  return g.children.map((k) => {
    const c = toPage(g, { x: k.x + k.width / 2, y: k.y + k.height / 2 });
    return { ...k, x: c.x - k.width / 2, y: c.y - k.height / 2, rotation: (k.rotation + g.rotation) % 360, opacity: k.opacity * g.opacity };
  });
}

/** Deep copies with fresh ids, moved by `offset`; brand locks are dropped unless `keepLocks` (only owners and admins set them). */
export function freshCopies(nodes: CherryNode[], offset: number, keepLocks: boolean): CherryNode[] {
  const renew = (n: CherryNode): CherryNode => ({
    ...n, id: crypto.randomUUID(), brandLock: keepLocks ? n.brandLock : "none",
    ...(n.kind === "group" ? { children: n.children.map(renew) } : {}),
  } as CherryNode);
  return structuredClone(nodes).map((n) => ({ ...renew(n), x: n.x + offset, y: n.y + offset }));
}
