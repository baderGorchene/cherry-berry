import type { StarterTemplate } from "@cherry/doc";
import { templateThumbUrl, type Template } from "../api";
import DocPreview from "../editor/DocPreview";

export type Pick = { id: string; name: string; starter?: StarterTemplate; template?: Template };

/** One template tile: a live preview for a starter, the stored thumbnail for a workspace or public template. */
export function TemplateTile({ t, disabled, onUse }: { t: Pick; disabled: boolean; onUse(t: Pick): void }) {
  const page = t.starter?.doc.pages[0];
  const k = page ? Math.min(160 / page.width, 160 / page.height) : 0;
  return (
    <li className="tpl-item">
      <button type="button" className="tpl-btn" aria-label={`Use ${t.name}`} disabled={disabled} onClick={() => onUse(t)}>
        <span className="tpl-thumb">
          {t.starter && page
            ? <DocPreview doc={t.starter.doc} pageId={page.id} width={page.width * k} height={page.height * k} />
            : <img src={templateThumbUrl(t.id)} alt="" />}
        </span>
        <strong className="ell tpl-name">{t.name}</strong>
      </button>
    </li>
  );
}
