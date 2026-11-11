import { useState } from "react";
import type { CherryNode } from "@cherry/doc";
import { nodeToPath } from "@cherry/vector";
import { errorMessage, saveShape, type Visibility } from "../api";

function Dialog({ node, workspaceId, viewer, onClose, onSaved }: {
  node: CherryNode; workspaceId: string; viewer: boolean; onClose(): void; onSaved(): void;
}) {
  const [name, setName] = useState(node.name);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const outline = nodeToPath(node, "local");
    if (!outline) return setError(errorMessage(null));
    const fill = "fill" in node ? node.fill : undefined;
    const stroke = node.kind === "rect" || node.kind === "ellipse" || node.kind === "path" ? node.stroke : undefined;
    setBusy(true);
    try {
      await saveShape({
        name: name.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean), visibility,
        ...(visibility === "workspace" ? { workspaceId } : {}),
        d: outline.d, fillRule: outline.fillRule, ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="ed-modal" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form role="dialog" aria-modal="true" aria-label="Save shape" className="ed-dialog"
        onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h2 className="ed-ph">Save shape</h2>
        <label className="ed-f"><b>Name</b>
          <input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="ed-f"><b>Tags</b>
          <input value={tags} placeholder="comma, separated" onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="ed-f"><b>Share with</b>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="private">Only me</option>
            <option value="workspace" disabled={viewer}>This workspace</option>
            <option value="public">Everyone (public)</option>
          </select>
        </label>
        {error && <p role="alert" className="ed-err">{error}</p>}
        <div className="ed-actions">
          <button type="submit" className="ed-mini" disabled={busy || !name.trim()}>Save</button>
          <button type="button" className="ed-mini" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

/** Properties box for a single rect, ellipse or path. Open to viewers: saving to the library doesn't edit the design. */
export default function ReuseShape({ node, workspaceId, viewer }: { node: CherryNode; workspaceId: string; viewer: boolean }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Reuse this shape</h2>
      <button className="ed-mini" onClick={() => { setSaved(false); setOpen(true); }}>Save as custom shape</button>
      {saved && <p role="status" className="muted" style={{ fontSize: 13 }}>Saved to your shapes</p>}
      {open && <Dialog node={node} workspaceId={workspaceId} viewer={viewer} onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); setSaved(true); }} />}
    </section>
  );
}
