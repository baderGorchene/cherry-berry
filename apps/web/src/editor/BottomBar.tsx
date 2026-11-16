import { useState } from "react";
import * as Y from "yjs";
import type { CherryDocument } from "@cherry/doc";
import Pages, { PageGrid } from "./Pages";
import { MAX_ZOOM, MIN_ZOOM } from "./geometry";

// The slider moves in log2 steps (×100), so 25 %, 100 % and 400 % are evenly spaced.
const LO = Math.round(Math.log2(MIN_ZOOM) * 100), HI = Math.round(Math.log2(MAX_ZOOM) * 100);

/** Under the canvas: the page strip, zoom slider with percentage, Fit, and the grid view of all pages. */
export default function BottomBar({ ydoc, doc, pageId, readOnly, act, onSwitch, zoom, onZoom }: {
  ydoc: Y.Doc; doc: CherryDocument; pageId: string; readOnly: boolean; act(fn: () => void): void; onSwitch(pageId: string): void;
  zoom: number; onZoom(z: number | null): void;
}) {
  const [grid, setGrid] = useState(false);
  const pct = `${Math.round(zoom * 100)}%`;
  const props = { ydoc, doc, pageId, readOnly, act, onSwitch };
  return (
    <div className="ed-bottom">
      <Pages {...props} />
      <input type="range" className="ed-zslider" aria-label="Zoom" aria-valuetext={pct} min={LO} max={HI} step={1}
        value={Math.round(Math.log2(zoom) * 100)} onChange={(e) => onZoom(2 ** (Number(e.target.value) / 100))} />
      <span className="ed-zpct" title="Zoom level">{pct}</span>
      <button type="button" className="ed-mini" title="Fit (Ctrl+0)" onClick={() => onZoom(null)}>Fit</button>
      <button type="button" className="ed-mini" onClick={() => setGrid(true)}>Grid view</button>
      {grid && <PageGrid {...props} onClose={() => setGrid(false)} />}
    </div>
  );
}
