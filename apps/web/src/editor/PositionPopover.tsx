import { useRef, useState } from "react";
import type { CherryNode, Page } from "@cherry/doc";
import { alignBoxes, distributeBoxes, type AlignOp } from "./layout";
import Popover from "./Popover";

const round2 = (n: number) => String(Math.round(n * 100) / 100);
const parseNum = (s: string) => (s === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

/** Number field that shows the live value and commits once on Enter or blur (Escape drops the draft). */
export function Num({ label, value, unit, disabled, onCommit }: {
  label: string; value: number; unit?: string; disabled: boolean; onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelling = useRef(false);
  const commit = () => {
    if (cancelling.current) { cancelling.current = false; setDraft(null); return; }
    if (draft === null) return;
    setDraft(null);
    const v = parseNum(draft.trim());
    if (v !== undefined && v !== value) onCommit(v);
  };
  return (
    <label className="ed-f">
      <b>{label}</b>
      <input aria-label={label} inputMode="decimal" value={draft ?? round2(value)} disabled={disabled}
        onFocus={() => { cancelling.current = false; }}
        onChange={(e) => { cancelling.current = false; setDraft(e.target.value); }} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { cancelling.current = true; setDraft(null); }
        }} />
      {unit && <span aria-hidden="true" className="ed-unit">{unit}</span>}
    </label>
  );
}

type Patch = { id: string } & Partial<CherryNode>;
const ALIGNS: [AlignOp, string][] = [["left", "Left"], ["center", "Center"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]];

/** Where the selection sits: X/Y/W/H and rotation (one layer) or X/Y of the group's box, align to page, distribute, and layer order. */
export default function PositionPopover({ page, nodes, frozen, onPatch, onResize, onReorder }: {
  page: Page; nodes: CherryNode[]; frozen: boolean;
  /** Applies several node patches as one undo step. */
  onPatch(patches: Patch[]): void; onResize(w: number, h: number): void; onReorder(to: "forward" | "backward"): void;
}) {
  const { unit } = page;
  const n = nodes[0]!;
  const minX = Math.min(...nodes.map((m) => m.x)), minY = Math.min(...nodes.map((m) => m.y));
  const move = (dx: number, dy: number) => onPatch(nodes.map((m) => ({ id: m.id, x: m.x + dx, y: m.y + dy })));
  return (
    <Popover label="Position" button="Position" title="Position, size, alignment and layer order">
      <h2 className="ed-ph">{nodes.length === 1 ? "Position and size" : `${nodes.length} layers`}</h2>
      <div className="ed-grid">
        <Num label="X" unit={unit} value={minX} disabled={frozen} onCommit={(v) => move(v - minX, 0)} />
        <Num label="Y" unit={unit} value={minY} disabled={frozen} onCommit={(v) => move(0, v - minY)} />
        {nodes.length === 1 && <>
          <Num label="W" unit={unit} value={n.width} disabled={frozen} onCommit={(w) => onResize(w, n.height)} />
          <Num label="H" unit={unit} value={n.height} disabled={frozen} onCommit={(h) => onResize(n.width, h)} />
          <Num label="Rotation" unit="°" value={n.rotation} disabled={frozen} onCommit={(rotation) => onPatch([{ id: n.id, rotation }])} />
        </>}
      </div>
      {!frozen && <>
        <h2 className="ed-ph">{nodes.length === 1 ? "Align to page" : "Align"}</h2>
        <div className="ed-align">
          {ALIGNS.map(([op, label]) => (
            <button key={op} type="button" className="ed-mini" onClick={() => onPatch(alignBoxes(nodes, op, page))}>{label}</button>
          ))}
        </div>
        {nodes.length >= 2 && (
          <div className="ed-align ed-align2">
            {(["x", "y"] as const).map((axis) => (
              <button key={axis} type="button" className="ed-mini" disabled={nodes.length < 3} title={nodes.length < 3 ? "Select three or more layers to distribute" : undefined}
                onClick={() => onPatch(distributeBoxes(nodes, axis))}>Distribute {axis === "x" ? "H" : "V"}</button>
            ))}
          </div>
        )}
        <h2 className="ed-ph">Arrange</h2>
        <div className="ed-align ed-align2">
          <button type="button" className="ed-mini" onClick={() => onReorder("forward")}>Bring forward</button>
          <button type="button" className="ed-mini" onClick={() => onReorder("backward")}>Send backward</button>
        </div>
      </>}
    </Popover>
  );
}
