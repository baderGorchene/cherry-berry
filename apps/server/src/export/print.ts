import { zipSync } from "fflate";
import { HttpError } from "../errors";

const TIMEOUT_MS = 130_000;
const unavailable = () => new HttpError(503, "print_unavailable");

/** POSTs to the print service. Network errors, timeouts and any non-2xx status all become 503 print_unavailable. */
async function post(url: string, body: Uint8Array): Promise<Response> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/pdf" }, body: Buffer.from(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) { await res.body?.cancel(); throw unavailable(); }
    return res;
  } catch (e) {
    throw e instanceof HttpError ? e : unavailable();
  }
}

/** The RGB PDF converted to CMYK PDF/X by the print service. */
export async function toPdfx(printUrl: string, pdf: Uint8Array): Promise<Uint8Array> {
  const res = await post(new URL("/pdfx", printUrl).href, pdf);
  try { return new Uint8Array(await res.arrayBuffer()); } catch { throw unavailable(); }
}

export type Plate = { page: number; name: string; png: Uint8Array };

/** One greyscale PNG per ink per page. */
export async function toPlates(printUrl: string, pdf: Uint8Array, dpi = 150): Promise<Plate[]> {
  const res = await post(new URL(`/plates?dpi=${dpi}`, printUrl).href, pdf);
  try {
    const { plates } = (await res.json()) as { plates: { page: number; name: string; png: string }[] };
    return plates.map((p) => ({ page: p.page, name: p.name, png: new Uint8Array(Buffer.from(p.png, "base64")) }));
  } catch { throw unavailable(); } // junk from the service
}

const safe = (name: string) => name.replace(/[/\:*?"<>|\u0000-\u001f]/g, "-");
export const zipPlates = (plates: Plate[]): Uint8Array =>
  zipSync(Object.fromEntries(plates.map((p) => [`p${p.page}-${safe(p.name)}.png`, p.png])));
