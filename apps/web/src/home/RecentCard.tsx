import { useEffect, useState } from "react";
import { Link } from "react-router";
import * as Y from "yjs";
import { yToDoc, type CherryDocument } from "@cherry/doc";
import { fromBase64, getDesign, type Design } from "../api";
import DocPreview from "../editor/DocPreview";
import { useInView } from "./useInView";

// 2 columns on a phone leave ~150px per tile
const BOX = () => (matchMedia("(max-width: 759px)").matches ? { w: 130, h: 100 } : { w: 190, h: 130 });

/** The first page of a design as a live render (a blank sheet until it loads, or if it can't be read). */
function useFirstPage(id: string, enabled: boolean) {
  const [doc, setDoc] = useState<CherryDocument | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    getDesign(id).then((r) => {
      try {
        const y = new Y.Doc();
        Y.applyUpdate(y, fromBase64(r.state));
        const p = yToDoc(y);
        if (!stale && p.ok) setDoc(p.doc);
      } catch { /* keep the blank sheet */ }
    }, () => {});
    return () => { stale = true; };
  }, [id, enabled]);
  return doc;
}

export default function RecentCard({ d, when }: { d: Design; when: string }) {
  const [ref, near] = useInView<HTMLAnchorElement>();
  const doc = useFirstPage(d.id, near);
  const page = doc?.pages[0];
  const box = BOX();
  const k = Math.min(box.w / d.width, box.h / d.height);
  const w = Math.round(d.width * k), h = Math.round(d.height * k);
  return (
    <Link ref={ref} to={`/d/${d.id}`} className="recent-card">
      <span className="recent-thumb">
        <span className="recent-badge">{d.colorMode.toUpperCase()}</span>
        <span data-testid="design-preview" className="recent-sheet" style={{ width: w, height: h }}>
          {doc && page && <DocPreview doc={doc} pageId={page.id} width={w} height={h} />}
        </span>
      </span>
      <strong className="ell recent-title">{d.title}</strong>
      <span className="muted recent-meta">{d.width} × {d.height} {d.unit} · {when}</span>
    </Link>
  );
}
