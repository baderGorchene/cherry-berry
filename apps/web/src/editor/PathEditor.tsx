import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Konva from "konva";
import { Circle, Group, Line, Path, Rect } from "react-konva";
import * as Y from "yjs";
import { addNode, fromPx, type CherryNode, type Page } from "@cherry/doc";
import {
  hitSegment, insertAnchor, moveAnchors, moveHandle, normalizeEdit, removeAnchors,
  setAnchorKind, toPathData, type Anchor, type AnchorRef, type PathModel, type PathNode, type Pt,
} from "@cherry/vector";
import type { Tool } from "./Canvas";
import { NUDGE, toKonvaAttrs } from "./geometry";
import { anchorAt, asPath, commitEdit, editModel, rot, toLocal, toPage, validRefs } from "./pathEdit";

const BERRY = "#8E1EA2";
const ZERO: Pt = { x: 0, y: 0 };
const ANCHOR_PX = 10, HANDLE_PX = 5, HIT_PX = 6;
export type PathKeys = RefObject<((e: KeyboardEvent) => boolean) | null>;
/** Stage presses and moves, forwarded by Canvas (a full-canvas Konva hit shape misses presses until its first hit redraw). */
export type PathInput = RefObject<{ down(e: MouseEvent): void; hover(e: MouseEvent | null): void } | null>;

const allRefs = (m: PathModel) => m.flatMap((sp, sub) => sp.anchors.map((_, i) => ({ sub, i })));
const same = (a: AnchorRef, b: AnchorRef) => a.sub === b.sub && a.i === b.i;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const plus = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });

/** `p` moved onto the nearest 45° ray from `from`. */
function snap45(from: Pt, p: Pt): Pt {
  const dx = p.x - from.x, dy = p.y - from.y, l = Math.hypot(dx, dy);
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: from.x + l * Math.cos(a), y: from.y + l * Math.sin(a) };
}

const previewNode = (n: CherryNode, m: PathModel): CherryNode => {
  const base = asPath(n);
  return { ...base, ...normalizeEdit(base, m) };
};

type Drag =
  | { kind: "anchors"; refs: AnchorRef[]; from: Pt; to: Pt } // node-local
  | { kind: "handle"; ref: AnchorRef; which: "in" | "out"; from: Pt; to: Pt; alt: boolean } // node-local
  | { kind: "marquee"; from: Pt; to: Pt; shift: boolean } // page
  | { kind: "pen"; from: Pt; to: Pt }; // draft frame: pulling the new anchor's handle
/** Pen anchors not yet committed; `sub` is the existing open subpath being continued. */
type Draft = { anchors: Anchor[]; sub: number | null };

/**
 * Konva overlay for the pen and for point editing. Drawn in page units inside the canvas's scaled group; `node` is the
 * path being edited (its anchors are node-local), or undefined while the pen draws a new path in page coordinates.
 */
