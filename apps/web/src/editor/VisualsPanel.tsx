import { useState } from "react";
import * as Y from "yjs";
import { addNode, updateNode, type CherryNode, type Page } from "@cherry/doc";
import { assetUrl, linkAssetToDesign, type Asset, type AssetKind, type Role } from "../api";
import { imageSlot } from "./brandLock";
import { useAssetList, type AssetScope } from "../library/assets";
import UploadDialog from "../library/UploadDialog";
import { imageNode, usableIn } from "./visuals";

const SOURCES: [AssetScope, string][] = [["mine", "Mine"], ["workspace", "Workspace"], ["public", "Public"]];
const TYPES: [AssetKind | undefined, string][] = [[undefined, "All"], ["image", "Images"], ["gif", "GIFs"], ["svg", "SVG"]];

function Chips<T>({ label, options, value, onPick }: { label: string; options: [T, string][]; value: T; onPick(v: T): void }) {
  return (
    <div role="group" aria-label={label} className="chips">
      {options.map(([v, text]) => (
        <button key={text} type="button" className="chip" aria-pressed={v === value} onClick={() => onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

/**
 * Links the asset to the design, then places it centred on the page and selects it, or swaps the picture of `slot`
 * (a content-locked image) keeping its box. Returns an error message, or null.
 */
export async function placeAsset(
  ydoc: Y.Doc, page: Page, designId: string, a: Asset, act: (fn: () => void) => void, onSelect: (ids: string[]) => void,
  slot?: CherryNode,
): Promise<string | null> {
  try {
    await linkAssetToDesign(designId, a.id);
  } catch {
    return "Couldn't link this visual to the design. Try again.";
  }
  // Placed even if the panel closed meanwhile: the person asked for it and the link now exists.
  if (slot) {
    act(() => updateNode(ydoc, page.id, slot.id, { assetId: a.id } as Partial<CherryNode>));
    return null;
  }
  const n = imageNode(a, page);
  act(() => addNode(ydoc, page.id, n));
  onSelect([n.id]);
  return null;
}

export default function VisualsPanel({ ydoc, page, designId, workspaceId, readOnly, role, selected, act, onSelect }: {
  ydoc: Y.Doc; page: Page; designId: string; workspaceId: string; readOnly: boolean; role: Role; selected: string[];
  act(fn: () => void): void; onSelect(ids: string[]): void;
}) {
  const [scope, setScope] = useState<AssetScope>("workspace");
  const [kind, setKind] = useState<AssetKind | undefined>();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const { res: raw, retry } = useAssetList(scope, { workspaceId, kind }, text);
  // "Mine" includes assets in your other workspaces, which can't be placed here.
  const res = raw && "assets" in raw ? { assets: raw.assets.filter((a) => usableIn(a, workspaceId)) } : raw;

  const insert = async (a: Asset) => {
    setError("");
    const err = await placeAsset(ydoc, page, designId, a, act, onSelect, imageSlot(page.nodes, selected, role));
    if (err) setError(err);
  };

  return (
    <aside aria-label="Visuals panel" className="ed-shapes">
      <Chips label="Source" options={SOURCES} value={scope} onPick={setScope} />
      <Chips label="Type" options={TYPES} value={kind} onPick={setKind} />
      <button className="ed-mini" disabled={readOnly} onClick={() => setUploading(true)}>Upload…</button>
      <input type="search" aria-label="Search visuals" placeholder="Search visuals" value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className="ed-err">{error}</p>}
      {!res ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        : "error" in res ? (
          <div><p role="alert" className="ed-err">{res.error}</p><button className="ed-mini" onClick={retry}>Retry</button></div>
        ) : !res.assets.length ? <p className="muted" style={{ fontSize: 13 }}>No visuals yet</p>
          : (
            <div className="ed-shapegrid">
              {res.assets.map((a) => (
                <button key={a.id} className="ed-shape" disabled={readOnly} title={a.title} onClick={() => void insert(a)}>
                  <img src={assetUrl(a.id, "thumb")} alt="" loading="lazy" />
                  <span>{a.title}</span>
                </button>
              ))}
            </div>
          )}
      {uploading && (
        <UploadDialog workspaceId={workspaceId} viewer={readOnly} onClose={() => setUploading(false)}
          onDone={(a) => { retry(); if (a) void insert(a); }} />
      )}
    </aside>
  );
}
