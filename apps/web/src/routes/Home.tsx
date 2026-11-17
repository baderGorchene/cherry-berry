import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { STARTER_TEMPLATES, serializeCherry } from "@cherry/doc";
import {
  ApiError, errorMessage, importDesign, listDesigns, listTemplates, myWorkspaces, startFromTemplate,
  type Design, type Workspace,
} from "../api";
import { type CreatePane } from "../create/sizes";
import { useCreateDialog } from "../create/CreateDialog";
import { currentWorkspace, useSession } from "../App";
import AppShell from "../AppShell";
import HScroll from "../HScroll";
import RecentCard from "../home/RecentCard";
import { TemplateTile, type Pick } from "../home/TemplateRow";
import { IconPlus, IconSearch, IconUpload } from "../icons";

/** Case-insensitive substring search over designs and templates; an empty query finds nothing. */
export function searchHome(q: string, designs: Design[], templates: { id: string; name: string }[]): { designs: Design[]; templates: { id: string; name: string }[] } {
  const n = q.trim().toLowerCase();
  if (!n) return { designs: [], templates: [] };
  const has = (s: string) => s.toLowerCase().includes(n);
  return { designs: designs.filter((d) => has(d.title)), templates: templates.filter((t) => has(t.name)) };
}

// [label, dialog pane, colour, page shape (or a plain icon)]
const SHORTCUTS: [string, CreatePane, string, [number, number] | "plus" | "open"][] = [
  ["Social post", "social", "#FFC0DE", [1, 1]],
  ["Story", "social", "#F4D4F5", [9, 16]],
  ["Presentation", "presentation", "#ED96D7", [16, 9]],
  ["Flyer", "print", "#FFFFFF", [210, 297]],
  ["Poster", "print", "#FFC0DE", [2, 3]],
  ["Business card", "cards", "#F4D4F5", [7, 4]],
  ["Invitation", "cards", "#ED96D7", [5, 7]],
  ["Custom size", "custom", "#FFFFFF", "plus"],
  ["Open file", "open", "#FFC0DE", "open"],
];

const CATEGORIES = [["Social", "social", "#FFC0DE"], ["Presentations", "presentation", "#F4D4F5"], ["Print", "print", "#ED96D7"], ["Cards & invites", "cards", "#E8C8F2"]] as const;

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

const STARTERS: Pick[] = STARTER_TEMPLATES.map((s) => ({ id: s.id, name: s.name, starter: s }));
const SHOWN = 8;

