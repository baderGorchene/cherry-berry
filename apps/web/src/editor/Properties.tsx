import { useEffect, useState, type ReactNode } from "react";
import * as Y from "yjs";
import { LOCAL, removeNodes, updateNode, type CherryNode, type Page } from "@cherry/doc";
import { scalePath, type BoolOp } from "@cherry/vector";
import { alignBoxes, distributeBoxes, type AlignOp } from "./layout";
import ReuseShape from "./SaveShapeDialog";
import { withTextHeight } from "./Canvas";
import { getAsset, type Asset, type BrandKit, type Role } from "../api";
import { canDelete, canMove } from "./brandLock";
import { BUILT_IN_FONTS, kitFamilies } from "../brand/fonts";
import { KitSelect } from "./BrandPanel";
import { LICENSES } from "../library/assets";

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

export function Num(p: { label: string; value: number; unit?: string; disabled: boolean; onCommit(v: number): void }) {
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

const OPS: { op: BoolOp; label: string; icon: ReactNode }[] = [
  { op: "union", label: "Union", icon: <><circle cx="10" cy="10" r="8" fill="#8E1EA2" /><circle cx="18" cy="10" r="8" fill="#8E1EA2" /></> },
  { op: "subtract", label: "Subtract", icon: <><mask id="bo-sub"><rect width="28" height="20" fill="#fff" /><circle cx="18" cy="10" r="8" fill="#000" /></mask><circle cx="10" cy="10" r="8" fill="#8E1EA2" mask="url(#bo-sub)" /><circle cx="18" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /></> },
  { op: "intersect", label: "Intersect", icon: <><clipPath id="bo-int"><circle cx="18" cy="10" r="8" /></clipPath><circle cx="10" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /><circle cx="18" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /><circle cx="10" cy="10" r="8" fill="#8E1EA2" clipPath="url(#bo-int)" /></> },
  { op: "exclude", label: "Exclude", icon: <path fill="#8E1EA2" fillRule="evenodd" d="M10 2a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM18 2a8 8 0 1 0 0 16a8 8 0 1 0 0-16z" /> },
];

/** The library asset behind an image layer: title, license, attribution and pixel size. */
function VisualInfo({ assetId }: { assetId: string }) {
  const [a, setA] = useState<Asset | "failed" | null>(null);
  useEffect(() => {
    let stale = false;
    getAsset(assetId).then((r) => !stale && setA(r.asset), () => !stale && setA("failed"));
    return () => { stale = true; };
  }, [assetId]);
  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Visual</h2>
      {a === null ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        : a === "failed" ? <p className="muted" style={{ fontSize: 13 }}>Details unavailable</p>
          : (
            <>
              <p style={{ fontSize: 13 }}>{a.title}</p>
              <p style={{ fontSize: 13 }}>{LICENSES.find((l) => l.value === a.license)?.badge ?? a.license}</p>
              {a.attribution && <p className="muted" style={{ fontSize: 13 }}>{a.attribution}</p>}
              <p className="muted" style={{ fontSize: 13 }}>{a.width} × {a.height} px</p>
            </>
          )}
    </section>
  );
}

const TEXT_TABS = ["Font", "Color", "Spacing", "Effects"] as const;
type TextTab = (typeof TEXT_TABS)[number];

