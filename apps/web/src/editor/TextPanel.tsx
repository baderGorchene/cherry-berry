import { useState } from "react";
import * as Y from "yjs";
import { FONTS, addNode, updateNode, type CherryNode, type Page } from "@cherry/doc";
import type { BrandKit, Role } from "../api";
import { canMove } from "./brandLock";
import { measureText } from "./Canvas";
import { presetPair, presetText, type TextPreset } from "./textPresets";

const ADD: [TextPreset, string, number][] = [["heading", "Add a heading", 22], ["subheading", "Add a subheading", 16], ["body", "Add a little body text", 13]];

/** The weight nearest `want` that the catalogue has for `family`. */
const weight = (family: string, want: number) =>
  (FONTS.find((f) => f.family === family)?.weights ?? [want]).reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
const PAIRS: [string, string][] = [
  ["Playfair Display", "Inter"], ["Bebas Neue", "DM Sans"], ["Montserrat", "Lora"],
  ["Abril Fatface", "Poppins"], ["Space Grotesk", "Inter"], ["Pacifico", "Montserrat"],
];

/** Text presets sized to the page, the linked kit's text styles and colours, and font pairings, each centred on `center`. */
export default function TextPanel({ ydoc, page, center, kit, readOnly, role, selected, act, onSelect }: {
  ydoc: Y.Doc; page: Page; center: { x: number; y: number }; kit: BrandKit | null; readOnly: boolean; role: Role; selected: string[];
  act(fn: () => void): void; onSelect(ids: string[]): void;
}) {
  const [note, setNote] = useState("");
  const add = (n: CherryNode) => { act(() => addNode(ydoc, page.id, n)); onSelect([n.id]); };
  const ink = kit?.content.colors.find((c) => c.role === "text");
  const paint = (hex: string) => {
    const texts = page.nodes.filter((n) => selected.includes(n.id) && n.kind === "text");
    const free = texts.filter((n) => !n.locked && canMove(n, role));
    if (!free.length) return setNote(texts.length ? "Selected text is locked" : "Select a text layer first");
    setNote("");
    act(() => free.forEach((n) => updateNode(ydoc, page.id, n.id, { fill: { type: "solid", color: hex, opacity: 1 } } as Partial<CherryNode>)));
  };
  return (
    <aside aria-label="Text panel" className="ed-shapes">
      {ADD.map(([kind, label, px]) => (
        <button key={kind} type="button" className="ed-addtext" disabled={readOnly} style={{ fontSize: px, fontWeight: kind === "body" ? 400 : kind === "heading" ? 700 : 600 }}
          onClick={() => add(presetText(kind, page, center, measureText))}>{label}</button>
      ))}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Or press T and click on the page.</p>

      {kit && (
        <section className="ed-sec">
          <h2 className="ed-ph">{kit.name}</h2>
          {(["heading", "subheading", "body"] as const).map((kind) => {
            const s = kit.content.typography[kind];
            return (
              <button key={kind} type="button" className="ed-mini ed-kitfont" disabled={readOnly} style={{ fontFamily: s.fontFamily, fontWeight: s.fontWeight }}
                aria-label={`Add brand ${kind}`}
                onClick={() => {
                  const n = presetText(kind, page, center, measureText, { fontFamily: s.fontFamily, fontWeight: s.fontWeight }) as Extract<CherryNode, { kind: "text" }>;
                  add(ink ? { ...n, fill: { type: "solid", color: ink.hex, opacity: 1 } } : n);
                }}>{s.fontFamily} · {kind}</button>
            );
          })}
          {kit.content.colors.length > 0 && (
            <div className="chips" role="group" aria-label="Brand text colours">
              {kit.content.colors.map((c) => (
                <button key={c.id} type="button" className="ed-swatch" aria-label={`Text colour ${c.name}`} title={`${c.name} ${c.hex}`} disabled={readOnly}
                  style={{ background: c.hex }} onClick={() => paint(c.hex)} />
              ))}
            </div>
          )}
          {note && <p role="status" className="muted" style={{ fontSize: 13, margin: 0 }}>{note}</p>}
        </section>
      )}

      <section className="ed-sec">
        <h2 className="ed-ph">Font pairings</h2>
        <div className="ed-pairs">
          {PAIRS.map(([a, b]) => (
            <button key={a + b} type="button" className="ed-pair" disabled={readOnly} aria-label={`${a} and ${b}`}
              onClick={() => add(presetPair(page, center, measureText, { fontFamily: a, fontWeight: weight(a, 700) }, { fontFamily: b, fontWeight: weight(b, 400) }))}>
              <b style={{ fontFamily: a, fontWeight: weight(a, 700) }}>{a}</b>
              <span style={{ fontFamily: b }}>{b}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
