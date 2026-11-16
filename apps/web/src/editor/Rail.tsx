import type { ReactNode } from "react";
import { IconBrand, IconLayers, IconShapes, IconTemplate, IconText, IconUpload } from "../icons";
import { PEN } from "./Toolbar";

export type RailItem = "templates" | "elements" | "text" | "uploads" | "brand" | "draw" | "layers";

export const RAIL: [RailItem, string, ReactNode][] = [
  ["templates", "Templates", <IconTemplate />], ["elements", "Elements", <IconShapes />], ["text", "Text", <IconText />],
  ["uploads", "Uploads", <IconUpload />], ["brand", "Brand", <IconBrand />], ["draw", "Draw", PEN], ["layers", "Layers", <IconLayers />],
];
export const RAIL_LABEL = Object.fromEntries(RAIL.map(([id, label]) => [id, label])) as Record<RailItem, string>;

/** The editor's panel switcher: a left column on desktop, a bottom bar on phones. `only` disables every other item. */
export default function Rail({ value, issues, only, onPick }: {
  value: RailItem | null; issues: number; only?: RailItem; onPick(item: RailItem): void;
}) {
  return (
    // Enter/Space activate the focused button; keep them from the editor's global shortcuts.
    <nav aria-label="Editor panels" className="ed-rail" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}>
      {RAIL.map(([id, label, icon]) => {
        const badge = id === "brand" && issues > 0;
        return (
          <button key={id} type="button" className="ed-rb" aria-pressed={value === id} disabled={!!only && only !== id}
            aria-label={badge ? `${label}, ${issues} ${issues === 1 ? "issue" : "issues"}` : label}
            onClick={() => onPick(id)}>
            {icon}<span>{label}</span>
            {badge && <b className="ed-rbadge" aria-hidden="true">{issues}</b>}
          </button>
        );
      })}
    </nav>
  );
}
