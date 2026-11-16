// Test helper: builds an uncompressed 8-bit grey TIFF like Ghostscript's tiffsep writes.
// Layout: header | pixels | IFD | out-of-line tag data (ASCII, RATIONAL, strip arrays) at EOF.
export interface TiffOpts {
  le?: boolean;
  strips?: number; // rows must divide evenly
  extras?: boolean; // add Software/DateTime (ASCII) and X/YResolution (RATIONAL) like libtiff
}

type Value = number[] | string;

export function tiff(w: number, h: number, pixels: number[], photometric: number, opts: TiffOpts = {}): Buffer {
  const le = opts.le ?? true;
  const strips = opts.strips ?? 1;
  const rows = h / strips;
  const entries: [number, number, Value][] = [
    [256, 3, [w]],
    [257, 3, [h]],
    [258, 3, [8]],
    [259, 3, [1]],
    [262, 3, [photometric]],
    [273, 4, Array.from({ length: strips }, (_, i) => 8 + i * rows * w)],
    [277, 3, [1]],
    [278, 3, [rows]],
    [279, 4, Array.from({ length: strips }, () => rows * w)],
  ];
  if (opts.extras) {
    entries.push([282, 5, [72, 1]], [283, 5, [72, 1]], [296, 3, [2]], [305, 2, "Ghostscript 10.0.0"], [306, 2, "2026:11:16 04:00:00"]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  const sizeOf = (type: number) => ({ 2: 1, 3: 2, 4: 4, 5: 8 })[type as 2 | 3 | 4 | 5]!;
  const countOf = (type: number, v: Value) => (typeof v === "string" ? v.length + 1 : type === 5 ? v.length / 2 : v.length);

  const ifdOff = 8 + pixels.length;
  const extraStart = ifdOff + 2 + entries.length * 12 + 4;
  const extraLen = entries.reduce((n, [t, ty, v]) => {
    const total = sizeOf(ty) * countOf(ty, v);
    return n + (total > 4 ? total : 0);
  }, 0);
  const b = Buffer.alloc(extraStart + extraLen);
  const w16 = (v: number, o: number) => (le ? b.writeUInt16LE(v, o) : b.writeUInt16BE(v, o));
  const w32 = (v: number, o: number) => (le ? b.writeUInt32LE(v, o) : b.writeUInt32BE(v, o));
  const put = (type: number, v: Value, o: number) => {
    if (typeof v === "string") b.write(v, o, "latin1");
    else v.forEach((x, i) => (type === 3 ? w16(x, o + i * 2) : w32(x, o + i * 4)));
  };
  b.write(le ? "II" : "MM", 0, "latin1");
  w16(42, 2);
  w32(ifdOff, 4);
  Buffer.from(pixels).copy(b, 8);
  w16(entries.length, ifdOff);
  let extra = extraStart;
  entries.forEach(([tag, type, v], i) => {
    const o = ifdOff + 2 + i * 12;
    const count = countOf(type, v);
    const total = sizeOf(type) * count;
    w16(tag, o);
    w16(type, o + 2);
    w32(count, o + 4);
    if (total <= 4) put(type, v, o + 8);
    else {
      w32(extra, o + 8);
      put(type, v, extra);
      extra += total;
    }
  });
  return b;
}
