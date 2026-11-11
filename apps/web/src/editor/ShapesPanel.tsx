import { useEffect, useState } from "react";
import * as Y from "yjs";
import { addNode, type CherryNode, type Page } from "@cherry/doc";
import { scalePath } from "@cherry/vector";
import { errorMessage, listShapes, type Shape } from "../api";
import type { Tool } from "./Canvas";
import { SHAPES } from "./Toolbar";

const TABS = [["basic", "Basic"], ["mine", "My shapes"], ["workspace", "Workspace"], ["public", "Public"]] as const;
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

export default function ShapesPanel({ ydoc, page, workspaceId, readOnly, act, onTool, onSelect }: {
  ydoc: Y.Doc; page: Page; workspaceId: string; readOnly: boolean; act(fn: () => void): void;
  onTool(t: Tool): void; onSelect(ids: string[]): void;
}) {
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
                      <svg viewBox={thumbBox(s)} overflow="visible" width="40" height="40" aria-hidden="true">
                        <path d={s.d} fillRule={s.fillRule} fill={s.fill?.color ?? "none"} fillOpacity={s.fill?.opacity}
                          {...(s.stroke ? { stroke: s.stroke.paint.color, strokeOpacity: s.stroke.paint.opacity, strokeWidth: s.stroke.width } : {})} />
                      </svg>
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
