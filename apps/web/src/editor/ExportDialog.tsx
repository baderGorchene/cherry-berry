import { useEffect, useRef, useState } from "react";
import {
  creditsText, preflight, serializeCherry, usedAssetIds, type CherryDocument, type ExportAsset, type ExportFormat, type PreflightCheck,
} from "@cherry/doc";
import { errorMessage, exportFile, exportInfo } from "../api";
import Modal from "../Modal";
import { FORMATS, downloadName, parsePageRange } from "./exportOptions";
import type { DesignState } from "./useDesign";

type Status = Extract<DesignState, { state: "ready" }>["status"];
type Pages = "all" | "current" | "custom";
const PRINT_NOTE = "CMYK, PDF/X and spot colors come with the print service.";

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export default function ExportDialog({ designId, doc, pageId, status, onShow, onClose }: {
  designId: string; doc: CherryDocument; pageId: string; status: Status;
  onShow(nodes: PreflightCheck["nodes"]): void; onClose(): void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf-print");
  const [pages, setPages] = useState<Pages>("all");
  const [range, setRange] = useState("");
  const [scale, setScale] = useState<1 | 2 | 3>(1);
  const [transparent, setTransparent] = useState(false);
  const [cropMarks, setCropMarks] = useState(true);
  const [seconds, setSeconds] = useState(2);
  const [info, setInfo] = useState<{ fonts: string[]; assets: ExportAsset[] } | "loading" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const credits = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { exportInfo(designId).then(setInfo, () => setInfo("failed")); }, [designId]);

  const label = FORMATS.find((f) => f.id === format)!.label;
  const cherry = format === "cherry";
  const picked = parsePageRange(range, doc.pages.length);
  const pageIds = cherry || pages === "all" ? doc.pages.map((p) => p.id)
    : pages === "current" ? [pageId] : (picked ?? []).map((i) => doc.pages[i]!.id);
  const badRange = !cherry && pages === "custom" && !picked;
  const raster = format === "png" || format === "jpg" || format === "gif";
  // Decision 9: the server exports the live document, so wait until it has every change; .cherry is built here.
  const gate = cherry ? "" : status === "offline" || status === "error" ? "Export needs a connection."
    : status === "saved" ? "" : "Saving your latest changes…";

  const checks = typeof info === "object" ? preflight(doc, { format, pageIds, scale: raster ? scale : 1 }, info) : [];
  const warnings = checks.filter((c) => c.status === "warn").length;
  const used = new Set(usedAssetIds(doc.pages.filter((p) => pageIds.includes(p.id))));
  const creditLines = typeof info === "object" ? creditsText(info.assets.filter((a) => used.has(a.id))) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(creditLines); // undefined on non-secure origins
      setCopied(true);
      setManual(false);
    } catch {
      setCopied(false);
      setManual(true);
      credits.current?.select();
    }
  };

  const run = async () => {
    setBusy(true); setError("");
    try {
      if (cherry) save(new Blob([serializeCherry(doc)], { type: "application/json" }), downloadName(doc.title, "cherry"));
      else {
        const { blob, filename } = await exportFile(designId, {
          format, pageIds,
          ...(raster ? { scale } : {}),
          ...(format === "png" ? { transparent } : {}),
          ...(format === "pdf-print" ? { cropMarks } : {}),
          ...(format === "gif" ? { secondsPerPage: seconds } : {}),
        });
        save(blob, filename);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Export "${doc.title}"`} onClose={onClose} className="exp-dlg" closeButton>
      <form className="exp-body" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <div className="exp-form">
          <fieldset className="exp-set">
            <legend className="lbl">Format</legend>
            <div className="exp-cards">
              {FORMATS.map((f) => (
                <label key={f.id} className="exp-card">
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
                  <b>{f.label}</b><span className="muted">{f.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {!cherry && (
            <fieldset className="exp-set">
              <legend className="lbl">Pages</legend>
              <label className="exp-opt"><input type="radio" name="pages" checked={pages === "all"} onChange={() => setPages("all")} /> All pages ({doc.pages.length})</label>
              <label className="exp-opt"><input type="radio" name="pages" checked={pages === "current"} onChange={() => setPages("current")} /> Current page</label>
              <label className="exp-opt"><input type="radio" name="pages" checked={pages === "custom"} onChange={() => setPages("custom")} /> Custom range</label>
              {pages === "custom" && (
                <>
                  <input className="inp" aria-label="Page range" placeholder="1-3, 5" value={range} aria-invalid={badRange}
                    aria-describedby={badRange ? "exp-range-err" : undefined} onChange={(e) => setRange(e.target.value)} />
                  {badRange && <p id="exp-range-err" className="exp-warn">Enter pages like 1-3, 5</p>}
                </>
              )}
            </fieldset>
          )}
          {raster && (
            <fieldset className="exp-set">
              <legend className="lbl">Scale</legend>
              <div className="exp-row">
                {([1, 2, 3] as const).map((s) => (
                  <label key={s} className="exp-opt"><input type="radio" name="scale" checked={scale === s} onChange={() => setScale(s)} /> {s}×</label>
                ))}
              </div>
            </fieldset>
          )}
          {format === "png" && (
            <label className="exp-opt"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>
          )}
          {format === "pdf-print" && (
            <>
              <label className="exp-opt"><input type="checkbox" checked={cropMarks} onChange={(e) => setCropMarks(e.target.checked)} /> Crop marks</label>
              <p className="muted">{PRINT_NOTE}</p>
            </>
          )}
          {format === "gif" && (
            <label><span className="lbl">Seconds per page</span>
              <select className="inp" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>

        <section className="exp-side" aria-labelledby="exp-pf">
          <div className="exp-side-h">
            <h3 id="exp-pf">Preflight</h3>
            {typeof info === "object" && (warnings
              ? <span className="exp-warn">{warnings} {warnings === 1 ? "warning" : "warnings"}</span>
              : <span className="exp-ok">All clear</span>)}
          </div>
          {info === "loading" && <p className="muted">Checking…</p>}
          {info === "failed" && <p className="muted">Couldn't run the checks. Check your connection.</p>}
          <ul className="exp-checks">
            {checks.map((c) => (
              <li key={c.id} className="exp-check">
                <span className={c.status === "warn" ? "exp-i exp-i-warn" : "exp-i exp-i-ok"} aria-hidden="true">{c.status === "warn" ? "!" : "✓"}</span>
                <div>
                  <p>{c.status === "warn" && <span className="sr-only">Warning: </span>}<b>{c.title}</b></p>
                  <p className="muted">{c.detail}</p>
                  {c.status === "warn" && c.nodes.length > 0 && (
                    <button type="button" className="ed-mini" onClick={() => onShow(c.nodes)}>Show on page</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {creditLines && (
            <div className="exp-credits">
              <label><span className="lbl">Credits</span>
                <textarea ref={credits} className="inp" readOnly rows={Math.min(5, creditLines.split("\n").length + 1)} value={creditLines} />
              </label>
              <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy credits"}</button>
              {manual && <p role="status">Press Ctrl+C to copy</p>}
            </div>
          )}
        </section>

        <div className="exp-foot">
          {gate && <p className="muted" role="status">{gate}</p>}
          <div className="hist-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-p" disabled={busy || badRange || !!gate}>Export {label}</button>
          </div>
          {error && <p role="alert" className="exp-err">{error}</p>}
        </div>
      </form>
    </Modal>
  );
}
