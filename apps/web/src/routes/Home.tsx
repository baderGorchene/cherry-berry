import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  ApiError, createDesign, errorMessage, listDesigns, myWorkspaces,
  type Design, type NewDesign, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import AppShell from "../AppShell";
import { IconPlus, IconSearch } from "../icons";
import { initials } from "./Workspaces";

export const PRESETS: { name: string; size: string; w: number; h: number; bg: string; body: NewDesign }[] = [
  { name: "Social post", size: "1080 × 1080 px", w: 60, h: 60, bg: "var(--blush)",
    body: { title: "Untitled design", width: 1080, height: 1080, unit: "px", colorMode: "rgb" } },
  { name: "A4 print", size: "210 × 297 mm · CMYK", w: 44, h: 64, bg: "var(--orchid)",
    body: { title: "Untitled design", width: 210, height: 297, unit: "mm", colorMode: "cmyk", bleed: 3 } },
  { name: "Presentation", size: "1920 × 1080 px", w: 96, h: 54, bg: "var(--berry)",
    body: { title: "Untitled design", width: 1920, height: 1080, unit: "px", colorMode: "rgb" } },
  { name: "Story", size: "1080 × 1920 px", w: 40, h: 70, bg: "var(--petal)",
    body: { title: "Untitled design", width: 1080, height: 1920, unit: "px", colorMode: "rgb" } },
  { name: "Business card", size: "85 × 55 mm · CMYK", w: 84, h: 48, bg: "#fff",
    body: { title: "Untitled design", width: 85, height: 55, unit: "mm", colorMode: "cmyk", bleed: 3 } },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function edited(iso: string, now = Date.now()): string {
  const s = (new Date(iso).getTime() - now) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12]];
  let v = s;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return `Edited ${unit === "second" ? "just now" : rtf.format(Math.round(v), unit)}`;
    v /= size;
  }
  return `Edited ${rtf.format(Math.round(v), "year")}`;
}

const tile = { padding: 14, gap: 10, textAlign: "left", font: "inherit", color: "inherit", textDecoration: "none" } as const;
const thumbBox = { height: 84, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tint)", borderRadius: 10 } as const;

export default function Home() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState(currentWorkspace.get());
  const [designs, setDesigns] = useState<Design[] | "error" | null>(null);
  const [designsTry, setDesignsTry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [q, setQ] = useState("");

  const load = () => {
    setLoadError(false);
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setLoadError(true);
    });
  };
  useEffect(load, []);

  const current = list && (list.find((w) => w.id === currentId) ?? list[0]);
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setDesigns(null);
    listDesigns(current.id).then((r) => !cancelled && setDesigns(r.designs), (e) => {
      if (cancelled) return;
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setDesigns("error");
    });
    return () => { cancelled = true; };
  }, [current?.id, designsTry]);

  if (loadError) return (
    <div className="card" style={{ maxWidth: 420, margin: "48px auto" }}>
      <p role="alert">Couldn't load your workspaces.</p>
      <button className="btn btn-p" onClick={load}>Retry</button>
    </div>
  );
  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!current) return <Navigate to="/workspaces" replace />;
  const viewOnly = current.role === "viewer";
  const shown = Array.isArray(designs) ? designs.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase())) : [];

  const create = async (body: NewDesign) => {
    setBusy(true); setCreateError("");
    try {
      const { design } = await createDesign(current.id, body);
      navigate(`/d/${design.id}`);
    } catch (e) {
      setCreateError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <AppShell active="home" onSwitch={setCurrentId}>
        <header className="page-head">
          <label className="search">
            <IconSearch />
            <input type="search" className="inp" aria-label="Search designs" placeholder="Search designs"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <span style={{ flex: 1 }} />
          {viewOnly ? null : <Link to="/new" className="btn btn-p"><IconPlus /> New design</Link>}
          <span aria-label={`Signed in as ${user?.name}`} title={user?.email} style={{
            width: 40, height: 40, borderRadius: "50%", background: "var(--berry)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>{initials(user?.name ?? "")}</span>
        </header>

        <section className="sec">
          <h1 className="page-title">Start something</h1>
          {createError && <p role="alert" className="field-error">{createError}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="card" disabled={viewOnly || busy}
                title={viewOnly ? "View-only access" : undefined} onClick={() => create(p.body)}
                style={{ ...tile, cursor: viewOnly ? "default" : "pointer", opacity: viewOnly ? 0.6 : 1 }}>
                <span style={thumbBox}>
                  <span style={{ width: p.w, height: p.h, background: p.bg, borderRadius: 5, border: p.bg === "#fff" ? "2px solid var(--berry)" : 0 }} />
                </span>
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{p.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{p.size}</span>
                </span>
              </button>
            ))}
            {viewOnly ? null : (
              <Link to="/new" className="card" style={{ ...tile, borderStyle: "dashed" }}>
                <span style={{ ...thumbBox, background: "none", color: "var(--berry)", fontSize: 32 }} aria-hidden="true">+</span>
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>Custom size</strong>
                  <span className="muted" style={{ fontSize: 13 }}>px, mm, in</span>
                </span>
              </Link>
            )}
          </div>
        </section>

        <section className="sec">
          <h2 className="sec-title">Recent designs</h2>
          {designs === null ? <p className="muted">Loading…</p> : designs === "error" ? (
            <div className="card" style={{ alignItems: "flex-start" }}>
              <p role="alert">Couldn't load your designs.</p>
              <button className="btn" onClick={() => setDesignsTry((n) => n + 1)}>Retry</button>
            </div>
          ) : designs.length === 0 ? (
            <div className="card" style={{ alignItems: "flex-start" }}>
              <p className="muted">No designs yet. Pick a size above to start your first one.</p>
              <Link to="/workspaces" style={{ fontSize: 14 }}>Join or create another workspace</Link>
            </div>
          ) : shown.length === 0 ? (
            <p className="muted">No designs match “{q.trim()}”.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
              {shown.map((d) => (
                <li key={d.id}>
                  <Link to={`/d/${d.id}`} className="card" style={{ ...tile, height: "100%" }}>
                    <span style={{ ...thumbBox, height: 160, overflow: "hidden" }}>
                      <span data-testid="design-preview" style={{
                        background: "#fff", border: "1px solid var(--line)", borderRadius: 4, boxSizing: "border-box",
                        aspectRatio: `${d.width} / ${d.height}`,
                        // height never exceeds 80% of the 160px box (128px); width follows from the ratio
                        width: `min(80%, ${(128 * d.width) / d.height}px)`,
                      }} />
                    </span>
                    <span>
                      <strong className="ell" style={{ display: "block", fontSize: 14 }}>{d.title}</strong>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {d.width} × {d.height} {d.unit} · {edited(d.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
    </AppShell>
  );
}
