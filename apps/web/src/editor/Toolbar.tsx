import type { ReactNode } from "react";
import type { BasicShape } from "@cherry/doc";
import type { Tool } from "./Canvas";

const svg = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{d}</svg>
);

export const SHAPES: { kind: BasicShape; label: string; icon: ReactNode }[] = [
  { kind: "rect", label: "Rectangle (R)", icon: svg(<rect x="4" y="5" width="16" height="14" rx="1" />) },
  { kind: "ellipse", label: "Ellipse (O)", icon: svg(<ellipse cx="12" cy="12" rx="8" ry="7" />) },
  { kind: "triangle", label: "Triangle", icon: svg(<path d="M12 4l8 15H4z" />) },
  { kind: "line", label: "Line (L)", icon: svg(<path d="M5 19L19 5" />) },
  { kind: "star", label: "Star", icon: svg(<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />) },
  { kind: "arrow", label: "Arrow", icon: svg(<path d="M4 12h14M13 6l6 6-6 6" />) },
];

export const PEN = svg(<><path d="M12 19l7-7 3 3-7 7z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z" /><circle cx="11" cy="11" r="2" /></>);

/** The Draw panel: the pen, and while a path is in point-edit mode the vector tools plus `children` (the path's point properties). */
export default function DrawPanel({ readOnly, tool, editing, onTool, children }: {
  readOnly: boolean; tool: Tool; editing: boolean; onTool(t: Tool): void; children?: ReactNode;
}) {
  const on = (t: Tool, label: string) => ({
    className: `ed-ib${tool === t ? " ed-ib-on" : ""}`, "aria-pressed": tool === t, disabled: readOnly,
    // Clicking the armed pen again puts it down (which also finishes a path in progress).
    onClick: () => onTool(tool === t && t === "pen" ? "select" : t), "aria-label": label, title: label,
  });
  return (
    <aside aria-label="Draw panel" className="ed-shapes">
      {editing ? (
        <>
          <div role="group" aria-label="Vector tools" className="ed-tools">
            <button {...on("direct", "Direct select (A)")}>{svg(<path d="M5 3l14 8-6 2-2 6z" fill="currentColor" />)}</button>
            <button {...on("pen", "Pen (P)")}>{PEN}</button>
            <button {...on("add-anchor", "Add anchor point (+)")}>
              {svg(<><rect x="8" y="8" width="8" height="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>)}
            </button>
            <button {...on("convert-anchor", "Convert anchor point (Shift+C)")}>{svg(<path d="M3 20L12 4l9 16" />)}</button>
          </div>
          {children}
        </>
      ) : (
        <>
          <div role="group" aria-label="Draw tools" className="ed-tools">
            <button {...on("pen", "Pen (P)")}>{PEN}</button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Pick the pen, then click on the page to place points. Drag to pull a curve; click the first point to close the shape.
            Double-click a shape to edit its points.
          </p>
        </>
      )}
    </aside>
  );
}
