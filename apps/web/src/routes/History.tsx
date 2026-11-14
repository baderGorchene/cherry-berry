import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import * as Y from "yjs";
import { diffDocs, yToDoc, type CherryDocument, type CherryNode } from "@cherry/doc";
import {
  branchVersion, errorMessage, fromBase64, listVersions, nameVersion, restoreVersion, versionState, type VersionSummary,
} from "../api";
import "../editor/editor.css";
import DocPreview from "../editor/DocPreview";
import { allIds } from "../editor/geometry";
import { Avatars } from "../editor/PresenceBar";
import { colorFor, initials, usePeers } from "../editor/presence";
import { useDesign, type DesignState } from "../editor/useDesign";
import { useYValue } from "../editor/useYValue";
import { IconBack } from "../icons";

type Ready = Extract<DesignState, { state: "ready" }>;
type Mode = "single" | "side" | "overlay";
const MODES: [Mode, string][] = [["single", "Single"], ["side", "Side by side"], ["overlay", "Overlay diff"]];
const MODE_KEY = "cherry.historyMode";
const DAY = 24 * 3600 * 1000;

const loadMode = (): Mode => {
  try { const m = localStorage.getItem(MODE_KEY); if (MODES.some(([v]) => v === m)) return m as Mode; } catch { /* storage unavailable */ }
  return "side";
};

