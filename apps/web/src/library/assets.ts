import { useEffect, useState } from "react";
import { errorMessage, listAssets, type Asset, type AssetFilters, type AssetKind, type License, type Visibility } from "../api";

export const LICENSES: { value: License; label: string; badge: string }[] = [
  { value: "cc0", label: "CC0 · public domain", badge: "CC0" },
  { value: "cc-by", label: "CC-BY · credit required", badge: "CC-BY" },
  { value: "own", label: "Own work · all rights", badge: "Own work" },
  { value: "workspace-only", label: "Workspace only", badge: "Workspace only" },
];
export const VISIBILITY: [Visibility, string][] = [["private", "Only me"], ["workspace", "This workspace"], ["public", "Everyone (public)"]];
export const KIND_BADGE: Record<AssetKind, string> = { image: "IMG", gif: "GIF", svg: "SVG" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const [v, unit] = n < 1024 ** 2 ? [n / 1024, "KB"] : n < 1024 ** 3 ? [n / 1024 ** 2, "MB"] : [n / 1024 ** 3, "GB"];
  return `${+v.toFixed(1)} ${unit}`;
}

export type AssetScope = "mine" | "workspace" | "public";

/** Debounced (250 ms) search plus fetch; a response for an older query is dropped. `retry` refetches. */
export function useAssetList(scope: AssetScope, filters: AssetFilters, text: string) {
  const [q, setQ] = useState("");
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<{ assets: Asset[] } | { error: string } | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const { workspaceId, kind, license } = filters;
  useEffect(() => {
    if (scope === "workspace" && !workspaceId) return;
    let stale = false;
    setRes(null);
    listAssets(scope, { workspaceId, kind, license, q }).then((r) => !stale && setRes(r), (e) => !stale && setRes({ error: errorMessage(e) }));
    return () => { stale = true; };
  }, [scope, workspaceId, kind, license, q, tries]);
  return { res, setRes, retry: () => setTries((n) => n + 1) };
}
