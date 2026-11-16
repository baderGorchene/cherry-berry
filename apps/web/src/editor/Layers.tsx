import { useState, type MouseEvent, type ReactNode } from "react";
import * as Y from "yjs";
import { reorderNode, updateNode, type CherryNode } from "@cherry/doc";
import { assetUrl, type Role } from "../api";
import { canEditContent, canMove } from "./brandLock";
import { IconDown, IconEye, IconEyeOff, IconLock, IconUnlock, IconUp } from "../icons";

const fillOf = (n: { fill?: { color: string; opacity: number } }) => n.fill?.color || "none";
const strokeOf = (n: { stroke?: { paint: { color: string }; width: number } }) =>
  n.stroke ? { stroke: n.stroke.paint.color, strokeWidth: Math.max(1.5, Math.min(3, n.stroke.width)) } : {};

/** Miniature visual preview of the actual canvas element. */
function LayerThumb({ n }: { n: CherryNode }) {
  if (n.kind === "image") {
    return (
      <span className="ed-lthumb" aria-hidden="true">
        <img src={assetUrl(n.assetId, "thumb")} alt="" loading="lazy" />
      </span>
    );
  }
  if (n.kind === "text") {
    return (
      <span className="ed-lthumb ed-lthumb-txt" aria-hidden="true"
        style={{ fontFamily: n.fontFamily, fontWeight: n.fontWeight, color: n.fill?.color || "var(--ink)" }}>
        Aa
      </span>
    );
  }
  if (n.kind === "group") {
    return (
      <span className="ed-lthumb ed-lthumb-grp" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="11" height="11" rx="2" fill="var(--tint)" />
          <rect x="9" y="9" width="11" height="11" rx="2" fill="#fff" />
        </svg>
      </span>
    );
  }
  const w = Math.max(1, n.width), h = Math.max(1, n.height || 1);
  return (
    <span className="ed-lthumb" aria-hidden="true">
      {n.kind === "rect" && (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <rect x="4" y="5" width="16" height="14" rx={Math.min(5, n.cornerRadius)}
            fill={fillOf(n)} {...(n.stroke ? strokeOf(n) : { stroke: fillOf(n) === "none" ? "var(--berry)" : undefined, strokeWidth: 1.5 })} />
        </svg>
      )}
      {n.kind === "ellipse" && (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="8.5" ry="7"
            fill={fillOf(n)} {...(n.stroke ? strokeOf(n) : { stroke: fillOf(n) === "none" ? "var(--berry)" : undefined, strokeWidth: 1.5 })} />
        </svg>
      )}
      {n.kind === "path" && (
        <svg width="24" height="24" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          <path d={n.d} fill={fillOf(n)} fillRule={n.fillRule}
            stroke={n.stroke?.paint.color ?? (fillOf(n) === "none" ? "var(--berry)" : undefined)}
            strokeWidth={Math.max(w, h) * 0.08} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  );
}

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

const findIn = (list: CherryNode[], id: string): CherryNode | undefined =>
  list.reduce<CherryNode | undefined>((hit, n) => hit ?? (n.id === id ? n : n.kind === "group" ? findIn(n.children, id) : undefined), undefined);

type Props = {
  ydoc: Y.Doc; pageId: string; nodes: CherryNode[]; selected: string[]; readOnly: boolean; role: Role;
  act(fn: () => void): void; onSelect(ids: string[]): void;
};

export default function Layers({ ydoc, pageId, nodes, selected, readOnly, role, act, onSelect }: Props) {
  const set = (id: string, patch: Partial<CherryNode>) => act(() => updateNode(ydoc, pageId, id, patch));
  const one = selected.length === 1 ? selected[0]! : null;
  const target = one ? findIn(nodes, one) : undefined; // a selected id can be gone for one render after a remote delete
  const movable = !target || canMove(target, role);
  const move = (to: "forward" | "backward") => one && act(() => reorderNode(ydoc, pageId, one, to));
  const click = (id: string, e: MouseEvent) => {
    if (!e.shiftKey) return onSelect([id]);
    onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  const rows = (list: CherryNode[], depth: number): ReactNode[] =>
    [...list].reverse().flatMap((n) => {
      const on = selected.includes(n.id);
      return [
        <li key={n.id} className={`ed-layrow${on ? " ed-layrow-on" : ""}`} style={{ marginLeft: depth * 14 }}>
          <LayerThumb n={n} />
          <InlineName name={n.name} label={n.name} editable={!readOnly} pressed={on}
            className={`ed-lay${on ? " ed-lay-on" : ""}`}
            onClick={(e) => click(n.id, e)} onRename={(name) => set(n.id, { name })} />
          {n.brandLock !== "none" && <span className="ed-badge">Brand</span>}
          <button className={`ed-icon${n.hidden ? " ed-icon-on" : ""}`} disabled={readOnly || !canMove(n, role)} aria-label={`${n.hidden ? "Show" : "Hide"} ${n.name}`}
            title={n.hidden ? "Show" : "Hide"} onClick={() => set(n.id, { hidden: !n.hidden })}>
            {n.hidden ? <IconEyeOff /> : <IconEye />}
          </button>
          <button className={`ed-icon${n.locked ? " ed-icon-on" : ""}`} disabled={readOnly || !canMove(n, role)} aria-label={`${n.locked ? "Unlock" : "Lock"} ${n.name}`}
            title={!canEditContent(n, role) ? "Locked by the brand template" : n.locked ? "Unlock" : "Lock"} onClick={() => set(n.id, { locked: !n.locked })}>
            {n.locked ? <IconLock /> : <IconUnlock />}
          </button>
        </li>,
        ...(n.kind === "group" ? rows(n.children, depth + 1) : []),
      ];
    });

  return (
    <section className="ed-sec">
      <div className="ed-phrow">
        <h2 className="ed-ph">Layers</h2>
        <button className="ed-icon" aria-label="Bring forward" title="Bring forward" disabled={readOnly || !one || !movable} onClick={() => move("forward")}><IconUp /></button>
        <button className="ed-icon" aria-label="Send backward" title="Send backward" disabled={readOnly || !one || !movable} onClick={() => move("backward")}><IconDown /></button>
      </div>
      {nodes.length === 0
        ? <p className="muted" style={{ fontSize: 13, padding: "0 8px" }}>No layers yet. Add a shape or text from the tools.</p>
        : <ul className="ed-list">{rows(nodes, 0)}</ul>}
    </section>
  );
}
