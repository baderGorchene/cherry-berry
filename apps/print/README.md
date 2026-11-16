# @cherry/print

Optional print service for Cherry Berry. A dependency-free Node HTTP server that shells out to the
Ghostscript CLI. It adds the `pdf-x` and `plates` export formats when the main server has `PRINT_URL` set.

## Run

    docker compose --profile print up --build print     # from the repo root, listens on :8080

**The service has no authentication. Do not expose it to the public internet**; compose binds it to
`127.0.0.1:8080`, and anything else that can reach it can burn CPU and disk.

Environment: `PORT` (default 8080), `PRINT_ICC_PROFILE` (path inside the container to the output ICC
profile). Unset, it uses Debian's Ghostscript CMYK profile at
`/usr/share/color/icc/ghostscript/default_cmyk.icc` (the `DEFAULT_ICC` constant in `src/gs.ts`; confirm that
path in the built image). A profile is always passed to gs, because `PDFX_def.ps` builds the PDF/X
OutputIntent from it (pdfwrite adds no output intent by itself).

## API

- `GET /health` returns `{ "status": "ok", "gs": "<gs --version>" }`.
- `POST /pdfx` with an RGB PDF body (max 200 MB) returns a CMYK PDF/X-3 (`application/pdf`).
- `POST /plates?dpi=150` (72..300) returns `{ "plates": [{ "page", "name", "png" }] }`, one greyscale PNG
  (base64) per separation per page. Names are `Cyan`, `Magenta`, `Yellow`, `Black` and any spot names.
- One job runs at a time; more than 4 waiting gives 429 `busy`. Jobs are killed after 120 s (504 `timeout`).
  Bad input or a Ghostscript failure gives 422 `gs_failed`.

## Ghostscript commands

    gs -dSAFER -dBATCH -dNOPAUSE -dPDFX -sDEVICE=pdfwrite -sColorConversionStrategy=CMYK        -sProcessColorModel=DeviceCMYK --permit-file-read=$ICC -sOutputICCProfile=$ICC -sICCProfile=$ICC        -sOutputFile=out.pdf PDFX_def.ps in.pdf

    gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=tiffsep -sCompression=none -r150 -sOutputFile=<dir>/p%d.tif in.pdf

`tiffsep` writes `p<page>.tif` (composite, ignored) and `p<page>(<plate>).tif` per separation. `plateFiles`
parses those names; the uncompressed greyscale TIFFs are re-encoded as PNG in `src/tiff.ts` (no image library).

## Licensing

Ghostscript is AGPL-3.0. It is installed only inside this container image and run as a separate process;
no Cherry Berry code links to or imports it, and `apps/print` has no npm dependencies. If you distribute the
image or offer it to others over a network, you are responsible for meeting the AGPL's terms for Ghostscript
(including offering its source).
