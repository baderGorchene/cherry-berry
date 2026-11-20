import { useEffect, useRef, useState } from "react";
import { errorMessage, uploadFont, type BrandKit } from "../api";

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const MAX_FONT = 5 * 1024 * 1024;

/** Uploads one font file (WOFF2, WOFF, TTF or OTF) into a brand kit; used by the Brand page and the editor's font picker. */
export default function FontDialog({ kit, onClose, onDone }: { kit: BrandKit; onClose(): void; onDone(font: BrandKit["fonts"][number]): void }) {
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState(400);
  const [italic, setItalic] = useState(false);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(f.size > MAX_FONT ? "That file is too large (5 MB max)." : "");
    setFamily((cur) => cur || f.name.replace(/\.[^.]*$/, "").slice(0, 60));
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true); setError("");
    try { onDone(await uploadFont(kit.id, file, { family: family.trim(), weight, style: italic ? "italic" : "normal" })); } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  const ok = !!file && file.size <= MAX_FONT && !!family.trim() && rights && !busy;

  return (
    <div className="overlay" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="font-h" className="card" style={{ width: "min(480px, 100%)", outline: "none" }}>
        <h2 id="font-h" className="card-title">Upload font</h2>
        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (ok) void submit(); }}>
          <div><label className="lbl" htmlFor="ff">Font file</label>
            <input id="ff" type="file" accept=".woff2,.woff,.ttf,.otf" onChange={(e) => pick(e.target.files?.[0])} /></div>
          <div><label className="lbl" htmlFor="fy">Family</label>
            <input id="fy" className="inp" maxLength={60} value={family} onChange={(e) => setFamily(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="fw">Weight</label>
            <select id="fw" className="inp" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>{WEIGHTS.map((w) => <option key={w}>{w}</option>)}</select></div>
          <label className="opt"><input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />Italic</label>
          <label className="opt"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />I have the right to use this font in this workspace.</label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="chips" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-p" disabled={!ok}>Upload</button>
          </div>
        </form>
      </div>
    </div>
  );
}
