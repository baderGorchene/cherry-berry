// Child process: sanitized SVG on stdin -> WEBP thumbnail on stdout. Plain JS so it runs without
// the TS loader. The parent kills it on a timeout, which a native librsvg call in-process cannot allow.
import sharp from "sharp";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const [size, maxPixels] = process.argv.slice(2).map(Number);
try {
  const out = await sharp(Buffer.concat(chunks), { limitInputPixels: maxPixels, failOn: "error" })
    .resize(size, size, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
  process.stdout.write(out, () => process.exit(0));
} catch (e) {
  process.stderr.write(String(e && e.message));
  process.exit(1);
}
