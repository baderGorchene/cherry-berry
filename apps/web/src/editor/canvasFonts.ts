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
  fonts: { load(font: string): Promise<unknown> } = document.fonts,
): Promise<void> {
  const faces = pageFontFaces(nodes);
  if (!faces.length) return;
  await Promise.all(faces.map((f) => fonts.load(f).catch(() => [])));
}