/** `tabs` (the phone sheet) groups a text layer's sections under Font, Color, Spacing and Effects pills. */
export default function Properties({ ydoc, page, workspaceId, designId, kit, onLinked, nodes, readOnly, role, act, combinable, canConvert, message, onCombine, onConvert, tabs = false }: {
  ydoc: Y.Doc; page: Page; workspaceId: string; designId: string; kit: BrandKit | null; onLinked(kitId: string | null): void; nodes: CherryNode[]; readOnly: boolean; role: Role; act(fn: () => void): void;
  combinable: boolean; canConvert: boolean; message: string; onCombine(op: BoolOp): void; onConvert(n: CherryNode): void; tabs?: boolean;
}) {
  const [tab, setTab] = useState<TextTab>("Font");
  const { id: pageId, unit } = page;
  if (nodes.length === 0) return (
    <aside aria-label="Properties" className="ed-props">
      <section className="ed-sec">
        <h2 className="ed-ph">Page</h2>
        <p style={{ fontSize: 13 }}>{page.width} × {page.height} {unit}</p>
        <p style={{ fontSize: 13 }}>{page.colorMode.toUpperCase()}</p>
        {!readOnly && <KitSelect label="Brand kit" workspaceId={workspaceId} designId={designId} kitId={kit?.id ?? null} onLinked={onLinked} />}
      </section>
      <p className="muted" style={{ fontSize: 13 }}>
        {readOnly ? "Select a layer to see its properties." : "Select a layer to edit it, or pick a tool on the left."}
      </p>
    </aside>
  );
  const remove = !readOnly && nodes.every((n) => canDelete(n, role)) && (
    <section className="ed-sec">
      <button className="ed-mini ed-del" onClick={() => act(() => removeNodes(ydoc, pageId, nodes.map((n) => n.id)))}>Delete</button>
    </section>
  );
  const update = (n: CherryNode, patch: Patch) =>
    updateNode(ydoc, pageId, n.id, withTextHeight(n, patch as Partial<CherryNode>, unit));
  const set = (n: CherryNode, patch: Patch) => act(() => update(n, patch));
  const ALIGNS: [AlignOp, string][] = [["left", "Left"], ["center", "Center"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]];
  const alignSection = !readOnly && nodes.every((n) => canMove(n, role)) && (
    <section className="ed-sec">
      <h2 className="ed-ph">{nodes.length === 1 ? "Align to page" : "Align"}</h2>
      <div className="ed-align">
        {ALIGNS.map(([op, label]) => (
          <button key={op} type="button" className="ed-mini" onClick={() => {
            const patches = alignBoxes(nodes, op, page);
            act(() => ydoc.transact(() => patches.forEach(({ id, ...p }) => updateNode(ydoc, pageId, id, p)), LOCAL));
          }}>{label}</button>
        ))}
      </div>
      {nodes.length >= 3 && (
        <div className="ed-align" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <button type="button" className="ed-mini" onClick={() => {
            const patches = distributeBoxes(nodes, "x");
            act(() => ydoc.transact(() => patches.forEach(({ id, ...p }) => updateNode(ydoc, pageId, id, p)), LOCAL));
          }}>Distribute H</button>
          <button type="button" className="ed-mini" onClick={() => {
            const patches = distributeBoxes(nodes, "y");
            act(() => ydoc.transact(() => patches.forEach(({ id, ...p }) => updateNode(ydoc, pageId, id, p)), LOCAL));
          }}>Distribute V</button>
        </div>
      )}
    </section>
  );
  const LOCKS = [["none", "Off"], ["content", "Content editable"], ["fixed", "Fixed"]] as const;
  const lock = nodes.every((n) => n.brandLock === nodes[0]!.brandLock) ? nodes[0]!.brandLock : "";
  const brandLock = (role === "owner" || role === "admin") && (
    <section className="ed-sec">
      <label className="ed-f"><b>Brand lock</b>
        <select value={lock} disabled={readOnly} onChange={(e) => act(() => nodes.forEach((n) => update(n, { brandLock: e.target.value })))}>
          {lock === "" && <option value="" disabled>Mixed</option>}
          {LOCKS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
      </label>
    </section>
  );

  if (nodes.length > 1) {
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const frozen = readOnly || nodes.some((n) => !canMove(n, role));
    const move = (dx: number, dy: number) =>
      act(() => ydoc.transact(() => nodes.forEach((n) => update(n, { x: n.x + dx, y: n.y + dy })), LOCAL));
    return (
      <aside aria-label="Properties" className="ed-props">
        <section className="ed-sec">
          <h2 className="ed-ph">Layout · {nodes.length} layers</h2>
          <div className="ed-grid">
            <Num label="X" unit={unit} value={minX} disabled={frozen} onCommit={(v) => move(v - minX, 0)} />
            <Num label="Y" unit={unit} value={minY} disabled={frozen} onCommit={(v) => move(0, v - minY)} />
          </div>
        </section>
        {alignSection}
        {combinable && !frozen && (
          <section className="ed-sec">
            <h2 className="ed-ph">Combine</h2>
            <div className="ed-ops">
              {OPS.map(({ op, label, icon }) => (
                <button key={op} className="ed-op" title={`${label} (Ctrl+Alt+${label[0]})`} onClick={() => onCombine(op)}>
                  <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">{icon}</svg>{label}
                </button>
              ))}
            </div>
            {message && <p role="status" className="muted" style={{ fontSize: 13 }}>{message}</p>}
          </section>
        )}
        {brandLock}
        {remove}
      </aside>
    );
  }

  const n = nodes[0]!;
  const ro = readOnly || !canMove(n, role);
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
  const swatches = !!kit?.content.rules.kitColorsOnly && kit.content.colors.length > 0;
  const fonts = kit ? kitFamilies(kit) : BUILT_IN_FONTS;
  const colorInput = (label: string, color: string, onCommit: (hex: string) => void) => swatches ? (
    <div>
      <div className="chips">
        {kit.content.colors.map((c) => (
          <button key={c.id} type="button" className="ed-swatch" aria-label={c.name} title={`${c.name} ${c.hex}`}
            disabled={ro} style={{ background: c.hex }} onClick={() => onCommit(c.hex.toUpperCase())} />
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{color || "None"}</p>
    </div>
  ) : <ColorField label={label} color={color} disabled={ro} onCommit={onCommit} />;
  const paint = (color: string, prev?: Paint): Paint => ({ type: "solid", color, opacity: prev?.opacity ?? 1 });
  const tabbed = tabs && n.kind === "text";
  const on = (t: TextTab) => !tabbed || tab === t;
  const opacity = (
    <Num label="Opacity" unit="%" value={n.opacity * 100} disabled={ro}
      onCommit={(o) => set(n, { opacity: Math.min(100, Math.max(0, o)) / 100 })} />
  );

  return (
    <aside aria-label="Properties" className="ed-props" key={n.id}>
      {tabbed && (
        <div role="tablist" aria-label="Text properties" className="ed-pills">
          {TEXT_TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className="ed-pill-t" onClick={() => setTab(t)}>{t}</button>)}
        </div>
      )}
      {on("Spacing") && <section className="ed-sec">
        <h2 className="ed-ph">Layout</h2>
        <div className="ed-grid">
          <Num label="X" unit={unit} value={n.x} disabled={ro} onCommit={(x) => set(n, { x })} />
          <Num label="Y" unit={unit} value={n.y} disabled={ro} onCommit={(y) => set(n, { y })} />
          <Num label="W" unit={unit} value={n.width} disabled={ro} onCommit={(w) => resize(w, n.height)} />
          <Num label="H" unit={unit} value={n.height} disabled={ro} onCommit={(h) => resize(n.width, h)} />
          <Num label="Rotation" unit="°" value={n.rotation} disabled={ro} onCommit={(rotation) => set(n, { rotation })} />
          {!tabbed && opacity}
          {n.kind === "rect" && (
            <Num label="Corner radius" unit={unit} value={n.cornerRadius} disabled={ro}
              onCommit={(r) => set(n, { cornerRadius: Math.max(0, r) })} />
          )}
        </div>
      </section>}
      {on("Spacing") && alignSection}
      {tabbed && tab === "Effects" && <section className="ed-sec"><h2 className="ed-ph">Effects</h2>{opacity}</section>}

      {n.kind === "image" && <VisualInfo assetId={n.assetId} />}
      {n.kind === "text" && (on("Font") || on("Spacing")) && (
        <section className="ed-sec">
          <h2 className="ed-ph">Text</h2>
          {on("Font") && <label className="ed-f"><b>Font</b>
            <select value={n.fontFamily} disabled={ro} onChange={(e) => set(n, { fontFamily: e.target.value })}>
              {(fonts.includes(n.fontFamily) ? fonts : [n.fontFamily, ...fonts]).map((f) => <option key={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
            </select>
          </label>}
          <div className="ed-grid">
            {on("Font") && <Num label="Size" unit="pt" value={n.fontSize} disabled={ro}
              onCommit={(fontSize) => fontSize > 0 && set(n, { fontSize })} />}
            {on("Font") && <label className="ed-f"><b>Weight</b>
              <select value={n.fontWeight} disabled={ro} onChange={(e) => set(n, { fontWeight: Number(e.target.value) })}>
                {[400, 500, 600, 700].map((w) => <option key={w}>{w}</option>)}
              </select>
            </label>}
            {on("Spacing") && <Num label="Line height" value={n.lineHeight} disabled={ro} onCommit={(lineHeight) => lineHeight > 0 && set(n, { lineHeight })} />}
            {on("Spacing") && <Num label="Letter spacing" value={n.letterSpacing} disabled={ro} onCommit={(letterSpacing) => set(n, { letterSpacing })} />}
          </div>
          {on("Font") && <label className="ed-f"><b>Align</b>
            <select value={n.align} disabled={ro} onChange={(e) => set(n, { align: e.target.value })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>}
        </section>
      )}

      {hasFill && on("Color") && (
        <section className="ed-sec">
          <h2 className="ed-ph">Fill</h2>
          {colorInput("Fill", fill?.color ?? "", (c) => set(n, { fill: c ? paint(c, fill) : undefined }))}
        </section>
      )}

      {hasStroke && (
        <section className="ed-sec">
          <h2 className="ed-ph">Stroke</h2>
          {colorInput("Stroke", stroke?.paint.color ?? "", (c) => set(n, { stroke: c ? { paint: paint(c, stroke?.paint), width: stroke?.width ?? 1 } : undefined }))}
          <Num label="Stroke width" unit={unit} value={stroke?.width ?? 0} disabled={ro}
            onCommit={(w) => set(n, { stroke: { paint: stroke?.paint ?? paint("#22142A"), width: Math.max(0, w) } })} />
        </section>
      )}

      {canConvert && (n.kind === "rect" || n.kind === "ellipse") && !ro && (
        <section className="ed-sec">
          <button className="ed-mini" onClick={() => onConvert(n)}>Convert to path</button>
          {message && <p role="status" className="muted" style={{ fontSize: 13 }}>{message}</p>}
        </section>
      )}
      {(n.kind === "rect" || n.kind === "ellipse" || n.kind === "path") && (
        <ReuseShape key={n.id} node={n} workspaceId={workspaceId} viewer={readOnly} />
      )}
      {brandLock}
      {remove}
    </aside>
  );
}
