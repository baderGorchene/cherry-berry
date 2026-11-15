import { useEffect, useRef, useState, type MutableRefObject } from "react";
import Konva from "konva";
import { Ellipse, Group, Image as KImage, Layer, Path, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import * as Y from "yjs";
import type { AnchorRef } from "@cherry/vector";
import {
  PT_PX, UNIT_PX, addNode, createShape, createText, removeNodes, toPx, updateNode,
  type BasicShape, type CherryNode, type Page,
} from "@cherry/doc";
import { fromKonvaTransform, toKonvaAttrs } from "./geometry";
import PathEditor, { type PathInput, type PathKeys } from "./PathEditor";
import TextEditor from "./TextEditor";
import type { BrandKit, Role } from "../api";
import { useAssetImage } from "./useAssetImage";
import { pinch } from "./gestures";
import { canEditContent, canMove } from "./brandLock";
import type { Peer } from "./presence";

export type Tool = "select" | "text" | "pen" | "direct" | "add-anchor" | "convert-anchor" | BasicShape;
type Pt = { x: number; y: number };
type Drag = { kind: "marquee" | "create"; from: Pt; to: Pt; shift: boolean };
type Unit = Page["unit"];
type TextNode = Extract<CherryNode, { kind: "text" }>;

const isLine = (n: CherryNode) => n.kind === "path" && n.height === 0;
const konvaFont = (n: TextNode, unit: Unit) => ({
  text: n.text, width: n.width, fontFamily: n.fontFamily, fontSize: (n.fontSize * PT_PX) / UNIT_PX[unit],
  fontStyle: String(n.fontWeight), lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, align: n.align,
});
const TEXT_LAYOUT = ["text", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "width"];

/** Adds the rendered height to a patch that changes how a text node lays out (other patches pass through). */
export function withTextHeight(n: CherryNode, patch: Partial<CherryNode>, unit: Unit): Partial<CherryNode> {
  if (n.kind !== "text" || !TEXT_LAYOUT.some((k) => k in patch)) return patch;
  const t = new Konva.Text(konvaFont({ ...n, ...patch } as TextNode, unit));
  const height = t.height();
  t.destroy();
  return { ...patch, height };
}

export const paint = (p?: { color: string; opacity: number }) => p && (p.opacity < 1 ? hexA(p.color, p.opacity) : p.color);
const hexA = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** An asset's image at the node's size; a grey box while it loads, with a note if it can't. */
function ImageView({ n, common }: { n: Extract<CherryNode, { kind: "image" }>; common: object }) {
  const { image, status } = useAssetImage(n.assetId);
  return (
    <Group {...common}>
      {image ? <KImage image={image} width={n.width} height={n.height} /> : (
        <>
          <Rect width={n.width} height={n.height} fill="#D9D2DC" />
          <Text text={status === "error" ? "Image unavailable" : "Image"} width={n.width} height={n.height} align="center" verticalAlign="middle"
            fontSize={Math.max(1, Math.min(n.width, n.height) / 6)} fill="#5D4E66" />
        </>
      )}
    </Group>
  );
}

/** Plain render of one node; Konva ids are only set on top-level (selectable) nodes. */
export function NodeView({ n, unit, top, editing, inert, ...events }: {
  n: CherryNode; unit: Unit; top: boolean; editing: string | null; inert?: boolean;
  draggable?: boolean; onDragEnd?(e: KonvaEventObject<DragEvent>): void; onDblClick?(): void;
}) {
  if (n.hidden) return null;
  const common = {
    ...toKonvaAttrs(n), ...(top ? { id: n.id, ...events } : {}), opacity: n.opacity, listening: !n.locked && !inert,
  };
  const strokeOf = (s?: { paint: { color: string; opacity: number }; width: number }) =>
    s ? { stroke: paint(s.paint), strokeWidth: s.width } : {};
  switch (n.kind) {
    case "rect":
      return <Rect {...common} width={n.width} height={n.height} cornerRadius={n.cornerRadius} fill={paint(n.fill)} {...strokeOf(n.stroke)} />;
    case "ellipse":
      // Konva ellipses are drawn around their origin, which is already the box center.
      return <Ellipse {...common} offsetX={0} offsetY={0} radiusX={n.width / 2} radiusY={n.height / 2} fill={paint(n.fill)} {...strokeOf(n.stroke)} />;
    case "path":
      return <Path {...common} data={n.d} fill={paint(n.fill)} fillRule={n.fillRule} hitStrokeWidth={isLine(n) ? 10 : "auto"} {...strokeOf(n.stroke)} />;
    case "text":
      return <Text {...common} {...konvaFont(n, unit)} fill={paint(n.fill)} visible={editing !== n.id} />;
    case "image":
      return <ImageView n={n} common={common} />;
    case "group":
      return (
        <Group {...common}>
          {n.children.map((c) => <NodeView key={c.id} n={c} unit={unit} top={false} editing={editing} />)}
        </Group>
      );
  }
}

export default function Canvas({
  ydoc, page, selected, readOnly, role, tool, zoom, pan, editingPath, anchors, pathKeys, snapRef, kit, fontsVersion, peers, onCursor,
  act, onSelect, onTool, onPan, onZoom, onViewport, onAnchors, onEditPath,
}: {
  ydoc: Y.Doc; page: Page; selected: string[]; readOnly: boolean; role: Role; tool: Tool; zoom: number; pan: Pt;
  editingPath: string | null; anchors: AnchorRef[]; pathKeys: PathKeys; snapRef: MutableRefObject<(() => string) | null>; kit: BrandKit | null; fontsVersion: number;
  peers: Peer[]; onCursor(c: Pt | null): void;
  act(fn: () => void): void; onSelect(ids: string[]): void; onTool(t: Tool): void;
  onPan(p: Pt): void; onZoom(z: number): void; onViewport(v: { width: number; height: number }): void;
  onAnchors(a: AnchorRef[]): void; onEditPath(id: string): void;
}) {
  const box = useRef<HTMLElement>(null);
  const nodesRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const pageRef = useRef<Konva.Group>(null);
  const [vp, setVp] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // A text placed by the Text tool lives here until its first commit, so an empty one never reaches the doc.
  const [draft, setDraft] = useState<TextNode | null>(null);
  // The edited path as it follows an anchor or handle drag, drawn in place of the stored node.
  const [edited, setEdited] = useState<CherryNode | null>(null);
  // Fingers on the canvas (px from its centre) and what the gesture is doing; `last` is the latest touch time.
  const touch = useRef({
    pts: new Map<number, Pt>(), last: 0, start: { x: 0, y: 0 }, moved: false,
    pinch: null as { start: [Pt, Pt]; zoom: number; pan: Pt } | null, pan: null as { from: Pt; pan: Pt } | null, tap: undefined as string | undefined,
    // Path tools: the press, replayed once the finger moves (so a pinch never reaches them), and whether that drag is live.
    press: null as PointerEvent | null, pathDrag: false,
  });
  const [pinching, setPinching] = useState(false);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      const v = { width: Math.floor(e!.contentRect.width), height: Math.floor(e!.contentRect.height) };
      setVp(v);
      onViewport(v);
    });
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  const scale = toPx(1, page.unit) * zoom;
  const origin = { x: (vp.width - page.width * scale) / 2 + pan.x, y: (vp.height - page.height * scale) / 2 + pan.y };
  const top = (id: string) => page.nodes.find((n) => n.id === id);
  const pathNode = editingPath ? top(editingPath) : undefined;
  const pathMode = !readOnly && (tool === "pen" || !!pathNode);
  const pathInput: PathInput = useRef(null);
  const selectable = (n: CherryNode) => !n.hidden && !n.locked && canEditContent(n, role);

  // Attach the transformer to the selected Konva nodes after each render.
  useEffect(() => {
    const tr = trRef.current, group = nodesRef.current;
    if (!tr || !group) return;
    tr.nodes(pathMode ? [] : group.getChildren((k) => selected.includes(k.id()) && !!top(k.id()) && selectable(top(k.id())!) && k.id() !== editing));
  });

  // A PNG of the page area only (no selection handles), longest side at most 600 px, whatever the zoom and pan.
  snapRef.current = () => {
    const stage = stageRef.current!, g = pageRef.current!, tr = trRef.current;
    const u = toPx(1, page.unit), t = Math.min(1, 600 / (Math.max(page.width, page.height) * u));
    const saved = { x: g.x(), y: g.y(), scaleX: g.scaleX(), scaleY: g.scaleY() };
    g.setAttrs({ x: 0, y: 0, scaleX: u * t, scaleY: u * t });
    tr?.visible(false);
    try {
      return stage.toDataURL({ x: 0, y: 0, width: page.width * u * t, height: page.height * u * t, pixelRatio: 1, mimeType: "image/png" });
    } finally {
      g.setAttrs(saved);
      tr?.visible(true);
      stage.batchDraw();
    }
  };

  const commitKonva = (ks: Konva.Node[]) => {
    if (touch.current.pinch) {
      // A second finger ended this drag or transform: put the layers back rather than commit a half move.
      ks.forEach((k) => { const n = top(k.id()); if (n) { const { x, y, rotation } = toKonvaAttrs(n); k.setAttrs({ x, y, rotation, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 }); } });
      trRef.current?.forceUpdate();
      return stageRef.current?.batchDraw();
    }
    const patches = ks.flatMap((k) => {
      const n = top(k.id());
      if (!n || !canMove(n, role)) return [];
      const t = { x: k.x(), y: k.y(), rotation: k.rotation(), scaleX: k.scaleX(), scaleY: k.scaleY() };
      // A multi-node resize can leave skew on rotated nodes; the document has no skew, so drop it.
      k.scale({ x: 1, y: 1 });
      k.skew({ x: 0, y: 0 });
      return [[n.id, withTextHeight(n, fromKonvaTransform(n, t), page.unit)] as const];
    });
    if (patches.length) act(() => patches.forEach(([id, p]) => updateNode(ydoc, page.id, id, p)));
  };

  /** Top-level node id under a Konva target, "tr" for transformer handles, null for empty canvas. */
  const hitOf = (target: Konva.Node): string | null => {
    for (let k: Konva.Node | null = target; k; k = k.getParent()) {
      if (k === trRef.current) return "tr";
      if (k.getParent() === nodesRef.current) return k.id();
    }
    return null;
  };

  const pointer = () => nodesRef.current!.getRelativePointerPosition()!;

  const onDown = (e: KonvaEventObject<MouseEvent>) => {
    // A tap also sends compatibility mouse events; touch is handled below.
    if (e.evt.button !== 0 || editing || Date.now() - touch.current.last < 800) return;
    touch.current.pinch = null;
    if (pathMode) return pathInput.current?.down(e.evt);
    const p = pointer();
    if (tool !== "select" && !readOnly) return setDrag({ kind: "create", from: p, to: p, shift: false });
    const hit = hitOf(e.target);
    if (hit === "tr") return;
    if (hit) {
      if (e.evt.shiftKey) onSelect(selected.includes(hit) ? selected.filter((s) => s !== hit) : [...selected, hit]);
      else if (!selected.includes(hit)) onSelect([hit]);
      return;
    }
    setDrag({ kind: "marquee", from: p, to: p, shift: e.evt.shiftKey });
  };

  const onMove = (e: KonvaEventObject<MouseEvent>) => {
    if (drag) setDrag({ ...drag, to: pointer() });
    if (pathMode) pathInput.current?.hover(e.evt);
    onCursor(pointer());
  };

  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    const { from, to } = drag;
    const r = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
    const moved = Math.max(r.width, r.height) * scale >= 3;
    if (drag.kind === "marquee") {
      if (!moved) return drag.shift || onSelect([]);
      const hits = nodesRef.current!.getChildren((k) => {
        const n = top(k.id());
        return !!n && selectable(n) && Konva.Util.haveIntersection(rectOnScreen(r), k.getClientRect());
      }).map((k) => k.id());
      return onSelect(drag.shift ? [...new Set([...selected, ...hits])] : hits);
    }
    onTool("select");
    if (tool === "text") {
      const t = (moved ? createText(r, r.width) : createText(from, page.width * 0.6)) as TextNode;
      setDraft(t);
      return setEditing(t.id);
    }
    const s = Math.min(page.width, page.height) * 0.25;
    let node: CherryNode;
    if (tool === "line" && moved) {
      // A dragged line runs from the press point to the release point.
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      node = createShape("line", { x: mid.x - len / 2, y: mid.y, width: len, height: 0 });
      node.rotation = ((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360;
    } else {
      node = createShape(tool as BasicShape, moved ? r : { x: from.x - s / 2, y: from.y - s / 2, width: s, height: s });
    }
    act(() => addNode(ydoc, page.id, node));
    onSelect([node.id]);
  };

  // End a drag on mouseup anywhere, even outside the canvas.
  useEffect(() => {
    if (!drag) return;
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [drag]);

  // Touch: one finger taps a layer to select it (Konva drags it as with a mouse), pans empty canvas, or uses the armed tool;
  // a second finger pinch-zooms and pans, and no layer drags while it is down.
  const onTouch = useRef<(e: PointerEvent) => void>(null);
  onTouch.current = (e) => {
    const t = touch.current;
    const r = box.current!.getBoundingClientRect();
    const p = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    t.last = Date.now();
    if (e.type === "pointerdown") {
      if (!(e.target instanceof HTMLCanvasElement)) return; // the text editor and peer labels sit over the canvas
      t.pts.set(e.pointerId, p);
      if (t.pts.size === 1) t.pinch = null; // a new gesture; the last pinch stays set until now so its trailing drag/transform end is undone
      if (t.pts.size === 2) {
        t.pinch = { start: [...t.pts.values()] as [Pt, Pt], zoom, pan };
        t.pan = null;
        t.tap = undefined;
        setDrag(null);
        if (t.pathDrag) pathInput.current?.cancel();
        t.press = null;
        t.pathDrag = false;
        // Stop what the first finger started; commitKonva puts those layers back.
        nodesRef.current?.getChildren().forEach((k) => { if (k.isDragging()) k.stopDrag(); });
        if (trRef.current?.isTransforming()) trRef.current.stopTransform();
        return setPinching(true);
      }
      if (t.pts.size > 2 || editing) return;
      t.start = p;
      t.moved = false;
      if (pathMode) { t.press = e; t.pathDrag = false; return; } // replayed on a drag or a tap, never on a pinch
      if (tool !== "select" && !readOnly) { const q = pointer(); return setDrag({ kind: "create", from: q, to: q, shift: false }); }
      const shape = stageRef.current!.getIntersection({ x: p.x + r.width / 2, y: p.y + r.height / 2 });
      const hit = shape && hitOf(shape);
      if (hit === "tr") return;
      if (hit) t.tap = hit;
      else t.pan = { from: p, pan };
    } else if (e.type === "pointermove") {
      if (!t.pts.has(e.pointerId)) return;
      t.pts.set(e.pointerId, p);
      if (Math.hypot(p.x - t.start.x, p.y - t.start.y) > 8) t.moved = true;
      if (pathMode && !t.pinch && t.press) {
        if (!t.pathDrag && t.moved) {
          stageRef.current!.setPointersPositions(t.press); // the press lands where the finger went down
          pathInput.current?.down(t.press);
          t.pathDrag = true;
        }
        if (t.pathDrag) pathInput.current?.move(e);
        return;
      }
      if (t.pinch) {
        if (t.pts.size !== 2) return;
        const z = pinch(t.pinch.start, [...t.pts.values()] as [Pt, Pt], t.pinch.zoom, t.pinch.pan);
        onZoom(z.zoom);
        onPan(z.pan);
      } else if (t.pan) onPan({ x: t.pan.pan.x + p.x - t.pan.from.x, y: t.pan.pan.y + p.y - t.pan.from.y });
      else if (drag) setDrag({ ...drag, to: pointer() });
      else if (pathMode) pathInput.current?.hover(e);
    } else {
      if (!t.pts.delete(e.pointerId)) return;
      if (t.pinch) {
        if (!t.pts.size) setPinching(false);
        return;
      }
      const tap = !t.moved && e.type === "pointerup";
      if (pathMode && t.press) {
        const press = t.press, live = t.pathDrag;
        t.press = null;
        t.pathDrag = false;
        if (e.type === "pointercancel") return void (live && pathInput.current?.cancel());
        if (!live && tap) { stageRef.current!.setPointersPositions(press); pathInput.current?.down(press); }
        return pathInput.current?.up(); // end the drag here rather than waiting on a compatibility mouseup
      }
      // Tapping a selected text edits it (a double tap would land on the sheet that the first tap opens).
      if (tap && t.tap && !readOnly && selected.includes(t.tap) && top(t.tap)?.kind === "text") setEditing(t.tap);
      else if (tap && t.tap) onSelect([t.tap]);
      else if (tap && t.pan) onSelect([]);
      t.pan = null;
      t.tap = undefined;
      if (drag) { if (e.type === "pointerup") onUp(); else setDrag(null); }
    }
  };
  useEffect(() => {
    const el = box.current!;
    const h = (e: PointerEvent) => { if (e.pointerType === "touch") onTouch.current!(e); };
    const types = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
    types.forEach((type) => el.addEventListener(type, h));
    return () => types.forEach((type) => el.removeEventListener(type, h));
  }, []);

  // Page-unit rect → stage (screen) rect, the space getClientRect() reports in.
  const rectOnScreen = (r: { x: number; y: number; width: number; height: number }) =>
    ({ x: origin.x + r.x * scale, y: origin.y + r.y * scale, width: r.width * scale, height: r.height * scale });

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) onZoom(zoom * Math.exp(-e.evt.deltaY * 0.002));
    else onPan({ x: pan.x - e.evt.deltaX, y: pan.y - e.evt.deltaY });
  };

  const commitText = (n: TextNode, text: string) => {
    setEditing(null);
    setDraft(null);
    const isNew = n === draft;
    if (!text.trim()) {
      if (!isNew && canMove(n, role)) act(() => removeNodes(ydoc, page.id, [n.id]));
      return onSelect(selected.filter((s) => s !== n.id));
    }
    const rename = n.name === "Text" || n.name === n.text;
    const next = { text, ...(rename ? { name: text.slice(0, 40) } : {}) };
    // A content-locked text may change only its words (the server rejects a new height), so its box stays as set.
    const patch = canMove(n, role) ? withTextHeight(n, next, page.unit) : next;
    if (isNew) {
      act(() => addNode(ydoc, page.id, { ...n, ...patch } as CherryNode));
      onSelect([n.id]);
    } else act(() => updateNode(ydoc, page.id, n.id, patch));
  };

  // A selected logo keeps its proportions when the kit locks logos.
  const logoIds = kit?.content.rules.lockLogos ? Object.values(kit.content.logos) : [];
  const keepRatio = selected.some((s) => { const n = top(s); return n?.kind === "image" && logoIds.includes(n.assetId); });
  const frozen = selected.some((s) => { const n = top(s); return !!n && !canMove(n, role); });
  const narrow = selected.some((s) => { const n = top(s); return !!n && (n.kind === "text" || isLine(n)); });
  const editNode = draft ?? (editing ? top(editing) : undefined);
  const preview = drag && {
    x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y),
    width: Math.abs(drag.to.x - drag.from.x), height: Math.abs(drag.to.y - drag.from.y),
  };

  return (
    <main ref={box} className="ed-stage" aria-label={`${page.name} canvas`}
      style={{ cursor: tool === "select" || tool === "direct" || readOnly ? "default" : "crosshair" }}>
      <Stage ref={stageRef} width={vp.width} height={vp.height} onMouseDown={onDown} onMouseMove={onMove}
        onMouseLeave={() => { pathInput.current?.hover(null); onCursor(null); }} onWheel={onWheel}>
        <Layer key={fontsVersion}>
          <Group ref={pageRef} x={origin.x} y={origin.y} scaleX={scale} scaleY={scale}>
            {page.bleed > 0 && (
              <Rect x={-page.bleed} y={-page.bleed} width={page.width + 2 * page.bleed} height={page.height + 2 * page.bleed}
                stroke="#ED96D7" strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
            )}
            <Rect width={page.width} height={page.height} fill={paint(page.background)}
              shadowColor="rgba(34,20,42,.22)" shadowBlur={50} shadowOffsetY={20} shadowForStrokeEnabled={false} />
            <Group ref={nodesRef}>
              {page.nodes.map((n) => (
                <NodeView key={n.id} n={edited?.id === n.id ? edited : n} unit={page.unit} top editing={editing}
                  inert={!canEditContent(n, role)}
                  draggable={!readOnly && tool === "select" && !n.locked && canMove(n, role) && !pinching}
                  onDragEnd={(e) => commitKonva([...new Set([e.target, ...(trRef.current?.nodes() ?? [])])])}
                  onDblClick={() => {
                    if (readOnly || pathMode) return;
                    if (n.kind !== "text") return onEditPath(n.id);
                    onSelect([n.id]);
                    setEditing(n.id);
                  }} />
              ))}
            </Group>
            {pathMode && (
              <PathEditor key={pathNode?.id ?? "new"} ydoc={ydoc} page={page} node={pathNode} tool={tool} scale={scale}
                anchors={anchors} act={act} keys={pathKeys} input={pathInput} onAnchors={onAnchors} onCreated={(id) => onSelect([id])}
                onTool={onTool} onPreview={setEdited} />
            )}
            {preview && (
              <Rect {...preview} stroke="#8E1EA2" strokeWidth={1} strokeScaleEnabled={false}
                fill={drag!.kind === "marquee" ? "rgba(142,30,162,.08)" : undefined} dash={drag!.kind === "create" ? [4, 4] : undefined} listening={false} />
            )}
          </Group>
          {!readOnly && (
            <Transformer ref={trRef} flipEnabled={false} rotateEnabled={!frozen} resizeEnabled={!frozen} keepRatio={keepRatio}
              borderStroke="#8E1EA2" anchorStroke="#8E1EA2" anchorFill="#fff" anchorSize={10} anchorCornerRadius={2}
              enabledAnchors={narrow ? ["middle-left", "middle-right"] : undefined}
              onTransformEnd={() => commitKonva(trRef.current!.nodes())} />
          )}
        </Layer>
      </Stage>
      {/* Other people's selections and cursors: DOM, so they never take pointer events. */}
      <div className="ed-peers" style={{ left: origin.x, top: origin.y }}>
        {peers.filter((p) => p.pageId === page.id).map((p) => {
          const nodes = p.selection.map((id) => top(id)).filter((n): n is CherryNode => !!n && !n.hidden);
          const first = nodes[0];
          return (
            <div key={p.clientId}>
              {nodes.map((n) => (
                <div key={n.id} className="ed-peer-box" style={{ left: n.x * scale, top: n.y * scale, width: n.width * scale, height: n.height * scale, borderColor: p.user.color }} />
              ))}
              {first && <span className="ed-peer-label" style={{ left: first.x * scale, top: first.y * scale - 22, background: p.user.color }}>{p.user.name} is editing</span>}
              {p.cursor && (
                <span className="ed-peer-cursor" style={{ left: p.cursor.x * scale, top: p.cursor.y * scale, color: p.user.color }}>
                  <svg width="14" height="20" viewBox="0 0 14 20"><path d="M0 0 L0 15 L4 11.5 L7 18 L9.5 17 L6.5 10.5 L12 10.5 Z" fill="currentColor" stroke="#fff" /></svg>
                  {p.user.name.split(/\s+/)[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {editNode?.kind === "text" && (
        <TextEditor key={editNode.id} node={editNode} origin={origin} scale={scale} zoom={zoom}
          onCommit={(t) => commitText(editNode, t)} />
      )}
    </main>
  );
}
