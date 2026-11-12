import { IngestError } from "./errors";

// Only linear checks live here, on the main thread. Parsing and sanitizing run in render.mjs,
// a child process the parent can kill.
const MAX_ELEMENTS = 5000;
const MAX_DEPTH = 256;

// One pass, no regex: count every `<` that opens a tag, quoted or not, whatever its name starts with,
// and estimate depth, reading `/>` only inside a tag and outside quotes. The estimate is still only an
// estimate (CDATA, unterminated quotes), so the child repeats the depth check on the parsed tree.
export function prescan(svg: string) {
  // Entities expand inside the parser, past every size cap, so no declarations and no internal subset.
  // `<` is excluded so each scan stops at the next tag: `[^>[]*` was quadratic on repeated `<!DOCTYPE`.
  if (/<!ENTITY/i.test(svg) || /<!DOCTYPE[^>[<]*\[/i.test(svg)) throw new IngestError("invalid_image", "dtd subset not allowed");
  let n = 0, depth = 0, quote = "", inTag = false;
  for (let i = 0; i < svg.length; i++) {
    const c = svg[i], next = svg[i + 1] ?? "/";
    const opens = c === "<" && next !== "/" && next !== "!" && next !== "?";
    if (opens && ++n > MAX_ELEMENTS) throw new IngestError("too_large", "too many elements");
    if (inTag) {
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") { inTag = false; if (svg[i - 1] === "/") depth--; }
    } else if (c === "<" && next === "/") depth--;
    else if (opens) {
      inTag = true;
      if (++depth > MAX_DEPTH) throw new IngestError("invalid_image", "nested too deeply");
    }
  }
}
