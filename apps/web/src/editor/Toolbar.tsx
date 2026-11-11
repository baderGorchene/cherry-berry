import type { ReactNode } from "react";
import * as Y from "yjs";
import { addNode, createShape, createText, type BasicShape, type CherryNode } from "@cherry/doc";

type Page = { id: string; width: number; height: number };

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

export default function Toolbar({ ydoc, page, readOnly, act, onInserted }: {
  ydoc: Y.Doc; page: Page; readOnly: boolean; act(fn: () => void): void; onInserted(id: string): void;
}) {
  const insert = (node: CherryNode) => { act(() => addNode(ydoc, page.id, node)); onInserted(node.id); };
  const addShape = (kind: BasicShape) => {
    const s = Math.min(page.width, page.height) * 0.25;
    insert(createShape(kind, { x: (page.width - s) / 2, y: (page.height - s) / 2, width: s, height: s }));
  };
  const addText = () => insert(createText({ x: page.width * 0.2, y: page.height / 2 }, page.width * 0.6));

  return (
    <nav aria-label="Tools" className="ed-rail">
      <button className="ed-ib ed-ib-on" aria-label="Select (V)" title="Select (V)" aria-pressed="true" disabled={readOnly}>
        {svg(<path d="M5 3l14 8-6 2-2 6z" />)}
      </button>
      <button className="ed-ib" aria-label="Text (T)" title="Text (T)" disabled={readOnly} onClick={addText}>
        {svg(<path d="M5 5h14M12 5v14" />)}
      </button>
      {SHAPES.map((s) => (
        <button key={s.kind} className="ed-ib" aria-label={s.label} title={s.label} disabled={readOnly} onClick={() => addShape(s.kind)}>
          {s.icon}
        </button>
      ))}
    </nav>
  );
}
