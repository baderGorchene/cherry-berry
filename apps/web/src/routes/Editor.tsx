import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import * as Y from "yjs";
import { removeNodes, setTitle, yToDoc, type CherryDocument, type CherryNode } from "@cherry/doc";
import "../editor/editor.css";
import Layers from "../editor/Layers";
import Pages from "../editor/Pages";
import Properties from "../editor/Properties";
import Toolbar from "../editor/Toolbar";
import { useDesign, type DesignState } from "../editor/useDesign";
import { useYValue } from "../editor/useYValue";

type Ready = Extract<DesignState, { state: "ready" }>;
type Page = CherryDocument["pages"][number];

const STATUS: Record<Ready["status"], string> = {
  saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", offline: "Offline — retrying", error: "Not saved",
};

function findNode(nodes: CherryNode[], id: string): CherryNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.kind === "group" ? findNode(n.children, id) : undefined;
    if (hit) return hit;
  }
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function Editor() {
  const { id = "" } = useParams();
  const d = useDesign(id);
  if (d.state === "loading") return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (d.state === "failed") return (
    <div className="card" style={{ maxWidth: 460, margin: "48px auto" }}>
      <p role="alert">{d.message}</p>
      <Link to="/">Back to home</Link>
    </div>
  );
  return <Shell d={d} key={d.ydoc.guid} />;
}

/** Center stage. Task 7 swaps this for the Konva canvas. */
function CanvasArea({ page }: { page: Page }) {
  return (
    <main className="ed-stage">
      <div className="ed-fit">
        <div aria-label={`${page.name} canvas`} className="ed-page"
          style={{ aspectRatio: `${page.width} / ${page.height}`, ["--ar" as string]: page.width / page.height, background: page.background.color }} />
      </div>
    </main>
  );
}

function Shell({ d }: { d: Ready }) {
  const { ydoc, undo, readOnly } = d;
  const last = useRef<CherryDocument | null>(null);
  const doc = useYValue(ydoc, () => {
    const r = yToDoc(ydoc);
    if (r.ok) last.current = r.doc;
    return last.current!;
  });
  const [sel, setSel] = useState<{ pageId: string; selected: string[] }>({ pageId: doc.pages[0]!.id, selected: [] });
  const page = doc.pages.find((p) => p.id === sel.pageId) ?? doc.pages[0]!;

  // Drop a vanished page or selected ids after every change.
  useEffect(() => {
    const selected = sel.selected.filter((s) => findNode(page.nodes, s));
    if (page.id !== sel.pageId || selected.length !== sel.selected.length) setSel({ pageId: page.id, selected });
  }, [doc]);

  const selRef = useRef(sel);
  selRef.current = sel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly || typing(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) undo.redo(); else undo.undo(); }
      else if (mod && key === "y") { e.preventDefault(); undo.redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current.selected.length) {
        e.preventDefault();
        removeNodes(ydoc, selRef.current.pageId, selRef.current.selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ydoc, undo, readOnly]);

  const select = (selected: string[]) => setSel({ pageId: page.id, selected });
  const selectedNodes = sel.selected.map((s) => findNode(page.nodes, s)).filter((n): n is CherryNode => !!n);
  const status = d.status === "error" ? `Not saved: ${d.statusMessage ?? ""}` : STATUS[d.status];

  return (
    <div className="ed">
      <header className="ed-head">
        <Link className="ed-ib" to="/" aria-label="Back to home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div className="ed-title">
          <input aria-label="Design title" key={doc.title} defaultValue={doc.title} disabled={readOnly} maxLength={120}
            onBlur={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== doc.title) setTitle(ydoc, t); else e.currentTarget.value = doc.title; }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          <span className="muted">
            {page.width} × {page.height} {page.unit} · {page.colorMode.toUpperCase()} · {readOnly ? <span>View only</span> : <span role="status">{status}</span>}
          </span>
        </div>
        <button className="ed-ib" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={readOnly} onClick={() => undo.undo()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
        </button>
        <button className="ed-ib" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={readOnly} onClick={() => undo.redo()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>
        </button>
        <span style={{ flex: 1 }} />
        <span className="ed-f ed-zoom">Zoom <strong>Fit</strong></span>
      </header>
      <div className="ed-body">
        <Toolbar ydoc={ydoc} page={page} readOnly={readOnly} onInserted={(nid) => select([nid])} />
        <aside aria-label="Layers" className="ed-left">
          <Layers ydoc={ydoc} pageId={page.id} nodes={page.nodes} selected={sel.selected} readOnly={readOnly} onSelect={select} />
          <Pages ydoc={ydoc} pages={doc.pages} pageId={page.id} readOnly={readOnly} onSwitch={(pageId) => setSel({ pageId, selected: [] })} />
        </aside>
        <CanvasArea page={page} />
        <Properties ydoc={ydoc} pageId={page.id} unit={page.unit} nodes={selectedNodes} readOnly={readOnly} />
      </div>
    </div>
  );
}
