import { CHERRY_FORMAT_VERSION, type CherryDocument } from "./schema";

export function createDocument(opts: {
  title: string; width: number; height: number;
  unit: "px" | "mm" | "in"; colorMode: "rgb" | "cmyk"; bleed?: number;
}): CherryDocument {
  return {
    format: "cherry",
    version: CHERRY_FORMAT_VERSION,
    id: crypto.randomUUID(),
    title: opts.title,
    createdAt: new Date().toISOString(),
    pages: [{
      id: crypto.randomUUID(), name: "Page 1",
      width: opts.width, height: opts.height, unit: opts.unit, colorMode: opts.colorMode,
      bleed: opts.bleed ?? 0,
      background: { type: "solid", color: "#FFFFFF", opacity: 1 },
      nodes: [],
    }],
  };
}
