import { useEffect, useState, type MutableRefObject } from "react";
import { Link } from "react-router";
import {
  TEMPLATE_CATEGORIES, errorMessage, listKits, publishTemplate, type BrandKit, type Template, type TemplateCategory,
} from "../api";

export default function PublishDialog({ designId, workspaceId, title, kitId: designKit, saved, snapRef, onClose }: {
  designId: string; workspaceId: string; title: string; kitId: string | null; saved: boolean;
  snapRef: MutableRefObject<(() => string) | null>; onClose(): void;
}) {
  const [name, setName] = useState(title);
  const [category, setCategory] = useState<TemplateCategory>("social");
  const [where, setWhere] = useState<"workspace" | "public">("workspace");
  const [license, setLicense] = useState<"cc0" | "cc-by">("cc0");
  const [attribution, setAttribution] = useState("");
  const [rights, setRights] = useState(false);
  const [kitId, setKitId] = useState(designKit ?? "");
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Template | null>(null);
  useEffect(() => { listKits(workspaceId).then(setKits, () => setKits([])); }, [workspaceId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const pub = where === "public";
  const ready = !!name.trim() && saved && (!pub || (rights && (license === "cc0" || !!attribution.trim())));
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const thumb = snapRef.current!().split(",")[1] ?? "";
      setDone(await publishTemplate(designId, {
        name: name.trim(), category, visibility: where, license: pub ? license : "workspace-only",
        attribution: pub && license === "cc-by" ? attribution.trim() : "", thumb, ...(pub ? {} : { kitId: kitId || null }),
      }));
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(34,20,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pub-h" className="card" style={{ width: "min(460px, 100%)", maxHeight: "100%", overflow: "auto" }}>
        <h2 id="pub-h" style={{ fontSize: 18 }}>Publish as a template</h2>
        {done ? (
          <>
            <p role="status">{done.status === "pending" ? "Sent for approval. An owner or admin will review it." : "Published"}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Link className="btn" to="/templates">Open templates</Link>
              <button className="btn btn-p" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label><span className="lbl">Name</span>
              <input className="inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label><span className="lbl">Category</span>
              <select className="inp" value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
                {TEMPLATE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label><span className="lbl">Where</span>
              <select className="inp" value={where} onChange={(e) => setWhere(e.target.value as "workspace" | "public")}>
                <option value="workspace">This workspace</option>
                <option value="public">Everyone (public)</option>
              </select>
            </label>
            {pub ? (
              <>
                <label><span className="lbl">License</span>
                  <select className="inp" value={license} onChange={(e) => setLicense(e.target.value as "cc0" | "cc-by")}>
                    <option value="cc0">CC0 (no attribution needed)</option>
                    <option value="cc-by">CC-BY (credit required)</option>
                  </select>
                </label>
                {license === "cc-by" && (
                  <label><span className="lbl">Attribution</span>
                    <input className="inp" value={attribution} maxLength={300} onChange={(e) => setAttribution(e.target.value)} />
                  </label>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
                  <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 3 }} />
                  I have the right to share everything in this design.
                </label>
              </>
            ) : (
              <label><span className="lbl">Brand kit</span>
                <select className="inp" value={kitId} onChange={(e) => setKitId(e.target.value)}>
                  <option value="">None</option>
                  {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </label>
            )}
            {error && <p role="alert" className="field-error">{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {!saved && <span className="muted" style={{ fontSize: 13 }}>Waiting for changes to save…</span>}
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={!ready || busy}>Publish</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
