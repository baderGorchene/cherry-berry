import { useState, type MouseEvent, type ReactNode } from "react";
import * as Y from "yjs";
import { reorderNode, updateNode, type CherryNode } from "@cherry/doc";
import { IconDown, IconEye, IconEyeOff, IconLock, IconUnlock, IconUp } from "../icons";

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
  act(fn: () => void): void; onSelect(ids: string[]): void;
};

export default function Layers({ ydoc, pageId, nodes, selected, readOnly, act, onSelect }: Props) {
  const set = (id: string, patch: Partial<CherryNode>) => act(() => updateNode(ydoc, pageId, id, patch));
  const one = selected.length === 1 ? selected[0]! : null;
  const move = (to: "forward" | "backward") => one && act(() => reorderNode(ydoc, pageId, one, to));
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
          onClick={(e) => click(n.id, e)} onRename={(name) => set(n.id, { name })} />
        <button className={`ed-icon${n.hidden ? " ed-icon-on" : ""}`} disabled={readOnly} aria-label={`${n.hidden ? "Show" : "Hide"} ${n.name}`}
          title={n.hidden ? "Show" : "Hide"} onClick={() => set(n.id, { hidden: !n.hidden })}>
          {n.hidden ? <IconEyeOff /> : <IconEye />}
        </button>
        <button className={`ed-icon${n.locked ? " ed-icon-on" : ""}`} disabled={readOnly} aria-label={`${n.locked ? "Unlock" : "Lock"} ${n.name}`}
          title={n.locked ? "Unlock" : "Lock"} onClick={() => set(n.id, { locked: !n.locked })}>
          {n.locked ? <IconLock /> : <IconUnlock />}
        </button>
      </li>,
      ...(n.kind === "group" ? rows(n.children, depth + 1) : []),
    ]);

  return (
    <section className="ed-sec">
      <div className="ed-phrow">
        <h2 className="ed-ph">Layers</h2>
        <button className="ed-icon" aria-label="Bring forward" title="Bring forward" disabled={readOnly || !one} onClick={() => move("forward")}><IconUp /></button>
        <button className="ed-icon" aria-label="Send backward" title="Send backward" disabled={readOnly || !one} onClick={() => move("backward")}><IconDown /></button>
      </div>
      {nodes.length === 0
        ? <p className="muted" style={{ fontSize: 13, padding: "0 8px" }}>No layers yet. Add a shape or text from the tools.</p>
        : <ul className="ed-list">{rows(nodes, 0)}</ul>}
    </section>
  );
}
