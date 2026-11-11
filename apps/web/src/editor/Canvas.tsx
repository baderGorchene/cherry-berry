import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Ellipse, Group, Layer, Path, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import * as Y from "yjs";
import {
  PT_PX, UNIT_PX, addNode, createShape, createText, removeNodes, toPx, updateNode,
  type BasicShape, type CherryNode, type Page,
} from "@cherry/doc";
import { fromKonvaTransform, toKonvaAttrs } from "./geometry";
import TextEditor from "./TextEditor";

export type Tool = "select" | "text" | BasicShape;
type Pt = { x: number; y: number };
type Drag = { kind: "marquee" | "create"; from: Pt; to: Pt; shift: boolean };
type Unit = Page["unit"];

const isLine = (n: CherryNode) => n.kind === "path" && n.height === 0;
const konvaFont = (n: Extract<CherryNode, { kind: "text" }>, unit: Unit) => ({
  text: n.text, width: n.width, fontFamily: n.fontFamily, fontSize: (n.fontSize * PT_PX) / UNIT_PX[unit],
  fontStyle: String(n.fontWeight), lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, align: n.align,
});
const paint = (p?: { color: string; opacity: number }) => p && (p.opacity < 1 ? hexA(p.color, p.opacity) : p.color);
const hexA = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Plain render of one node; Konva ids are only set on top-level (selectable) nodes. */
function NodeView({ n, unit, top, editing, ...events }: {
  n: CherryNode; unit: Unit; top: boolean; editing: string | null;
  draggable?: boolean; onDragEnd?(e: KonvaEventObject<DragEvent>): void; onDblClick?(): void;
}) {
  if (n.hidden) return null;
  const common = {
    ...toKonvaAttrs(n), ...(top ? { id: n.id, ...events } : {}), opacity: n.opacity, listening: !n.locked,
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
      return (
        <Group {...common}>
          <Rect width={n.width} height={n.height} fill="#D9D2DC" />
          <Text text="Image" width={n.width} height={n.height} align="center" verticalAlign="middle"
            fontSize={Math.max(1, Math.min(n.width, n.height) / 6)} fill="#5D4E66" />
        </Group>
      );
    case "group":
      return (
        <Group {...common}>
          {n.children.map((c) => <NodeView key={c.id} n={c} unit={unit} top={false} editing={editing} />)}
        </Group>
      );
  }
}

