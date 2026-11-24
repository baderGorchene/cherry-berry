import { ask } from "../Modal";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import {
  ApiError, assetUrl, deleteAsset, errorMessage, myWorkspaces, updateAsset,
  type Asset, type AssetKind, type License, type Visibility, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import { KIND_BADGE, LICENSES, VISIBILITY, formatBytes, useAssetList, type AssetScope } from "../library/assets";
import ReportDialog from "../library/ReportDialog";
import UploadDialog from "../library/UploadDialog";
import AppShell from "../AppShell";
import FileMenu, { type FileItem } from "../editor/FileMenu";
import { IconUpload } from "../icons";

const TYPES: [AssetKind | undefined, string][] = [[undefined, "All"], ["image", "Images"], ["gif", "GIFs"], ["svg", "SVG"]];
const SOURCES: [AssetScope, string][] = [["workspace", "Workspace"], ["mine", "Mine"], ["public", "Public"]];
const LICENSE_CHIPS: [License | undefined, string][] = [[undefined, "Any"], ["cc0", "CC0"], ["cc-by", "CC-BY"], ["own", "Own work"]];

const license = (l: License) => LICENSES.find((x) => x.value === l)!;

/** A dropdown chip ("Type: All"): opens a menu of the options; Escape closes it and focus returns to the chip. */
function FilterChip<T>({ label, options, value, onPick }: { label: string; options: [T, string][]; value: T; onPick(v: T): void }) {
  const current = options.find(([v]) => v === value)![1];
  return (
    <FileMenu label={label} button={`${label}: ${current}`} className="chip chip-dd"
      items={options.map(([v, text]) => [text, () => onPick(v)] as FileItem)} />
  );
}

function Details({ a, ws, onEdited, onDeleted, onError }: {
  a: Asset; ws: Workspace; onEdited(): void; onDeleted(): void; onError(msg: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [form, setForm] = useState({ title: "", tags: "", license: "cc0" as License, attribution: "", visibility: "private" as Visibility });
  const [formError, setFormError] = useState("");
  useEffect(() => setEditing(false), [a.id]);

  const edit = () => {
    setForm({ title: a.title, tags: a.tags.join(", "), license: a.license, attribution: a.attribution, visibility: a.visibility });
    setFormError(""); setEditing(true);
  };
  const save = async () => {
    try {
      await updateAsset(a.id, {
        title: form.title.trim(), tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        license: form.license, attribution: form.attribution.trim(), visibility: form.visibility,
        ...(form.visibility === "workspace" ? { workspaceId: a.workspaceId ?? ws.id } : {}),
      });
      setEditing(false); onEdited();
    } catch (e) { setFormError(errorMessage(e)); }
  };
  const remove = async () => {
    if (!(await ask({ title: `Delete "${a.title}"?`, body: "This can't be undone.", ok: "Delete", danger: true }))) return;
    try { await deleteAsset(a.id); onDeleted(); } catch (e) { onError(errorMessage(e)); }
  };

  return (
    <>
      <div style={{ height: 200, background: "var(--tint)", borderRadius: 12, overflow: "hidden" }}>
        <img src={assetUrl(a.id, "thumb")} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <h3 style={{ fontSize: 17 }}>{a.title}</h3>
      {a.tags.length > 0 && (
        <ul className="chips" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {a.tags.map((t) => <li key={t} className="muted" style={{ fontSize: 13, background: "var(--tint)", borderRadius: 999, padding: "2px 10px" }}>{t}</li>)}
        </ul>
      )}
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label><span className="lbl">Title</span>
            <input className="inp" required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label><span className="lbl">Tags</span>
            <input className="inp" placeholder="comma, separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
          <label><span className="lbl">License</span>
            <select className="inp" value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value as License })}>
              {LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select></label>
          <label><span className="lbl">Attribution</span>
            <input className="inp" maxLength={300} value={form.attribution} onChange={(e) => setForm({ ...form, attribution: e.target.value })} /></label>
          <label><span className="lbl">Who can see it</span>
            <select className="inp" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}>
              {VISIBILITY.map(([v, l]) => <option key={v} value={v} disabled={v === "workspace" && ws.role === "viewer"}>{l}</option>)}
            </select></label>
          {formError && <p role="alert" className="field-error">{formError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-p" disabled={!form.title.trim()}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <dl className="facts">
            <dt>Uploaded by</dt><dd>{a.workspaceName ? `${a.uploaderName} · ${a.workspaceName}` : a.uploaderName}</dd>
            <dt>License</dt><dd>{license(a.license).label}{a.license === "cc-by" && a.attribution ? ` — ${a.attribution}` : ""}</dd>
            <dt>Size</dt><dd>{a.width} × {a.height} px</dd>
            <dt>Format</dt><dd>{a.format.toUpperCase()}</dd>
            <dt>File size</dt><dd>{formatBytes(a.bytes)}</dd>
            <dt>Visible to</dt><dd>{VISIBILITY.find(([v]) => v === a.visibility)![1]}</dd>
            <dt>Used in</dt><dd>{a.usedIn} {a.usedIn === 1 ? "design" : "designs"}</dd>
          </dl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {a.mine ? (
              <>
                <button className="btn" onClick={edit}>Edit details</button>
                <button className="btn" onClick={() => void remove()}>Delete</button>
              </>
            ) : <button className="btn" onClick={() => setReporting(true)}>Report</button>}
          </div>
        </>
      )}
      {reporting && <ReportDialog target={{ type: "asset", id: a.id, title: a.title }} onClose={() => setReporting(false)} />}
    </>
  );
}

