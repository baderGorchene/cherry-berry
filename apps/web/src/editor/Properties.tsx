import { useState } from "react";
import * as Y from "yjs";
import { LOCAL, scalePath, updateNode, type CherryNode } from "@cherry/doc";

const FONTS = ["Inter", "Space Grotesk", "Georgia", "Arial", "Times New Roman", "Courier New"];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const round2 = (n: number) => String(Math.round(n * 100) / 100);

type Paint = { type: "solid"; color: string; opacity: number };
type Patch = Record<string, unknown>;

/** Text field that shows the live value and commits once on Enter or blur. */
function Field<T extends number | string>({ label, value, unit, disabled, parse, format, onCommit }: {
  label: string; value: T; unit?: string; disabled: boolean;
  parse(s: string): T | undefined; format(v: T): string; onCommit(v: T): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const v = parse(draft.trim());
    if (v !== undefined && v !== value) onCommit(v);
  };
  return (
    <label className="ed-f">
      <b>{label}</b>
      <input aria-label={label} value={draft ?? format(value)} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(null); }} />
      {unit && <span aria-hidden="true" className="ed-unit">{unit}</span>}
    </label>
  );
}

const parseNum = (s: string) => (s === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));
const parseHex = (s: string) => (s === "" ? "" : HEX.test(s) ? s.toUpperCase() : undefined);

function Num(p: { label: string; value: number; unit?: string; disabled: boolean; onCommit(v: number): void }) {
  return <Field {...p} parse={parseNum} format={round2} />;
}

function ColorField({ label, color, disabled, onCommit }: {
  label: string; color: string; disabled: boolean; onCommit(hex: string): void;
}) {
  return (
    <div className="ed-color">
      <Field label={label} value={color} disabled={disabled} parse={parseHex} format={(v) => v} onCommit={onCommit} />
      {/* Native "change" fires once when the picker closes: one undo step, not one per drag. */}
      <input type="color" aria-label={`${label} color`} key={color} defaultValue={color || "#000000"} disabled={disabled}
        ref={(el) => {
          if (!el) return;
          const h = () => onCommit(el.value.toUpperCase());
          el.addEventListener("change", h);
          return () => el.removeEventListener("change", h);
        }} />
    </div>
  );
}

