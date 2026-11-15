import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import * as Y from "yjs";
import type { AnchorRef, BoolOp } from "@cherry/vector";
import {
  brandIssues, duplicateNodes, fromPx, removeNodes, reorderNode, setTitle, updateNode, yToDoc, type CherryDocument, type CherryNode,
} from "@cherry/doc";
import { getKit, myWorkspaces, type BrandKit } from "../api";
import { useSession } from "../App";
import { canDelete, canEditContent, canMove } from "../editor/brandLock";
import { useKitFonts } from "../brand/fonts";
import "../editor/editor.css";
import BrandPanel from "../editor/BrandPanel";
import { IconBack, IconBrand, IconImage, IconLayers, IconMore, IconRedo, IconShapes, IconText, IconUndo } from "../icons";
import Canvas, { type Tool } from "../editor/Canvas";
import { NUDGE, allIds, clampZoom, fitZoom } from "../editor/geometry";
import ExportDialog from "../editor/ExportDialog";
import Layers from "../editor/Layers";
import PublishDialog from "../editor/PublishDialog";
import Pages from "../editor/Pages";
import type { PathKeys } from "../editor/PathEditor";
import { combinable, combine, convertToPath, editModel } from "../editor/pathEdit";
import PathPanel from "../editor/PathPanel";
import ShapesPanel from "../editor/ShapesPanel";
import VisualsPanel from "../editor/VisualsPanel";
import Properties from "../editor/Properties";
import { Avatars, SharePopover } from "../editor/PresenceBar";
import { colorFor, usePeers, type PresenceUser } from "../editor/presence";
import Sheet from "../editor/Sheet";
import Toolbar, { PEN } from "../editor/Toolbar";
import { useDesign, type DesignState } from "../editor/useDesign";
import { useYValue } from "../editor/useYValue";

type Ready = Extract<DesignState, { state: "ready" }>;
const TOOL_KEYS: Record<string, Tool> = { v: "select", t: "text", r: "rect", o: "ellipse", l: "line", p: "pen" };
// In path edit mode only the vector tools are armed by key; Shift+C (convert) is checked separately.
const EDIT_KEYS: Record<string, Tool> = { a: "direct", p: "pen", "+": "add-anchor", "=": "add-anchor" };

type Panel = "layers" | "shapes" | "visuals" | "brand";
const TABS: [Panel, string][] = [["layers", "Layers"], ["shapes", "Shapes"], ["visuals", "Visuals"], ["brand", "Brand"]];

type SheetId = Panel | "properties";
const SHEET_LABEL: Record<SheetId, string> = { layers: "Layers", shapes: "Shapes", visuals: "Visuals", brand: "Brand", properties: "Properties" };

