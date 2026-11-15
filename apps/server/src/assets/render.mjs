// Child process: raw SVG on stdin -> sanitize, measure, thumbnail. Every step here can blow up on a
// small hostile file (XML parse, DOMPurify, librsvg), so it runs where the parent can SIGKILL it.
// Plain JS so it runs without the TS loader.
// Output on stdout: 4-byte big-endian header length, JSON header, then the sanitized SVG bytes
// (header.svg long) and the WEBP thumbnail (the rest). On failure the header is { error, message }.
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const CODES = new Set(["unsupported_type", "invalid_image", "too_large"]);
const MAX_ELEMENTS = 5000;
const MAX_DEPTH = 256;
const MAX_OUTPUT = 2 * 1024 * 1024; // same as the upload limit for svg
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,/i;
// `url(` is fine only when it points at a fragment in this document.
const EXTERNAL_URL = /url\(\s*(?!['"]?#)/i;
const fail = (code, message = code) => Object.assign(new Error(message), { code });

// Loaded before stdin is read, so a warm child has paid for jsdom by the time it gets work.
const win = new JSDOM("").window;
const purify = createDOMPurify(win);
// Tell the parent the imports are loaded: its job clock starts here, so a cold start is not billed to the job.
process.stderr.write("\u0006ready\n");

// Closed by construction: a backslash (CSS escape) anywhere voids the whole style.
const badCss = (css) => css.includes("\\") || /@import|image-set/i.test(css) || EXTERNAL_URL.test(css);

// Iterative, so a deep tree cannot overflow the stack here (DOMPurify and the serializer recurse).
function checkDepth(root) {
  const stack = [[root, 1]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    if (top[1] > MAX_DEPTH) throw fail("invalid_image", "nested too deeply");
    for (const c of Array.from(top[0].children)) stack.push([c, top[1] + 1]);
  }
}

// True when the sanitizer or the walk below stripped anything; the parent flags such uploads for review.
let stripped = false;

// Only strips of real security content flag an upload; comments, <metadata> and editor namespaces
// (inkscape:, sodipodi:, rdf:, cc:, dc:) are routine in exports and are not worth a moderator's time.
const DENY = new Set(["script", "foreignobject", "iframe", "object", "embed"]);
const unsafeHref = (v) => !v.trim().startsWith("#");
function securityStrip(r) {
  if (r.attribute) {
    const name = r.attribute.name.toLowerCase();
    return name.startsWith("on") || (name.split(":").pop() === "href" && unsafeHref(r.attribute.value ?? ""));
  }
  const el = r.element;
  if (!el || el.nodeType !== 1) return false; // comments, text, the wrapping BODY
  const tag = el.localName.toLowerCase();
  if (DENY.has(tag)) return true;
  const attr = (n) => el.getAttribute(n) ?? "";
  if (tag === "a") return unsafeHref(attr("href") || attr("xlink:href"));
  if (tag === "style") return /url\(|expression|@import/i.test(el.textContent ?? "");
  if (tag === "set" || tag === "animate") return /^(xlink:)?href$/i.test(attr("attributeName"));
  return false;
}

function sanitizeSvg(svg) {
  // Parse as XML, like librsvg does (an HTML parse would see a different tree), then
  // let DOMPurify clean that tree in place of the text.
  let doc;
  try { doc = new win.DOMParser().parseFromString(svg, "image/svg+xml"); }
  catch { throw fail("invalid_image", "not well-formed xml"); }
  if (doc.documentElement?.localName !== "svg") throw fail("invalid_image", "no svg root");
  checkDepth(doc.documentElement);
  const body = purify.sanitize(doc.documentElement, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"], // dropped by the svg profile; the walk below keeps only #-references
    FORBID_TAGS: ["foreignObject", "a", "script"],
    RETURN_DOM: true,
  });
  stripped = purify.removed.some(securityStrip);
  const root = body.querySelector("svg");
  if (!root) throw fail("invalid_image", "no svg root");
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  if (all.length > MAX_ELEMENTS) throw fail("too_large", "too many elements");

  for (const el of all) {
    const tag = el.localName.toLowerCase();
    if (tag === "style" && badCss(el.textContent ?? "")) { el.remove(); stripped = true; continue; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      let bad = false;
      if (name === "style") bad = badCss(value);
      else if (name.split(":").pop() === "href") {
        const v = value.trim();
        bad = !(v.startsWith("#") || (tag === "image" && DATA_IMAGE.test(v)));
      } else bad = value.includes("\\") || EXTERNAL_URL.test(value);
      if (bad) { el.removeAttribute(attr.name); stripped = true; }
    }
    if (tag === "use" && !el.hasAttribute("href") && !el.hasAttribute("xlink:href")) { el.remove(); stripped = true; }
  }
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const out = new win.XMLSerializer().serializeToString(root);
  if (out.length > MAX_OUTPUT) throw fail("too_large", "sanitized svg too large");
  return out;
}

function send(head, ...bufs) {
  const h = Buffer.from(JSON.stringify(head));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(h.length);
  process.stdout.write(Buffer.concat([len, h, ...bufs]), () => process.exit(0));
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
if (chunks.length === 0) process.exit(0); // a warm spare whose parent went away
const [size, maxPixels] = process.argv.slice(2).map(Number);
const opts = { limitInputPixels: maxPixels, failOn: "error" };
try {
  const svg = Buffer.from(sanitizeSvg(new TextDecoder().decode(Buffer.concat(chunks)))); // the decoder drops a BOM
  // Size comes from the renderer itself, so it agrees with the thumbnail.
  const m = await sharp(svg, opts).metadata();
  const [width, height] = [m.width ?? 0, m.height ?? 0];
  if (!(width > 0 && height > 0)) throw fail("invalid_image");
  if (width * height > maxPixels) throw fail("too_large");
  const thumb = await sharp(svg, opts).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
  send({ width, height, svg: svg.length, sanitized: stripped }, svg, thumb);
} catch (e) {
  const message = String(e?.message ?? e);
  send({ error: CODES.has(e?.code) ? e.code : /pixel limit/i.test(message) ? "too_large" : "invalid_image", message });
}