export default function PathEditor({ ydoc, page, node, tool, scale, anchors, act, keys, input, onAnchors, onCreated, onTool, onPreview }: {
  ydoc: Y.Doc; page: Page; node: CherryNode | undefined; tool: Tool; scale: number; anchors: AnchorRef[];
  act(fn: () => void): void; keys: PathKeys; input: PathInput; onAnchors(a: AnchorRef[]): void; onCreated(id: string): void;
  onTool(t: Tool): void; onPreview(n: CherryNode | null): void;
}) {
  const root = useRef<Konva.Group>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  // Mirrors `draft` synchronously, so an unmount right after finishing doesn't commit the stale draft again.
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => { draftRef.current = d; setDraftState(d); };
  const [hover, setHover] = useState<{ p: Pt; shift: boolean } | null>(null);

  const model = node ? editModel(node) : null;
  const sel = model ? validRefs(model, anchors) : [];
  // The pen works in node-local coordinates while editing, page coordinates otherwise.
  const frame = (p: Pt) => (node ? toLocal(node, p) : p);
  const pg = (p: Pt) => (node ? toPage(node, p) : p);
  const pointer = () => root.current!.getRelativePointerPosition()!;
  const near = (p: Pt, pagePt: Pt, px: number) => dist(pg(p), pagePt) * scale <= px;
  const commit = (m: PathModel) => node && commitEdit(ydoc, page, node, m, act);

  const work = (() => {
    if (!model || !drag) return model;
    if (drag.kind === "anchors") return moveAnchors(model, drag.refs, drag.to.x - drag.from.x, drag.to.y - drag.from.y);
    if (drag.kind === "handle") {
      const h = anchorAt(model, drag.ref)![drag.which];
      return moveHandle(model, drag.ref, drag.which, { x: h.x + drag.to.x - drag.from.x, y: h.y + drag.to.y - drag.from.y }, drag.alt);
    }
    return model;
  })();

  /** The draft with its last anchor made symmetric while the pen press is dragged out. */
  const pulled = (dr: Draft | null, d: Drag | null): Draft | null => {
    if (!dr || d?.kind !== "pen" || dist(d.from, d.to) * scale < 3) return dr;
    const out = { x: d.to.x - d.from.x, y: d.to.y - d.from.y };
    const last = dr.anchors[dr.anchors.length - 1]!;
    return { ...dr, anchors: [...dr.anchors.slice(0, -1), { ...last, kind: "symmetric", out, in: { x: -out.x, y: -out.y } }] };
  };

  const finish = (dr: Draft | null, closed: boolean) => {
    setDraft(null);
    if (!dr || dr.anchors.length < 2) return false;
    const sp = { anchors: dr.anchors, closed };
    if (node && model) {
      commit(dr.sub === null ? [...model, sp] : model.map((s, i) => (i === dr.sub ? sp : s)));
      onAnchors(closed ? [] : [{ sub: dr.sub ?? model.length, i: dr.anchors.length - 1 }]);
      return true;
    }
    const base = {
      id: crypto.randomUUID(), kind: "path", name: "Path", x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1,
      locked: false, hidden: false, d: "", fillRule: "nonzero",
      ...(closed
        ? { fill: { type: "solid", color: "#8E1EA2", opacity: 1 } }
        : { stroke: { paint: { type: "solid", color: "#22142A", opacity: 1 }, width: fromPx(2, page.unit) } }),
    } as PathNode;
    const n = { ...base, ...normalizeEdit(base, [sp]) };
    act(() => addNode(ydoc, page.id, n));
    onCreated(n.id);
    return true;
  };

  // Switching tools (or unmounting) keeps a pen path in progress rather than dropping it.
  const finishRef = useRef(() => finish(draftRef.current, false));
  finishRef.current = () => finish(draftRef.current, false);
  useEffect(() => () => { finishRef.current(); }, [tool]);
  useEffect(() => () => onPreview(null), []);

  const penDown = (pagePt: Pt, shift: boolean) => {
    const target = sel[0] && model && !model[sel[0].sub]!.closed ? sel[0].sub : null;
    const cur = draft ?? { anchors: target === null ? [] : model![target]!.anchors.map((a) => ({ ...a })), sub: target };
    const first = cur.anchors[0];
    if (first && cur.anchors.length >= 2 && near(first, pagePt, HIT_PX)) {
      if (finish(cur, true) && !node) onTool("select");
      return;
    }
    const p = frame(pagePt), last = cur.anchors[cur.anchors.length - 1];
    const at = shift && last ? snap45(last, p) : p;
    setDraft({ ...cur, anchors: [...cur.anchors, { ...at, in: ZERO, out: ZERO, kind: "corner" }] });
    setDrag({ kind: "pen", from: at, to: at });
  };

  const onDown = (e: MouseEvent) => {
    const pagePt = pointer(), p = frame(pagePt), shift = e.shiftKey;
    if (tool === "pen") return penDown(pagePt, shift);
    if (!node || !model) return;
    const hit = allRefs(model).find((r) => near(anchorAt(model, r)!, pagePt, HIT_PX));
    if (tool === "convert-anchor") {
      if (hit) {
        commit(setAnchorKind(model, hit, anchorAt(model, hit)!.kind === "corner" ? "smooth" : "corner"));
        onAnchors([hit]);
      }
      return;
    }
    if (tool === "add-anchor") {
      const s = hitSegment(model, p, HIT_PX / scale);
      if (s) {
        const r = insertAnchor(model, s.sub, s.segment, s.t);
        commit(r.model);
        onAnchors([r.ref]);
      }
      return;
    }
    // Direct select: handles of selected anchors first, then anchors, then a marquee.
    for (const ref of sel) {
      const a = anchorAt(model, ref)!;
      for (const which of ["in", "out"] as const) {
        if ((a[which].x || a[which].y) && near(plus(a, a[which]), pagePt, HIT_PX)) {
          return setDrag({ kind: "handle", ref, which, from: p, to: p, alt: e.altKey });
        }
      }
    }
    if (hit) {
      const on = sel.some((r) => same(r, hit));
      const next = shift ? (on ? sel.filter((r) => !same(r, hit)) : [...sel, hit]) : on ? sel : [hit];
      onAnchors(next);
      if (!(shift && on)) setDrag({ kind: "anchors", refs: next, from: p, to: p });
      return;
    }
    setDrag({ kind: "marquee", from: pagePt, to: pagePt, shift });
  };

  const endDrag = (d: Drag) => {
    setDrag(null);
    if (d.kind === "pen") return setDraft(pulled(draft, d));
    if (d.kind === "marquee") {
      const x0 = Math.min(d.from.x, d.to.x), x1 = Math.max(d.from.x, d.to.x);
      const y0 = Math.min(d.from.y, d.to.y), y1 = Math.max(d.from.y, d.to.y);
      if (Math.max(x1 - x0, y1 - y0) * scale < 3) return d.shift || onAnchors([]);
      const hits = model ? allRefs(model).filter((r) => {
        const q = pg(anchorAt(model, r)!);
        return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      }) : [];
      return onAnchors(d.shift ? [...sel, ...hits.filter((h) => !sel.some((r) => same(r, h)))] : hits);
    }
    if ((d.to.x !== d.from.x || d.to.y !== d.from.y) && work) commit(work);
  };

  // Track the drag on the window so it keeps going (and ends) outside the canvas.
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      root.current!.getStage()!.setPointersPositions(e);
      const pagePt = pointer();
      setDrag({ ...drag, to: drag.kind === "marquee" ? pagePt : frame(pagePt), ...(drag.kind === "handle" ? { alt: e.altKey } : {}) });
    };
    const up = () => endDrag(drag);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, draft]);

  // The real node follows anchor and handle drags.
  useEffect(() => {
    onPreview(node && work && (drag?.kind === "anchors" || drag?.kind === "handle") ? previewNode(node, work) : null);
  }, [drag]);

  // Layout effect: the handlers must be in place before the next input event, even right after mounting.
  useLayoutEffect(() => {
    input.current = {
      down: (e) => { if (e.button === 0) onDown(e); },
      hover: (e) => setHover(e && { p: pointer(), shift: e.shiftKey }),
    };
    keys.current = (e) => {
      if (draft && (e.key === "Enter" || e.key === "Escape")) {
        if (finish(draft, false) && !node) onTool("select");
        return true;
      }
      if (!node || !model || e.ctrlKey || e.metaKey) return false;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (sel.length) { commit(removeAnchors(model, sel)); onAnchors([]); }
        return true;
      }
      if (e.key in NUDGE) {
        const [dx, dy] = NUDGE[e.key]!.map((v) => v * (e.shiftKey ? 10 : 1));
        const v = rot({ x: dx!, y: dy! }, -node.rotation);
        if (sel.length) commit(moveAnchors(model, sel, v.x, v.y));
        return true;
      }
      return false;
    };
    return () => { keys.current = null; input.current = null; };
  });

  const shown = pulled(draft, drag);
  const k = 1 / scale; // one screen pixel in page units
  const square = (p: Pt, on: boolean, key: string) => (
    <Rect key={key} x={p.x - (ANCHOR_PX / 2) * k} y={p.y - (ANCHOR_PX / 2) * k} width={ANCHOR_PX * k} height={ANCHOR_PX * k}
      fill={on ? BERRY : "#fff"} stroke={BERRY} strokeWidth={1.5 * k} listening={false} />
  );
  const handles = (a: Anchor, key: string) => (["in", "out"] as const).filter((w) => a[w].x || a[w].y).map((w) => {
    const from = pg(a), to = pg(plus(a, a[w]));
    return (
      <Group key={`${key}${w}`} listening={false}>
        <Line points={[from.x, from.y, to.x, to.y]} stroke={BERRY} strokeWidth={k} />
        <Circle x={to.x} y={to.y} radius={(HANDLE_PX / 2) * k} fill="#fff" stroke={BERRY} strokeWidth={k} />
      </Group>
    );
  });
  const frameAttrs = node ? toKonvaAttrs(node) : {};
  const lastShown = shown?.anchors[shown.anchors.length - 1];
  const band = lastShown && hover && !drag && pg(lastShown);
  const bandTo = lastShown && hover && pg(hover.shift ? snap45(lastShown, frame(hover.p)) : frame(hover.p));

  return (
    <Group ref={root}>
      {work && (
        <Path {...frameAttrs} data={toPathData(work)} stroke={BERRY} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
      )}
      {shown && (
        <Path {...frameAttrs} data={toPathData([{ anchors: shown.anchors, closed: false }])}
          stroke={BERRY} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      )}
      {band && bandTo && (
        <Line points={[band.x, band.y, bandTo.x, bandTo.y]} stroke={BERRY} strokeWidth={k} dash={[4 * k, 4 * k]} listening={false} />
      )}
      {work && sel.map((r) => handles(anchorAt(work, r)!, `h${r.sub}:${r.i}`))}
      {work && allRefs(work).map((r) => square(pg(anchorAt(work, r)!), sel.some((s) => same(s, r)), `a${r.sub}:${r.i}`))}
      {lastShown && handles(lastShown, "draft")}
      {shown?.anchors.map((a, i) => square(pg(a), false, `d${i}`))}
      {drag?.kind === "marquee" && (
        <Rect x={Math.min(drag.from.x, drag.to.x)} y={Math.min(drag.from.y, drag.to.y)}
          width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)}
          stroke={BERRY} strokeWidth={k} fill="rgba(142,30,162,.08)" listening={false} />
      )}
    </Group>
  );
}
