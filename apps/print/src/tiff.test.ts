import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { tiff } from "./fixture.ts";
import { TiffError, tiffGrayToPng } from "./tiff.ts";

function decode(png: Buffer) {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  expect([png[24], png[25]]).toEqual([8, 0]);
  const idat = png.indexOf("IDAT");
  const len = png.readUInt32BE(idat - 4);
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + len));
  const rows: number[][] = [];
  for (let y = 0; y < h; y++) rows.push([...raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1))]);
  return { w, h, rows };
}

const PX = [0, 128, 255, 10, 20, 30];

it("converts MinIsBlack grey TIFF (both byte orders) to a grey PNG", () => {
  for (const le of [true, false]) {
    const { w, h, rows } = decode(tiffGrayToPng(tiff(3, 2, PX, 1, { le })));
    expect([w, h]).toEqual([3, 2]);
    expect(rows).toEqual([[0, 128, 255], [10, 20, 30]]);
  }
});

it("skips ASCII and RATIONAL tags stored out of line (both byte orders)", () => {
  for (const le of [true, false]) {
    const { rows } = decode(tiffGrayToPng(tiff(3, 2, PX, 1, { le, extras: true })));
    expect(rows).toEqual([[0, 128, 255], [10, 20, 30]]);
  }
});

it("reads multi-strip images (both byte orders)", () => {
  for (const le of [true, false]) {
    const { rows } = decode(tiffGrayToPng(tiff(3, 2, PX, 1, { le, strips: 2, extras: true })));
    expect(rows).toEqual([[0, 128, 255], [10, 20, 30]]);
  }
});

it("inverts MinIsWhite so the PNG looks like the TIFF", () => {
  const { rows } = decode(tiffGrayToPng(tiff(2, 1, [0, 255], 0)));
  expect(rows).toEqual([[255, 0]]);
});

it("throws TiffError for non-TIFF, truncated and out-of-range input", () => {
  expect(() => tiffGrayToPng(Buffer.from("nope nope nope"))).toThrow(TiffError);
  const good = tiff(3, 2, PX, 1, { extras: true, strips: 2 });
  for (const n of [4, 12, 20, 40]) {
    expect(() => tiffGrayToPng(good.subarray(0, n))).toThrow(TiffError);
  }
  const badOffset = Buffer.from(good);
  badOffset.writeUInt32LE(0xfffffff0, 4); // IFD offset beyond the file
  expect(() => tiffGrayToPng(badOffset)).toThrow(TiffError);
});
