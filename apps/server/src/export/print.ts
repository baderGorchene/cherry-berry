import { zipSync } from "fflate";
import { HttpError } from "../errors";

const TIMEOUT_MS = 130_000;
/** Resolve relative to a URL ending in `/`, so a path prefix in PRINT_URL is kept. */
const base = (u: string) => (u.endsWith("/") ? u : `${u}/`);
const unavailable = () => new HttpError(503, "print_unavailable");

/** POSTs to the print service. Network errors, timeouts and any non-2xx status all become 503 print_unavailable. */
async function post(url: string, body: Uint8Array, signal?: AbortSignal): Promise<Response> {
  try {
    const sig = signal ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal]) : AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/pdf" }, body: body as BodyInit, signal: sig });
    if (!res.ok) { await res.body?.cancel(); throw unavailable(); }
    return res;
  } catch (e) {
    throw e instanceof HttpError ? e : unavailable();
  }
}

/** The RGB PDF converted to CMYK PDF/X by the print service. */
export async function toPdfx(printUrl: string, pdf: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await post(new URL("pdfx", base(printUrl)).href, pdf, signal);
  try { return new Uint8Array(await res.arrayBuffer()); } catch { throw unavailable(); }
}

export type Plate = { page: number; name: string; png: Uint8Array };

/** One greyscale PNG per ink per page. */
export async function toPlates(printUrl: string, pdf: Uint8Array, dpi = 150, signal?: AbortSignal): Promise<Plate[]> {
  const res = await post(new URL(`plates?dpi=${dpi}`, base(printUrl)).href, pdf, signal);
  try {
    const { plates } = (await res.json()) as { plates: { page: number; name: string; png: string }[] };
    if (!Array.isArray(plates) || !plates.length
      || !plates.every((p) => p && Number.isInteger(p.page) && typeof p.name === "string" && typeof p.png === "string")) throw unavailable();
    return plates.map((p) => ({ page: p.page, name: p.name, png: new Uint8Array(Buffer.from(p.png, "base64")) }));
  } catch { throw unavailable(); } // junk from the service
}

const safe = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
/** Files named p<page>-<ink>.png; a name that collides after sanitising gets a numeric suffix. */
export function zipPlates(plates: Plate[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const p of plates) {
    const stem = `p${p.page}-${safe(p.name)}`;
    let name = `${stem}.png`;
    for (let n = 2; name in files; n++) name = `${stem}-${n}.png`;
    files[name] = p.png;
  }
  return zipSync(files);
}
