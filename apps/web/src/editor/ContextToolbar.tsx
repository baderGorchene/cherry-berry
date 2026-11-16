import { useEffect, useState, type ReactNode } from "react";
import * as Y from "yjs";
import { LOCAL, updateNode, updatePage, type CherryNode, type Page } from "@cherry/doc";
import { scalePath, type AnchorRef, type BoolOp } from "@cherry/vector";
import { getAsset, type Asset, type BrandKit, type Role } from "../api";
import { BUILT_IN_FONTS, kitFamilies } from "../brand/fonts";
import { LICENSES } from "../library/assets";
import { KitSelect } from "./BrandPanel";
import { withTextHeight } from "./Canvas";
import ColorPopover from "./ColorPopover";
import { boldWeight, fontWeights, toolbarKind } from "./selection";
import { canMove } from "./brandLock";
import PathPanel from "./PathPanel";
import Popover from "./Popover";
import PositionPopover, { Num } from "./PositionPopover";
import ReuseShape from "./SaveShapeDialog";
import { IconLock, IconUnlock } from "../icons";

type Patch = Record<string, unknown>;
type Paint = { type: "solid"; color: string; opacity: number };
const paint = (color: string, prev?: Paint): Paint => ({ type: "solid", color, opacity: prev?.opacity ?? 1 });

const OPS: { op: BoolOp; label: string; icon: ReactNode }[] = [
  { op: "union", label: "Union", icon: <><circle cx="10" cy="10" r="8" fill="#8E1EA2" /><circle cx="18" cy="10" r="8" fill="#8E1EA2" /></> },
  { op: "subtract", label: "Subtract", icon: <><mask id="bo-sub"><rect width="28" height="20" fill="#fff" /><circle cx="18" cy="10" r="8" fill="#000" /></mask><circle cx="10" cy="10" r="8" fill="#8E1EA2" mask="url(#bo-sub)" /><circle cx="18" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /></> },
  { op: "intersect", label: "Intersect", icon: <><clipPath id="bo-int"><circle cx="18" cy="10" r="8" /></clipPath><circle cx="10" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /><circle cx="18" cy="10" r="8" fill="none" stroke="#C654C3" strokeDasharray="2 2" /><circle cx="10" cy="10" r="8" fill="#8E1EA2" clipPath="url(#bo-int)" /></> },
  { op: "exclude", label: "Exclude", icon: <path fill="#8E1EA2" fillRule="evenodd" d="M10 2a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM18 2a8 8 0 1 0 0 16a8 8 0 1 0 0-16z" /> },
];
const ALIGN_TEXT = [["left", "M4 6h16M4 10h10M4 14h16M4 18h10"], ["center", "M4 6h16M7 10h10M4 14h16M7 18h10"], ["right", "M4 6h16M10 10h10M4 14h16M10 18h10"]] as const;
const LOCKS = [["none", "Off"], ["content", "Content editable"], ["fixed", "Fixed"]] as const;

/** The library asset behind an image layer: title, license, attribution and pixel size. */
function ImageInfo({ assetId }: { assetId: string }) {
  const [a, setA] = useState<Asset | "failed" | null>(null);
  useEffect(() => {
    let stale = false;
    getAsset(assetId).then((r) => !stale && setA(r.asset), () => !stale && setA("failed"));
    return () => { stale = true; };
  }, [assetId]);
  return (
    <Popover label="Image info" button="Info" title="Title, license and attribution">
      <h2 className="ed-ph">Image</h2>
      {a === null ? <p className="muted ed-note">Loading…</p>
        : a === "failed" ? <p className="muted ed-note">Details unavailable</p>
          : (
            <>
              <p className="ed-note">{a.title}</p>
              <p className="ed-note">{LICENSES.find((l) => l.value === a.license)?.badge ?? a.license}</p>
              {a.attribution && <p className="muted ed-note">{a.attribution}</p>}
              <p className="muted ed-note">{a.width} × {a.height} px</p>
            </>
          )}
    </Popover>
  );
}

export type PathEditing = { node: CherryNode; anchors: AnchorRef[]; onDone(): void; panel: boolean };

/**
 * The bar above the canvas; what it holds depends on the selection (spec Decision 5):
 * page settings with nothing selected, text or shape styling, image info, group and combine for several, and Position for all.
 * Viewers get no editing controls.
 */
