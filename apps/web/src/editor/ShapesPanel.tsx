import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { addNode, type CherryNode, type Page } from "@cherry/doc";
import { InvalidSvg, parsePath, pathBounds, scalePath, svgToPaths, transformPath } from "@cherry/vector";
import { errorMessage, listShapes, type Shape } from "../api";
import type { Tool } from "./Canvas";
import { SHAPES } from "./Toolbar";

export const TABS = [["basic", "Basic"], ["mine", "My shapes"], ["workspace", "Workspace"], ["public", "Public"]] as const;
type TabId = (typeof TABS)[number][0];

/** A library shape as a path node whose longer side is 25% of the page's shorter side, centred on the page. */
export function shapeNode(s: Shape, page: Page): CherryNode {
  const f = (0.25 * Math.min(page.width, page.height)) / (Math.max(s.width, s.height) || 1);
  const width = s.width * f, height = s.height * f;
  return {
    id: crypto.randomUUID(), kind: "path", name: s.name,
    x: (page.width - width) / 2, y: (page.height - height) / 2, width, height, rotation: 0, opacity: 1,
    locked: false, hidden: false, d: scalePath(s.d, f, f), fillRule: s.fillRule,
    ...(s.fill ? { fill: s.fill } : s.stroke ? {} : { fill: { type: "solid" as const, color: "#8E1EA2", opacity: 1 } }),
    ...(s.stroke ? { stroke: { ...s.stroke, width: s.stroke.width * f } } : {}),
  };
}

/** Thumbnail viewBox; a zero-width or zero-height shape (a straight line) is padded so it doesn't render blank. */
export function thumbBox(s: Pick<Shape, "width" | "height">): string {
  const pad = s.width && s.height ? 0 : (Math.max(s.width, s.height) || 1) * 0.1;
  const w = Math.max(s.width, pad), h = Math.max(s.height, pad);
  return `${(s.width - w) / 2} ${(s.height - h) / 2} ${w} ${h}`;
}

const IMPORT_ERRORS = {
  too_large: "That file is too large (1 MB max).",
  no_shapes: "That SVG has no shapes to import.",
  too_complex: "That SVG has too many shapes (2,000 max).",
};

/** Reads an SVG file into paths, or the user-facing reason it can't be imported. */
export async function readSvg(file: File): Promise<{ paths: ReturnType<typeof svgToPaths> } | { error: string }> {
  try {
    return { paths: svgToPaths(await file.text()) };
  } catch (e) {
    return { error: e instanceof InvalidSvg ? IMPORT_ERRORS[e.code] : "That file couldn't be read as an SVG." };
  }
}

/** Imported paths as nodes, scaled to fit 60% of the page and centred on it. */
export function importNodes(paths: ReturnType<typeof svgToPaths>, page: Page): CherryNode[] {
  const boxes = paths.map((p) => pathBounds(parsePath(p.d)));
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const w = Math.max(...boxes.map((b) => b.x + b.width)) - x0, h = Math.max(...boxes.map((b) => b.y + b.height)) - y0;
  const f = Math.min(w ? (0.6 * page.width) / w : Infinity, h ? (0.6 * page.height) / h : Infinity);
  const k = Number.isFinite(f) ? f : 1;
  const tx = page.width / 2 - k * (x0 + w / 2), ty = page.height / 2 - k * (y0 + h / 2);
  return paths.map((p, i) => {
    const placed = transformPath(p.d, [k, 0, 0, k, tx, ty]);
    const b = pathBounds(parsePath(placed));
    return {
      id: crypto.randomUUID(), kind: "path", name: `Imported ${i + 1}`,
      x: b.x, y: b.y, width: b.width, height: b.height, rotation: 0, opacity: 1, locked: false, hidden: false,
      d: transformPath(placed, [1, 0, 0, 1, -b.x, -b.y]), fillRule: p.fillRule,
      ...(p.fill ? { fill: p.fill } : {}),
      ...(p.stroke ? { stroke: { ...p.stroke, width: p.stroke.width * k } } : {}),
    } as CherryNode;
  });
}

export function ShapeThumb({ s, size = 40 }: { s: Pick<Shape, "d" | "width" | "height" | "fillRule" | "fill" | "stroke">; size?: number }) {
  return (
    <svg viewBox={thumbBox(s)} overflow="visible" width={size} height={size} aria-hidden="true">
      <path d={s.d} fillRule={s.fillRule} fill={s.fill?.color ?? "none"} fillOpacity={s.fill?.opacity}
        {...(s.stroke ? { stroke: s.stroke.paint.color, strokeOpacity: s.stroke.paint.opacity, strokeWidth: s.stroke.width } : {})} />
    </svg>
  );
}

export default function ShapesPanel({ ydoc, page, workspaceId, readOnly, act, onTool, onSelect }: {
  ydoc: Y.Doc; page: Page; workspaceId: string; readOnly: boolean; act(fn: () => void): void;
  onTool(t: Tool): void; onSelect(ids: string[]): void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>("basic");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<{ shapes: Shape[] } | { error: string } | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    if (tab === "basic") return;
    let stale = false;
    setRes(null);
    listShapes(tab, { workspaceId, q }).then((r) => !stale && setRes(r), (e) => !stale && setRes({ error: errorMessage(e) }));
    return () => { stale = true; };
  }, [tab, q, tries, workspaceId]);

  const [importError, setImportError] = useState("");
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await readSvg(file);
    if ("error" in r) return setImportError(r.error);
    setImportError("");
    const nodes = importNodes(r.paths, page);
    act(() => nodes.forEach((n) => addNode(ydoc, page.id, n)));
    onSelect(nodes.map((n) => n.id));
  };

  const insert = (s: Shape) => {
    const n = shapeNode(s, page);
    act(() => addNode(ydoc, page.id, n));
    onSelect([n.id]);
  };

  return (
    <aside aria-label="Shapes panel" className="ed-shapes">
      <div role="tablist" className="ed-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ed-mini${tab === id ? " ed-ib-on" : ""}`}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <button className="ed-mini" disabled={readOnly} onClick={() => fileRef.current?.click()}>Import SVG…</button>
      <input ref={fileRef} type="file" hidden aria-label="Import SVG file" accept=".svg,image/svg+xml"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {importError && <p role="alert" className="ed-err">{importError}</p>}
      {tab === "basic" ? (
        <div className="ed-shapegrid">
          {SHAPES.map((s) => (
            <button key={s.kind} className="ed-shape" disabled={readOnly} onClick={() => onTool(s.kind)}>
              {s.icon}<span>{s.label.replace(/ \(.\)$/, "")}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <input type="search" aria-label="Search shapes" placeholder="Search shapes" value={text} onChange={(e) => setText(e.target.value)} />
          {!res ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
            : "error" in res ? (
              <div><p role="alert" className="ed-err">{res.error}</p><button className="ed-mini" onClick={() => setTries(tries + 1)}>Retry</button></div>
            ) : !res.shapes.length ? <p className="muted" style={{ fontSize: 13 }}>No shapes yet</p>
              : (
                <div className="ed-shapegrid">
                  {res.shapes.map((s) => (
                    <button key={s.id} className="ed-shape" disabled={readOnly} title={s.name} onClick={() => insert(s)}>
                      <ShapeThumb s={s} />
                      <span>{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
        </>
      )}
    </aside>
  );
}
