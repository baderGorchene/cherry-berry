import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import * as Y from "yjs";
import type { AnchorRef, BoolOp } from "@cherry/vector";
import {
  duplicateNodes, fromPx, removeNodes, reorderNode, setTitle, updateNode, yToDoc, type CherryDocument, type CherryNode,
} from "@cherry/doc";
import "../editor/editor.css";
import { IconBack, IconRedo, IconUndo } from "../icons";
import Canvas, { type Tool } from "../editor/Canvas";
import { NUDGE, clampZoom, fitZoom } from "../editor/geometry";
import Layers from "../editor/Layers";
import Pages from "../editor/Pages";
import type { PathKeys } from "../editor/PathEditor";
import { combinable, combine, convertToPath, editModel } from "../editor/pathEdit";
import PathPanel from "../editor/PathPanel";
import ShapesPanel from "../editor/ShapesPanel";
import VisualsPanel from "../editor/VisualsPanel";
import Properties from "../editor/Properties";
import Toolbar from "../editor/Toolbar";
import { useDesign, type DesignState } from "../editor/useDesign";
import { useYValue } from "../editor/useYValue";

type Ready = Extract<DesignState, { state: "ready" }>;
const TOOL_KEYS: Record<string, Tool> = { v: "select", t: "text", r: "rect", o: "ellipse", l: "line", p: "pen" };
// In path edit mode only the vector tools are armed by key; Shift+C (convert) is checked separately.
const EDIT_KEYS: Record<string, Tool> = { a: "direct", p: "pen", "+": "add-anchor", "=": "add-anchor" };

type Panel = "layers" | "shapes" | "visuals";
const TABS: [Panel, string][] = [["layers", "Layers"], ["shapes", "Shapes"], ["visuals", "Visuals"]];

