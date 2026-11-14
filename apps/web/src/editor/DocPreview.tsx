import { Group, Layer, Rect, Stage } from "react-konva";
import type { CherryDocument } from "@cherry/doc";
import { NodeView, paint } from "./Canvas";
import { toKonvaAttrs } from "./geometry";

/**
 * A non-interactive render of one page, scaled to fit width x height. `highlight` outlines top-level nodes by id;
 * `ghost` draws that document's same page at 40 % opacity on top.
 */
export default function DocPreview({ doc, pageId, width, height, highlight = [], ghost }: {
  doc: CherryDocument; pageId: string; width: number; height: number; highlight?: string[]; ghost?: CherryDocument;
}) {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return <div className="hist-nopage" style={{ width, height }}>This page didn't exist yet.</div>;
  const scale = Math.min(width / page.width, height / page.height);
  const ghostPage = ghost?.pages.find((p) => p.id === pageId);
  const pad = 4 / scale;
  const view = (n: (typeof page.nodes)[number]) => <NodeView key={n.id} n={n} unit={page.unit} top={false} editing={null} inert />;
  return (
    <Stage width={page.width * scale} height={page.height * scale} listening={false}>
      <Layer listening={false}>
        <Group scaleX={scale} scaleY={scale}>
          <Rect width={page.width} height={page.height} fill={paint(page.background)} />
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
