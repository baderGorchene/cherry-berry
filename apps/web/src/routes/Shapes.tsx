import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import {
  ApiError, deleteShape, errorMessage, listShapes, myWorkspaces, saveShape, signOut,
  type Shape, type Visibility, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import { readSvg, ShapeThumb, TABS } from "../editor/ShapesPanel";
import { SHAPES } from "../editor/Toolbar";

const MAX_D = 100_000;
const grid = { listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 14 } as const;
const cell = { alignItems: "center", padding: 14, color: "var(--berry)" } as const;

export default function Shapes() {
  const { setUser } = useSession();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("basic");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<{ shapes: Shape[] } | { error: string } | null>(null);
  const [preview, setPreview] = useState<Shape | null>(null);
  const [fileError, setFileError] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null); else setList([]);
    });
  }, []);
  const ws = list && currentWorkspace.pick(list);

  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    if (tab === "basic" || !ws) return;
    let stale = false;
    setRes(null);
    listShapes(tab, { workspaceId: ws.id, q }).then((r) => !stale && setRes(r), (e) => !stale && setRes({ error: errorMessage(e) }));
    return () => { stale = true; };
  }, [tab, q, tries, ws?.id]);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!ws) return <Navigate to="/workspaces" replace />;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSaved(false); setFormError("");
    const r = await readSvg(file);
    if ("error" in r) { setPreview(null); return setFileError(r.error); }
    setFileError("");
    const filled = r.paths.find((p) => p.fill);
    // Dimensions are measured by the server on save; the preview only needs a padded box.
    setPreview({
      d: r.paths.map((p) => p.d).join(" "), fillRule: r.paths[0]!.fillRule, fill: filled?.fill ?? null,
      stroke: filled ? null : (r.paths.find((p) => p.stroke)?.stroke ?? null), width: 100, height: 100,
    } as Shape);
    setName((n) => n || file.name.replace(/\.svg$/i, ""));
  };

  const save = async () => {
    if (!preview) return;
    if (preview.d.length > MAX_D) return setFormError("That SVG is too detailed to save as one shape.");
    setBusy(true); setFormError("");
    try {
      await saveShape({
        name: name.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean), visibility,
        ...(visibility === "workspace" ? { workspaceId: ws.id } : {}),
        d: preview.d, fillRule: preview.fillRule,
        ...(preview.fill ? { fill: preview.fill } : {}), ...(preview.stroke ? { stroke: preview.stroke } : {}),
      });
      setSaved(true); setPreview(null); setName(""); setTags(""); setTab("mine"); setTries((n) => n + 1);
    } catch (e) {
      setFormError(errorMessage(e));
    }
    setBusy(false);
  };

  const remove = async (s: Shape) => {
    if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    try {
      await deleteShape(s.id);
      setTries((n) => n + 1);
    } catch (e) {
      setRes({ error: errorMessage(e) });
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap" }}>
      <nav aria-label="Main" style={{
        flex: "1 1 220px", maxWidth: 260, background: "#fff", borderRight: "1px solid var(--line)",
        padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        <p className="brand" style={{ margin: "0 0 4px 12px" }}>Cherry Berry</p>
        <Link to="/" style={{ padding: "6px 12px", fontWeight: 600 }}>Designs</Link>
        <Link to="/shapes" aria-current="page" style={{ padding: "6px 12px", fontWeight: 700, color: "var(--berry)" }}>Shapes</Link>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={async () => { await signOut().catch(() => {}); setUser(null); }}>Sign out</button>
      </nav>

      <main style={{ flex: "999 1 560px", minWidth: 0, padding: "28px clamp(16px, 4vw, 40px) 48px", display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
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
                <div><p role="alert" className="field-error">{res.error}</p><button className="btn" onClick={() => setTries(tries + 1)}>Retry</button></div>
              ) : !res.shapes.length ? <p className="muted">No shapes yet</p> : (
                <ul style={grid}>
                  {res.shapes.map((s) => (
                    <li key={s.id} className="card" style={cell}>
                      <ShapeThumb s={s} size={64} />
                      <span style={{ color: "var(--ink)", fontSize: 14 }}>{s.name}</span>
                      {s.mine && <button className="btn" onClick={() => void remove(s)}>Delete</button>}
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
              <label><b>Name</b><input className="inp" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label><b>Tags</b><input className="inp" value={tags} placeholder="comma, separated" onChange={(e) => setTags(e.target.value)} /></label>
              <label><b>Share with</b>
                <select className="inp" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                  <option value="private">Only me</option>
                  <option value="workspace" disabled={ws.role === "viewer"}>This workspace</option>
                  <option value="public">Everyone (public)</option>
                </select>
              </label>
              {formError && <p role="alert" className="field-error">{formError}</p>}
              <button type="submit" className="btn btn-p" disabled={busy || !name.trim()}>Save shape</button>
            </form>
          )}
          {saved && <p role="status" className="muted">Saved to your shapes</p>}
        </aside>
      </main>
    </div>
  );
}