const BOOL_KEYS: Record<string, BoolOp> = { u: "union", s: "subtract", i: "intersect", e: "exclude" };

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

  const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [sel.selected.join()]);
  const [tool, setTool] = useState<Tool>("select");
  const [panel, setPanel] = useState<Panel>("layers");
  const [vp, setVp] = useState({ width: 0, height: 0 });
  const [zoomSet, setZoomSet] = useState<number | null>(null); // null = fit to viewport
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoom = zoomSet ?? fitZoom(page, vp);
  const zoomTo = (z: number | null) => { setZoomSet(z === null ? null : clampZoom(z)); if (z === null) setPan({ x: 0, y: 0 }); };

  // Point-edit mode: the path being edited and its selected anchors.
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<AnchorRef[]>([]);
  const editNode = editingPath ? page.nodes.find((n) => n.id === editingPath) : undefined;
  const pathKeys: PathKeys = useRef<(e: KeyboardEvent) => boolean>(null);
  const enterEdit = (id: string) => {
    const n = page.nodes.find((x) => x.id === id);
    if (readOnly || !n || n.locked || n.hidden || !editModel(n)) return;
    select([id]);
    setEditingPath(id);
    setAnchors([]);
    setTool("direct");
  };
  const exitEdit = () => { setEditingPath(null); setAnchors([]); setTool("select"); };
  // Leave edit mode when the node is gone (undo, remote delete, page switch) or can no longer be point-edited.
  useEffect(() => { if (editingPath && !(editNode && editModel(editNode))) exitEdit(); }, [doc, page.id, editingPath]);

  const onKey = useRef<(e: KeyboardEvent) => void>(null);
  onKey.current = (e) => {
    if (typing(e.target)) return;
    if (pathKeys.current?.(e)) return e.preventDefault(); // pen finish, anchor delete/nudge
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const ids = sel.selected;
    const stop = () => e.preventDefault();
    if (mod && (key === "=" || key === "+")) { stop(); zoomTo(zoom * 1.2); }
    else if (mod && key === "-") { stop(); zoomTo(zoom / 1.2); }
    else if (mod && key === "0") { stop(); zoomTo(null); }
    else if (mod && key === "a") { stop(); select(page.nodes.filter((n) => !n.hidden && !n.locked).map((n) => n.id)); }
    else if (mod && e.altKey && key in BOOL_KEYS) { stop(); if (!readOnly && !editingPath) runCombine(BOOL_KEYS[key]!); }
    else if (key === "escape") { if (editingPath) exitEdit(); else { select([]); setTool("select"); } }
    else if (readOnly) return;
    else if (key === "enter") {
      if (!editingPath && selectedNodes.length === 1 && selectedNodes[0]!.kind === "path") { stop(); enterEdit(selectedNodes[0]!.id); }
    }
    else if (mod && key === "z") { stop(); if (e.shiftKey) undo.redo(); else undo.undo(); }
    else if (mod && key === "y") { stop(); undo.redo(); }
    else if (mod && key === "d") {
      stop();
      let copies: string[] = [];
      if (ids.length) { act(() => { copies = duplicateNodes(ydoc, page.id, ids, fromPx(10, page.unit)); }); select(copies); }
    }
    else if (mod && (e.key === "]" || e.key === "[")) {
      stop();
      // Move the topmost first when going forward (bottom-most first going back) so neighbours don't swap back.
      const order = page.nodes.map((n) => n.id).filter((id) => ids.includes(id));
      const to = e.key === "]" ? "forward" : "backward";
      if (order.length) act(() => (to === "forward" ? order.reverse() : order).forEach((id) => reorderNode(ydoc, page.id, id, to)));
    }
    else if (e.key in NUDGE) {
      const movable = selectedNodes.filter((n) => !n.locked);
      if (!movable.length) return;
      stop();
      const [dx, dy] = NUDGE[e.key]!.map((v) => v * (e.shiftKey ? 10 : 1));
      act(() => movable.forEach((n) => updateNode(ydoc, page.id, n.id, { x: n.x + dx!, y: n.y + dy! })));
    }
    else if ((e.key === "Delete" || e.key === "Backspace") && ids.length) { stop(); act(() => removeNodes(ydoc, page.id, ids)); }
    else if (mod || e.altKey) return;
    else if (editingPath) {
      if (key === "c" && e.shiftKey) setTool("convert-anchor");
      else if (key in EDIT_KEYS) setTool(EDIT_KEYS[key]!);
    }
    else if (key in TOOL_KEYS) setTool(TOOL_KEYS[key]!);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current!(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const select = (selected: string[]) => setSel({ pageId: page.id, selected });
  /** One committed action = one undo step, even within captureTimeout of the last. */
  const act = (fn: () => void) => { undo.stopCapturing(); fn(); undo.stopCapturing(); };
  const selectedNodes = sel.selected.map((s) => findNode(page.nodes, s)).filter((n): n is CherryNode => !!n);
  const operands = page.nodes.filter((n) => sel.selected.includes(n.id) && combinable(n));
  const runCombine = (op: BoolOp) => {
    if (operands.length >= 2) setMessage(combine(ydoc, page.id, op, operands, act, select) ?? "");
  };
  const runConvert = (n: CherryNode) => setMessage(convertToPath(ydoc, page.id, n, act) ?? "");
  const left: Panel = editNode ? "layers" : panel; // path edit mode always shows Layers
  const status = d.status === "error" ? `Not saved: ${d.statusMessage ?? ""}` : STATUS[d.status];

  return (
    <div className="ed">
      <header className="ed-head">
        <Link className="ed-ib" to="/" aria-label="Back to home"><IconBack /></Link>
        <div className="ed-title">
          <input aria-label="Design title" key={doc.title} defaultValue={doc.title} disabled={readOnly} maxLength={120}
            onBlur={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== doc.title) act(() => setTitle(ydoc, t)); else e.currentTarget.value = doc.title; }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          <span className="muted ell">
            {page.width} × {page.height} {page.unit} · {page.colorMode.toUpperCase()} · {readOnly ? <span>View only</span> : <span role="status">{status}</span>}
            {d.statusCode === "invalid_document" && <> <button className="ed-mini" onClick={d.reload}>Reload to get the latest version</button></>}
          </span>
        </div>
        <button className="ed-ib" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={readOnly} onClick={() => undo.undo()}><IconUndo /></button>
        <button className="ed-ib" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={readOnly} onClick={() => undo.redo()}><IconRedo /></button>
        {editNode && <span className="ed-pill">Editing path</span>}
        <span style={{ flex: 1 }} />
        <div className="ed-zoom" role="group" aria-label="Zoom">
          <button className="ed-mini" aria-label="Zoom out" title="Zoom out (Ctrl+-)" onClick={() => zoomTo(zoom / 1.2)}>−</button>
          <span className="ed-f" title="Zoom level">{Math.round(zoom * 100)}%</span>
          <button className="ed-mini" aria-label="Zoom in" title="Zoom in (Ctrl+=)" onClick={() => zoomTo(zoom * 1.2)}>+</button>
          <button className="ed-mini" title="Fit (Ctrl+0)" onClick={() => zoomTo(null)}>Fit</button>
        </div>
        {editNode && <button className="ed-done" title="Done (Esc)" onClick={exitEdit}>Done</button>}
      </header>
      <div className="ed-body">
        <Toolbar readOnly={readOnly} tool={tool} editing={!!editNode} panel={panel} onTool={setTool} onPanel={(p) => setPanel(panel === p ? "layers" : p)} />
        <div className="ed-left">
          {/* Enter/Space on a focused tab activate it; keep them from the editor's global shortcuts. */}
          <div role="tablist" aria-label="Left panel" className="ed-ltabs" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={left === id} className="ed-tab" disabled={!!editNode && id !== "layers"}
                onClick={(e) => { setPanel(id); if (e.detail > 0) e.currentTarget.blur(); }}>{label}</button>
            ))}
          </div>
          {left === "layers" && (
            <aside aria-label="Layers" className="ed-pane">
              <Layers ydoc={ydoc} pageId={page.id} nodes={page.nodes} selected={sel.selected} readOnly={readOnly} act={act} onSelect={select} />
              <Pages ydoc={ydoc} pages={doc.pages} pageId={page.id} readOnly={readOnly} act={act} onSwitch={(pageId) => setSel({ pageId, selected: [] })} />
            </aside>
          )}
          {left === "shapes" && (
            <ShapesPanel ydoc={ydoc} page={page} workspaceId={d.design.workspaceId} readOnly={readOnly} act={act} onTool={setTool} onSelect={select} />
          )}
          {left === "visuals" && (
            <VisualsPanel ydoc={ydoc} page={page} designId={d.design.id} workspaceId={d.design.workspaceId} readOnly={readOnly} act={act} onSelect={select} />
          )}
        </div>
        <Canvas ydoc={ydoc} page={page} selected={sel.selected} readOnly={readOnly} tool={tool} zoom={zoom} pan={pan}
          editingPath={editNode ? editNode.id : null} anchors={anchors} pathKeys={pathKeys}
          act={act} onSelect={select} onTool={setTool} onPan={setPan} onZoom={zoomTo} onViewport={setVp}
          onAnchors={setAnchors} onEditPath={enterEdit} />
        {editNode
          ? <PathPanel ydoc={ydoc} page={page} node={editNode} anchors={anchors} act={act} />
          : <Properties ydoc={ydoc} page={page} workspaceId={d.design.workspaceId} nodes={selectedNodes} readOnly={readOnly} act={act}
            combinable={operands.length >= 2} canConvert={selectedNodes.every((n) => page.nodes.includes(n))} message={message} onCombine={runCombine} onConvert={runConvert} />}
      </div>
    </div>
  );
}
