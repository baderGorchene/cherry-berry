import { deflateSync } from "node:zlib";

// Minimal decoder for what Ghostscript's tiffsep writes with -sCompression=none (8-bit grey, striped),
// and a PNG encoder, so the service needs no image library.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

export function tiffGrayToPng(tif: Buffer): Buffer {
  const head = tif.subarray(0, 2).toString("latin1");
  if (tif.length < 8 || (head !== "II" && head !== "MM")) throw new Error("not a TIFF");
  const le = head === "II";
  const u16 = (o: number) => (le ? tif.readUInt16LE(o) : tif.readUInt16BE(o));
  const u32 = (o: number) => (le ? tif.readUInt32LE(o) : tif.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error("not a TIFF");
  const ifd = u32(4);
  const tags = new Map<number, number[]>();
  for (let i = 0, n = u16(ifd); i < n; i++) {
    const o = ifd + 2 + i * 12;
    const type = u16(o + 2);
    const count = u32(o + 4);
    const size = type === 3 ? 2 : 4; // SHORT or LONG; other types aren't used by tags we read
    const base = size * count <= 4 ? o + 8 : u32(o + 8);
    const vals: number[] = [];
    for (let k = 0; k < count; k++) vals.push(size === 2 ? u16(base + k * 2) : u32(base + k * 4));
    tags.set(u16(o), vals);
  }
  const one = (t: number, d?: number) => {
    const v = tags.get(t)?.[0] ?? d;
    if (v === undefined) throw new Error(`TIFF tag ${t} missing`);
    return v;
  };
  const w = one(256);
  const h = one(257);
  if (one(258, 8) !== 8 || one(277, 1) !== 1 || one(259, 1) !== 1) throw new Error("unsupported TIFF (need 8-bit grey, uncompressed)");
  const invert = one(262, 1) === 0; // MinIsWhite
  const offsets = tags.get(273) ?? [];
  const counts = tags.get(279) ?? [];
  const pixels = Buffer.concat(offsets.map((off, i) => tif.subarray(off, off + (counts[i] ?? 0))));
  if (pixels.length < w * h) throw new Error("TIFF pixel data is short");
  const raw = Buffer.alloc(h * (w + 1)); // each row: filter byte 0 + w samples
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = pixels[y * w + x]!;
      raw[y * (w + 1) + 1 + x] = invert ? 255 - v : v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
