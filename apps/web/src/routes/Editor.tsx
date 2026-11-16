import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as Y from "yjs";
import type { AnchorRef, BoolOp } from "@cherry/vector";
import {
  brandIssues, duplicateNodes, fromPx, insertPages, removeNodes, reorderNode, setTitle, toPx, updateNode, yToDoc,
  type CherryDocument, type CherryNode, type Page,
} from "@cherry/doc";
import { getKit, myWorkspaces, startFromTemplate, type BrandKit } from "../api";
import { useSession } from "../App";
import { useCreateDialog } from "../create/CreateDialog";
import { canDelete, canEditContent, canMove } from "../editor/brandLock";
import { useKitFonts } from "../brand/fonts";
import "../editor/editor.css";
import BrandPanel from "../editor/BrandPanel";
import { IconBack, IconMore, IconRedo, IconUndo } from "../icons";
import BottomBar from "../editor/BottomBar";
import Canvas, { type Tool } from "../editor/Canvas";
import { NUDGE, allIds, clampZoom, fitZoom } from "../editor/geometry";
import ExportDialog from "../editor/ExportDialog";
import FileMenu from "../editor/FileMenu";
import Layers from "../editor/Layers";
import PageHeader from "../editor/PageHeader";
import PublishDialog from "../editor/PublishDialog";
import type { PathKeys } from "../editor/PathEditor";
import { combinable, combine, convertToPath, editModel } from "../editor/pathEdit";
import PathPanel from "../editor/PathPanel";
import Rail, { RAIL_LABEL, type RailItem } from "../editor/Rail";
import ShapesPanel from "../editor/ShapesPanel";
import TemplatesPanel from "../editor/TemplatesPanel";
import TextPanel from "../editor/TextPanel";
import VisualsPanel from "../editor/VisualsPanel";
import Properties from "../editor/Properties";
import { Avatars, SharePopover } from "../editor/PresenceBar";
import { colorFor, usePeers, type PresenceUser } from "../editor/presence";
import Sheet from "../editor/Sheet";
import DrawPanel from "../editor/Toolbar";
import { useDesign, type DesignState } from "../editor/useDesign";
import { useYValue } from "../editor/useYValue";

type Ready = Extract<DesignState, { state: "ready" }>;
const TOOL_KEYS: Record<string, Tool> = { v: "select", t: "text", r: "rect", o: "ellipse", l: "line", p: "pen" };
// In path edit mode only the vector tools are armed by key; Shift+C (convert) is checked separately.
const EDIT_KEYS: Record<string, Tool> = { a: "direct", p: "pen", "+": "add-anchor", "=": "add-anchor" };

type SheetId = RailItem | "properties";
const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));

