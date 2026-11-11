import { useEffect, useState } from "react";
import type { Paint, Stroke } from "@cherry/doc";
import { errorMessage, listShapes, type NewShape, type Shape, type Visibility } from "../api";

export type ShapeTab = "mine" | "workspace" | "public";

/** Debounced (250 ms) search plus fetch for a library tab; `null` tab idles. `retry` refetches. */
export function useShapeList(tab: ShapeTab | null, workspaceId: string | undefined, text: string) {
  const [q, setQ] = useState("");
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<{ shapes: Shape[] } | { error: string } | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    if (!tab || !workspaceId) return;
    let stale = false;
    setRes(null);
    listShapes(tab, { workspaceId, q }).then((r) => !stale && setRes(r), (e) => !stale && setRes({ error: errorMessage(e) }));
    return () => { stale = true; };
  }, [tab, q, tries, workspaceId]);
  return { res, setRes, retry: () => setTries((n) => n + 1) };
}

export type ShapeForm = { name: string; tags: string; visibility: Visibility };

export function shapePayload(f: ShapeForm, workspaceId: string, g: { d: string; fillRule: "nonzero" | "evenodd"; fill?: Paint | null; stroke?: Stroke | null }): NewShape {
  return {
    name: f.name.trim(), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), visibility: f.visibility,
    ...(f.visibility === "workspace" ? { workspaceId } : {}),
    d: g.d, fillRule: g.fillRule, ...(g.fill ? { fill: g.fill } : {}), ...(g.stroke ? { stroke: g.stroke } : {}),
  };
}

/** Name, Tags and Share with. `label`/`input` are the host page's class names. */
export function ShapeFields({ value, onChange, viewer, label = "", input = "", autoFocus }: {
  value: ShapeForm; onChange(v: ShapeForm): void; viewer: boolean; label?: string; input?: string; autoFocus?: boolean;
}) {
  return (
    <>
      <label className={label}><b>Name</b>
        <input className={input} autoFocus={autoFocus} required maxLength={80} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <label className={label}><b>Tags</b>
        <input className={input} value={value.tags} placeholder="comma, separated" onChange={(e) => onChange({ ...value, tags: e.target.value })} />
      </label>
      <label className={label}><b>Share with</b>
        <select className={input} value={value.visibility} onChange={(e) => onChange({ ...value, visibility: e.target.value as Visibility })}>
          <option value="private">Only me</option>
          <option value="workspace" disabled={viewer}>This workspace</option>
          <option value="public">Everyone (public)</option>
        </select>
      </label>
    </>
  );
}

export const useShapeForm = (name = "") => useState<ShapeForm>({ name, tags: "", visibility: "private" });
