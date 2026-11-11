import { useState, type MouseEvent, type ReactNode } from "react";
import * as Y from "yjs";
import { reorderNode, updateNode, type CherryNode } from "@cherry/doc";

const GLYPH: Record<CherryNode["kind"], string> = { rect: "□", ellipse: "○", path: "◇", text: "T", image: "▣", group: "▾" };

/** A name that turns into a text field on double-click; commits on Enter/blur, Escape cancels. */
export function InlineName({ name, label, editable, className, pressed, onClick, onRename }: {
  name: string; label: string; editable: boolean; className: string; pressed: boolean;
  onClick(e: MouseEvent): void; onRename(name: string): void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <input className="ed-rename" aria-label={`Rename ${name}`} defaultValue={name} autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => { setEditing(false); const v = e.currentTarget.value.trim(); if (v && v !== name) onRename(v); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { e.currentTarget.value = name; e.currentTarget.blur(); }
      }} />
  );
  return (
    <button className={className} aria-pressed={pressed} onClick={onClick} onDoubleClick={() => editable && setEditing(true)}>
      {label}
    </button>
  );
}

type Props = {
  ydoc: Y.Doc; pageId: string; nodes: CherryNode[]; selected: string[]; readOnly: boolean;
  onSelect(ids: string[]): void;
};

export default function Layers({ ydoc, pageId, nodes, selected, readOnly, onSelect }: Props) {
  const one = selected.length === 1 ? selected[0]! : null;
  const click = (id: string, e: MouseEvent) => {
    if (!e.shiftKey) return onSelect([id]);
    onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  const rows = (list: CherryNode[], depth: number): ReactNode[] =>
    [...list].reverse().flatMap((n) => [
      <li key={n.id} className="ed-layrow" style={{ paddingLeft: depth * 16 }}>
        <span aria-hidden="true" className="ed-glyph">{GLYPH[n.kind]}</span>
        <InlineName name={n.name} label={n.name} editable={!readOnly} pressed={selected.includes(n.id)}
          className={`ed-lay${selected.includes(n.id) ? " ed-lay-on" : ""}`}
          onClick={(e) => click(n.id, e)} onRename={(name) => updateNode(ydoc, pageId, n.id, { name })} />
        <button className="ed-mini" disabled={readOnly} onClick={() => updateNode(ydoc, pageId, n.id, { hidden: !n.hidden })}>
          {n.hidden ? "Show" : "Hide"}
        </button>
        <button className="ed-mini" disabled={readOnly} onClick={() => updateNode(ydoc, pageId, n.id, { locked: !n.locked })}>
          {n.locked ? "Unlock" : "Lock"}
        </button>
      </li>,
      ...(n.kind === "group" ? rows(n.children, depth + 1) : []),
    ]);

  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Layers</h2>
      {nodes.length === 0
        ? <p className="muted" style={{ fontSize: 13, padding: "0 8px" }}>No layers yet. Add a shape or text from the tools.</p>
        : <ul className="ed-list">{rows(nodes, 0)}</ul>}
      <div className="ed-actions">
        <button className="ed-mini" disabled={readOnly || !one} onClick={() => one && reorderNode(ydoc, pageId, one, "forward")}>Bring forward</button>
        <button className="ed-mini" disabled={readOnly || !one} onClick={() => one && reorderNode(ydoc, pageId, one, "backward")}>Send backward</button>
      </div>
    </section>
  );
}
