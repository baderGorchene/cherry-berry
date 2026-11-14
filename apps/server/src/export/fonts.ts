import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
    FontLibrary.use(family, ["latin", "latin-ext"].flatMap((sub) =>
      [400, 500, 600, 700].map((w) => join(dir, `${slug}-${sub}-${w}-normal.woff2`))));
  }
}

const kit = new Map<string, Promise<void>>();

/** Registers brand-kit fonts, cached under os.tmpdir()/cherry-fonts/<id>.<format>; each id once per process. */
export async function useKitFonts(fonts: { id: string; family: string; format: string; bytes: () => Promise<Uint8Array> }[]): Promise<void> {
  await Promise.all(fonts.map((f) => {
    let p = kit.get(f.id);
    if (!p) {
      p = (async () => {
        const dir = join(tmpdir(), "cherry-fonts");
        const file = join(dir, `${f.id.replace(/[^\w-]/g, "_")}.${f.format.replace(/\W/g, "")}`);
        if (!existsSync(file)) {
          await mkdir(dir, { recursive: true });
          await writeFile(file, await f.bytes());
        }
        // A font skia can't read is left out; the text falls back to a substitute (preflight names it).
        try { FontLibrary.use(f.family, [file]); } catch { /* substitute */ }
      })();
      p.catch(() => kit.delete(f.id)); // a failed read is retried next time
      kit.set(f.id, p);
    }
    return p;
  }));
}

export function availableFamilies(kitFamilies: string[]): string[] {
  return [...new Set([...Object.keys(BUILT_IN), ...kitFamilies])];
}
