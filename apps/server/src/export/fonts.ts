import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FontLibrary } from "skia-canvas";

const BUILT_IN = { Inter: "@fontsource/inter", "Space Grotesk": "@fontsource/space-grotesk" };
let builtIn = false;

/** Inter and Space Grotesk 400–700 (latin + latin-ext woff2 from @fontsource); once per process. */
export function registerBuiltInFonts(): void {
  if (builtIn) return;
  builtIn = true;
  const require = createRequire(import.meta.url);
  for (const [family, pkg] of Object.entries(BUILT_IN)) {
    const dir = join(dirname(require.resolve(pkg)), "files"), slug = pkg.split("/")[1]!;
    // For a weight held by two files skia uses the one registered last, and the latin-ext subset has no ASCII glyphs:
    // latin must come last or basic text falls back to a substitute. ponytail: latin-ext-only glyphs (ő, ł…) then
    // fall back too; merge the subsets into one file per weight if that matters.
    FontLibrary.use(family, ["latin-ext", "latin"].flatMap((sub) =>
      [400, 500, 600, 700].map((w) => join(dir, `${slug}-${sub}-${w}-normal.woff2`))));
  }
}

const kit = new Map<string, Promise<boolean>>();

/** The private FontLibrary family of one kit family: unique per kit, so no tenant's font reaches another's design. */
export const kitFamily = (kitId: string, family: string) =>
  `cb-kit-${createHash("sha256").update(`${kitId}/${family}`).digest("hex").slice(0, 24)}`;

/** Family name → private family, passed to the renderer for one design; built-in and other kits' fonts stay untouched. */
export type FontMap = Map<string, string>;

/**
 * Registers brand-kit fonts under their private family, cached under os.tmpdir()/cherry-fonts/<id>.<format>; each id
 * once per process. The file is written to a temp name and renamed, and a cached file skia rejects is fetched again,
 * so a torn write never sticks. Returns the mapping for the families that registered. A font whose bytes can't be
 * read, or that skia rejects, is skipped with a warning: its text falls back to a substitute (preflight names it).
 */
export async function useKitFonts(
  fonts: { id: string; kitId: string; family: string; format: string; bytes: () => Promise<Uint8Array> }[],
): Promise<FontMap> {
  const ok = await Promise.all(fonts.map((f) => {
    let p = kit.get(f.id);
    if (!p) {
      p = (async () => {
        const dir = join(tmpdir(), "cherry-fonts");
        const file = join(dir, `${f.id.replace(/[^\w-]/g, "_")}.${f.format.replace(/\W/g, "")}`);
        const register = () => { try { FontLibrary.use(kitFamily(f.kitId, f.family), [file]); return true; } catch { return false; } };
        if (existsSync(file) && register()) return true;
        await mkdir(dir, { recursive: true });
        const tmp = `${file}.${randomUUID()}.tmp`;
        await writeFile(tmp, await f.bytes());
        await rename(tmp, file);
        if (register()) return true;
        await rm(file, { force: true });
        return false;
      })();
      p.catch(() => kit.delete(f.id)); // a failed read is retried next time
      kit.set(f.id, p);
    }
    return p.catch((e) => { console.warn(`export: kit font ${f.id} (${f.family}) skipped`, e); return false; });
  }));
  return new Map(fonts.filter((_, i) => ok[i]).map((f) => [f.family, kitFamily(f.kitId, f.family)]));
}

export function availableFamilies(kitFamilies: string[]): string[] {
  return [...new Set([...Object.keys(BUILT_IN), ...kitFamilies])];
}
