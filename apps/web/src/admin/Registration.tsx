import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { adminSettings, ApiError, errorMessage, saveAdminSettings, type InstanceSettings } from "../api";

const ACCOUNTS: [InstanceSettings["registration"], string][] = [
  ["open", "Anyone"], ["invited", "Only invited emails"], ["domains", "Only emails on allowed domains"],
];
const CREATORS: [InstanceSettings["workspaceCreation"], string][] = [["anyone", "Any user"], ["admins", "Admins only"]];
const SIZES: InstanceSettings["maxUploadMb"][] = [20, 50, 100];

function Radios<T extends string | number>({ legend, name, options, value, onChange, children }: {
  legend: string; name: string; options: [T, string][]; value: T; onChange(v: T): void; children?: ReactNode;
}) {
  return (
    <fieldset className="adm-set">
      <legend className="lbl">{legend}</legend>
      <div className="adm-opts">
        {options.map(([v, label]) => (
          <label key={v} className="opt">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

export default function Registration() {
  const [s, setS] = useState<InstanceSettings | null>(null);
  const [domains, setDomains] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loaded = (v: InstanceSettings) => { setS(v); setDomains(v.allowedDomains.join("\n")); };
  useEffect(() => { adminSettings().then(loaded, (e) => setError(errorMessage(e))); }, []);
  const change = (p: Partial<InstanceSettings>) => { setS((v) => v && { ...v, ...p }); setStatus(""); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setBusy(true); setStatus(""); setError("");
    try {
      // The textarea only counts while it shows; otherwise keep the saved list so a hidden typo can't block the save.
      const allowedDomains = s.registration === "domains" ? domains.split(/\s+/).filter(Boolean) : s.allowedDomains;
      loaded(await saveAdminSettings({ ...s, allowedDomains }));
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_body" ? "Check the domains: one per line, like acme.com." : errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <section className="sec" aria-labelledby="adm-h">
      <h2 id="adm-h" className="sec-title">Sign-in & registration</h2>
      {!s && error && <p role="alert" className="field-error">{error}</p>}
      {s && (
        <form className="card adm-form" onSubmit={save}>
          <Radios legend="Who can create an account" name="registration" options={ACCOUNTS} value={s.registration} onChange={(registration) => change({ registration })}>
            {s.registration === "domains" && (
              <div>
                <label className="lbl" htmlFor="adm-domains">Allowed domains</label>
                <textarea id="adm-domains" className="inp adm-area" rows={4} spellCheck={false} placeholder="acme.com"
                  value={domains} onChange={(e) => { setDomains(e.target.value); setStatus(""); }} />
                <p className="muted adm-hint">One per line. Subdomains aren't included. Admins can always sign up.</p>
              </div>
            )}
          </Radios>
          <Radios legend="Who can create workspaces" name="workspaceCreation" options={CREATORS} value={s.workspaceCreation} onChange={(workspaceCreation) => change({ workspaceCreation })} />
          <Radios legend="Max upload size" name="maxUploadMb" options={SIZES.map((n) => [n, `${n} MB`])} value={s.maxUploadMb} onChange={(maxUploadMb) => change({ maxUploadMb })} />
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="adm-save">
            <button type="submit" className="btn btn-p" disabled={busy}>Save</button>
            <span role="status" className="adm-ok">{status}</span>
          </div>
        </form>
      )}
    </section>
  );
}
