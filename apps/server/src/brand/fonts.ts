export type FontFormat = "woff2" | "woff" | "ttf" | "otf";

export const FONT_TYPES: Record<FontFormat, string> = {
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
};

/** The format named by the file's first 4 bytes, or null when it isn't a font we accept. */
export function sniffFont(b: Uint8Array): FontFormat | null {
  if (b.length < 4) return null;
  const magic = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  if (magic === "wOF2") return "woff2";
  if (magic === "wOFF") return "woff";
  if (magic === "\0\x01\0\0" || magic === "true") return "ttf";
  return magic === "OTTO" ? "otf" : null;
}