// The phone layout (bottom tool bar and sheets) follows the theme's phone breakpoint.
const phoneQuery = () => matchMedia("(max-width: 759px)");
const onPhoneChange = (cb: () => void) => { const q = phoneQuery(); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
const usePhone = () => useSyncExternalStore(onPhoneChange, () => phoneQuery().matches);

const BOOL_KEYS: Record<string, BoolOp> = { u: "union", s: "subtract", i: "intersect", e: "exclude" };

const STATUS: Record<Ready["status"], string> = {
  saved: "Saved", saving: "Saving…", offline: "Offline — retrying", error: "Not saved",
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
  const [panel, setPanel] = useState<RailItem | null>("layers");
  const phone = usePhone();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const toggleSheet = (s: SheetId) => setSheet((cur) => (cur === s ? null : s));
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const morePop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    morePop.current?.focus();
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
  const left: RailItem | null = editNode ? "draw" : panel; // path edit mode always shows Draw (its point tools)
  const status = d.status === "error" ? `Not saved: ${d.statusMessage ?? ""}` : STATUS[d.status];
  const navigate = useNavigate();
  const createDialog = useCreateDialog();
  const titleRef = useRef<HTMLInputElement>(null);
  // The visible middle of the page, in page units: new text and pairings land there.
  const scale = toPx(1, page.unit) * zoom;
  const center = { x: clamp(page.width / 2 - pan.x / scale, page.width), y: clamp(page.height / 2 - pan.y / scale, page.height) };
  const switchPage = (pageId: string) => setSel({ pageId, selected: [] });
  const insertTemplate = (pages: Page[]) => {
    let ids: string[] = [];
    act(() => { ids = insertPages(ydoc, pages, page.id); });
    if (ids[0]) { switchPage(ids[0]); zoomTo(null); }
    if (phone) setSheet(null);
  };
  const pickRail = (p: RailItem) => (phone ? toggleSheet(p) : setPanel(panel === p ? null : p));

  const titleInput = (
    <input ref={titleRef} aria-label="Design title" key={doc.title} defaultValue={doc.title} disabled={readOnly} maxLength={120}
      onBlur={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== doc.title) act(() => setTitle(ydoc, t)); else e.currentTarget.value = doc.title; }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
  const statusLine = (
    <span className="muted ell">
      {readOnly ? <span>View only</span> : <span role="status">{status}</span>}
      {(d.statusCode === "invalid_document" || d.statusCode === "brand_locked") && <> <button className="ed-mini" onClick={d.reload}>Reload to get the latest version</button></>}
    </span>
  );
  const undoBtn = <button className="ed-ib" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={readOnly} onClick={() => undo.undo()}><IconUndo /></button>;
  const redoBtn = <button className="ed-ib" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={readOnly} onClick={() => undo.redo()}><IconRedo /></button>;
  const fileMenu = (
    <FileMenu items={[
      ["Rename", () => { titleRef.current?.focus(); titleRef.current?.select(); }, readOnly],
      ["Page size and colour mode", () => {
        select([]);
        if (phone) setSheet("properties");
        // ponytail: finds the Properties page section by class; Task 7 moves page settings into the context toolbar.
        else requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>(".ed-props"); if (el) { el.tabIndex = -1; el.focus(); } });
      }],
      ["History", () => navigate(`/d/${d.design.id}/history`)],
      ["Publish as template", () => setPublishing(true), role === "viewer" || !!editNode],
      ["Open a .cherry file", () => createDialog.open("open"), role === "viewer"],
      ["Export", () => setExporting(true)],
    ]} />
  );
  const done = editNode && <button className="ed-done" title="Done (Esc)" onClick={exitEdit}>Done</button>;
  const panelBody = (p: RailItem) => ({
    templates: (
      <TemplatesPanel page={page} workspaceId={d.design.workspaceId} readOnly={readOnly} onInsert={insertTemplate}
        onOpen={async (id) => navigate(`/d/${(await startFromTemplate(id, d.design.workspaceId)).id}`)} />
    ),
    // On phones an armed tool closes the sheet so the canvas can take the tap.
    elements: <ShapesPanel ydoc={ydoc} page={page} workspaceId={d.design.workspaceId} designId={d.design.id} readOnly={readOnly} act={act} onSelect={select}
      onTool={(t) => { setTool(t); if (phone) setSheet(null); }} />,
    text: <TextPanel ydoc={ydoc} page={page} center={center} kit={kit} readOnly={readOnly} role={role} selected={sel.selected} act={act} onSelect={select} />,
    uploads: <VisualsPanel ydoc={ydoc} page={page} designId={d.design.id} workspaceId={d.design.workspaceId} readOnly={readOnly} role={role} selected={sel.selected} act={act} onSelect={select} />,
    brand: (
      <BrandPanel ydoc={ydoc} page={page} kit={kit} loading={kitLoading} issues={issues} designId={d.design.id} workspaceId={d.design.workspaceId} readOnly={readOnly} role={role}
        act={act} selected={sel.selected} onSelect={select} onLinked={setKitId} />
    ),
    draw: (
      <DrawPanel readOnly={readOnly} tool={tool} editing={!!editNode} onTool={(t) => { setTool(t); if (phone && !editNode) setSheet(null); }}>
        {/* Desktop keeps the point properties in the right column (as before), so the canvas doesn't move under the pointer. */}
        {editNode && phone && <PathPanel ydoc={ydoc} page={page} node={editNode} anchors={anchors} act={act} />}
      </DrawPanel>
    ),
    layers: (
      <aside aria-label="Layers panel" className="ed-pane">
        <Layers ydoc={ydoc} pageId={page.id} nodes={page.nodes} selected={sel.selected} readOnly={readOnly} role={role} act={act} onSelect={select} />
      </aside>
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
  const pageHeader = <PageHeader ydoc={ydoc} pages={doc.pages} page={page} readOnly={readOnly} role={role} act={act} onSwitch={switchPage} />;
  const bottomBar = <BottomBar ydoc={ydoc} doc={doc} pageId={page.id} readOnly={readOnly} act={act} onSwitch={switchPage} zoom={zoom} onZoom={zoomTo} />;
  const rail = (value: RailItem | null) => <Rail value={value} issues={issueCount} only={editNode && !phone ? "draw" : undefined} onPick={pickRail} />;
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
    const sheetBody = sheet === "properties" ? properties(true) : sheet && panelBody(sheet);
    return (
      <div className="ed ed-m">
        <header className="ed-head">
          <Link className="ed-ib" to="/" aria-label="Back to home"><IconBack /></Link>
          <div className="ed-title">{titleInput}</div>
          {undoBtn}
          {fileMenu}
          {done || <button className="btn btn-p" onClick={() => setExporting(true)}>Export</button>}
          <div className="ed-more-w" ref={moreRef}>
            <button ref={moreBtn} className="ed-ib" aria-label="More" aria-expanded={more} onClick={() => setMore(!more)}><IconMore /></button>
            {more && (
              <div className="ed-pop ed-more" role="dialog" aria-label="More" tabIndex={-1} ref={morePop}>
                {statusLine}
                <Avatars people={people} />
                <div className="ed-more-row">{redoBtn}</div>
                <SharePopover workspace={workspaceName} />
              </div>
            )}
          </div>
        </header>
        {pageHeader}
        <div className="ed-body">{canvas}</div>
        {bottomBar}
        {sheet && <Sheet key={sheet} label={sheet === "properties" ? "Properties" : RAIL_LABEL[sheet]} onClose={() => setSheet(null)}>{sheetBody}</Sheet>}
        {rail(sheet === "properties" ? null : sheet)}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="ed">
      <header className="ed-head">
        <Link className="ed-ib" to="/" aria-label="Back to home"><IconBack /></Link>
        {fileMenu}
        <div className="ed-title">
          {titleInput}
          {statusLine}
        </div>
        {undoBtn}
        {redoBtn}
        {editNode && <span className="ed-pill">Editing path</span>}
        <span style={{ flex: 1 }} />
        <Avatars people={people} />
        <SharePopover workspace={workspaceName} />
        {done || <button className="btn btn-p" onClick={() => setExporting(true)}>Export</button>}
      </header>
      <div className="ed-body">
        {rail(left)}
        {left && (
          <div className="ed-left">
            <div className="ed-lhead">
              <h2 className="ed-lt">{RAIL_LABEL[left]}</h2>
              {!editNode && <button type="button" className="ed-lcollapse" aria-label="Close panel" title="Close panel" onClick={() => setPanel(null)}>‹</button>}
            </div>
            {panelBody(left)}
          </div>
        )}
        <div className="ed-center">
          {pageHeader}
          {canvas}
          {bottomBar}
        </div>
        {properties(false)}
      </div>
      {dialogs}
    </div>
  );
}
