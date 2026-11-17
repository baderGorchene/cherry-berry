import type { CherryNode } from "@cherry/doc";

export function pageFontFaces(nodes: CherryNode[], into = new Set<string>()): string[] {
  for (const n of nodes) {
    if (n.kind === "group") pageFontFaces(n.children, into);
    else if (n.kind === "text") into.add(`${n.fontWeight} 16px "${n.fontFamily}"`);
  }
  return [...into];
}

export async function loadPageFonts(
  nodes: CherryNode[],
  fonts: { load(font: string): Promise<unknown>; check?(font: string): boolean } = document.fonts,
): Promise<boolean> {
  const faces = pageFontFaces(nodes).filter((f) => !(fonts.check?.(f) ?? false));
  if (!faces.length) return false;
  await Promise.all(faces.map((f) => fonts.load(f).catch(() => [])));
  return true;
}
