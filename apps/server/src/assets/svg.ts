import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { IngestError } from "./errors";

const MAX_ELEMENTS = 5000;
const MAX_OUTPUT = 2 * 1024 * 1024; // same as the upload limit for svg
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,/i;
// `url(` is fine only when it points at a fragment in this document.
const EXTERNAL_URL = /url\(\s*(?!['"]?#)/i;

let lazy: { parse: (s: string) => Document; purify: ReturnType<typeof createDOMPurify>; serialize: (n: Node) => string } | undefined;
function getPurify() {
  // One jsdom window for the process, created on first use.
  if (!lazy) {
    const win = new JSDOM("").window;
    lazy = {
      purify: createDOMPurify(win as unknown as Window & typeof globalThis),
      parse: (s) => new win.DOMParser().parseFromString(s, "image/svg+xml") as unknown as Document,
      serialize: (n) => new win.XMLSerializer().serializeToString(n),
    };
  }
  return lazy;
}

// Closed by construction: a backslash (CSS escape) anywhere voids the whole style.
function badCss(css: string): boolean {
  return css.includes("\\") || /@import|image-set/i.test(css) || EXTERNAL_URL.test(css);
}

// Count every `<` that opens a tag, whatever its name starts with, before any parser allocates.
// The depth estimate can be spoofed (`/>` inside an attribute), so checkDepth repeats it on the parsed tree.
function prescan(svg: string) {
  // Entities expand inside the parser, past every size cap, so no declarations and no internal subset.
  if (/<!ENTITY/i.test(svg) || /<!DOCTYPE[^>[]*\[/i.test(svg)) throw new IngestError("invalid_image", "dtd subset not allowed");
  let n = 0, depth = 0;
  for (const m of svg.matchAll(/<(?![/!?])|<\/|\/>/g)) {
    if (m[0].length === 2) { depth--; continue; }
    if (++n > MAX_ELEMENTS) throw new IngestError("too_large", "too many elements");
    if (++depth > MAX_DEPTH) throw new IngestError("invalid_image", "nested too deeply");
  }
}

const MAX_DEPTH = 256;
// Iterative, so a deep tree cannot overflow the stack here (DOMPurify and the serializer recurse).
function checkDepth(root: Element) {
  const stack: [Element, number][] = [[root, 1]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    if (top[1] > MAX_DEPTH) throw new IngestError("invalid_image", "nested too deeply");
    for (const c of Array.from(top[0].children)) stack.push([c, top[1] + 1]);
  }
}

/** Returns sanitized SVG text. Throws IngestError invalid_image (no <svg> root) or too_large. */
export function sanitizeSvg(svg: string): string {
  prescan(svg);
  try { return sanitize(svg); }
  catch (e) { throw e instanceof IngestError ? e : new IngestError("invalid_image", String(e)); }
}

function sanitize(svg: string): string {
  const { purify: p, parse, serialize } = getPurify();
  // Parse as XML, like librsvg does (an HTML parse would see a different tree), then
  // let DOMPurify clean that tree in place of the text.
  let doc: Document;
  try { doc = parse(svg); } catch { throw new IngestError("invalid_image", "not well-formed xml"); }
  if (doc.documentElement?.localName !== "svg") throw new IngestError("invalid_image", "no svg root");
  checkDepth(doc.documentElement);
  const body = p.sanitize(doc.documentElement, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"], // dropped by the svg profile; the walk below keeps only #-references
    FORBID_TAGS: ["foreignObject", "a", "script"],
    RETURN_DOM: true,
  }) as HTMLElement;
  const root = body.querySelector("svg");
  if (!root) throw new IngestError("invalid_image", "no svg root");
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  if (all.length > MAX_ELEMENTS) throw new IngestError("too_large", "too many elements");

  for (const el of all) {
    const tag = el.localName.toLowerCase();
    if (tag === "style" && badCss(el.textContent ?? "")) { el.remove(); continue; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      let bad = false;
      if (name === "style") bad = badCss(value);
      else if (name.split(":").pop() === "href") {
        const v = value.trim();
        bad = !(v.startsWith("#") || (tag === "image" && DATA_IMAGE.test(v)));
      } else bad = value.includes("\\") || EXTERNAL_URL.test(value);
      if (bad) el.removeAttribute(attr.name);
    }
    if (tag === "use" && !el.hasAttribute("href") && !el.hasAttribute("xlink:href")) el.remove();
  }
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const out = serialize(root);
  if (out.length > MAX_OUTPUT) throw new IngestError("too_large", "sanitized svg too large");
  return out;
}
