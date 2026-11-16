// Pure Ghostscript argument builders. Ghostscript (AGPL) is only ever run as a CLI process.

/** Ghostscript's default CMYK profile in the Debian `ghostscript` package (confirm in the image). */
export const DEFAULT_ICC = "/usr/share/color/icc/ghostscript/default_cmyk.icc";

/** Gs failed, or exited 0 without producing usable output, or the input was not a PDF. */
export class GsError extends Error {}
export class TimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}
export class AbortedError extends Error {
  constructor() {
    super("aborted");
  }
}

/**
 * RGB PDF -> CMYK PDF/X. `pdfxDef` is PDFX_def.ps, which builds the OutputIntent from `-sICCProfile`;
 * pdfwrite adds no output intent on its own. The profile is always passed.
 */
export function pdfxArgs(input: string, output: string, icc: string, pdfxDef: string): string[] {
  return [
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-dPDFX",
    "-sDEVICE=pdfwrite",
    "-sColorConversionStrategy=CMYK",
    "-sProcessColorModel=DeviceCMYK",
    `--permit-file-read=${icc}`,
    `-sOutputICCProfile=${icc}`,
    `-sICCProfile=${icc}`,
    `-sOutputFile=${output}`,
    pdfxDef,
    input,
  ];
}

/**
 * One grey TIFF per separation per page. The output template is `<outDir>/p%d.tif`, so gs writes
 * `p1.tif` (composite, ignored) and `p1(Cyan).tif`, `p1(Magenta).tif`, `p1(Yellow).tif`,
 * `p1(Black).tif`, plus `p1(<spot name>).tif` for each spot colour.
 */
export function platesArgs(input: string, outDir: string, dpi: number): string[] {
  const r = Number.isFinite(dpi) ? Math.min(300, Math.max(72, Math.round(dpi))) : 150;
  return [
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=tiffsep",
    "-sCompression=none",
    `-r${r}`,
    `-sOutputFile=${outDir}/p%d.tif`,
    input,
  ];
}

/** Parses `p<page>(<plate>).tif` file names written by `platesArgs`; anything else is ignored. */
export function plateFiles(names: string[]): { page: number; name: string; file: string }[] {
  const out: { page: number; name: string; file: string }[] = [];
  for (const file of names) {
    const m = /^p(\d+)\((.+)\)\.tif$/.exec(file);
    if (m) out.push({ page: Number(m[1]), name: m[2]!, file });
  }
  return out.sort((a, b) => a.page - b.page || a.file.localeCompare(b.file));
}
