import * as Y from "yjs";
import { addPage, movePage, removePage, renamePage } from "@cherry/doc";
import { InlineName } from "./Layers";
import { IconCopy, IconDown, IconTrash, IconUp } from "../icons";

type Props = {
  ydoc: Y.Doc; pages: { id: string; name: string }[]; pageId: string; readOnly: boolean;
  act(fn: () => void): void; onSwitch(pageId: string): void;
};

export default function Pages({ ydoc, pages, pageId, readOnly, act, onSwitch }: Props) {
  const add = (opts: { after: string; copyOf?: string }) => {
    let id = "";
    act(() => { id = addPage(ydoc, opts); });
    onSwitch(id);
  };
  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Pages</h2>
      <ul className="ed-list">
        {pages.map((p, i) => (
          <li key={p.id} className="ed-pagerow">
            <InlineName name={p.name} label={`${i + 1} · ${p.name}`} editable={!readOnly} pressed={p.id === pageId}
              className={`ed-lay${p.id === pageId ? " ed-lay-on" : ""}`}
              onClick={() => onSwitch(p.id)} onRename={(name) => act(() => renamePage(ydoc, p.id, name))} />
            {p.id === pageId && <>
              <button className="ed-icon" aria-label="Duplicate" title="Duplicate" disabled={readOnly} onClick={() => add({ after: p.id, copyOf: p.id })}><IconCopy /></button>
              <button className="ed-icon" aria-label="Delete" title="Delete" disabled={readOnly || pages.length === 1} onClick={() => act(() => removePage(ydoc, p.id))}><IconTrash /></button>
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