export default function Home() {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState(currentWorkspace.get());
  const [designs, setDesigns] = useState<Design[] | "error" | null>(null);
  const [designsTry, setDesignsTry] = useState(0);
  const [templates, setTemplates] = useState<Pick[]>(STARTERS);
  const [busy, setBusy] = useState(false);
  const [useError, setUseError] = useState("");
  const [all, setAll] = useState(false);
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
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    Promise.allSettled([listTemplates("workspace", { workspaceId: current.id }), listTemplates("public")]).then((rs) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const more = rs.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .filter((t) => t.status === "published" && !seen.has(t.id) && !!seen.add(t.id))
        .map((t): Pick => ({ id: t.id, name: t.name, template: t }));
      setTemplates([...STARTERS, ...more]);
    });
    return () => { cancelled = true; };
  }, [current?.id]);

  const found = useMemo(
    () => searchHome(q, Array.isArray(designs) ? designs : [], templates),
    [q, designs, templates],
  );

  if (loadError) return (
    <div className="card" style={{ maxWidth: 420, margin: "48px auto" }}>
      <p role="alert">Couldn't load your workspaces.</p>
      <button className="btn btn-p" onClick={load}>Retry</button>
    </div>
  );
  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!current) return <Navigate to="/workspaces" replace />;
  const viewOnly = current.role === "viewer";

  const use = async (t: Pick) => {
    setBusy(true); setUseError("");
    try {
      const d = t.starter ? await importDesign(current.id, serializeCherry(t.starter.doc)) : await startFromTemplate(t.id, current.id);
      navigate(`/d/${d.id}`);
    } catch (e) {
      setUseError(errorMessage(e));
      setBusy(false);
    }
  };
  const tiles = (items: Pick[]) => items.map((t) => <TemplateTile key={t.id} t={t} disabled={busy || viewOnly} onUse={use} />);
  const searching = q.trim() !== "";
  const mine = Array.isArray(designs) ? [...designs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  const firstRun = Array.isArray(designs) && designs.length === 0;
  const card = (d: Design) => <li key={d.id}><RecentCard d={d} when={edited(d.updatedAt)} /></li>;

  const templateRow = (
    <section className="sec" aria-labelledby="h-tpl">
      <div className="sec-head">
        <h2 className="sec-title" id="h-tpl">Start from a template</h2>
        <Link to="/templates" className="sec-link">See all</Link>
      </div>
      {viewOnly && <p className="muted">Viewers can't create designs.</p>}
      <HScroll as="ul" className="tpl-row">{tiles(templates)}</HScroll>
    </section>
  );

  const continueDesigning = (
    <section className="sec" aria-labelledby="h-cont">
      <div className="sec-head">
        <h2 className="sec-title" id="h-cont">Continue designing</h2>
        {mine.length > SHOWN && <button type="button" className="btn-link" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `See all (${mine.length})`}</button>}
      </div>
      {designs === null ? <p className="muted">Loading…</p> : designs === "error" ? (
        <div className="card" style={{ alignItems: "flex-start" }}>
          <p role="alert">Couldn't load your designs.</p>
          <button className="btn" onClick={() => setDesignsTry((n) => n + 1)}>Retry</button>
        </div>
      ) : <ul className="recent">{(all ? mine : mine.slice(0, SHOWN)).map(card)}</ul>}
    </section>
  );

  return (
    <AppShell active="home" onSwitch={setCurrentId}>
      <section className="home-hero" aria-label="Start">
        <h1 className="home-title">What are you making today?</h1>
        <label className="search home-search">
          <IconSearch />
          <input type="search" className="inp" aria-label="Search designs and templates" placeholder="Search designs and templates"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {viewOnly ? null : (
          <ul className="shortcuts" aria-label="Create">
            {SHORTCUTS.map(([label, pane, color, shape]) => (
              <li key={label}>
                <button type="button" className="sc" onClick={() => create_.open(pane)}>
                  <span className="sc-dot" style={{ "--c": color } as CSSProperties} aria-hidden="true">
                    {shape === "plus" ? <IconPlus /> : shape === "open" ? <IconUpload /> : (
                      <span className="sc-page" style={{ width: 26 * Math.min(1, shape[0] / shape[1]), height: 26 * Math.min(1, shape[1] / shape[0]) }} />
                    )}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {useError && <p role="alert" className="field-error">{useError}</p>}

      {searching ? (
        <section className="sec" aria-label="Search results">
          {!found.designs.length && !found.templates.length && <p className="muted">Nothing matches “{q.trim()}”.</p>}
          {found.designs.length > 0 && (
            <>
              <h2 className="sec-title">Designs</h2>
              <ul className="recent">{found.designs.map(card)}</ul>
            </>
          )}
          {found.templates.length > 0 && (
            <>
              <h2 className="sec-title">Templates</h2>
              <HScroll as="ul" className="tpl-row">{tiles(templates.filter((t) => found.templates.some((f) => f.id === t.id)))}</HScroll>
            </>
          )}
        </section>
      ) : (
        <>
          {firstRun && (
            <p className="home-welcome">No designs yet. Start from a template below, or pick a format above.
              {" "}<Link to="/workspaces">Join or create another workspace</Link></p>
          )}
          {firstRun ? templateRow : <>{continueDesigning}{templateRow}</>}
          <section className="sec" aria-labelledby="h-cat">
            <h2 className="sec-title" id="h-cat">Browse by category</h2>
            <ul className="cats">
              {CATEGORIES.map(([label, cat, color]) => (
                <li key={cat}><Link to={`/templates?category=${cat}`} className="cat" style={{ "--c": color } as CSSProperties}>{label}</Link></li>
              ))}
            </ul>
          </section>
        </>
      )}
      {viewOnly ? null : <button type="button" className="fab" aria-label="New design" onClick={() => create_.open()}><IconPlus /></button>}
    </AppShell>
  );
}