export default function Canvas({ ydoc, page, selected, readOnly, tool, zoom, pan, act, onSelect, onTool, onPan, onZoom, onViewport }: {
  ydoc: Y.Doc; page: Page; selected: string[]; readOnly: boolean; tool: Tool; zoom: number; pan: Pt;
  act(fn: () => void): void; onSelect(ids: string[]): void; onTool(t: Tool): void;
  onPan(p: Pt): void; onZoom(z: number): void; onViewport(v: { width: number; height: number }): void;
}) {
  const box = useRef<HTMLElement>(null);
  const nodesRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [vp, setVp] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

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
  const selectable = (n: CherryNode) => !n.hidden && !n.locked;

  // Attach the transformer to the selected Konva nodes after each render.
  useEffect(() => {
    const tr = trRef.current, group = nodesRef.current;
    if (!tr || !group) return;
    tr.nodes(group.getChildren((k) => selected.includes(k.id()) && !!top(k.id()) && selectable(top(k.id())!) && k.id() !== editing));
  });

  const commitKonva = (ks: Konva.Node[]) => {
    const patches = ks.flatMap((k) => {
      const n = top(k.id());
      if (!n) return [];
      const t = { x: k.x(), y: k.y(), rotation: k.rotation(), scaleX: k.scaleX(), scaleY: k.scaleY() };
      k.scale({ x: 1, y: 1 });
      return [[n.id, fromKonvaTransform(n, t)] as const];
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
    if (e.evt.button !== 0 || editing) return;
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

  const onMove = () => { if (drag) setDrag({ ...drag, to: pointer() }); };

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
    let node: CherryNode;
    if (tool === "text") {
      node = moved ? createText(r, r.width) : createText(from, page.width * 0.6);
    } else {
      const s = Math.min(page.width, page.height) * 0.25;
      node = createShape(tool as BasicShape, moved ? r : { x: from.x - s / 2, y: from.y - s / 2, width: s, height: s });
    }
    act(() => addNode(ydoc, page.id, node));
    onSelect([node.id]);
    onTool("select");
    if (node.kind === "text") setEditing(node.id);
  };

  // Page-unit rect → stage (screen) rect, the space getClientRect() reports in.
  const rectOnScreen = (r: { x: number; y: number; width: number; height: number }) =>
    ({ x: origin.x + r.x * scale, y: origin.y + r.y * scale, width: r.width * scale, height: r.height * scale });

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) onZoom(zoom * Math.exp(-e.evt.deltaY * 0.002));
    else onPan({ x: pan.x - e.evt.deltaX, y: pan.y - e.evt.deltaY });
  };

  const commitText = (id: string, text: string) => {
    setEditing(null);
    const n = top(id);
    if (!n || n.kind !== "text") return;
    if (!text.trim()) {
      act(() => removeNodes(ydoc, page.id, [id]));
      return onSelect(selected.filter((s) => s !== id));
    }
    const height = new Konva.Text(konvaFont({ ...n, text }, page.unit)).height();
    const rename = n.name === "Text" || n.name === n.text;
    act(() => updateNode(ydoc, page.id, id, { text, height, ...(rename ? { name: text.slice(0, 40) } : {}) }));
  };

  const narrow = selected.some((s) => { const n = top(s); return !!n && (n.kind === "text" || isLine(n)); });
  const editNode = editing ? top(editing) : undefined;
  const preview = drag && {
    x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y),
    width: Math.abs(drag.to.x - drag.from.x), height: Math.abs(drag.to.y - drag.from.y),
  };

  return (
    <main ref={box} className="ed-stage" aria-label={`${page.name} canvas`}
      style={{ cursor: tool === "select" || readOnly ? "default" : "crosshair" }}>
      <Stage width={vp.width} height={vp.height} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel}>
        <Layer>
          <Group x={origin.x} y={origin.y} scaleX={scale} scaleY={scale}>
            {page.bleed > 0 && (
              <Rect x={-page.bleed} y={-page.bleed} width={page.width + 2 * page.bleed} height={page.height + 2 * page.bleed}
                stroke="#ED96D7" strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
            )}
            <Rect width={page.width} height={page.height} fill={paint(page.background)}
              shadowColor="rgba(34,20,42,.22)" shadowBlur={50} shadowOffsetY={20} shadowForStrokeEnabled={false} />
            <Group ref={nodesRef}>
              {page.nodes.map((n) => (
                <NodeView key={n.id} n={n} unit={page.unit} top editing={editing}
                  draggable={!readOnly && tool === "select" && !n.locked}
                  onDragEnd={(e) => commitKonva([...new Set([e.target, ...(trRef.current?.nodes() ?? [])])])}
                  onDblClick={() => { if (!readOnly && n.kind === "text") { onSelect([n.id]); setEditing(n.id); } }} />
              ))}
            </Group>
            {preview && (
              <Rect {...preview} stroke="#8E1EA2" strokeWidth={1} strokeScaleEnabled={false}
                fill={drag!.kind === "marquee" ? "rgba(142,30,162,.08)" : undefined} dash={drag!.kind === "create" ? [4, 4] : undefined} listening={false} />
            )}
          </Group>
          {!readOnly && (
            <Transformer ref={trRef} flipEnabled={false} rotateEnabled
              borderStroke="#8E1EA2" anchorStroke="#8E1EA2" anchorFill="#fff" anchorSize={10} anchorCornerRadius={2}
              enabledAnchors={narrow ? ["middle-left", "middle-right"] : undefined}
              onTransformEnd={() => commitKonva(trRef.current!.nodes())} />
          )}
        </Layer>
      </Stage>
      {editNode?.kind === "text" && (
        <TextEditor key={editNode.id} node={editNode} origin={origin} scale={scale} zoom={zoom}
          onCommit={(t) => commitText(editNode.id, t)} />
      )}
    </main>
  );
}
