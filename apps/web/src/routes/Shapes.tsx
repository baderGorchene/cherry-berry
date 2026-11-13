import { useEffect, useState } from "react";
import { parsePath, pathBounds, transformPath } from "@cherry/vector";
import { Navigate } from "react-router";
import {
  ApiError, deleteShape, errorMessage, myWorkspaces, saveShape, type Shape, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import { readSvg, ShapeThumb, TABS } from "../editor/ShapesPanel";
import { ShapeFields, shapePayload, useShapeForm, useShapeList } from "../editor/shapeForm";
import { SHAPES } from "../editor/Toolbar";
import ReportDialog from "../library/ReportDialog";
import AppShell from "../AppShell";

const MAX_D = 100_000;
const grid = { listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 14 } as const;
const cell = { alignItems: "center", padding: 14, color: "var(--berry)" } as const;

export default function Shapes() {
  const { setUser } = useSession();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("basic");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Shape | null>(null);
  const [fileError, setFileError] = useState("");
  const [form, setForm] = useShapeForm();
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setCurrentId] = useState<string | null>(null); // re-render when the sidebar switches workspace
  const [reporting, setReporting] = useState<Shape | null>(null);

  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null); else setList([]);
    });
  }, []);
  const ws = list && currentWorkspace.pick(list);
  const { res, setRes, retry } = useShapeList(tab === "basic" ? null : tab, ws?.id, text);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!ws) return <Navigate to="/workspaces" replace />;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSaved(false); setFormError("");
    const r = await readSvg(file);
    if ("error" in r) { setPreview(null); return setFileError(r.error); }
    setFileError("");
    try {
      const filled = r.paths.find((p) => p.fill);
      const joined = r.paths.map((p) => p.d).join(" ");
      const b = pathBounds(parsePath(joined));
      setPreview({
        d: transformPath(joined, [1, 0, 0, 1, -b.x, -b.y]), fillRule: r.paths[0]!.fillRule, fill: filled?.fill ?? null,
        stroke: filled ? null : (r.paths.find((p) => p.stroke)?.stroke ?? null), width: b.width, height: b.height,
      } as Shape);
    } catch {
      setPreview(null);
      return setFileError("That SVG is too detailed to save as one shape.");
    }
    setForm((f) => ({ ...f, name: f.name || file.name.replace(/\.svg$/i, "") }));
  };

  const save = async () => {
    if (!preview) return;
    if (preview.d.length > MAX_D) return setFormError("That SVG is too detailed to save as one shape.");
    setBusy(true); setFormError("");
    try {
      await saveShape(shapePayload(form, ws.id, preview));
      setSaved(true); setPreview(null); setForm({ name: "", tags: "", visibility: form.visibility }); setTab("mine"); retry();
    } catch (e) {
      setFormError(errorMessage(e));
    }
    setBusy(false);
  };

  const remove = async (s: Shape) => {
    if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    try {
      await deleteShape(s.id);
      retry();
    } catch (e) {
      setRes({ error: errorMessage(e) });
    }
  };

  return (
    <AppShell active="shapes" onSwitch={setCurrentId}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ flex: "3 1 380px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ fontSize: 22 }}>Shapes</h1>
          <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`btn${tab === id ? " btn-p" : ""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          {tab === "basic" ? (
            <ul style={grid}>
              {SHAPES.map((s) => (
                <li key={s.kind} className="card" style={cell}>
                  {s.icon}<span style={{ color: "var(--ink)", fontSize: 14 }}>{s.label.replace(/ \(.\)$/, "")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <input className="inp" type="search" aria-label="Search shapes" placeholder="Search shapes" value={text} onChange={(e) => setText(e.target.value)} />
              {!res ? <p className="muted">Loading…</p> : "error" in res ? (
                <div><p role="alert" className="field-error">{res.error}</p><button className="btn" onClick={retry}>Retry</button></div>
              ) : !res.shapes.length ? <p className="muted">No shapes yet</p> : (
                <ul style={grid}>
                  {res.shapes.map((s) => (
                    <li key={s.id} className="card" style={cell}>
                      <ShapeThumb s={s} size={64} />
                      <span style={{ color: "var(--ink)", fontSize: 14 }}>{s.name}</span>
                      {s.mine
                        ? <button className="btn" onClick={() => void remove(s)}>Delete</button>
                        : <button className="btn" onClick={() => setReporting(s)}>Report</button>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <aside aria-label="New shape" className="card" style={{ flex: "1 1 260px", maxWidth: 360 }}>
          <h2 style={{ fontSize: 18 }}>New shape</h2>
          <section>
            <h3 style={{ fontSize: 15 }}>Draw with the pen</h3>
            <p className="muted" style={{ fontSize: 13 }}>Draw a path with the pen in any design, then choose "Save as custom shape".</p>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={{ fontSize: 15 }}>Import an SVG</h3>
            <input type="file" aria-label="Import SVG file" accept=".svg,image/svg+xml"
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {fileError && <p role="alert" className="field-error">{fileError}</p>}
            {preview && <div style={{ color: "var(--berry)", alignSelf: "center" }}><ShapeThumb s={preview} size={96} /></div>}
          </section>
          {preview && (
            <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ShapeFields value={form} onChange={setForm} viewer={ws.role === "viewer"} input="inp" />
              {formError && <p role="alert" className="field-error">{formError}</p>}
              <button type="submit" className="btn btn-p" disabled={busy || !form.name.trim()}>Save shape</button>
            </form>
          )}
          {saved && <p role="status" className="muted">Saved to your shapes</p>}
        </aside>
      </div>
      {reporting && <ReportDialog target={{ type: "shape", id: reporting.id, title: reporting.name }} onClose={() => setReporting(null)} />}
    </AppShell>
  );
}
