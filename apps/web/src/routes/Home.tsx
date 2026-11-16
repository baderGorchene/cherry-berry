import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  ApiError, createDesign, errorMessage, listDesigns, myWorkspaces,
  type Design, type NewDesign, type Workspace,
} from "../api";
import { PRESETS } from "../create/sizes";
import { useCreateDialog } from "../create/CreateDialog";
import { currentWorkspace, useSession } from "../App";
import AppShell from "../AppShell";
import { IconPlus, IconSearch, IconTemplate, IconUpload } from "../icons";
import { initials } from "./Workspaces";

function PresetArt({ name }: { name: string }) {
  switch (name) {
    case "Social post":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#FFE0EF" stroke="#C654C3" strokeWidth="1.6" />
          <path d="M14 19.5s-5-3.2-5-6.6a2.9 2.9 0 0 1 5-2 2.9 2.9 0 0 1 5 2c0 3.4-5 6.6-5 6.6Z" fill="#8E1EA2" />
        </svg>
      );
    case "A4 print":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="6" y="3" width="16" height="22" rx="3" fill="#fff" stroke="#8E1EA2" strokeWidth="1.6" />
          <path d="M9.5 9h9M9.5 13h9M9.5 17h6" stroke="#C654C3" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "Presentation":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="2.5" y="5.5" width="23" height="16" rx="4" fill="#8E1EA2" />
          <rect x="6.5" y="13.5" width="3.5" height="5" rx="1" fill="#FFC0DE" />
          <rect x="12" y="10.5" width="3.5" height="8" rx="1" fill="#fff" />
          <rect x="17.5" y="12" width="3.5" height="6.5" rx="1" fill="#ED96D7" />
        </svg>
      );
    case "Story":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="7.5" y="2.5" width="13" height="23" rx="4" fill="#F8E2FB" stroke="#8E1EA2" strokeWidth="1.6" />
          <circle cx="14" cy="11.5" r="3" fill="#C654C3" />
          <path d="M10.5 18.5h7" stroke="#8E1EA2" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="6.5" width="22" height="15" rx="3.5" fill="#fff" stroke="#8E1EA2" strokeWidth="1.6" />
          <circle cx="9" cy="14" r="2.5" fill="#C654C3" />
          <path d="M14 12.5h7M14 16h5" stroke="#5D4E66" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Phone size row: label → preset name (null: custom size). */
const SIZES: [string, string][] = [["Post", "social"], ["Story", "social"], ["A4 print", "print"], ["Custom", "custom"]];

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
  const create_ = useCreateDialog();

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
        <section className="home-hero">
          <div className="home-hero-top only-d">
            <span className="home-ws-pill">{current.name} · {current.role ?? "viewer"}</span>
            <span style={{ flex: 1 }} />
            {viewOnly ? null : <button type="button" className="btn btn-p" onClick={() => create_.open()}><IconPlus /> New design</button>}
            <span className="me" role="img" aria-label={`Signed in as ${user?.name}`} title={user?.email}>{initials(user?.name ?? "")}</span>
          </div>

          <div className="home-hero-center">
            <h1 className="page-title home-title">Start something</h1>
            <p className="muted home-sub only-d">Create print-ready layouts, vector graphics, and brand-consistent designs.</p>
            <div className="home-pills only-d">
              <span className="home-pill home-pill-on">Your designs</span>
              <Link to="/templates" className="home-pill">Templates</Link>
            </div>
            <label className="search home-search">
              <IconSearch />
              <input type="search" className="inp" aria-label="Search designs" placeholder="Search your designs…"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          {createError && <p role="alert" className="field-error" style={{ textAlign: "center" }}>{createError}</p>}

          {viewOnly ? null : (
            <>
              <ul className="sizes" aria-label="Sizes">
                {SIZES.map(([label, category]) => {
                  const p = PRESETS.find((x) => x.name === (label === "Post" ? "Social post" : label));
                  return (
                    <li key={label}>
                      <Link to={`/new?category=${category}`} className="size">
                        <span className="size-box" aria-hidden="true">
                          {p ? <span style={{ width: p.w * 0.66, height: p.h * 0.66, background: p.bg, borderRadius: 4 }} /> : <IconPlus />}
                        </span>
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="quick-strip only-d" aria-label="Quick create">
                <Link to="/templates" className="quick-tile">
                  <span className="quick-icon quick-icon-tpl" aria-hidden="true"><IconTemplate /></span>
                  <span className="quick-lbl">Templates</span>
                </Link>
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" className="quick-tile" disabled={busy}
                    title={`${p.name} · ${p.size}`} onClick={() => create(p.body)}>
                    <span className="quick-icon" aria-hidden="true">
                      <PresetArt name={p.name} />
                    </span>
                    <span className="quick-lbl">{p.name}</span>
                  </button>
                ))}
                <button type="button" className="quick-tile" title="Custom dimensions in px, mm, or in" onClick={() => create_.open("custom")}>
                  <span className="quick-icon quick-icon-new" aria-hidden="true"><IconPlus /></span>
                  <span className="quick-lbl">Custom size</span>
                </button>
                <Link to="/library" className="quick-tile" title="Upload images, SVGs, or GIFs">
                  <span className="quick-icon quick-icon-up" aria-hidden="true"><IconUpload /></span>
                  <span className="quick-lbl">Upload</span>
                </Link>
              </div>
            </>
          )}
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="sec-title">Recent<span className="only-d"> designs</span></h2>
            <Link to="/templates" className="sec-link only-d">Browse templates →</Link>
          </div>
          {designs === null ? <p className="muted">Loading…</p> : designs === "error" ? (
            <div className="card" style={{ alignItems: "flex-start" }}>
              <p role="alert">Couldn't load your designs.</p>
              <button className="btn" onClick={() => setDesignsTry((n) => n + 1)}>Retry</button>
            </div>
          ) : designs.length === 0 ? (
            <div className="card" style={{ alignItems: "flex-start" }}>
              <p className="muted">No designs yet. Pick a format above to start your first one.</p>
              <Link to="/workspaces" style={{ fontSize: 14 }}>Join or create another workspace</Link>
            </div>
          ) : shown.length === 0 ? (
            <p className="muted">No designs match “{q.trim()}”.</p>
          ) : (
            <ul className="recent">
              {shown.map((d) => (
                <li key={d.id}>
                  <Link to={`/d/${d.id}`} className="card recent-card" style={{ ...tile, height: "100%" }}>
                    <span className="recent-thumb" style={{ ...thumbBox, height: 160, overflow: "hidden", position: "relative" }}>
                      <span className="recent-badge">{d.colorMode.toUpperCase()}</span>
                      <span data-testid="design-preview" className="recent-sheet" style={{
                        background: "#fff", border: "1px solid var(--line)", borderRadius: 6, boxSizing: "border-box",
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
        {viewOnly ? null : <button type="button" className="fab" aria-label="New design" onClick={() => create_.open()}><IconPlus /></button>}
    </AppShell>
  );
}
