import * as Y from "yjs";
import { addPage, movePage, removePage, renamePage, type CherryNode } from "@cherry/doc";
import { InlineName } from "./Layers";
import type { Role } from "../api";
import { hasBrandLock } from "./brandLock";
import { IconCopy, IconDown, IconTrash, IconUp } from "../icons";

type Props = {
  ydoc: Y.Doc; pages: { id: string; name: string; nodes: CherryNode[] }[]; pageId: string; readOnly: boolean; role: Role;
  act(fn: () => void): void; onSwitch(pageId: string): void;
};

export default function Pages({ ydoc, pages, pageId, readOnly, role, act, onSwitch }: Props) {
  const add = (opts: { after: string; copyOf?: string; keepLocks?: boolean }) => {
    let id = "";
    act(() => { id = addPage(ydoc, opts); });
    onSwitch(id);
  };
  const locked = (p: { nodes: CherryNode[] }) => role === "editor" && hasBrandLock(p.nodes);
  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Pages</h2>
      <ul className="ed-list">
        {pages.map((p, i) => (
          <li key={p.id} className={`ed-pagerow${p.id === pageId ? " ed-layrow-on" : ""}`}>
            <span className="ed-pnum" aria-hidden="true">{i + 1}</span>
            <InlineName name={p.name} label={p.name} editable={!readOnly} pressed={p.id === pageId}
              className={`ed-lay${p.id === pageId ? " ed-lay-on" : ""}`}
              onClick={() => onSwitch(p.id)} onRename={(name) => act(() => renamePage(ydoc, p.id, name))} />
            {p.id === pageId && <>
              <button className="ed-icon" aria-label="Duplicate" title="Duplicate" disabled={readOnly} onClick={() => add({ after: p.id, copyOf: p.id, keepLocks: role !== "editor" })}><IconCopy /></button>
              <button className="ed-icon" aria-label="Delete" title={locked(p) ? "Contains brand-locked layers" : "Delete"} disabled={readOnly || pages.length === 1 || locked(p)} onClick={() => act(() => removePage(ydoc, p.id))}><IconTrash /></button>
              <button className="ed-icon" aria-label="Move up" title="Move up" disabled={readOnly || i === 0} onClick={() => act(() => movePage(ydoc, p.id, i - 1))}><IconUp /></button>
              <button className="ed-icon" aria-label="Move down" title="Move down" disabled={readOnly || i === pages.length - 1} onClick={() => act(() => movePage(ydoc, p.id, i + 1))}><IconDown /></button>
            </>}
          </li>
        ))}
      </ul>
      <button className="btn ed-add" disabled={readOnly} onClick={() => add({ after: pageId })}>+ Add page</button>
    </section>
  );
}
