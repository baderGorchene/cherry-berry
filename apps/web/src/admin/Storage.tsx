import { useEffect, useState, type FormEvent } from "react";
import { adminSettings, adminStorage, errorMessage, saveAdminSettings, type InstanceSettings, type StorageReport } from "../api";
import { formatBytes } from "../library/assets";
import { UsageBar, usedOf } from "./Overview";

export default function Storage() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [settings, setSettings] = useState<InstanceSettings | null>(null);
  const [quota, setQuota] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => adminStorage().then(setReport, (e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
    adminSettings().then((s) => { setSettings(s); setQuota(s.storageQuotaGb?.toString() ?? ""); }, (e) => setError(errorMessage(e)));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true); setStatus(""); setError("");
    try {
      const s = await saveAdminSettings({ ...settings, storageQuotaGb: quota.trim() ? Number(quota) : null });
      setSettings(s);
      setStatus("Saved");
      void load();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <section className="sec" aria-labelledby="adm-h">
      <h2 id="adm-h" className="sec-title">Storage</h2>
      <div className="adm-grid">
        <section className="card" aria-labelledby="adm-use">
          <h3 id="adm-use" className="card-title">Used</h3>
          {report && <>
            <p className="adm-big">{usedOf(report.usedBytes, report.quotaBytes)}</p>
            <UsageBar used={report.usedBytes} quota={report.quotaBytes} />
          </>}
          <form onSubmit={save} className="adm-form">
            <div>
              <label className="lbl" htmlFor="adm-quota">Storage quota (GB)</label>
              <input id="adm-quota" className="inp" type="number" min={1} step={1} inputMode="numeric" placeholder="Unlimited"
                value={quota} onChange={(e) => { setQuota(e.target.value); setStatus(""); }} />
              <p className="muted adm-hint">Leave blank for unlimited. Uploads that would go over it are refused; brand fonts always save.</p>
            </div>
            {error && <p role="alert" className="field-error">{error}</p>}
            <div className="adm-save">
              <button type="submit" className="btn btn-p" disabled={busy || !settings}>Save</button>
              <span role="status" className="adm-ok">{status}</span>
            </div>
          </form>
        </section>
        <section className="card" aria-labelledby="adm-top">
          <h3 id="adm-top" className="card-title">Largest workspaces</h3>
          {report && (
            <table className="adm-table">
              <thead><tr><th>Workspace</th><th>Storage</th></tr></thead>
              <tbody>
                {report.byWorkspace.map((w) => <tr key={w.id}><td data-label="Workspace"><strong>{w.name}</strong></td><td data-label="Storage">{formatBytes(w.usedBytes)}</td></tr>)}
                <tr><td data-label="Workspace"><strong>Personal uploads</strong></td><td data-label="Storage">{formatBytes(report.personalBytes)}</td></tr>
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