// The phone layout (bottom tool bar and sheets) follows the theme's phone breakpoint.
const phoneQuery = () => matchMedia("(max-width: 759px)");
const onPhoneChange = (cb: () => void) => { const q = phoneQuery(); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
const usePhone = () => useSyncExternalStore(onPhoneChange, () => phoneQuery().matches);

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
  const { ydoc, undo, readOnly, role } = d;
  const last = useRef<CherryDocument | null>(null);
  const doc = useYValue(ydoc, () => {
    const r = yToDoc(ydoc);
    if (r.ok) last.current = r.doc;
    return last.current!;
  });
  const [sel, setSel] = useState<{ pageId: string; selected: string[] }>({ pageId: doc.pages[0]!.id, selected: [] });
  const page = doc.pages.find((p) => p.id === sel.pageId) ?? doc.pages[0]!;

  // Drop a vanished page or selected ids when the page's nodes change.
  const nodeIds = allIds(page.nodes).join();
  useEffect(() => {
    const selected = sel.selected.filter((s) => findNode(page.nodes, s));
    if (page.id !== sel.pageId || selected.length !== sel.selected.length) setSel({ pageId: page.id, selected });
  }, [page.id, nodeIds]);

  // Presence: publish my page and selection, and read everyone else's.
  const { user } = useSession();
  const me = useMemo<PresenceUser>(() => ({ id: user?.id ?? "", name: user?.name ?? "", color: colorFor(user?.id ?? "") }), [user]);
  const awareness = d.provider.awareness!;
  const peers = usePeers(awareness);
  useEffect(() => { awareness.setLocalStateField("user", me); }, [awareness, me]);
  useEffect(() => { awareness.setLocalStateField("pageId", page.id); }, [awareness, page.id]);
  const selKey = sel.selected.join();
  useEffect(() => { awareness.setLocalStateField("selection", sel.selected); }, [awareness, selKey]);
  const lastCursor = useRef(0);
  const onCursor = (c: { x: number; y: number } | null) => {
    const now = Date.now();
    if (c && now - lastCursor.current < 50) return;
    lastCursor.current = now;
    awareness.setLocalStateField("cursor", c);
  };
  // The same person in two tabs shows once.
  const people = [me, ...peers.map((p) => p.user)].filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i);
  const [workspaceName, setWorkspaceName] = useState("your workspace");
  useEffect(() => {
    myWorkspaces().then(({ workspaces }) => { const w = workspaces.find((x) => x.id === d.design.workspaceId); if (w) setWorkspaceName(w.name); }, () => {});
  }, [d.design.workspaceId]);

  // The linked kit; a kit that is gone or unreadable leaves the design unlinked.
  const [kitId, setKitId] = useState(d.design.kitId);
  const [loaded, setLoaded] = useState<{ id: string; kit: BrandKit | null } | null>(null);
  useEffect(() => {
    if (!kitId) return;
    let stale = false;
    getKit(kitId).then((k) => !stale && setLoaded({ id: kitId, kit: k }), () => !stale && setLoaded({ id: kitId, kit: null }));
    return () => { stale = true; };
  }, [kitId]);
  const kit = kitId && loaded?.id === kitId ? loaded.kit : null;
  const kitLoading = !!kitId && loaded?.id !== kitId;
  const fontsVersion = useKitFonts(kit);
  const issues = useMemo(() => (kit ? brandIssues(page, kit.content) : []), [page, kit]);
  const issueCount = issues.length;

  const [params, setParams] = useSearchParams();
  const [publishing, setPublishing] = useState(role !== "viewer" && params.get("publish") === "1");
  const snapRef = useRef<(() => string) | null>(null);
  const closePublish = () => {
    setPublishing(false);
    if (params.has("publish")) setParams((p) => { p.delete("publish"); return p; }, { replace: true });
  };

  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [sel.selected.join()]);
  const [tool, setTool] = useState<Tool>("select");
  const [panel, setPanel] = useState<Panel>("layers");
  const phone = usePhone();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const toggleSheet = (s: SheetId) => setSheet((cur) => (cur === s ? null : s));
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!more) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMore(false); moreBtn.current?.focus(); } };
    const down = (e: PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMore(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); };
  }, [more]);
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
    if (readOnly || !n || n.locked || n.hidden || !canMove(n, role) || !editModel(n)) return;
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
    if (exporting || typing(e.target)) return; // the export dialog is modal
    if (pathKeys.current?.(e)) return e.preventDefault(); // pen finish, anchor delete/nudge
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const ids = sel.selected;
    const stop = () => e.preventDefault();
    if (mod && (key === "=" || key === "+")) { stop(); zoomTo(zoom * 1.2); }
    else if (mod && key === "-") { stop(); zoomTo(zoom / 1.2); }
    else if (mod && key === "0") { stop(); zoomTo(null); }
    else if (mod && key === "a") { stop(); select(page.nodes.filter((n) => !n.hidden && !n.locked && canEditContent(n, role)).map((n) => n.id)); }
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
      const dup = ids.filter((id) => canMove(findNode(page.nodes, id)!, role));
      if (dup.length) { act(() => { copies = duplicateNodes(ydoc, page.id, dup, fromPx(10, page.unit), role !== "editor"); }); select(copies); }
    }
    else if (mod && (e.key === "]" || e.key === "[")) {
      stop();
      // Move the topmost first when going forward (bottom-most first going back) so neighbours don't swap back.
      const order = page.nodes.filter((n) => ids.includes(n.id) && canMove(n, role)).map((n) => n.id);
      const to = e.key === "]" ? "forward" : "backward";
      if (order.length) act(() => (to === "forward" ? order.reverse() : order).forEach((id) => reorderNode(ydoc, page.id, id, to)));
    }
    else if (e.key in NUDGE) {
      const movable = selectedNodes.filter((n) => !n.locked && canMove(n, role));
      if (!movable.length) return;
      stop();
      const [dx, dy] = NUDGE[e.key]!.map((v) => v * (e.shiftKey ? 10 : 1));
      act(() => movable.forEach((n) => updateNode(ydoc, page.id, n.id, { x: n.x + dx!, y: n.y + dy! })));
    }
    else if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
      stop();
      const del = selectedNodes.filter((n) => canDelete(n, role)).map((n) => n.id);
      if (del.length) act(() => removeNodes(ydoc, page.id, del));
    }
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

  const closeExport = useCallback(() => setExporting(false), []);
  const select = (selected: string[]) => {
    setSel({ pageId: page.id, selected });
    // On phones, picking a layer shows its properties; clearing the selection closes them.
    if (phone) setSheet((s) => (selected.length ? "properties" : s === "properties" ? null : s));
  };
  /** One committed action = one undo step, even within captureTimeout of the last. */
  const act = (fn: () => void) => { undo.stopCapturing(); fn(); undo.stopCapturing(); };
  const selectedNodes = sel.selected.map((s) => findNode(page.nodes, s)).filter((n): n is CherryNode => !!n);
  const operands = page.nodes.filter((n) => sel.selected.includes(n.id) && combinable(n));
  const canCombine = operands.length >= 2 && operands.every((n) => canMove(n, role));
  const runCombine = (op: BoolOp) => {
    if (canCombine) setMessage(combine(ydoc, page.id, op, operands, act, select) ?? "");
  };
  const runConvert = (n: CherryNode) => setMessage(convertToPath(ydoc, page.id, n, act) ?? "");
  const left: Panel = editNode ? "layers" : panel; // path edit mode always shows Layers
  const status = d.status === "error" ? `Not saved: ${d.statusMessage ?? ""}` : STATUS[d.status];

  const titleInput = (
    <input aria-label="Design title" key={doc.title} defaultValue={doc.title} disabled={readOnly} maxLength={120}
      onBlur={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== doc.title) act(() => setTitle(ydoc, t)); else e.currentTarget.value = doc.title; }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
  const statusLine = (
    <span className="muted ell">
      {page.width} × {page.height} {page.unit} · {page.colorMode.toUpperCase()} · {readOnly ? <span>View only</span> : <span role="status">{status}</span>}
      {(d.statusCode === "invalid_document" || d.statusCode === "brand_locked") && <> <button className="ed-mini" onClick={d.reload}>Reload to get the latest version</button></>}
    </span>
  );
  const undoBtn = <button className="ed-ib" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={readOnly} onClick={() => undo.undo()}><IconUndo /></button>;
  const redoBtn = <button className="ed-ib" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={readOnly} onClick={() => undo.redo()}><IconRedo /></button>;
  const zoomGroup = (
    <div className="ed-zoom" role="group" aria-label="Zoom">
      <button className="ed-mini" aria-label="Zoom out" title="Zoom out (Ctrl+-)" onClick={() => zoomTo(zoom / 1.2)}>−</button>
      <span className="ed-f" title="Zoom level">{Math.round(zoom * 100)}%</span>
      <button className="ed-mini" aria-label="Zoom in" title="Zoom in (Ctrl+=)" onClick={() => zoomTo(zoom * 1.2)}>+</button>
      <button className="ed-mini" title="Fit (Ctrl+0)" onClick={() => zoomTo(null)}>Fit</button>
    </div>
  );
  const history = <Link className="btn" to={`/d/${d.design.id}/history`}>History</Link>;
  const publish = role !== "viewer" && !editNode && <button className="btn" onClick={() => { setMore(false); setPublishing(true); }}>Publish</button>;
  const done = editNode && <button className="ed-done" title="Done (Esc)" onClick={exitEdit}>Done</button>;
  const panelBody = (p: Panel) => ({
    layers: (
      <aside aria-label="Layers" className="ed-pane">
        <Layers ydoc={ydoc} pageId={page.id} nodes={page.nodes} selected={sel.selected} readOnly={readOnly} role={role} act={act} onSelect={select} />
        <Pages ydoc={ydoc} pages={doc.pages} pageId={page.id} readOnly={readOnly} role={role} act={act} onSwitch={(pageId) => setSel({ pageId, selected: [] })} />
      </aside>
    ),
    // On phones an armed tool closes the sheet so the canvas can take the tap.
    shapes: <ShapesPanel ydoc={ydoc} page={page} workspaceId={d.design.workspaceId} readOnly={readOnly} act={act} onSelect={select}
      onTool={(t) => { setTool(t); if (phone) setSheet(null); }} />,
    visuals: <VisualsPanel ydoc={ydoc} page={page} designId={d.design.id} workspaceId={d.design.workspaceId} readOnly={readOnly} role={role} selected={sel.selected} act={act} onSelect={select} />,
    brand: (
      <BrandPanel ydoc={ydoc} page={page} kit={kit} loading={kitLoading} issues={issues} designId={d.design.id} workspaceId={d.design.workspaceId} readOnly={readOnly} role={role}
        act={act} selected={sel.selected} onSelect={select} onLinked={setKitId} />
    ),
  })[p];
  const properties = (tabs: boolean) => editNode
    ? <PathPanel ydoc={ydoc} page={page} node={editNode} anchors={anchors} act={act} />
    : <Properties ydoc={ydoc} page={page} workspaceId={d.design.workspaceId} designId={d.design.id} kit={kit} onLinked={setKitId} nodes={selectedNodes} readOnly={readOnly} role={role} act={act}
      combinable={canCombine} canConvert={selectedNodes.every((n) => page.nodes.includes(n))} message={message} onCombine={runCombine} onConvert={runConvert} tabs={tabs} />;
  const canvas = (
    <Canvas ydoc={ydoc} page={page} selected={sel.selected} readOnly={readOnly} role={role} tool={tool} zoom={zoom} pan={pan}
      editingPath={editNode ? editNode.id : null} anchors={anchors} pathKeys={pathKeys} snapRef={snapRef}
      kit={kit} fontsVersion={fontsVersion} peers={peers} onCursor={onCursor}
      act={act} onSelect={select} onTool={setTool} onPan={setPan} onZoom={zoomTo} onViewport={setVp}
      onAnchors={setAnchors} onEditPath={enterEdit} />
  );
  const dialogs = (
    <>
      {publishing && (
        <PublishDialog designId={d.design.id} workspaceId={d.design.workspaceId} title={doc.title} kitId={kitId} saved={d.status === "saved"}
          snapRef={snapRef} onClose={closePublish} />
      )}
      {exporting && (
        <ExportDialog designId={d.design.id} doc={doc} pageId={page.id} status={d.status} onClose={closeExport}
          onShow={(nodes) => {
            const pageId = nodes[0]!.pageId;
            setSel({ pageId, selected: nodes.filter((n) => n.pageId === pageId).map((n) => n.nodeId) });
            setExporting(false);
          }} />
      )}
    </>
  );

  if (phone) {
    const tl = (label: string, icon: ReactNode, pressed: boolean, onClick: () => void, disabled = false) => (
      <button className="ed-tl" aria-pressed={pressed} disabled={disabled} onClick={onClick}>{icon}{label}</button>
    );
    const arm = (t: Tool) => { setTool(tool === t ? "select" : t); setSheet(null); };
    return (
      <div className="ed ed-m">
        <header className="ed-head">
          <Link className="ed-ib" to="/" aria-label="Back to home"><IconBack /></Link>
          <div className="ed-title">{titleInput}</div>
          {undoBtn}
          <button className={`ed-ib${sheet === "layers" ? " ed-ib-on" : ""}`} aria-label="Layers" aria-pressed={sheet === "layers"} onClick={() => toggleSheet("layers")}><IconLayers /></button>
          {done || <button className="btn btn-p" onClick={() => setExporting(true)}>Export</button>}
          <div className="ed-more-w" ref={moreRef}>
            <button ref={moreBtn} className="ed-ib" aria-label="More" aria-expanded={more} onClick={() => setMore(!more)}><IconMore /></button>
            {more && (
              <div className="ed-pop ed-more" role="dialog" aria-label="More">
                {statusLine}
                {zoomGroup}
                <Avatars people={people} />
                <div className="ed-more-row">{redoBtn}{history}{publish}</div>
                <SharePopover workspace={workspaceName} />
              </div>
            )}
          </div>
        </header>
        <div className="ed-body">{canvas}</div>
        {sheet && <Sheet label={SHEET_LABEL[sheet]} onClose={() => setSheet(null)}>{sheet === "properties" ? properties(true) : panelBody(sheet)}</Sheet>}
        <nav aria-label="Tools" className="ed-mtools">
          {tl("Text", <IconText />, tool === "text", () => arm("text"), readOnly)}
          {tl("Shapes", <IconShapes />, sheet === "shapes", () => toggleSheet("shapes"))}
          {tl("Visuals", <IconImage />, sheet === "visuals", () => toggleSheet("visuals"))}
          {tl("Draw", PEN, tool === "pen", () => arm("pen"), readOnly || !!editNode)}
          {tl(issueCount ? `Brand (${issueCount})` : "Brand", <IconBrand />, sheet === "brand", () => toggleSheet("brand"))}
        </nav>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="ed">
      <header className="ed-head">
        <Link className="ed-ib" to="/" aria-label="Back to home"><IconBack /></Link>
        <div className="ed-title">
          {titleInput}
          {statusLine}
        </div>
        {undoBtn}
        {redoBtn}
        {editNode && <span className="ed-pill">Editing path</span>}
        <span style={{ flex: 1 }} />
        {zoomGroup}
        <Avatars people={people} />
        {history}
        <button className="btn" onClick={() => setExporting(true)}>Export</button>
        <SharePopover workspace={workspaceName} />
        {publish}
        {done}
      </header>
      <div className="ed-body">
        <Toolbar readOnly={readOnly} tool={tool} editing={!!editNode} panel={panel} onTool={setTool} onPanel={(p) => setPanel(panel === p ? "layers" : p)} />
        <div className="ed-left">
          {/* Enter/Space on a focused tab activate it; keep them from the editor's global shortcuts. */}
          <div role="tablist" aria-label="Left panel" className="ed-ltabs" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={left === id} className="ed-tab" disabled={!!editNode && id !== "layers"}
                onClick={(e) => { setPanel(id); if (e.detail > 0) e.currentTarget.blur(); }}>{id === "brand" && issueCount ? `${label} (${issueCount})` : label}</button>
            ))}
          </div>
          {panelBody(left)}
        </div>
        {canvas}
        {properties(false)}
      </div>
      {dialogs}
    </div>
  );
}
