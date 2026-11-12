import type { CherryNode } from "@cherry/doc";
import type { Asset } from "../api";

/** A library visual as an image node scaled to fit inside 60% of the page, centred on it. */
export function imageNode(asset: Pick<Asset, "id" | "title" | "width" | "height">, page: { width: number; height: number }): CherryNode {
  const f = Math.min((0.6 * page.width) / (asset.width || 1), (0.6 * page.height) / (asset.height || 1));
  const width = asset.width * f, height = asset.height * f;
  return {
    id: crypto.randomUUID(), kind: "image", name: asset.title, assetId: asset.id,
    x: (page.width - width) / 2, y: (page.height - height) / 2, width, height, rotation: 0, opacity: 1, locked: false, hidden: false,
  };
}
