import * as Y from "yjs";
import { addPage, movePage, removePage, renamePage } from "@cherry/doc";
import { InlineName } from "./Layers";

type Props = {
  ydoc: Y.Doc; pages: { id: string; name: string }[]; pageId: string; readOnly: boolean;
  onSwitch(pageId: string): void;
};

export default function Pages({ ydoc, pages, pageId, readOnly, onSwitch }: Props) {
  return (
    <section className="ed-sec">
      <h2 className="ed-ph">Pages</h2>
      <ul className="ed-list">
        {pages.map((p, i) => (
          <li key={p.id} className="ed-pagerow">
            <InlineName name={p.name} label={`${i + 1} · ${p.name}`} editable={!readOnly} pressed={p.id === pageId}
              className={`ed-lay${p.id === pageId ? " ed-lay-on" : ""}`}
              onClick={() => onSwitch(p.id)} onRename={(name) => renamePage(ydoc, p.id, name)} />
            <span className="ed-actions">
              <button className="ed-mini" disabled={readOnly} onClick={() => onSwitch(addPage(ydoc, { after: p.id, copyOf: p.id }))}>Duplicate</button>
              <button className="ed-mini" disabled={readOnly || pages.length === 1} onClick={() => removePage(ydoc, p.id)}>Delete</button>
              <button className="ed-mini" disabled={readOnly || i === 0} onClick={() => movePage(ydoc, p.id, i - 1)}>Move up</button>
              <button className="ed-mini" disabled={readOnly || i === pages.length - 1} onClick={() => movePage(ydoc, p.id, i + 1)}>Move down</button>
            </span>
          </li>
        ))}
      </ul>
      <button className="btn ed-add" disabled={readOnly} onClick={() => onSwitch(addPage(ydoc, { after: pageId }))}>+ Add page</button>
    </section>
  );
}
