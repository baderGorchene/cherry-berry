import { useEffect, useState } from "react";
import { errorMessage, reportItem, type ReportBody } from "../api";

const REASONS: [ReportBody["reason"], string][] = [
  ["copyright", "Copyright or license problem"], ["inappropriate", "Inappropriate"], ["spam", "Spam"], ["other", "Something else"],
];

export default function ReportDialog({ target, onClose }: {
  target: { type: "asset" | "shape" | "template"; id: string; title: string }; onClose(): void;
}) {
  const [reason, setReason] = useState<ReportBody["reason"]>("copyright");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    setState("busy"); setError("");
    try {
      await reportItem({ targetType: target.type, targetId: target.id, reason, note: note.trim() });
      setState("sent");
    } catch (e) {
      setError(errorMessage(e)); setState("idle");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(34,20,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-h" className="card" style={{ width: "min(420px, 100%)" }}>
        <h2 id="report-h" style={{ fontSize: 18 }}>Report</h2>
        <p className="muted" style={{ fontSize: 14 }}>{target.title}</p>
        {state === "sent" ? (
          <>
            <p role="status">Thanks. Your report was sent.</p>
            <button className="btn btn-p" onClick={onClose}>Close</button>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label><span className="lbl">Reason</span>
              <select className="inp" value={reason} onChange={(e) => setReason(e.target.value as ReportBody["reason"])}>
                {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label><span className="lbl">Note (optional)</span>
              <textarea className="inp" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ padding: 10 }} />
            </label>
            {error && <p role="alert" className="field-error">{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={state === "busy"}>Send report</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
