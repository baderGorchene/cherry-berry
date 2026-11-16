// Test helper: builds a one-strip, uncompressed, 8-bit grey TIFF like Ghostscript's tiffsep writes.
export function tiff(w: number, h: number, pixels: number[], photometric: number, le = true): Buffer {
  const ifdOff = 8 + pixels.length; // header | pixels | IFD
  const entries: [number, number, number][] = [
    [256, 3, w], [257, 3, h], [258, 3, 8], [259, 3, 1], [262, 3, photometric],
    [273, 4, 8], [277, 3, 1], [278, 3, h], [279, 4, pixels.length],
  ];
  const b = Buffer.alloc(ifdOff + 2 + entries.length * 12 + 4);
  const w16 = (v: number, o: number) => (le ? b.writeUInt16LE(v, o) : b.writeUInt16BE(v, o));
  const w32 = (v: number, o: number) => (le ? b.writeUInt32LE(v, o) : b.writeUInt32BE(v, o));
  b.write(le ? "II" : "MM", 0, "latin1");
  w16(42, 2);
  w32(ifdOff, 4);
  Buffer.from(pixels).copy(b, 8);
  w16(entries.length, ifdOff);
  entries.forEach(([tag, type, val], i) => {
    const o = ifdOff + 2 + i * 12;
    w16(tag, o);
    w16(type, o + 2);
    w32(1, o + 4);
    if (type === 3) w16(val, o + 8);
    else w32(val, o + 8);
  });
  return b;
}
