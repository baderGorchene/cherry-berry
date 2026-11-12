import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { IngestError } from "./ingest";

const MAX_ELEMENTS = 5000;
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

/** Returns sanitized SVG text. Throws IngestError invalid_image (no <svg> root) or too_large. */
export function sanitizeSvg(svg: string): string {
  const { purify: p, parse, serialize } = getPurify();
  // Parse as XML, like librsvg does (an HTML parse would see a different tree), then
  // let DOMPurify clean that tree in place of the text.
  let doc: Document;
  try { doc = parse(svg); } catch { throw new IngestError("invalid_image", "not well-formed xml"); }
  if (doc.documentElement?.localName !== "svg") throw new IngestError("invalid_image", "no svg root");
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
  return serialize(root);
}
