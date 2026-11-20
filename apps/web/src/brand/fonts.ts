import { useEffect, useState } from "react";
import { FONTS } from "@cherry/doc";
import { fontUrl, type BrandKit } from "../api";

export const BUILT_IN_FONTS = [...FONTS.map((f) => f.family), "Georgia", "Arial", "Times New Roman", "Courier New"];

/** The built-in families plus the kit's uploaded ones, each once. */
export const kitFamilies = (kit: BrandKit): string[] => [...new Set([...BUILT_IN_FONTS, ...kit.fonts.map((f) => f.family)])];

type QueryLocalFonts = () => Promise<{ family: string }[]>;
const queryApi = (): QueryLocalFonts | undefined =>
  typeof window === "undefined" ? undefined : (window as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts?.bind(window);

/** Whether this browser can list installed fonts at all (Chromium and the Windows desktop app; not Firefox/Safari). */
export const canQueryLocalFonts = () => !!queryApi();

export type LocalFonts = { families: string[] } | { error: "unsupported" | "denied" };

/**
 * The font families installed on this computer, sorted and each once, via the Local Font Access API. Call it from a
 * click: the browser asks for permission the first time. Installed fonts render by name, so nothing is loaded here;
 * exports rendered on the server substitute them (preflight names them), which is why kit uploads stay the way to share a font.
 */
export async function queryLocalFamilies(query = queryApi()): Promise<LocalFonts> {
  if (!query) return { error: "unsupported" };
  try {
    const fonts = await query();
    return { families: [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b)) };
  } catch {
    return { error: "denied" }; // NotAllowedError (prompt dismissed or blocked) or SecurityError (no user gesture/policy)
  }
}

let listed: LocalFonts | null = null; // once granted, kept for the page session

/** This computer's fonts once the user asks for them (or right away when permission was already granted), and the ask. */
export function useLocalFonts(): [LocalFonts | null, () => void] {
  const [fonts, setFonts] = useState(listed);
  const request = () => void queryLocalFamilies().then((r) => { if ("families" in r) listed = r; setFonts(r); });
  useEffect(() => {
    if (listed || !queryApi()) return;
    navigator.permissions?.query({ name: "local-fonts" as PermissionName })
      .then((p) => { if (p.state === "granted") request(); }, () => { /* no such permission name: wait for the click */ });
  }, []);
  return [fonts, request];
}

const requested = new Set<string>();

/** Loads the kit's uploaded fonts once per page session. Returns a counter that grows after each font loads, so callers re-render (and canvases redraw). */
export function useKitFonts(kit: BrandKit | null): number {
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    for (const f of kit?.fonts ?? []) {
      if (requested.has(f.id)) continue;
      requested.add(f.id);
      void (async () => {
        try {
          const res = await fetch(fontUrl(f.id), { credentials: "include" });
          if (!res.ok) throw new Error(String(res.status));
          const face = new FontFace(f.family, await res.arrayBuffer(), { weight: String(f.weight), style: f.style });
          await face.load();
          document.fonts.add(face);
          setLoaded((n) => n + 1);
        } catch { /* skipped: the text falls back to another font */ }
      })();
    }
  }, [kit]);
  return loaded;
}
