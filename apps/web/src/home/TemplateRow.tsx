import type { StarterTemplate } from "@cherry/doc";
import { templateThumbUrl, type Template } from "../api";
import DocPreview from "../editor/DocPreview";
import { useInView } from "./useInView";

export type Pick = { id: string; name: string; starter?: StarterTemplate; template?: Template };

/**
 * One template tile: a live preview for a starter, the stored thumbnail for a workspace or public template.
 * A starter's Konva preview mounts only once the tile is near the viewport (as RecentCard does).
 */
export function TemplateTile({ t, disabled, onUse }: { t: Pick; disabled: boolean; onUse(t: Pick): void }) {
  const [ref, near] = useInView<HTMLLIElement>();
  const page = t.starter?.doc.pages[0];
  const k = page ? Math.min(160 / page.width, 160 / page.height) : 0;
  return (
    <li ref={ref} className="tpl-item">
      <button type="button" className="tpl-btn" aria-label={`Use ${t.name}`} disabled={disabled} onClick={() => onUse(t)}>
        <span className="tpl-thumb">
          {t.starter && page
            ? near && <DocPreview doc={t.starter.doc} pageId={page.id} width={page.width * k} height={page.height * k} />
            : <img src={templateThumbUrl(t.id)} alt="" />}
        </span>
        <strong className="ell tpl-name">{t.name}</strong>
      </button>
    </li>
  );
}
