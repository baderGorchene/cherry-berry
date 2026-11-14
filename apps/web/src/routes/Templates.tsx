import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  ApiError, TEMPLATE_CATEGORIES, approveTemplate, deleteTemplate, errorMessage, listDesigns, listTemplates, myWorkspaces,
  startFromTemplate, templateThumbUrl, type Design, type Template, type TemplateCategory, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import ReportDialog from "../library/ReportDialog";
import AppShell from "../AppShell";

type Filter = "all" | "brand" | TemplateCategory;
const CHIPS: [Filter, string][] = [
  ["all", "All"], ...TEMPLATE_CATEGORIES.slice(0, 4), ["brand", "Brand templates"],
];
const isAdmin = (w: Workspace) => w.role === "owner" || w.role === "admin";

type CardProps = { ws: Workspace; onUse(t: Template): void; onDone(): void; onReport(t: Template): void; onError(m: string): void };

function Card({ t, ws, onUse, onDone, onReport, onError }: { t: Template } & CardProps) {
  const viewer = ws.role === "viewer";
  const admin = isAdmin(ws);
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); onDone(); } catch (e) { onError(errorMessage(e)); }
  };
  const who = t.kitName ?? (t.visibility === "public" ? `by ${t.authorName} · ${t.license === "cc-by" ? "CC-BY" : "CC0"}` : "");
  const meta = [`${t.width} × ${t.height} ${t.unit}`, who].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="tile" style={{ height: 160 }}>
        <img src={templateThumbUrl(t.id)} alt="" />
        {t.kitId && <span className="badge badge-kind">LOCKED LAYOUT</span>}
      </span>
      <strong style={{ display: "block", fontSize: 14, marginTop: 8 }}>{t.name}</strong>
      <span className="muted" style={{ fontSize: 13 }}>{meta}</span>
    </>
  );
  return (
    <li className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {t.status === "pending" ? <div>{body}</div> : (
        <button type="button" aria-label={`Use ${t.name}`} disabled={viewer} onClick={() => onUse(t)}
          style={{ all: "unset", cursor: viewer ? "default" : "pointer", display: "block", opacity: viewer ? 0.7 : 1 }}>{body}</button>
      )}
      {viewer && t.status !== "pending" && <span className="muted" style={{ fontSize: 13 }}>Viewers can't create designs</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {t.status === "pending" && admin && <button className="btn" onClick={() => void run(() => approveTemplate(t.id))}>Approve</button>}
        {(t.mine || admin) && (
          <button className="btn" onClick={() => {
            if (confirm(`Delete "${t.name}"? This can't be undone.`)) void run(() => deleteTemplate(t.id));
          }}>Delete</button>
        )}
        {t.visibility === "public" && !t.mine && <button className="btn" onClick={() => onReport(t)}>Report</button>}
      </div>
    </li>
  );
}

function Section({ title, items, ...rest }: { title: string; items: Template[] } & CardProps) {
  return (
    <section className="sec" aria-label={title}>
      <h2 className="sec-title">{title}</h2>
      <ul className="tiles">{items.map((t) => <Card key={t.id} t={t} {...rest} />)}</ul>
    </section>
  );
}

function PickDesign({ workspaceId, onClose }: { workspaceId: string; onClose(): void }) {
  const nav = useNavigate();
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    listDesigns(workspaceId).then((r) => setDesigns(r.designs), (e) => setError(errorMessage(e)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [workspaceId, onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(34,20,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pick-h" className="card" style={{ width: "min(420px, 100%)", maxHeight: "100%", overflow: "auto" }}>
        <h2 id="pick-h" style={{ fontSize: 18 }}>Choose a design to publish</h2>
        {error ? <p role="alert" className="field-error">{error}</p> : !designs ? <p className="muted">Loading…</p> : !designs.length ? (
          <p className="muted">This workspace has no designs yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {designs.map((d) => <li key={d.id}><button className="btn" style={{ width: "100%" }} onClick={() => nav(`/d/${d.id}?publish=1`)}>{d.title}</button></li>)}
          </ul>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

export default function Templates() {
  const { setUser } = useSession();
  const nav = useNavigate();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [, setCurrentId] = useState<string | null>(null); // re-render when the sidebar switches workspace
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [mine, setMine] = useState<Template[] | null>(null);
  const [pub, setPub] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [reporting, setReporting] = useState<Template | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null); else setList([]);
    });
  }, []);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const ws = list && currentWorkspace.pick(list);
  const wsId = ws?.id;
  useEffect(() => {
    if (!wsId) return;
    let stale = false;
    Promise.all([listTemplates("workspace", { workspaceId: wsId }), listTemplates("public", { q })]).then(
      ([a, b]) => { if (!stale) { setError(""); setMine(a); setPub(b); } },
      (e) => { if (!stale) { setError(errorMessage(e)); setMine([]); setPub([]); } },
    );
    return () => { stale = true; };
  }, [wsId, q, tries]);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!ws) return <Navigate to="/workspaces" replace />;

  const needle = q.toLowerCase();
  const show = (t: Template) =>
    (filter === "all" || (filter === "brand" ? t.kitId !== null : t.category === filter)) && (!needle || t.name.toLowerCase().includes(needle));
  const pending = (mine ?? []).filter((t) => t.status === "pending" && show(t));
  const own = (mine ?? []).filter((t) => t.status === "published" && show(t));
  const community = (pub ?? []).filter((t) => t.workspaceId !== ws.id && show(t));
  const none = !pending.length && !own.length && !community.length;

  const use = async (t: Template) => {
    try { nav(`/d/${(await startFromTemplate(t.id, ws.id)).id}`); } catch (e) { setError(errorMessage(e)); }
  };
  const shared: CardProps = { ws, onUse: use, onDone: () => setTries((n) => n + 1), onReport: setReporting, onError: setError };

  return (
    <AppShell active="templates" onSwitch={setCurrentId}>
      <header className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 className="page-title">Templates</h1>
          <p className="page-sub">Made and shared by the community and your workspace.</p>
        </div>
        <span style={{ flex: 1 }} />
        {ws.role !== "viewer" && <button className="btn btn-p" onClick={() => setPicking(true)}>Publish a template</button>}
      </header>
      <input className="inp" type="search" aria-label="Search templates" placeholder="Search templates" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="chips" role="group" aria-label="Category">
        {CHIPS.map(([v, l]) => <button key={v} className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      {mine === null || pub === null ? <p className="muted">Loading…</p> : none ? (
        <p className="muted">{q || filter !== "all" ? "No templates match your search." : "No templates here yet."}</p>
      ) : (
        <>
          {pending.length > 0 && <Section title="Waiting for approval" items={pending} {...shared} />}
          {own.length > 0 && <Section title={ws.name} items={own} {...shared} />}
          {community.length > 0 && <Section title="Community" items={community} {...shared} />}
        </>
      )}
      {picking && <PickDesign workspaceId={ws.id} onClose={() => setPicking(false)} />}
      {reporting && <ReportDialog target={{ type: "template", id: reporting.id, title: reporting.name }} onClose={() => setReporting(null)} />}
    </AppShell>
  );
}