/** `ddd HH:mm` within the past 7 days, otherwise a short date. */
function when(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (now - d.getTime() < 7 * DAY) {
    return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
}

const plural = (n: number) => `${n} ${n === 1 ? "change" : "changes"} outlined`;

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement); // read during the first render, before any autofocus
  const focusables = () => [...box.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, a[href]")];
  useEffect(() => {
    const el = opener.current;
    if (!box.current!.contains(document.activeElement)) (box.current!.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
    return () => { if (el instanceof HTMLElement && el.isConnected) el.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const f = focusables(), first = f[0], end = f[f.length - 1];
    if (!first || !end) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="hist-scrim">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="hist-dlg" className="card hist-dlg" onKeyDown={trap}>
        <h2 id="hist-dlg" style={{ fontSize: 18 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function NameDialog({ title, action, initial, onSubmit, onClose }: {
  title: string; action: string; initial: string; onSubmit(name: string): Promise<void>; onClose(): void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }}
        onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSubmit(name.trim()); }}>
        <label><span className="lbl">Name</span>
          <input className="inp" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="hist-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" disabled={busy || !name.trim()}>{action}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function History() {
  const { id = "" } = useParams();
  const d = useDesign(id);
  if (d.state === "loading") return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (d.state === "failed") return (
    <div className="card" style={{ maxWidth: 460, margin: "48px auto" }}>
      <p role="alert">{d.message}</p>
      <Link to="/">Back to home</Link>
    </div>
  );
  return <Page d={d} key={d.ydoc.guid} />;
}

function Page({ d }: { d: Ready }) {
  const { ydoc, readOnly } = d;
  const navigate = useNavigate();
  const last = useRef<CherryDocument | null>(null);
  // "Current" is the live document; this page only reads it and never writes.
  const doc = useYValue(ydoc, () => {
    const r = yToDoc(ydoc);
    if (r.ok) last.current = r.doc;
    return last.current!;
  });
  const peers = usePeers(d.provider.awareness!);
  const people = peers.map((p) => p.user).filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i);

  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ } };
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"name" | "restore" | "branch" | null>(null);
  const [vdoc, setVdoc] = useState<{ id: string; doc: CherryDocument } | null>(null);

  const refresh = () => listVersions(d.design.id).then(setVersions, (e) => setError(errorMessage(e)));
  useEffect(() => { void refresh(); }, [d.design.id]);

  const selected = versions?.find((v) => v.id === selId) ?? versions?.[0];
  useEffect(() => {
    if (!selected) return;
    let stale = false;
    versionState(selected.id).then((s) => {
      if (stale) return;
      try {
        const y = new Y.Doc();
        Y.applyUpdate(y, fromBase64(s));
        const r = yToDoc(y);
        if (!r.ok) throw new Error("invalid");
        setVdoc({ id: selected.id, doc: r.doc });
      } catch { setError("This version couldn't be opened."); }
    }, (e) => !stale && setError(errorMessage(e)));
    return () => { stale = true; };
  }, [selected?.id]);
  const before = vdoc && vdoc.id === selected?.id ? vdoc.doc : null;

  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const diff = useMemo(() => (before ? diffDocs(before, doc) : null), [before, doc]);
  // Outline whole top-level layers; page ids and layers on other pages don't match a node here and are skipped.
  const outlined = useMemo(() => {
    const ids = new Set([...(diff?.added ?? []), ...(diff?.changed ?? [])]);
    return page.nodes.filter((n: CherryNode) => allIds([n]).some((i) => ids.has(i))).map((n) => n.id);
  }, [diff, page]);

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try { await fn(); } catch (e) { setError(errorMessage(e)); }
    setDialog(null);
  };
  const label = selected ? `${when(selected.createdAt)}${selected.name ? ` · “${selected.name}”` : ""}` : "";
  const single = mode === "single";

  return (
    <div className="ed hist">
      <header className="ed-head">
        <Link className="ed-ib" to={`/d/${d.design.id}`} aria-label="Back to editor"><IconBack /></Link>
        <h1 className="hist-h">{doc.title} · Version history</h1>
        <span style={{ flex: 1 }} />
        <div className="hist-seg" role="group" aria-label="View mode">
          {MODES.map(([m, l]) => <button key={m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}
        </div>
      </header>
      <div className="hist-body">
        <aside aria-label="Versions" className="hist-list">
          {!readOnly && <button className="btn" onClick={() => setDialog("name")}>Name this version</button>}
          <ul>
            <li className="hist-item">
              <div className="hist-cur"><strong>Current</strong>{people.length > 0 && <Avatars people={people} />}</div>
            </li>
            {versions?.map((v) => {
              const on = v.id === selected?.id;
              return (
                <li key={v.id} className={`hist-item${on ? " hist-on" : ""}`}>
                  <button className="hist-pick" aria-pressed={on} onClick={() => { setSelId(v.id); setError(""); }}>
                    <span className="hist-time">{when(v.createdAt)}</span>
                    {v.kind === "branch"
                      ? <span className="hist-tag hist-branch">Branch: {v.name}</span>
                      : v.name && <span className="hist-tag">{v.name}</span>}
                    <span className="hist-who">
                      {v.createdBy && <span className="ed-avatar hist-av" style={{ background: colorFor(v.createdBy.id) }}>{initials(v.createdBy.name)}</span>}
                      {v.createdBy?.name ?? "Auto-saved"}
                    </span>
                    <span className="muted">{v.summary}</span>
                  </button>
                  {v.branchDesignId && <Link to={`/d/${v.branchDesignId}`}>Open branch</Link>}
                  {on && !readOnly && (
                    <div className="hist-actions">
                      <button className="btn btn-p" onClick={() => setDialog("restore")}>Restore</button>
                      <button className="btn" onClick={() => setDialog("branch")}>Branch from here</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
        <main className="hist-main">
          {error && <p role="alert" className="field-error">{error}</p>}
          {doc.pages.length > 1 && (
            <select className="inp hist-page" aria-label="Page" value={page.id} onChange={(e) => setPageId(e.target.value)}>
              {doc.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {versions && !versions.length && <p className="muted">No versions yet. Name one, or keep editing — versions are saved every 10 minutes.</p>}
          {selected && before && (
            <div className="hist-pair">
              {mode !== "overlay" && (
                <figure>
                  <div className="hist-canvas"><DocPreview doc={before} pageId={page.id} width={single ? 720 : 420} height={single ? 520 : 420} /></div>
                  <figcaption>{label}</figcaption>
                </figure>
              )}
              {!single && (
                <figure>
                  <div className="hist-canvas">
                    <DocPreview doc={doc} pageId={page.id} width={mode === "side" ? 420 : 720} height={mode === "side" ? 420 : 520}
                      highlight={outlined} ghost={mode === "overlay" ? before : undefined} />
                  </div>
                  <figcaption>Current · {plural(outlined.length)}{mode === "overlay" && ` · ${label} at 40%`}</figcaption>
                </figure>
              )}
            </div>
          )}
        </main>
      </div>
      {dialog === "name" && (
        <NameDialog title="Name this version" action="Save name" initial="" onClose={() => setDialog(null)}
          onSubmit={(name) => run(async () => { const v = await nameVersion(d.design.id, name); await refresh(); setSelId(v.id); })} />
      )}
      {dialog === "branch" && selected && (
        <NameDialog title="Branch from here" action="Create branch" initial={(selected.name ?? "Branch").slice(0, 60)} onClose={() => setDialog(null)}
          onSubmit={(name) => run(async () => { const nd = await branchVersion(selected.id, name); navigate(`/d/${nd.id}`); })} />
      )}
      {dialog === "restore" && selected && (
        <Modal title="Restore this version?" onClose={() => setDialog(null)}>
          <p>Restore this version? Everyone editing will see it. The current design is kept as “Before restore”.</p>
          <div className="hist-actions">
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-p" data-autofocus onClick={() => void run(async () => { await restoreVersion(selected.id); await refresh(); setSelId(null); })}>Restore</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
