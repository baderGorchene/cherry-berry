import type { ReactNode } from "react";
import type { BasicShape } from "@cherry/doc";
import type { Tool } from "./Canvas";

const svg = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{d}</svg>
);

const SHAPES: { kind: BasicShape; label: string; icon: ReactNode }[] = [
  { kind: "rect", label: "Rectangle (R)", icon: svg(<rect x="4" y="5" width="16" height="14" rx="1" />) },
  { kind: "ellipse", label: "Ellipse (O)", icon: svg(<ellipse cx="12" cy="12" rx="8" ry="7" />) },
  { kind: "triangle", label: "Triangle", icon: svg(<path d="M12 4l8 15H4z" />) },
  { kind: "line", label: "Line (L)", icon: svg(<path d="M5 19L19 5" />) },
  { kind: "star", label: "Star", icon: svg(<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />) },
  { kind: "arrow", label: "Arrow", icon: svg(<path d="M4 12h14M13 6l6 6-6 6" />) },
];

/** Every button arms a tool; Text and shape tools then place on the canvas (click, or drag out a box). */
export default function Toolbar({ readOnly, tool, onTool }: { readOnly: boolean; tool: Tool; onTool(t: Tool): void }) {
  const on = (t: Tool) => ({
    className: `ed-ib${tool === t ? " ed-ib-on" : ""}`, "aria-pressed": tool === t, disabled: readOnly, onClick: () => onTool(t),
  });
  return (
    <nav aria-label="Tools" className="ed-rail">
      <button {...on("select")} aria-label="Select (V)" title="Select (V)">
        {svg(<path d="M5 3l14 8-6 2-2 6z" />)}
      </button>
      <button {...on("text")} aria-label="Text (T)" title="Text (T)">
        {svg(<path d="M5 5h14M12 5v14" />)}
      </button>
      {SHAPES.map((s) => (
        <button key={s.kind} {...on(s.kind)} aria-label={s.label} title={s.label}>
          {s.icon}
        </button>
      ))}
    </nav>
  );
}
