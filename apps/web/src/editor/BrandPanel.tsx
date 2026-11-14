import { useEffect, useState } from "react";
import { Link } from "react-router";
import * as Y from "yjs";
import { addNode, brandIssues, createText, updateNode, type CherryNode, type Page } from "@cherry/doc";
import { assetUrl, errorMessage, getAsset, listKits, setDesignKit, type Asset, type BrandKit } from "../api";
import { withTextHeight } from "./Canvas";
import { placeAsset } from "./VisualsPanel";

type TextNode = Extract<CherryNode, { kind: "text" }>;
type Role = "heading" | "subheading" | "body";
const STYLES: [Role, string][] = [["heading", "Heading"], ["subheading", "Subheading"], ["body", "Body"]];
const SLOTS = [["primary", "Primary"], ["onDark", "On dark"], ["mark", "Mark"], ["wordmark", "Wordmark"]] as const;

const flat = (nodes: CherryNode[]): CherryNode[] => nodes.flatMap((n) => (n.kind === "group" ? [n, ...flat(n.children)] : [n]));

/** Picks the workspace kit a design is linked to ("None" unlinks it). */
export function KitSelect({ label, workspaceId, designId, kitId, onLinked }: {
  label: string; workspaceId: string; designId: string; kitId: string | null; onLinked(kitId: string | null): void;
}) {
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    listKits(workspaceId).then((k) => !stale && setKits(k), () => !stale && setKits([]));
    return () => { stale = true; };
  }, [workspaceId]);
  if (!kits) return null;
  if (!kits.length) return <p className="muted" style={{ fontSize: 13 }}>No brand kits yet. <Link to="/brand">Create one</Link></p>;
  const pick = async (v: string) => {
    setError("");
    try {
      await setDesignKit(designId, v || null);
      onLinked(v || null);
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <div>
      <label className="ed-f"><b>{label}</b>
        <select value={kits.some((k) => k.id === kitId) ? kitId! : ""} onChange={(e) => void pick(e.target.value)}>
          <option value="">None</option>
          {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="ed-err">{error}</p>}
    </div>
  );
}

function Logo({ slot, assetId, readOnly, onPlace }: { slot: string; assetId: string; readOnly: boolean; onPlace(a: Asset): void }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  useEffect(() => {
    let stale = false;
    getAsset(assetId).then((r) => !stale && setAsset(r.asset), () => {});
    return () => { stale = true; };
  }, [assetId]);
  return (
    <button className="ed-shape" disabled={readOnly || !asset} title={`Place ${slot} logo`} aria-label={`Place ${slot} logo`} onClick={() => asset && onPlace(asset)}>
      <img src={assetUrl(assetId, "thumb")} alt="" loading="lazy" />
      <span>{slot}</span>
    </button>
  );
}

export default function BrandPanel({ ydoc, page, kit, designId, workspaceId, readOnly, act, selected, onSelect, onLinked }: {
  ydoc: Y.Doc; page: Page; kit: BrandKit | null; designId: string; workspaceId: string; readOnly: boolean;
  act(fn: () => void): void; selected: string[]; onSelect(ids: string[]): void; onLinked(kitId: string | null): void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [selected.join()]);

  if (!kit) return (
    <aside aria-label="Brand panel" className="ed-shapes">
      <p style={{ fontSize: 13 }}>This design isn't linked to a brand kit.</p>
      {!readOnly && <KitSelect label="Link a brand kit" workspaceId={workspaceId} designId={designId} kitId={null} onLinked={onLinked} />}
    </aside>
  );

  const { colors, typography, logos } = kit.content;
  const chosen = flat(page.nodes).filter((n) => selected.includes(n.id) && !n.locked);
  const issues = brandIssues(page, kit.content);

  const paintWith = (hex: string) => {
    if (!selected.length) return setNote("Select a layer first");
    const targets = chosen.filter((n) => n.kind === "rect" || n.kind === "ellipse" || n.kind === "path" || n.kind === "text");
    act(() => targets.forEach((n) => updateNode(ydoc, page.id, n.id, {
      fill: { type: "solid", color: hex, opacity: "fill" in n ? n.fill?.opacity ?? 1 : 1 },
    } as Partial<CherryNode>)));
  };

  const applyStyle = (role: Role, label: string) => {
    const s = typography[role];
    const style = { fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeight };
    const texts = chosen.filter((n): n is TextNode => n.kind === "text");
    if (texts.length) return act(() => texts.forEach((n) => updateNode(ydoc, page.id, n.id, withTextHeight(n, style, page.unit))));
    const width = page.width * 0.6;
    const t = createText({ x: (page.width - width) / 2, y: 0 }, width) as TextNode;
    const ink = colors.find((c) => c.role === "text");
    const base = { ...t, name: label, text: label, ...style, ...(ink && t.fill ? { fill: { ...t.fill, color: ink.hex } } : {}) } as TextNode;
    const height = (withTextHeight(base, { text: label }, page.unit) as { height: number }).height;
    const node = { ...base, height, y: (page.height - height) / 2 } as TextNode;
    act(() => addNode(ydoc, page.id, node));
    onSelect([node.id]);
  };

  const place = async (a: Asset) => setNote((await placeAsset(ydoc, page, designId, a, act, onSelect)) ?? "");

  return (
    <aside aria-label="Brand panel" className="ed-shapes">
      <h2 className="ed-ph">{kit.name}</h2>
      {!readOnly && <KitSelect label="Link a brand kit" workspaceId={workspaceId} designId={designId} kitId={kit.id} onLinked={onLinked} />}
      {note && <p role="status" className="muted" style={{ fontSize: 13 }}>{note}</p>}

      <h2 className="ed-ph">Colors</h2>
      {colors.length ? (
        <div className="chips">
          {colors.map((c) => (
            <button key={c.id} type="button" className="ed-swatch" aria-label={c.name} title={`${c.name} ${c.hex}`} disabled={readOnly}
              style={{ background: c.hex }} onClick={() => paintWith(c.hex)} />
          ))}
        </div>
      ) : <p className="muted" style={{ fontSize: 13 }}>This kit has no colors yet.</p>}

      <h2 className="ed-ph">Text styles</h2>
      <div className="chips">
        {STYLES.map(([role, label]) => (
          <button key={role} type="button" className="ed-mini" disabled={readOnly} onClick={() => applyStyle(role, label)}>{label}</button>
        ))}
      </div>

      <h2 className="ed-ph">Logos</h2>
      {SLOTS.some(([k]) => logos[k]) ? (
        <div className="ed-shapegrid">
          {SLOTS.map(([k, label]) => logos[k] && <Logo key={k} slot={label} assetId={logos[k]!} readOnly={readOnly} onPlace={(a) => void place(a)} />)}
        </div>
      ) : <p className="muted" style={{ fontSize: 13 }}>This kit has no logos yet.</p>}

      <h2 className="ed-ph">Brand checks</h2>
      {issues.length ? (
        <ul className="ed-issues">
          {issues.map((i) => (
            <li key={i.nodeId + i.kind + i.message}>
              <button type="button" className="ed-mini" onClick={() => onSelect([i.nodeId])}>{i.message}</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ fontSize: 13 }}>No brand issues on this page.</p>}
    </aside>
  );
}
