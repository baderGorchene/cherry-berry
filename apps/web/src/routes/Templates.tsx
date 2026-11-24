import { ask } from "../Modal";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { STARTER_TEMPLATES, serializeCherry, type StarterTemplate } from "@cherry/doc";
import {
  ApiError, TEMPLATE_CATEGORIES, approveTemplate, deleteTemplate, errorMessage, importDesign, listDesigns, listTemplates, myWorkspaces,
  startFromTemplate, templateThumbUrl, type Design, type Template, type TemplateCategory, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import ReportDialog from "../library/ReportDialog";
import AppShell from "../AppShell";
import DocPreview from "../editor/DocPreview";
import { useInView } from "../home/useInView";

type Filter = "all" | "brand" | TemplateCategory;
const CHIPS: [Filter, string][] = [
  ["all", "All"], ...TEMPLATE_CATEGORIES.slice(0, 4), ["brand", "Brand templates"],
];
const PER_SECTION = 6;
const isAdmin = (w: Workspace) => w.role === "owner" || w.role === "admin";

type CardProps = { ws: Workspace; onUse(t: Template): void; onDone(): void; onReport(t: Template): void; onError(m: string): void };

function Card({ t, ws, onUse, onDone, onReport, onError }: { t: Template } & CardProps) {
  const viewer = ws.role === "viewer";
  const admin = isAdmin(ws) && t.workspaceId === ws.id; // roles only count in the template's own workspace
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
        <button type="button" className="tpl-use" aria-label={`Use ${t.name}`} disabled={viewer} onClick={() => onUse(t)}>{body}</button>
      )}
      {viewer && t.status !== "pending" && <span className="muted" style={{ fontSize: 13 }}>Viewers can't create designs</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {t.status === "pending" && admin && <button className="btn" onClick={() => void run(() => approveTemplate(t.id))}>Approve</button>}
        {(t.mine || admin) && (
          <button className="btn" onClick={async () => {
            if (await ask({ title: `Delete "${t.name}"?`, body: "This can't be undone.", ok: "Delete", danger: true })) void run(() => deleteTemplate(t.id));
          }}>Delete</button>
        )}
        {t.visibility === "public" && !t.mine && <button className="btn" onClick={() => onReport(t)}>Report</button>}
      </div>
    </li>
  );
}

/** A built-in starter: the preview renders only once the card is near the viewport. */
function StarterCard({ t, viewer, busy, onUse }: { t: StarterTemplate; viewer: boolean; busy: boolean; onUse(t: StarterTemplate): void }) {
  const [ref, near] = useInView<HTMLLIElement>();
  const page = t.doc.pages[0];
  const k = page ? Math.min(220 / page.width, 150 / page.height) : 0;
  return (
    <li ref={ref} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className="tpl-use" aria-label={`Use ${t.name}`} disabled={viewer || busy} onClick={() => onUse(t)}>
        <span className="tile tpl-starter" style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {near && page && <DocPreview doc={t.doc} pageId={page.id} width={page.width * k} height={page.height * k} />}
          <span className="badge badge-kind">Built-in</span>
        </span>
        <strong style={{ display: "block", fontSize: 14, marginTop: 8 }}>{t.name}</strong>
      </button>
      {viewer && <span className="muted" style={{ fontSize: 13 }}>Viewers can't create designs</span>}
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
  const [params, setParams] = useSearchParams();
  const filter: Filter = CHIPS.find(([v]) => v === params.get("category"))?.[0] ?? "all";
  const setFilter = (v: Filter) => setParams(v === "all" ? {} : { category: v });
  const [busy, setBusy] = useState(false);
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
  const starterSections = TEMPLATE_CATEGORIES.map(([c, label]) => ({
    c, label,
    items: filter === "all" || filter === c
      ? STARTER_TEMPLATES.filter((t) => t.category === c && (!needle || t.name.toLowerCase().includes(needle)))
      : [],
  })).filter((x) => x.items.length);
  const none = !pending.length && !own.length && !community.length && !starterSections.length;

  const use = async (t: Template) => {
    try { nav(`/d/${(await startFromTemplate(t.id, ws.id)).id}`); } catch (e) { setError(errorMessage(e)); }
  };
  const useStarter = async (t: StarterTemplate) => {
    setBusy(true);
    try { nav(`/d/${(await importDesign(ws.id, serializeCherry(t.doc))).id}`); } catch (e) { setError(errorMessage(e)); setBusy(false); }
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
          {starterSections.map(({ c, label, items }) => (
            <section key={c} className="sec" aria-label={label}>
              <div className="sec-head">
                <h2 className="sec-title">{label}</h2>
                {filter === "all" && <Link to={`/templates?category=${c}`} className="sec-link">See all</Link>}
              </div>
              <ul className="tiles">
                {(filter === "all" ? items.slice(0, PER_SECTION) : items).map((t) => (
                  <StarterCard key={t.id} t={t} viewer={ws.role === "viewer"} busy={busy} onUse={useStarter} />
                ))}
              </ul>
            </section>
          ))}
          {community.length > 0 && <Section title="Community" items={community} {...shared} />}
        </>
      )}
      {picking && <PickDesign workspaceId={ws.id} onClose={() => setPicking(false)} />}
      {reporting && <ReportDialog target={{ type: "template", id: reporting.id, title: reporting.name }} onClose={() => setReporting(null)} />}
    </AppShell>
  );
}