export default function Properties({ ydoc, pageId, unit, nodes, readOnly }: {
  ydoc: Y.Doc; pageId: string; unit: string; nodes: CherryNode[]; readOnly: boolean;
}) {
  if (nodes.length === 0) return (
    <aside aria-label="Properties" className="ed-props">
      <p className="muted" style={{ fontSize: 13 }}>Select a layer to edit its properties.</p>
    </aside>
  );
  const set = (n: CherryNode, patch: Patch) => updateNode(ydoc, pageId, n.id, patch as Partial<CherryNode>);

  if (nodes.length > 1) {
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const move = (dx: number, dy: number) =>
      ydoc.transact(() => nodes.forEach((n) => set(n, { x: n.x + dx, y: n.y + dy })), LOCAL);
    return (
      <aside aria-label="Properties" className="ed-props">
        <section className="ed-sec">
          <h2 className="ed-ph">Layout · {nodes.length} layers</h2>
          <div className="ed-grid">
            <Num label="X" unit={unit} value={minX} disabled={readOnly} onCommit={(v) => move(v - minX, 0)} />
            <Num label="Y" unit={unit} value={minY} disabled={readOnly} onCommit={(v) => move(0, v - minY)} />
          </div>
        </section>
      </aside>
    );
  }

  const n = nodes[0]!;
  const resize = (w: number, h: number) => {
    w = Math.max(0, w); h = Math.max(0, h);
    const patch: Patch = { width: w, height: h };
    if (n.kind === "path") patch.d = scalePath(n.d, n.width ? w / n.width : 1, n.height ? h / n.height : 1);
    set(n, patch);
  };
  const fill = "fill" in n ? n.fill : undefined;
  const stroke = n.kind === "rect" || n.kind === "ellipse" || n.kind === "path" ? n.stroke : undefined;
  const hasStroke = n.kind === "rect" || n.kind === "ellipse" || n.kind === "path";
  const hasFill = hasStroke || n.kind === "text";
  const paint = (color: string, prev?: Paint): Paint => ({ type: "solid", color, opacity: prev?.opacity ?? 1 });

  return (
    <aside aria-label="Properties" className="ed-props" key={n.id}>
      <section className="ed-sec">
        <h2 className="ed-ph">Layout</h2>
        <div className="ed-grid">
          <Num label="X" unit={unit} value={n.x} disabled={readOnly} onCommit={(x) => set(n, { x })} />
          <Num label="Y" unit={unit} value={n.y} disabled={readOnly} onCommit={(y) => set(n, { y })} />
          <Num label="W" unit={unit} value={n.width} disabled={readOnly} onCommit={(w) => resize(w, n.height)} />
          <Num label="H" unit={unit} value={n.height} disabled={readOnly} onCommit={(h) => resize(n.width, h)} />
          <Num label="Rotation" unit="°" value={n.rotation} disabled={readOnly} onCommit={(rotation) => set(n, { rotation })} />
          <Num label="Opacity" unit="%" value={n.opacity * 100} disabled={readOnly}
            onCommit={(o) => set(n, { opacity: Math.min(100, Math.max(0, o)) / 100 })} />
          {n.kind === "rect" && (
            <Num label="Corner radius" unit={unit} value={n.cornerRadius} disabled={readOnly}
              onCommit={(r) => set(n, { cornerRadius: Math.max(0, r) })} />
          )}
        </div>
      </section>

      {n.kind === "text" && (
        <section className="ed-sec">
          <h2 className="ed-ph">Text</h2>
          <label className="ed-f"><b>Font</b>
            <select value={n.fontFamily} disabled={readOnly} onChange={(e) => set(n, { fontFamily: e.target.value })}>
              {(FONTS.includes(n.fontFamily) ? FONTS : [n.fontFamily, ...FONTS]).map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <div className="ed-grid">
            <Num label="Size" unit="pt" value={n.fontSize} disabled={readOnly}
              onCommit={(fontSize) => fontSize > 0 && set(n, { fontSize })} />
            <label className="ed-f"><b>Weight</b>
              <select value={n.fontWeight} disabled={readOnly} onChange={(e) => set(n, { fontWeight: Number(e.target.value) })}>
                {[400, 500, 600, 700].map((w) => <option key={w}>{w}</option>)}
              </select>
            </label>
            <Num label="Line height" value={n.lineHeight} disabled={readOnly} onCommit={(lineHeight) => set(n, { lineHeight })} />
            <Num label="Letter spacing" value={n.letterSpacing} disabled={readOnly} onCommit={(letterSpacing) => set(n, { letterSpacing })} />
          </div>
          <label className="ed-f"><b>Align</b>
            <select value={n.align} disabled={readOnly} onChange={(e) => set(n, { align: e.target.value })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>
        </section>
      )}

      {hasFill && (
        <section className="ed-sec">
          <h2 className="ed-ph">Fill</h2>
          <ColorField label="Fill" color={fill?.color ?? ""} disabled={readOnly}
            onCommit={(c) => set(n, { fill: c ? paint(c, fill) : undefined })} />
        </section>
      )}

      {hasStroke && (
        <section className="ed-sec">
          <h2 className="ed-ph">Stroke</h2>
          <ColorField label="Stroke" color={stroke?.paint.color ?? ""} disabled={readOnly}
            onCommit={(c) => set(n, { stroke: c ? { paint: paint(c, stroke?.paint), width: stroke?.width ?? 1 } : undefined })} />
          <Num label="Stroke width" unit={unit} value={stroke?.width ?? 0} disabled={readOnly}
            onCommit={(w) => set(n, { stroke: { paint: stroke?.paint ?? paint("#22142A"), width: Math.max(0, w) } })} />
        </section>
      )}
    </aside>
  );
}
