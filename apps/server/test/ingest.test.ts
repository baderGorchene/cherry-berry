import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ingest, IngestError } from "../src/assets/ingest";

const solid = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#8E1EA2" } });
const meta = (b: Uint8Array) => sharp(b).metadata();
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const enc = (s: string) => new TextEncoder().encode(s);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof IngestError ? e.code : String(e)));

async function gif(frames: number) {
  const f = Buffer.alloc(20 * 20 * 4 * frames);
  for (let i = 0; i < frames; i++) f.fill(i * 80, i * 1600, (i + 1) * 1600);
  return sharp(f, { raw: { width: 20, height: 20 * frames, channels: 4, pageHeight: 20 } }).gif().toBuffer();
}

const HOSTILE = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink" width="100" height="50" onload="alert(1)">
<script>alert(1)</script>
<foreignObject><iframe src="http://example.invalid/f"/></foreignObject>
<image href="http://example.invalid/x.png" width="10" height="10"/>
<image x:href="http://example.invalid/y.png" width="10" height="10"/>
<a href="javascript:alert(1)"><rect width="5" height="5"/></a>
<rect style="fill:u\\72l(http://example.invalid/a)" width="5" height="5"/>
<rect style="fill:image-set('http://example.invalid/i.png' 1x)" width="5" height="5"/>
<style>@import url(http://example.invalid/b.css);</style>
<rect fill="url(http://example.invalid/c)" width="5" height="5"/>
<rect STYLE="fill:URL(http://example.invalid/d)" width="5" height="5"/>
<image HREF="http://example.invalid/e.png" width="10" height="10"/>
<circle fill="#8E1EA2" cx="5" cy="5" r="5"/></svg>`;

describe("ingest rasters", () => {
  it.each(["png", "jpeg", "webp"] as const)("%s ingests with size and a webp thumb no larger than 480", async (fmt) => {
    const r = await ingest(await solid(1000, 500)[fmt]().toBuffer());
    expect(r).toMatchObject({ kind: "image", format: fmt, contentType: `image/${fmt}`, width: 1000, height: 500 });
    expect(await meta(r.thumb)).toMatchObject({ format: "webp", width: 480 });
  });
  it("a small image is not enlarged", async () => {
    const t = await meta((await ingest(await solid(40, 30).png().toBuffer())).thumb);
    expect([t.width, t.height]).toEqual([40, 30]);
  });
  it("animated gif is kind gif, single-frame gif is kind image", async () => {
    expect((await ingest(await gif(3))).kind).toBe("gif");
    expect((await ingest(await gif(1))).kind).toBe("image");
  });
  it("sha256 is of the uploaded bytes", async () => {
    const bytes = await solid(10, 10).png().toBuffer();
    const r = await ingest(bytes);
    expect(r.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(Buffer.from(r.file).equals(bytes)).toBe(true);
  });
});

describe("ingest svg", () => {
  it("svg is sanitized", async () => {
    const r = await ingest(enc(HOSTILE));
    const out = text(r.file).toLowerCase();
    for (const bad of ["script", "onload", "foreignobject", "iframe", "example.invalid", "javascript:", "@import", "image-set"]) {
      expect(out).not.toContain(bad);
    }
    expect(text(r.file)).toMatch(/<circle[^>]*fill="#8E1EA2"/);
    expect(r).toMatchObject({ kind: "svg", format: "svg", contentType: "image/svg+xml", width: 100, height: 50 });
  });
  it("svg keeps internal references", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><rect id="s" width="5" height="5"/></defs><rect fill="url(#g)" width="9" height="9"/><use href="#s"/></svg>`;
    const r = await ingest(enc(svg));
    expect(text(r.file)).toContain("url(#g)");
    expect(text(r.file)).toMatch(/<use[^>]*href="#s"/);
    expect([r.width, r.height]).toEqual([80, 40]);
  });
  it("svg thumbnail renders without network", async () => {
    const r = await ingest(enc(HOSTILE));
    expect(r.thumb.length).toBeGreaterThan(0);
    expect((await meta(r.thumb)).format).toBe("webp");
  });
  it("an svg with no size takes the size the renderer gives it", async () => {
    const r = await ingest(enc(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>`));
    const m = await sharp(r.file).metadata();
    expect([r.width, r.height]).toEqual([m.width, m.height]);
  });
});

describe("lying and broken files", () => {
  it("rejects them with the right code", async () => {
    expect(await code(ingest(enc("<html><body>hi</body></html>")))).toBe("unsupported_type");
    expect(await code(ingest(new Uint8Array(0)))).toBe("unsupported_type");
    const jpeg = await solid(300, 300).jpeg().toBuffer();
    expect(await code(ingest(jpeg.subarray(0, 200)))).toBe("invalid_image");
    const chunk = (t: string, d: Buffer) => {
      const type = Buffer.from(t), len = Buffer.alloc(4), crc = Buffer.alloc(4);
      len.writeUInt32BE(d.length); crc.writeUInt32BE(crc32(Buffer.concat([type, d])));
      return Buffer.concat([len, type, d, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20000, 0); ihdr.writeUInt32BE(10001, 4); ihdr.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr), chunk("IDAT", Buffer.from([0x78, 0x9c, 3, 0, 0, 0, 0, 1])), chunk("IEND", Buffer.alloc(0))]);
    expect(await code(ingest(png))).toBe("too_large");
    const big = `<svg xmlns="http://www.w3.org/2000/svg">${"<!--x-->".repeat(2.1e6 / 8)}</svg>`;
    expect(await code(ingest(enc(big)))).toBe("too_large");
  });
});

const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
async function timed(bytes: Uint8Array) {
  const t0 = performance.now();
  const outcome = await ingest(bytes).then(() => "ok", (e) => (e instanceof IngestError ? e.code : `non-IngestError: ${e}`));
  return { outcome, ms: performance.now() - t0 };
}

describe("bounded work", () => {
  it.each(["<?xml ?>", "<!--a-->"])("a long prolog of %s is rejected quickly", async (unit) => {
    const { outcome, ms } = await timed(enc(unit.repeat(40) + "x"));
    expect(outcome).toBe("unsupported_type");
    expect(ms).toBeLessThan(200);
  });
  it.each([4000, 100000])("%i nested groups reject with an IngestError", async (n) => {
    const { outcome, ms } = await timed(enc(`<svg ${SVGNS}>${"<g>".repeat(n)}${"</g>".repeat(n)}</svg>`));
    expect(outcome).toMatch(/^(invalid_image|too_large)$/);
    expect(ms).toBeLessThan(1000);
  });
  it("200000 elements reject as too_large without parsing them", async () => {
    const { outcome, ms } = await timed(enc(`<svg ${SVGNS}>${"<g/>".repeat(200000)}</svg>`));
    expect(outcome).toBe("too_large");
    expect(ms).toBeLessThan(500);
  });
  it("a prolog with an unterminated doctype or comment returns promptly", async () => {
    for (const bad of ["<?x?><!DOCTYPE [>", "<!--a--><!DOCTYPE svg [ <svg/>", "<!--a", "<?x"]) {
      const { outcome, ms } = await timed(enc(bad));
      expect(outcome).toBe("unsupported_type");
      expect(ms).toBeLessThan(100);
    }
  }, 5000);
  it("counts elements whatever their name starts with", async () => {
    for (const body of ["<ü/>".repeat(300000), "<ü>".repeat(100000), '<g a="/>/>">'.repeat(3000)]) {
      const { outcome, ms } = await timed(enc(`<svg ${SVGNS}>${body}</svg>`));
      expect(outcome).toMatch(/^(too_large|invalid_image)$/);
      expect(ms).toBeLessThan(1000);
    }
    expect((await timed(enc(`<svg ${SVGNS}>${"<ü/>".repeat(6000)}</svg>`))).outcome).toBe("too_large");
  }, 10000);
  it("a render that never ends is killed and reported too_large", async () => {
    const text = "w".repeat(1990);
    const uses = (href: string) => `<use href="#${href}"/>`.repeat(49);
    const useText = `<svg ${SVGNS} width="200" height="200"><defs><text id="t" font-size="9">${text}</text>` +
      `<g id="a">${uses("t")}</g><g id="b">${uses("a")}</g></defs><use href="#b"/></svg>`;
    const verts = Array.from({ length: 300 }, (_, i) => `L${i % 50} ${i % 40}`).join(" ");
    const marker = `<svg ${SVGNS} width="100" height="100"><defs><marker id="m" markerWidth="50" markerHeight="50" markerUnits="userSpaceOnUse">` +
      `<text font-size="9">${"w".repeat(1500)}</text></marker></defs><path d="M0 0 ${verts}" fill="none" stroke="#000" marker-mid="url(#m)"/></svg>`;
    for (const svg of [useText, marker]) {
      const { outcome, ms } = await timed(enc(svg));
      expect(outcome).toBe("too_large");
      expect(ms).toBeLessThan(8000);
    }
  }, 30000);
  it("a text heavy svg still gets a thumbnail", async () => {
    const r = await ingest(enc(`<svg ${SVGNS} width="200" height="50"><text font-size="9">${"w".repeat(500)}</text></svg>`));
    expect((await meta(r.thumb)).format).toBe("webp");
  });
  it("svg size is what sharp renders", async () => {
    const r = await ingest(enc(`<svg ${SVGNS} width="10cm" height="5cm"/>`));
    const m = await sharp(r.file).metadata();
    expect([r.width, r.height]).toEqual([m.width, m.height]);
    expect(r.width).not.toBe(300);
  });
  it("an enormous declared size is too_large", async () => {
    expect(await code(ingest(enc(`<svg ${SVGNS} width="1e5" height="1e5"/>`)))).toBe("too_large");
    expect(await code(ingest(enc(`<svg ${SVGNS} width="20000" height="10001"/>`)))).toBe("too_large");
  });
  it("junk before <svg is unsupported_type", async () => {
    expect(await code(ingest(enc(`junk<svg ${SVGNS} width="5" height="5"/>`)))).toBe("unsupported_type");
  });
});
