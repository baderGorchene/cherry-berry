// Pure Ghostscript argument builders. Ghostscript (AGPL) is only ever run as a CLI process.

/** RGB PDF -> CMYK PDF/X-3. `icc` is the output intent profile; without it gs uses its bundled default CMYK profile. */
export function pdfxArgs(input: string, output: string, icc: string | undefined): string[] {
  return [
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=pdfwrite",
    "-dPDFX=3",
    "-sColorConversionStrategy=CMYK",
    "-sProcessColorModel=DeviceCMYK",
    ...(icc ? [`--permit-file-read=${icc}`, `-sOutputICCProfile=${icc}`] : []),
    `-sOutputFile=${output}`,
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
