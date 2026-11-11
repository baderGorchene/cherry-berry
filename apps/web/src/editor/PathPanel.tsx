import * as Y from "yjs";
import type { CherryNode, Page } from "@cherry/doc";
import { moveAnchors, setAnchorKind, setClosed, type Anchor, type AnchorRef, type PathModel } from "@cherry/vector";
import { anchorAt, commitEdit, editModel, toLocal, toPage, validRefs } from "./PathEditor";
import { Num } from "./Properties";

const KINDS: [Anchor["kind"], string][] = [["corner", "Corner"], ["smooth", "Smooth"], ["symmetric", "Symmetric"]];
const RULES: ["nonzero" | "evenodd", string][] = [["nonzero", "Non-zero"], ["evenodd", "Even-odd"]];

function Segmented<T extends string>({ label, options, value, onPick }: {
  label: string; options: [T, string][]; value: T | null; onPick(v: T): void;
}) {
  return (
    <div className="ed-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={value === v} onClick={() => value !== v && onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

/** Properties content while a path is in point-edit mode. Every change is one `commitEdit` (one undo step). */
export default function PathPanel({ ydoc, page, node, anchors, act }: {
  ydoc: Y.Doc; page: Page; node: CherryNode; anchors: AnchorRef[]; act(fn: () => void): void;
}) {
  const model = editModel(node);
  if (!model) return null;
  const commit = (m: PathModel, patch?: { fillRule: "nonzero" | "evenodd" }) => commitEdit(ydoc, page, node, m, act, patch);
  const sel = validRefs(model, anchors);
  const ref = sel[0], a = ref && anchorAt(model, ref)!;
  const at = a && toPage(node, a);
  const moveTo = (x: number, y: number) => {
    const l = toLocal(node, { x, y });
    commit(moveAnchors(model, [ref!], l.x - a!.x, l.y - a!.y));
  };
  const kind = a && sel.every((r) => anchorAt(model, r)!.kind === a.kind) ? a.kind : null;
  const closed = model.every((sp) => sp.closed);
  const fillRule = node.kind === "path" ? node.fillRule ?? "nonzero" : "nonzero";

  return (
    <aside aria-label="Path properties" className="ed-props">
      <section className="ed-sec">
        <h2 className="ed-ph">Selected point</h2>
        {at ? (
          <>
            <div className="ed-grid">
              <Num label="X" unit={page.unit} value={at.x} disabled={false} onCommit={(x) => moveTo(x, at.y)} />
              <Num label="Y" unit={page.unit} value={at.y} disabled={false} onCommit={(y) => moveTo(at.x, y)} />
            </div>
            <Segmented label="Point kind" options={KINDS} value={kind}
              onPick={(k) => commit(sel.reduce((m, r) => setAnchorKind(m, r, k), model))} />
          </>
        ) : <p className="muted" style={{ fontSize: 13, margin: 0 }}>Select a point to edit it.</p>}
      </section>
      <section className="ed-sec">
        <h2 className="ed-ph">Path</h2>
        <div className="ed-grid">
          <label className="ed-f"><b>Points</b>
            <input aria-label="Points" readOnly value={model.reduce((s, sp) => s + sp.anchors.length, 0)} />
          </label>
          <label className="ed-f"><b>Closed</b>
            <input type="checkbox" aria-label="Closed" checked={closed}
              onChange={(e) => commit(model.reduce((m, _, i) => setClosed(m, i, e.target.checked), model))} />
          </label>
        </div>
        <Segmented label="Fill rule" options={RULES} value={fillRule} onPick={(r) => commit(model, { fillRule: r })} />
      </section>
    </aside>
  );
}