export default function Library() {
  const { setUser } = useSession();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [, setCurrentId] = useState<string | null>(null); // re-render when the sidebar switches workspace
  const [kind, setKind] = useState<AssetKind | undefined>();
  const [scope, setScope] = useState<AssetScope>("workspace");
  const [lic, setLic] = useState<License | undefined>();
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dropped, setDropped] = useState<File[]>([]);

  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null); else setList([]);
    });
  }, []);
  const ws = list && currentWorkspace.pick(list);
  const { res, setRes, retry } = useAssetList(scope, { workspaceId: ws?.id, kind, license: lic }, text);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!ws) return <Navigate to="/workspaces" replace />;
  const filtered = !!(kind || lic || text.trim());
  const selected = res && "assets" in res ? res.assets.find((a) => a.id === selectedId) : undefined;

  return (
    <AppShell active="library" onSwitch={setCurrentId} bleed>
      <div className="split">
        <section className="split-main">
          <header className="page-head">
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <h1 className="page-title">Visual library</h1>
              <p className="page-sub only-d">Images, GIFs and SVGs you can use in any design.</p>
            </div>
            <button className="btn btn-p only-d" onClick={() => setUploading(true)}><IconUpload />Upload visuals</button>
          </header>
          <input className="inp" type="search" aria-label="Search visuals" placeholder="Search by title, tag or uploader"
            value={text} onChange={(e) => setText(e.target.value)} />
          <div className="filters">
            <FilterChip label="Type" options={TYPES} value={kind} onPick={setKind} />
            <FilterChip label="Source" options={SOURCES} value={scope} onPick={setScope} />
            <FilterChip label="License" options={LICENSE_CHIPS} value={lic} onPick={setLic} />
          </div>
          {!res ? <p className="muted">Loading…</p> : "error" in res ? (
            <div><p role="alert" className="field-error">{res.error}</p><button className="btn" onClick={retry}>Retry</button></div>
          ) : !res.assets.length ? (
            filtered || scope === "public" ? <p className="muted">No visuals match.</p> : (
              <div className="empty">
                <h2 className="sec-title">Upload your first image</h2>
                <p className="muted">PNG, JPG, WEBP, GIF and SVG files you add here can go into any design.</p>
                <div role="button" tabIndex={0} className="drop" onClick={() => setUploading(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setUploading(true); } }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); setDropped(Array.from(e.dataTransfer.files)); setUploading(true); }}>
                  <strong>Drop files here or click to browse</strong>
                </div>
                <button type="button" className="btn btn-p" onClick={() => setUploading(true)}><IconUpload />Upload your first image</button>
              </div>
            )
          ) : (
            <ul className="tiles">
              {res.assets.map((a) => (
                <li key={a.id}>
                  <button type="button" className="tile" aria-pressed={a.id === selectedId} onClick={() => setSelectedId(a.id)}>
                    <img src={assetUrl(a.id, "thumb")} alt={a.title} loading="lazy" />
                    <span className="badge badge-kind">{KIND_BADGE[a.kind]}</span>
                    <span className="badge badge-lic">{license(a.license).badge}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside aria-label="Selected visual" className={`aside${selected ? "" : " aside-idle"}`}>
          <h2 style={{ fontSize: 18 }}>Selected visual</h2>
          {selected ? (
            <Details a={selected} ws={ws} onEdited={retry} onError={(error) => setRes({ error })}
              onDeleted={() => { setSelectedId(null); retry(); }} />
          ) : <p className="muted" style={{ fontSize: 14 }}>Select a visual to see its details.</p>}
        </aside>
      </div>
      <button type="button" className="fab" aria-label="Upload visuals" onClick={() => setUploading(true)}><IconUpload /></button>
      {uploading && (
        <UploadDialog workspaceId={ws.id} viewer={ws.role === "viewer"} files={dropped} onClose={() => { setUploading(false); setDropped([]); }}
          onDone={(a) => { if (a) setSelectedId(a.id); retry(); }} />
      )}
    </AppShell>
  );
}