export default function ContextToolbar({
  ydoc, page, nodes, kit, docColors, role, readOnly, workspaceId, designId, act, onLinked,
  canCombine, canConvert, message, onCombine, onConvert, onGroup, onUngroup, onEditPath, onLock, onReorder, editing,
}: {
  ydoc: Y.Doc; page: Page; nodes: CherryNode[]; kit: BrandKit | null; docColors: string[]; role: Role; readOnly: boolean;
  workspaceId: string; designId: string; act(fn: () => void): void; onLinked(kitId: string | null): void;
  canCombine: boolean; canConvert: boolean; message: string; onCombine(op: BoolOp): void; onConvert(n: CherryNode): void;
  onGroup(): void; onUngroup(): void; onEditPath(id: string): void; onLock(): void; onReorder(to: "forward" | "backward"): void;
  editing: PathEditing | null;
}) {
  const { unit } = page;
  const kind = toolbarKind(nodes);
  const bar = (children: ReactNode) => <div role="toolbar" aria-label="Selection" className="ed-tb">{children}</div>;

  if (editing) return bar(<>
    <span className="ed-pill">Editing path</span>
    {editing.panel && <button type="button" className="ed-done" title="Done (Esc)" onClick={editing.onDone}>Done</button>}
    {editing.panel && <PathPanel ydoc={ydoc} page={page} node={editing.node} anchors={editing.anchors} act={act} />}
  </>);

  const update = (n: CherryNode, patch: Patch) => updateNode(ydoc, page.id, n.id, withTextHeight(n, patch as Partial<CherryNode>, unit));
  const setAll = (patch: Patch) => act(() => ydoc.transact(() => nodes.forEach((n) => update(n, patch)), LOCAL));
  const n = nodes[0];

  if (readOnly) return bar(<>
    {n?.kind === "image" && nodes.length === 1 && <ImageInfo assetId={n.assetId} />}
    {n && nodes.length === 1 && (kind === "shape" || kind === "path") && <ReuseShape key={n.id} node={n} workspaceId={workspaceId} viewer />}
    <span className="muted ed-note">{page.width} × {page.height} {unit} · {page.colorMode.toUpperCase()}</span>
  </>);

  if (!n) {
    const setPage = (patch: Parameters<typeof updatePage>[2]) => act(() => updatePage(ydoc, page.id, patch));
    return bar(<>
      <ColorPopover label="Background colour" dialog="Background colour" color={page.background.color} disabled={false} kit={kit} docColors={docColors}
        onCommit={(c) => setPage({ background: paint(c, page.background) })} />
      <span role="group" aria-label="Page size" className="ed-tbg">
        <Num label="Page width" unit={unit} value={page.width} disabled={false} onCommit={(width) => width > 0 && setPage({ width })} />
        <Num label="Page height" unit={unit} value={page.height} disabled={false} onCommit={(height) => height > 0 && setPage({ height })} />
      </span>
      <select className="ed-tbsel" aria-label="Colour mode" title="Colour mode" value={page.colorMode}
        onChange={(e) => setPage({ colorMode: e.target.value as Page["colorMode"] })}>
        <option value="rgb">RGB</option><option value="cmyk">CMYK</option>
      </select>
      <KitSelect label="Brand kit" workspaceId={workspaceId} designId={designId} kitId={kit?.id ?? null} onLinked={onLinked} />
    </>);
  }

  const frozen = nodes.some((m) => !canMove(m, role));
  const set = (patch: Patch) => act(() => update(n, patch));
  const resize = (w: number, h: number) => {
    w = Math.max(0, w); h = Math.max(0, h);
    const patch: Patch = { width: w, height: h };
    if (n.kind === "path") patch.d = scalePath(n.d, n.width ? w / n.width : 1, n.height ? h / n.height : 1);
    set(patch);
  };
  const colour = (label: string, dialog: string, color: string, onCommit: (c: string) => void, allowNone = true) => (
    <ColorPopover label={label} dialog={dialog} color={color} disabled={frozen} kit={kit} docColors={docColors} allowNone={allowNone} onCommit={onCommit} />
  );
  const opacity = (
    <Num label="Opacity" unit="%" value={n.opacity * 100} disabled={frozen}
      onCommit={(o) => setAll({ opacity: Math.min(100, Math.max(0, o)) / 100 })} />
  );
  const position = (
    <PositionPopover page={page} nodes={nodes} frozen={frozen} onResize={resize} onReorder={onReorder}
      onPatch={(patches) => act(() => ydoc.transact(() => patches.forEach(({ id, ...p }) => {
        const m = nodes.find((x) => x.id === id);
        if (m) update(m, p);
      }), LOCAL))} />
  );
  const lock = nodes.every((m) => m.brandLock === n.brandLock) ? n.brandLock : "";
  const end = <>
    {(role === "owner" || role === "admin") && (
      <label className="ed-f"><b>Brand lock</b>
        <select value={lock} onChange={(e) => setAll({ brandLock: e.target.value })}>
          {lock === "" && <option value="" disabled>Mixed</option>}
          {LOCKS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
      </label>
    )}
    {!frozen && (
      <button type="button" className="ed-icon ed-tbi" aria-label={n.locked ? "Unlock" : "Lock"} title={n.locked ? "Unlock" : "Lock"} aria-pressed={nodes.every((m) => m.locked)}
        onClick={onLock}>{n.locked ? <IconLock /> : <IconUnlock />}</button>
    )}
    {message && <span role="status" className="muted ed-note">{message}</span>}
  </>;

  if (kind === "multi" || kind === "group") return bar(<>
    {kind === "multi" && !frozen && <button type="button" className="ed-tbb" onClick={onGroup}>Group</button>}
    {kind === "group" && !frozen && <button type="button" className="ed-tbb" onClick={onUngroup}>Ungroup</button>}
    {canCombine && !frozen && (
      <span role="group" aria-label="Combine" className="ed-tbg">
        {OPS.map(({ op, label, icon }) => (
          <button key={op} type="button" className="ed-tbb" title={`${label} (Ctrl+Alt+${label[0]})`} onClick={() => onCombine(op)}>
            <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">{icon}</svg>{label}
          </button>
        ))}
      </span>
    )}
    {opacity}
    {position}
    {end}
  </>);

  if (n.kind === "image") return bar(<>{opacity}<ImageInfo assetId={n.assetId} />{position}{end}</>);

  if (n.kind === "text") {
    const fonts = kit ? kitFamilies(kit) : BUILT_IN_FONTS;
    const weights = fontWeights(n.fontFamily, kit);
    const size = (v: number) => v > 0 && set({ fontSize: Math.round(v * 100) / 100 });
    return bar(<>
      <select className="ed-tbsel ed-font" aria-label="Font" title="Font" value={n.fontFamily} disabled={frozen} style={{ fontFamily: `"${n.fontFamily}"` }}
        onChange={(e) => set({ fontFamily: e.target.value })}>
        {(fonts.includes(n.fontFamily) ? fonts : [n.fontFamily, ...fonts]).map((f) => <option key={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
      </select>
      <span className="ed-tbg">
        <button type="button" className="ed-tbb ed-tbi" aria-label="Decrease font size" title="Decrease font size" disabled={frozen || n.fontSize <= 1} onClick={() => size(n.fontSize - 1)}>−</button>
        <Num label="Size" unit="pt" value={n.fontSize} disabled={frozen} onCommit={size} />
        <button type="button" className="ed-tbb ed-tbi" aria-label="Increase font size" title="Increase font size" disabled={frozen} onClick={() => size(n.fontSize + 1)}>+</button>
      </span>
      {colour("Text colour", "Text colour", n.fill?.color ?? "", (c) => set({ fill: c ? paint(c, n.fill) : undefined }), false)}
      <button type="button" className="ed-tbb ed-tbi ed-bold" aria-label="Bold" title="Bold" aria-pressed={n.fontWeight >= 600}
        disabled={frozen || boldWeight(n.fontWeight, weights) === n.fontWeight} onClick={() => set({ fontWeight: boldWeight(n.fontWeight, weights) })}>B</button>
      <span role="group" aria-label="Text alignment" className="ed-tbg">
        {ALIGN_TEXT.map(([a, d]) => (
          <button key={a} type="button" className="ed-icon ed-tbi" aria-label={`Align text ${a}`} title={`Align text ${a}`} aria-pressed={n.align === a} disabled={frozen}
            onClick={() => set({ align: a })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
          </button>
        ))}
      </span>
      <Popover label="Text spacing" button="Spacing" title="Weight, line height and letter spacing" disabled={frozen}>
        <label className="ed-f"><b>Weight</b>
          <select value={n.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
            {(weights.includes(n.fontWeight) ? weights : [...weights, n.fontWeight].sort((a, b) => a - b)).map((w) => <option key={w}>{w}</option>)}
          </select>
        </label>
        <Num label="Line height" value={n.lineHeight} disabled={frozen} onCommit={(lineHeight) => lineHeight > 0 && set({ lineHeight })} />
        <Num label="Letter spacing" value={n.letterSpacing} disabled={frozen} onCommit={(letterSpacing) => set({ letterSpacing })} />
      </Popover>
      {opacity}
      {position}
      {end}
    </>);
  }

  // A rect, ellipse or path.
  const fill = "fill" in n ? n.fill : undefined;
  const stroke = n.kind === "rect" || n.kind === "ellipse" || n.kind === "path" ? n.stroke : undefined;
  return bar(<>
    {colour("Fill", "Fill colour", fill?.color ?? "", (c) => set({ fill: c ? paint(c, fill) : undefined }))}
    {colour("Stroke", "Stroke colour", stroke?.paint.color ?? "", (c) => set({ stroke: c ? { paint: paint(c, stroke?.paint), width: stroke?.width ?? 1 } : undefined }))}
    <Num label="Stroke width" unit={unit} value={stroke?.width ?? 0} disabled={frozen}
      onCommit={(w) => set({ stroke: { paint: stroke?.paint ?? paint("#22142A"), width: Math.max(0, w) } })} />
    {n.kind === "rect" && <Num label="Corner radius" unit={unit} value={n.cornerRadius} disabled={frozen} onCommit={(r) => set({ cornerRadius: Math.max(0, r) })} />}
    {opacity}
    {position}
    {n.kind === "path" && !frozen && <button type="button" className="ed-tbb" title="Edit points (Enter)" onClick={() => onEditPath(n.id)}>Edit points</button>}
    {canConvert && n.kind !== "path" && !frozen && <button type="button" className="ed-tbb" onClick={() => onConvert(n)}>Convert to path</button>}
    <ReuseShape key={n.id} node={n} workspaceId={workspaceId} viewer={false} />
    {end}
  </>);
}
