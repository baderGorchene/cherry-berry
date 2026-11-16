import type { ExportFormat } from "@cherry/doc";

export const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "pdf-print", label: "PDF · Print", hint: "Bleed, crop marks" },
  { id: "pdf", label: "PDF · Digital", hint: "Smallest PDF" },
  { id: "png", label: "PNG", hint: "Transparent" },
  { id: "jpg", label: "JPG", hint: "Smallest file" },
  { id: "svg", label: "SVG", hint: "True vectors" },
  { id: "gif", label: "GIF", hint: "Animated" },
  { id: "pptx", label: "PPTX", hint: "Editable slides" },
  { id: "cherry", label: ".cherry", hint: "Open source file" },
];

const PRINT_FORMATS: typeof FORMATS = [
  { id: "pdf-x", label: "PDF/X (CMYK, for print)", hint: "Print service" },
  { id: "plates", label: "Colour plates (PNG per ink)", hint: "Print service" },
];

/** The formats to offer; PDF/X and plates follow "PDF · Print" and only exist when the server has a print service. */
export const formatsFor = (print: boolean) => (print ? [FORMATS[0]!, ...PRINT_FORMATS, ...FORMATS.slice(1)] : FORMATS);

/** "1-3, 5" → [0, 1, 2, 4] (zero-based, sorted, once each); anything out of 1..count or unreadable → null. */
export function parsePageRange(text: string, count: number): number[] | null {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < 1 || b < a || b > count) return null;
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

/** The server's `fileBase` (export/service.ts) plus the extension. */
export const downloadName = (title: string, ext: string) => `${[...title.trim()
  .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "-")]
  .slice(0, 100).join("") || "design"}.${ext}`;
