import { useRef, useState } from "react";
import * as Y from "yjs";
import { addNode, type CherryNode, type Page } from "@cherry/doc";
import { InvalidSvg, parsePath, pathBounds, scalePath, svgToPaths, transformPath } from "@cherry/vector";
import { assetUrl, type Shape } from "../api";
import { useAssetList } from "../library/assets";
import ReportDialog from "../library/ReportDialog";
import { useShapeList } from "./shapeForm";
import type { Tool } from "./Canvas";
import { ELEMENT_CATEGORIES, ELEMENTS, type ElementCategory, type ElementPreset } from "./elements";
import { SHAPES } from "./Toolbar";
import { placeAsset } from "./VisualsPanel";

export const TABS = [["basic", "Basic"], ["mine", "My shapes"], ["workspace", "Workspace"], ["public", "Public"]] as const;
// The editor's Elements panel also lists the workspace's SVG visuals.
const PANEL_TABS = [...TABS, ["svg", "SVG visuals"]] as const;
type TabId = (typeof PANEL_TABS)[number][0];

/** A library shape as a path node whose longer side is 25% of the page's shorter side, centred on the page. */
export function shapeNode(s: Shape, page: Page): CherryNode {
  const f = (0.25 * Math.min(page.width, page.height)) / (Math.max(s.width, s.height) || 1);
  const width = s.width * f, height = s.height * f;
  return {
    id: crypto.randomUUID(), kind: "path", name: s.name,
    x: (page.width - width) / 2, y: (page.height - height) / 2, width, height, rotation: 0, opacity: 1,
    locked: false, hidden: false, brandLock: "none" as const, d: scalePath(s.d, f, f), fillRule: s.fillRule,
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
  if (file.size > 1_000_000) return { error: IMPORT_ERRORS.too_large };
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
      x: b.x, y: b.y, width: b.width, height: b.height, rotation: 0, opacity: 1, locked: false, hidden: false, brandLock: "none" as const,
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

export default function ShapesPanel({ ydoc, page, workspaceId, designId, readOnly, act, onTool, onSelect }: {
  ydoc: Y.Doc; page: Page; workspaceId: string; designId: string; readOnly: boolean; act(fn: () => void): void;
  onTool(t: Tool): void; onSelect(ids: string[]): void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>("basic");
  const [cat, setCat] = useState<ElementCategory | "All">("All");
  const [text, setText] = useState("");
  const { res, retry } = useShapeList(tab === "basic" || tab === "svg" ? null : tab, workspaceId, text);
  const svgs = useAssetList("workspace", { workspaceId: tab === "svg" ? workspaceId : undefined, kind: "svg" }, text);
  const [importError, setImportError] = useState("");
  const [reporting, setReporting] = useState<Shape | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await readSvg(file);
    if ("error" in r) return setImportError(r.error);
    setImportError("");
    let nodes: CherryNode[];
    try { nodes = importNodes(r.paths, page); } catch { return setImportError("That SVG is too detailed to import."); }
    act(() => nodes.forEach((n) => addNode(ydoc, page.id, n)));
    onSelect(nodes.map((n) => n.id));
  };

  const insert = (s: Pick<Shape, "name" | "d" | "width" | "height" | "fillRule"> & { fill?: Shape["fill"]; stroke?: Shape["stroke"] }) => {
    const n = shapeNode(s as Shape, page);
    act(() => addNode(ydoc, page.id, n));
    onSelect([n.id]);
  };
  const q = text.trim().toLowerCase();
  const filteredElements = ELEMENTS.filter((el: ElementPreset) =>
    (cat === "All" || el.category === cat) &&
    (!q || el.name.toLowerCase().includes(q) || el.tags.some((t) => t.includes(q))),
  );
  const filteredBasic = SHAPES.filter((s) => !q || s.label.toLowerCase().includes(q));

  return (
    <aside aria-label="Elements panel" className="ed-shapes">
      <div role="tablist" className="ed-tabs">
        {PANEL_TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ed-mini${tab === id ? " ed-ib-on" : ""}`}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <button className="ed-mini" disabled={readOnly} onClick={() => fileRef.current?.click()}>Import SVG…</button>
      <input ref={fileRef} type="file" hidden aria-label="Import SVG file" accept=".svg,image/svg+xml"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {importError && <p role="alert" className="ed-err">{importError}</p>}
      {tab === "basic" ? (
        <>
          <input type="search" aria-label="Search elements" placeholder="Search elements (blob, sparkle, badge…)" value={text}
            onChange={(e) => setText(e.target.value)} />
          <div className="chips" role="group" aria-label="Element categories">
            {(["All", ...ELEMENT_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" className="ed-kchip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          {cat === "All" && filteredBasic.length > 0 && (
            <div className="ed-shapegrid">
              {filteredBasic.map((s) => (
                <button key={s.kind} className="ed-shape" disabled={readOnly} onClick={() => onTool(s.kind)}>
                  {s.icon}<span>{s.label.replace(/ \(.\)$/, "")}</span>
                </button>
              ))}
            </div>
          )}
          <div className="ed-shapegrid">
            {filteredElements.map((el) => (
              <button key={el.id} className="ed-shape" disabled={readOnly} title={el.name} onClick={() => insert(el)}>
                <svg viewBox={thumbBox(el)} width="36" height="36" aria-hidden="true">
                  <path d={el.d} fill={el.fill?.color ?? "#8E1EA2"} fillRule={el.fillRule} />
                </svg>
                <span>{el.name}</span>
              </button>
            ))}
          </div>
          {filteredBasic.length === 0 && filteredElements.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>No elements match “{text.trim()}”</p>
          )}
        </>
      ) : tab === "svg" ? (
        <>
          <input type="search" aria-label="Search SVG visuals" placeholder="Search SVG visuals" value={text} onChange={(e) => setText(e.target.value)} />
          {!svgs.res ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
            : "error" in svgs.res ? (
              <div><p role="alert" className="ed-err">{svgs.res.error}</p><button className="ed-mini" onClick={svgs.retry}>Retry</button></div>
            ) : !svgs.res.assets.length ? <p className="muted" style={{ fontSize: 13 }}>No SVG visuals in this workspace yet</p>
              : (
                <div className="ed-shapegrid">
                  {svgs.res.assets.map((a) => (
                    <button key={a.id} className="ed-shape" disabled={readOnly} title={a.title}
                      onClick={() => void placeAsset(ydoc, page, designId, a, act, onSelect).then((e) => setImportError(e ?? ""))}>
                      <img src={assetUrl(a.id, "thumb")} alt="" loading="lazy" />
                      <span>{a.title}</span>
                    </button>
                  ))}
                </div>
              )}
        </>
      ) : (
        <>
          <input type="search" aria-label="Search shapes" placeholder="Search shapes" value={text} onChange={(e) => setText(e.target.value)} />
          {!res ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
            : "error" in res ? (
              <div><p role="alert" className="ed-err">{res.error}</p><button className="ed-mini" onClick={retry}>Retry</button></div>
            ) : !res.shapes.length ? <p className="muted" style={{ fontSize: 13 }}>No shapes yet</p>
              : (
                <div className="ed-shapegrid">
                  {res.shapes.map((s) => (
                    <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button className="ed-shape" disabled={readOnly} title={s.name} onClick={() => insert(s)}>
                        <ShapeThumb s={s} />
                        <span>{s.name}</span>
                      </button>
                      {!s.mine && <button className="ed-mini" aria-label={`Report ${s.name}`} onClick={() => setReporting(s)}>Report</button>}
                    </div>
                  ))}
                </div>
              )}
        </>
      )}
      {reporting && <ReportDialog target={{ type: "shape", id: reporting.id, title: reporting.name }} onClose={() => setReporting(null)} />}
    </aside>
  );
}
