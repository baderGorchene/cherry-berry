import { useEffect, useState } from "react";
import { fontUrl, type BrandKit } from "../api";

export const BUILT_IN_FONTS = ["Inter", "Space Grotesk", "Georgia", "Arial", "Times New Roman", "Courier New"];

/** The built-in families plus the kit's uploaded ones, each once. */
export const kitFamilies = (kit: BrandKit): string[] => [...new Set([...BUILT_IN_FONTS, ...kit.fonts.map((f) => f.family)])];

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
