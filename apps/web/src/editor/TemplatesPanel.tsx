import { useEffect, useState } from "react";
import { STARTER_TEMPLATES, type CherryDocument, type Page } from "@cherry/doc";
import { errorMessage, listTemplates, templateThumbUrl, type Template } from "../api";
import DocPreview from "./DocPreview";

type Item = { id: string; name: string; width: number; height: number; unit: string; doc?: CherryDocument };

/** Same unit and aspect ratio within 2%. */
export const fitsPage = (t: Pick<Item, "width" | "height" | "unit">, page: Pick<Page, "width" | "height" | "unit">) =>
  t.unit === page.unit && Math.abs((t.width / t.height) / (page.width / page.height) - 1) <= 0.02;

const STARTERS: Item[] = STARTER_TEMPLATES.map((s) => {
  const p = s.doc.pages[0]!;
  return { id: s.id, name: s.name, width: p.width, height: p.height, unit: p.unit, doc: s.doc };
});

/**
 * Starters plus the workspace's and public templates, "Fits this page" first. A starter's pages are inserted after the
 * current page; a server template only offers its thumbnail here (the API doesn't expose its document), so it opens as a new design.
 */
export default function TemplatesPanel({ page, workspaceId, readOnly, onInsert, onOpen }: {
  page: Page; workspaceId: string; readOnly: boolean; onInsert(pages: Page[]): void; onOpen(templateId: string): Promise<void>;
}) {
  const [server, setServer] = useState<Template[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    Promise.all([listTemplates("workspace", { workspaceId }), listTemplates("public")]).then(([w, p]) => {
      if (!stale) setServer([...w, ...p.filter((t) => !w.some((x) => x.id === t.id))]);
    }, () => {});
    return () => { stale = true; };
  }, [workspaceId]);
  const items: Item[] = [...STARTERS, ...server.map((t) => ({ id: t.id, name: t.name, width: t.width, height: t.height, unit: t.unit }))];
  const card = (t: Item) => {
    const size = <span className="muted">{t.width} × {t.height} {t.unit}{t.doc && t.doc.pages.length > 1 ? ` · ${t.doc.pages.length} pages` : ""}</span>;
    return t.doc ? (
      <li key={t.id}>
        <button type="button" className="ed-tpl" disabled={readOnly} aria-label={`Insert ${t.name}`} title="Add its pages after this page" onClick={() => onInsert(t.doc!.pages)}>
          <span className="ed-tpl-img"><DocPreview doc={t.doc} pageId={t.doc.pages[0]!.id} width={130} height={96} /></span>
          <b className="ell">{t.name}</b>{size}
        </button>
      </li>
    ) : (
      <li key={t.id}>
        <div className="ed-tpl">
          <span className="ed-tpl-img"><img src={templateThumbUrl(t.id)} alt="" loading="lazy" /></span>
          <b className="ell">{t.name}</b>{size}
          <button type="button" className="ed-mini" disabled={readOnly} aria-label={`Open ${t.name} as a new design`}
            onClick={() => { setError(""); onOpen(t.id).catch((e) => setError(errorMessage(e))); }}>Open as new design</button>
        </div>
      </li>
    );
  };
  const fit = items.filter((t) => fitsPage(t, page)), other = items.filter((t) => !fitsPage(t, page));
  return (
    <aside aria-label="Templates panel" className="ed-shapes">
      {error && <p role="alert" className="ed-err">{error}</p>}
      <section className="ed-sec" aria-labelledby="tpl-fit">
        <h2 id="tpl-fit" className="ed-ph">Fits this page</h2>
        {fit.length ? <ul className="ed-tplgrid">{fit.map(card)}</ul>
          : <p className="muted" style={{ fontSize: 13, margin: 0 }}>None at {page.width} × {page.height} {page.unit} yet. Templates below add pages of their own size.</p>}
      </section>
      <section className="ed-sec" aria-labelledby="tpl-other">
        <h2 id="tpl-other" className="ed-ph">Other sizes</h2>
        <ul className="ed-tplgrid">{other.map(card)}</ul>
      </section>
    </aside>
  );
}
