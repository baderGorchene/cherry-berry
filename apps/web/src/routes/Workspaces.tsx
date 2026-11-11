import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  acceptInvitation, createWorkspace, errorMessage, joinOpen, joinWithPassword, openWorkspaces,
  type AccessMode, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Accepts a pasted invite link (…/invite/<token>) or a bare token. */
const tokenFrom = (input: string) => input.trim().split(/[/?#]/).filter(Boolean).pop() ?? "";

const MODES: { value: AccessMode; title: string; hint: string }[] = [
  { value: "invite", title: "Invitation only", hint: "You invite people by email." },
  { value: "password", title: "ID + password", hint: "Anyone with both can join." },
  { value: "open", title: "Open", hint: "Listed and free to join." },
];

export default function Workspaces() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AccessMode>("invite");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Workspace[]>([]);

  useEffect(() => {
    const t = setTimeout(() => openWorkspaces(q).then((r) => setOpen(r.workspaces), () => setOpen([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  async function run(key: string, action: () => Promise<{ workspace: Workspace }>) {
    setBusy(true); setErrors({});
    try {
      const { workspace } = await action();
      currentWorkspace.set(workspace.id);
      navigate("/");
    } catch (err) {
      setErrors({ [key]: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  const fields = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget); };

  return (
    <div style={{ minHeight: "100vh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <Link to="/" className="brand" style={{ textDecoration: "none" }}>Cherry Berry</Link>
          <span className="muted" style={{ fontSize: 14 }}>Signed in as {user?.email}</span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 40, letterSpacing: "-0.02em" }}>Pick a workspace</h1>
          <p className="muted" style={{ fontSize: 16 }}>Workspaces hold your designs, brand kits and shared visual library.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
          <form className="card" onSubmit={(e) => { const f = fields(e); run("invite", () => acceptInvitation(tokenFrom(String(f.get("invite"))))); }}>
            <h2 style={{ fontSize: 20 }}>Invitations</h2>
            <p className="muted" style={{ fontSize: 14 }}>Got an invitation link by email? Paste it here.</p>
            <div>
              <label className="lbl" htmlFor="invite">Invitation link</label>
              <input id="invite" name="invite" className="inp" placeholder="https://…/invite/…" required />
            </div>
            {errors.invite && <p role="alert" className="field-error">{errors.invite}</p>}
            <button className="btn btn-p" type="submit" disabled={busy}>Accept invitation</button>
          </form>

          <form className="card" onSubmit={(e) => {
            const f = fields(e);
            run("join", () => joinWithPassword({ publicId: String(f.get("publicId")), password: String(f.get("joinPassword")) }));
          }}>
            <h2 style={{ fontSize: 20 }}>Join with ID</h2>
            <p className="muted" style={{ fontSize: 14 }}>Ask the owner for the workspace ID and password.</p>
            <div>
              <label className="lbl" htmlFor="publicId">Workspace ID</label>
              <input id="publicId" name="publicId" className="inp" placeholder="e.g. cherry-7Q4K" required />
            </div>
            <div>
              <label className="lbl" htmlFor="joinPassword">Workspace password</label>
              <input id="joinPassword" name="joinPassword" type="password" className="inp" required />
            </div>
            {errors.join && <p role="alert" className="field-error">{errors.join}</p>}
            <button className="btn btn-p" type="submit" disabled={busy}>Join workspace</button>
          </form>

          <section className="card">
            <h2 style={{ fontSize: 20 }}>Open workspaces</h2>
            <label htmlFor="openSearch" className="sr-only">Search open workspaces</label>
            <input id="openSearch" className="inp" placeholder="Search open workspaces" value={q} onChange={(e) => setQ(e.target.value)} />
            {open.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No open workspaces{q ? " match that search" : " yet"}.</p>}
            {open.map((w) => (
              <div className="row" key={w.id}>
                <span className="av" aria-hidden="true">{initials(w.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 14 }}>{w.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>Open · anyone can join</span>
                </span>
                <button className="btn" style={{ minHeight: 40 }} disabled={busy} onClick={() => run("open", () => joinOpen(w.id))}
                  aria-label={`Join ${w.name}`}>Join</button>
              </div>
            ))}
            {errors.open && <p role="alert" className="field-error">{errors.open}</p>}
          </section>
        </div>

        <form className="card" style={{ gap: 20 }} onSubmit={(e) => {
          const f = fields(e);
          run("create", () => createWorkspace({
            name: String(f.get("name")), accessMode: mode,
            ...(mode === "password" ? { password: String(f.get("createPassword")) } : {}),
          }));
        }}>
          <h2 style={{ fontSize: 20 }}>Or create your own</h2>
          <div style={{ maxWidth: 560 }}>
            <label className="lbl" htmlFor="name">Workspace name</label>
            <input id="name" name="name" className="inp" placeholder="My studio" maxLength={80} required />
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <legend className="lbl">Who can join</legend>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {MODES.map((m) => (
                <label key={m.value} className="opt">
                  <input type="radio" name="accessMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
                  <span><strong style={{ display: "block" }}>{m.title}</strong><span className="muted" style={{ fontSize: 13 }}>{m.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {mode === "password" && (
            <div style={{ maxWidth: 560 }}>
              <label className="lbl" htmlFor="createPassword">Password for joining</label>
              <input id="createPassword" name="createPassword" type="password" className="inp" minLength={8} required autoComplete="new-password" />
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>At least 8 characters. Share it with the workspace ID.</p>
            </div>
          )}
          {errors.create && <p role="alert" className="field-error">{errors.create}</p>}
          <div><button className="btn btn-p" type="submit" disabled={busy}>Create workspace</button></div>
        </form>
      </div>
    </div>
  );
}
