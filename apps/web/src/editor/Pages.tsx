import * as Y from "yjs";
import { addPage, movePage, type CherryDocument } from "@cherry/doc";
import DocPreview from "./DocPreview";
import HScroll from "../HScroll";
import Modal from "../Modal";
import { IconDown, IconPlus, IconUp } from "../icons";

type Props = { ydoc: Y.Doc; doc: CherryDocument; pageId: string; readOnly: boolean; act(fn: () => void): void; onSwitch(pageId: string): void };

const Thumb = ({ doc, pageId, h }: { doc: CherryDocument; pageId: string; h: number }) => {
  const p = doc.pages.find((x) => x.id === pageId)!;
  return <DocPreview doc={doc} pageId={pageId} width={Math.min(h * 2, (h * p.width) / p.height)} height={h} />;
};

/** The bottom bar's page strip: one thumbnail per page (click to switch) and Add page. */
export default function Pages({ ydoc, doc, pageId, readOnly, act, onSwitch }: Props) {
  return (
    <HScroll as="nav" label="Pages" className="ed-strip" step={160} compact>
      {doc.pages.map((p, i) => (
        <button key={p.id} type="button" className="ed-thumb" aria-label={`Page ${i + 1}`} title={p.name} aria-current={p.id === pageId ? "page" : undefined}
          onClick={() => onSwitch(p.id)}>
          <Thumb doc={doc} pageId={p.id} h={36} />
        </button>
      ))}
      <button type="button" className="ed-thumb ed-thumb-add" aria-label="Add page" title="Add page" disabled={readOnly}
        onClick={() => { let id = ""; act(() => { id = addPage(ydoc, { after: pageId }); }); onSwitch(id); }}><IconPlus /></button>
    </HScroll>
  );
}

/** Every page at once, to switch to one or reorder them. */
export function PageGrid({ ydoc, doc, pageId, readOnly, act, onSwitch, onClose }: Props & { onClose(): void }) {
  const n = doc.pages.length;
  return (
    <Modal title="All pages" onClose={onClose} closeButton className="ed-grid-dlg">
      <ol className="ed-pgrid">
        {doc.pages.map((p, i) => (
          <li key={p.id} className={p.id === pageId ? "on" : undefined}>
            <button type="button" className="ed-gthumb" aria-label={`Page ${i + 1}`} title={p.name} onClick={() => { onSwitch(p.id); onClose(); }}>
              <Thumb doc={doc} pageId={p.id} h={110} />
            </button>
            <div className="ed-gfoot">
              <span className="ell">{i + 1}. {p.name}</span>
              <button type="button" className="ed-icon" aria-label={`Move page ${i + 1} earlier`} title="Move earlier" disabled={readOnly || i === 0}
                onClick={() => act(() => movePage(ydoc, p.id, i - 1))}><IconUp /></button>
              <button type="button" className="ed-icon" aria-label={`Move page ${i + 1} later`} title="Move later" disabled={readOnly || i === n - 1}
                onClick={() => act(() => movePage(ydoc, p.id, i + 1))}><IconDown /></button>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
