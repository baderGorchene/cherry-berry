import { useEffect, useState } from "react";
import { Group, Layer, Rect, Stage } from "react-konva";
import type { CherryDocument, CherryNode } from "@cherry/doc";
import { NodeView, paint } from "./Canvas";
import { toKonvaAttrs } from "./geometry";

/** Canvas text never triggers a @font-face download, so a family not yet used in the DOM measures as the fallback font. */
function fontFaces(nodes: CherryNode[], into = new Set<string>()) {
  for (const n of nodes) {
    if (n.kind === "group") fontFaces(n.children, into);
    else if (n.kind === "text") into.add(`${n.fontWeight} 16px "${n.fontFamily}"`);
  }
  return into;
}

/**
 * A non-interactive render of one page, scaled to fit width x height. `highlight` outlines top-level nodes by id;
 * `ghost` draws that document's same page at 40 % opacity on top.
 */
export default function DocPreview({ doc, pageId, width, height, highlight = [], ghost }: {
  doc: CherryDocument; pageId: string; width: number; height: number; highlight?: string[]; ghost?: CherryDocument;
}) {
  const page = doc.pages.find((p) => p.id === pageId);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let live = true;
    const faces = [...fontFaces(page ? [...page.nodes, ...(ghost?.pages.find((p) => p.id === pageId)?.nodes ?? [])] : [])];
    void Promise.all(faces.map((f) => document.fonts.load(f).catch(() => []))).then(() => { if (live) setFontsReady((c) => c + 1); });
    return () => { live = false; };
  }, [page, ghost, pageId]);
  if (!page) return <div className="hist-nopage" style={{ width, height }}>This page didn't exist yet.</div>;
  const scale = Math.min(width / page.width, height / page.height);
  const ghostPage = ghost?.pages.find((p) => p.id === pageId);
  const pad = 4 / scale;
  const view = (n: (typeof page.nodes)[number]) => <NodeView key={n.id} n={n} unit={page.unit} top={false} editing={null} inert />;
  return (
    <Stage key={fontsReady} width={page.width * scale} height={page.height * scale} listening={false}>
      <Layer listening={false}>
        <Group scaleX={scale} scaleY={scale}>
          <Rect x={-page.bleed} y={-page.bleed} width={page.width + 2 * page.bleed} height={page.height + 2 * page.bleed} fill={paint(page.background)} />
          {page.nodes.map(view)}
          {ghostPage && <Group opacity={0.4}>{ghostPage.nodes.map(view)}</Group>}
          {page.nodes.filter((n) => highlight.includes(n.id)).map((n) => {
            const a = toKonvaAttrs(n);
            return (
              <Rect key={n.id} x={a.x} y={a.y} rotation={a.rotation} offsetX={a.offsetX + pad} offsetY={a.offsetY + pad}
                width={n.width + 2 * pad} height={n.height + 2 * pad} stroke="#FFC0DE" strokeWidth={2} strokeScaleEnabled={false} dash={[6, 4]} />
            );
          })}
        </Group>
      </Layer>
    </Stage>
  );
}
