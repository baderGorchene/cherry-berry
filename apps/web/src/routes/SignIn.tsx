import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { errorMessage, signIn, signUp } from "../api";
import { useSession } from "../App";
import { shell, switchServerUrl } from "../native";

const CLOUD = (() => { try { return new URL(import.meta.env.VITE_CLOUD_URL ?? "").origin; } catch { return null; } })();

/** Native shells only: which server this app is on; picking another hands over to the launcher. */
function ServerPicker() {
  const here = location.origin;
  const [kind, setKind] = useState<"cloud" | "self">(here === CLOUD ? "cloud" : "self");
  const [address, setAddress] = useState(here === CLOUD ? "" : here);
  const target = address.trim();
  const go = (to: string) => { const url = switchServerUrl(to); if (url) location.href = url; };
  return (
    <form className="server" onSubmit={(e) => { e.preventDefault(); if (target && target !== here) go(target); }}>
      <fieldset className="server-opts">
        <legend className="lbl">Server</legend>
        {CLOUD && (
          <label className="opt">
            <input type="radio" name="server" checked={kind === "cloud"} onChange={() => { setKind("cloud"); if (CLOUD !== here) go(CLOUD!); }} />
            <span><strong>Cherry Berry Cloud</strong><br /><span className="muted">The central instance, nothing to install.</span></span>
          </label>
        )}
        <label className="opt">
          <input type="radio" name="server" checked={kind === "self"} onChange={() => setKind("self")} />
          <span><strong>Self-hosted server</strong><br /><span className="muted">Your organization's own instance.</span></span>
        </label>
      </fieldset>
      {kind === "self" && (
        <div className="server-addr">
          <label className="sr-only" htmlFor="server-address">Server address</label>
          <input id="server-address" className="inp" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://design.your-company.com"
            value={address} onChange={(e) => setAddress(e.target.value)} />
          <button type="submit" className="btn" disabled={!target || target === here}>Connect</button>
        </div>
      )}
      {kind === "self" && /^http:\/\//i.test(target) && <p className="warn-note">Not secure: this address uses http.</p>}
    </form>
  );
}

export default function SignIn() {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")), password = String(f.get("password"));
    setBusy(true); setError("");
    try {
      const { user } = mode === "up"
        ? await signUp({ name: String(f.get("name")), email, password })
        : await signIn({ email, password });
      setUser(user);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <p className="brand" style={{ color: "#fff", fontSize: 22 }}>Cherry Berry</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 520 }}>
          <h1>Design freely. Own every file.</h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "#FFE3F1" }}>
            An open-source design studio. Real vector tools, print-ready export and nothing locked behind a paywall.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="pill">Open source</span>
          <span className="pill">Self-hostable</span>
          <span className="pill">Vector editing</span>
        </div>
      </section>

      <section style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "48px 24px" }}>
        {shell() && <ServerPicker />}
        <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ fontSize: 32, letterSpacing: "-0.01em" }}>{mode === "in" ? "Sign in" : "Create your account"}</h2>
            <p className="muted">{mode === "in" ? "Welcome back." : "Free, open source, nothing gated."}</p>
          </div>
          {mode === "up" && (
            <div>
              <label className="lbl" htmlFor="name">Name</label>
              <input id="name" name="name" className="inp" autoComplete="name" required />
            </div>
          )}
          <div>
            <label className="lbl" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="inp" placeholder="you@example.com" autoComplete="email" required />
          </div>
          <div>
            <label className="lbl" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="inp" minLength={8} required
              autoComplete={mode === "in" ? "current-password" : "new-password"} />
          </div>
          {error && <p role="alert" className="field-error">{error}</p>}
          <button className="btn btn-p" type="submit" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
          <p className="muted" style={{ textAlign: "center", fontSize: 14 }}>
            {mode === "in" ? "New here? " : "Already have an account? "}
            <button type="button" className="btn btn-link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
              {mode === "in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
