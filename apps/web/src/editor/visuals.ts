import type { CherryNode } from "@cherry/doc";
import type { Asset } from "../api";

/** A library visual as an image node scaled to fit inside 60% of the page, centred on it. */
export function imageNode(asset: Pick<Asset, "id" | "title" | "width" | "height">, page: { width: number; height: number }): CherryNode {
  const sized = asset.width > 0 && asset.height > 0;
  const f = sized ? Math.min((0.6 * page.width) / asset.width, (0.6 * page.height) / asset.height) : 1;
  const width = sized ? asset.width * f : 0.6 * Math.min(page.width, page.height);
  const height = sized ? asset.height * f : width;
  return {
    id: crypto.randomUUID(), kind: "image", name: asset.title, assetId: asset.id,
    x: (page.width - width) / 2, y: (page.height - height) / 2, width, height, rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const,
  };
}

/** A workspace asset can only be placed in its own workspace's designs; private and public ones travel. */
export const usableIn = (a: Pick<Asset, "visibility" | "workspaceId">, workspaceId: string) =>
  a.visibility !== "workspace" || a.workspaceId === workspaceId;
