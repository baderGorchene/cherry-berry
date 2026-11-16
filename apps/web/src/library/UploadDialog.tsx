import { useEffect, useRef, useState } from "react";
import { ApiError, assetByHash, errorMessage, instanceInfo, uploadAsset, type Asset, type License, type Visibility } from "../api";
import { LICENSES, VISIBILITY } from "./assets";
import { precheck, sha256Hex, titleFromName, validate, type Details } from "./upload";

type Status = "checking" | "ready" | "duplicate" | "uploading" | "added" | "error";
type Row = { id: number; file: File; status: Status; error?: string; existing?: Asset; details: Details };

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.svg";
const LABEL: Record<Exclude<Status, "error">, string> = {
  checking: "Checking…", ready: "Ready", duplicate: "Already in library", uploading: "Uploading…", added: "Added",
};
let nextId = 1;

export default function UploadDialog({ workspaceId, viewer, onClose, onDone }: {
  workspaceId: string; viewer: boolean; onClose(): void; onDone(asset?: Asset): void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxMb, setMaxMb] = useState(50);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => dialogRef.current?.focus(), []);
  useEffect(() => { instanceInfo().then((i) => setMaxMb(i.maxUploadMb), () => {}); }, []);

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setDetails = (id: number, d: Partial<Details>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, details: { ...r.details, ...d } } : r)));

  const check = async (row: Row) => {
    const pre = precheck(row.file, maxMb);
    if (pre !== "ok") return patch(row.id, { status: "error", error: errorMessage(new ApiError(400, pre === "too_large" ? "upload_too_large" : pre)) });
    try {
      const existing = await assetByHash(await sha256Hex(await row.file.arrayBuffer()), workspaceId);
      patch(row.id, existing ? { status: "duplicate", existing } : { status: "ready" });
    } catch (e) { patch(row.id, { status: "error", error: errorMessage(e) }); }
  };

  const addFiles = (files: FileList | null) => {
    const fresh: Row[] = Array.from(files ?? [], (file) => ({
      id: nextId++, file, status: "checking",
      details: { title: titleFromName(file.name), tags: "", license: "", visibility: viewer ? "private" : "workspace", attribution: "", confirmed: false },
    }));
    if (!fresh.length) return;
    setRows((rs) => [...rs, ...fresh]);
    setSelectedId((s) => s ?? fresh[0]!.id);
    fresh.forEach((r) => void check(r));
  };

  const remove = (id: number) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  };
  const useExisting = (r: Row) => {
    remove(r.id);
    onDone(r.existing);
    if (rows.length === 1) onClose();
  };

  const selected = rows.find((r) => r.id === selectedId);
  const sendable = rows.filter((r) => r.status === "ready" && !validate(r.details));
  const applyAll = () => {
    if (!selected) return;
    const { license, visibility, tags, attribution, confirmed } = selected.details;
    setRows((rs) => rs.map((r) => (r.id !== selected.id && r.status === "ready" ? { ...r, details: { ...r.details, license, visibility, tags, attribution, confirmed } } : r)));
  };

  const addAll = async () => {
    setBusy(true);
    let newest: Asset | undefined;
    let clean = rows.every((r) => r.status === "added" || sendable.includes(r)); // no other row left in error or needing details
    for (const r of sendable) {
      const d = r.details;
      patch(r.id, { status: "uploading" });
      try {
        const res = await uploadAsset(r.file, {
          title: d.title.trim() || titleFromName(r.file.name), tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
          license: d.license as License, attribution: d.attribution.trim(), visibility: d.visibility, workspaceId,
        });
        if (res.duplicate) { clean = false; patch(r.id, { status: "duplicate", existing: res.asset }); }
        else { newest = res.asset; patch(r.id, { status: "added" }); }
      } catch (e) {
        clean = false;
        patch(r.id, { status: "error", error: errorMessage(e) });
      }
    }
    setBusy(false);
    if (newest) onDone(newest);
    if (clean) onClose();
  };

  const n = sendable.length;
  const d = selected?.details;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(34,20,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="upload-h" className="card"
        style={{ width: "min(560px, 100%)", maxHeight: "100%", overflowY: "auto", outline: "none" }}>
        <h2 id="upload-h" style={{ fontSize: 18 }}>Upload visuals</h2>

        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <strong>Drop files or click to browse</strong>
          <span className="muted" style={{ fontSize: 13 }}>PNG, JPG, WEBP, GIF, SVG · Up to {maxMb} MB each</span>
        </label>

        {rows.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r) => {
              const hint = r.status === "ready" ? validate(r.details) : null;
              return (
                <li key={r.id} className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                  <button type="button" className="btn-link" aria-pressed={r.id === selectedId} onClick={() => setSelectedId(r.id)}
                    style={{ flex: "1 1 120px", textAlign: "left", textDecoration: r.id === selectedId ? "underline" : "none", overflowWrap: "anywhere" }}>
                    {r.file.name}
                  </button>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14 }}>
                    {r.status === "error" ? <span role="alert" className="field-error">{r.error}</span> : <span>{LABEL[r.status]}</span>}
                    {hint && <span className="muted" style={{ fontSize: 13 }}>{hint}</span>}
                  </span>
                  {r.status === "duplicate" && <button type="button" className="btn" onClick={() => useExisting(r)}>Use existing</button>}
                  {(r.status === "error" || r.status === "ready" || r.status === "duplicate") &&
                    <button type="button" className="btn" aria-label={`Remove ${r.file.name}`} onClick={() => remove(r.id)}>Remove</button>}
                </li>
              );
            })}
          </ul>
        )}

        {selected && d && (
          <fieldset aria-label={`Details for ${selected.file.name}`} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={{ fontSize: 15 }}>Details for {selected.file.name}</h3>
            <label><span className="lbl">Title</span>
              <input className="inp" maxLength={120} value={d.title} onChange={(e) => setDetails(selected.id, { title: e.target.value })} /></label>
            <label><span className="lbl">Tags</span>
              <input className="inp" placeholder="comma, separated" value={d.tags} onChange={(e) => setDetails(selected.id, { tags: e.target.value })} /></label>
            <label><span className="lbl">License</span>
              <select className="inp" aria-label="License" value={d.license} onChange={(e) => setDetails(selected.id, { license: e.target.value as License | "" })}>
                <option value="" disabled>Choose a license</option>
                {LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select></label>
            <label><span className="lbl">Who can see it</span>
              <select className="inp" aria-label="Who can see it" value={d.visibility} onChange={(e) => setDetails(selected.id, { visibility: e.target.value as Visibility })}>
                {VISIBILITY.map(([v, l]) => <option key={v} value={v} disabled={v === "workspace" && viewer}>{l}</option>)}
              </select></label>
            <label><span className="lbl">Attribution / source</span>
              <input className="inp" maxLength={300} value={d.attribution} onChange={(e) => setDetails(selected.id, { attribution: e.target.value })} /></label>
            <label className="opt" style={{ flex: "none" }}>
              <input type="checkbox" checked={d.confirmed} onChange={(e) => setDetails(selected.id, { confirmed: e.target.checked })} />
              <span>I created this or have the right to share it under this license.</span>
            </label>
            {rows.length > 1 && <div><button type="button" className="btn" onClick={applyAll}>Apply to all files</button></div>}
          </fieldset>
        )}

        <p className="muted" style={{ fontSize: 13 }}>
          SVGs are cleaned of scripts and external links before saving. Duplicates are matched by file hash, so the library stays tidy.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-p" disabled={!n || busy} onClick={() => void addAll()}>
            Add {n} {n === 1 ? "visual" : "visuals"}
          </button>
        </div>
      </div>
    </div>
  );
}
