// The core build has no canvas/jsdom dependency, so it runs headless in Node and in the browser.
import paperCore from "paper/dist/paper-core";

let shared: paper.PaperScope | undefined;

/** Lazily created headless scope. Build every item with `insert: false`. */
export function scope(): paper.PaperScope {
  if (!shared) {
    shared = new paperCore.PaperScope();
    shared.setup(new shared.Size(1, 1));
  }
  return shared;
}
