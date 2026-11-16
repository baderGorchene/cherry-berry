import { useEffect, useState } from "react";
import { Link } from "react-router";
import { adminOverview, errorMessage, type AdminOverview } from "../api";
import { formatBytes } from "../library/assets";

export const usedOf = (used: number, quota: number | null) => `${formatBytes(used)} of ${quota === null ? "unlimited" : formatBytes(quota)}`;

/** Storage used against the quota; nothing to draw without one. */
export function UsageBar({ used, quota }: { used: number; quota: number | null }) {
  if (quota === null) return null;
  const pct = Math.min(100, (used / quota) * 100);
  return (
    <div className="adm-bar" role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Overview() {
  const [o, setO] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { adminOverview().then(setO, (e) => setError(errorMessage(e))); }, []);
  return (
    <section className="sec" aria-labelledby="adm-h">
      <h2 id="adm-h" className="sec-title">Overview</h2>
      {error && <p role="alert" className="field-error">{error}</p>}
      {o && (
        <div className="adm-grid">
          <section className="card" aria-labelledby="adm-sv">
            <h3 id="adm-sv" className="card-title">Server</h3>
            <dl className="kv">
              <dt>Version</dt><dd>{o.version}</dd>
              <dt>Database</dt><dd>{o.database}</dd>
              <dt>File storage</dt><dd>{o.storage}</dd>
              <dt>Storage used</dt><dd>{usedOf(o.usedBytes, o.quotaBytes)}</dd>
            </dl>
            <UsageBar used={o.usedBytes} quota={o.quotaBytes} />
          </section>
          <section className="card" aria-labelledby="adm-ac">
            <h3 id="adm-ac" className="card-title">Activity</h3>
            <dl className="kv">
              <dt>Users</dt><dd>{o.users}</dd>
              <dt>Workspaces</dt><dd>{o.workspaces}</dd>
              <dt>Designs</dt><dd>{o.designs}</dd>
              <dt>Waiting for review</dt><dd><Link to="/admin/moderation">{o.queue}</Link></dd>
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
