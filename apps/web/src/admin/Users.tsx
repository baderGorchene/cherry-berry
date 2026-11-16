import { useEffect, useState } from "react";
import {
  adminUsers, adminWorkspaces, errorMessage, suspendUser, unsuspendUser, type AccessMode, type AdminUser, type AdminWorkspace,
} from "../api";
import { formatBytes } from "../library/assets";
import { IconSearch } from "../icons";

const JOIN: Record<AccessMode, string> = { invite: "Invitation only", password: "ID + password", open: "Open" };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function UsersTable() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    let live = true; // a response for an older query is dropped
    adminUsers(q).then((r) => { if (live) { setUsers(r.users); setNext(r.next); } }, (e) => live && setError(errorMessage(e)));
    return () => { live = false; };
  }, [q]);

  const more = () => adminUsers(q, next).then((r) => { setUsers((u) => [...u, ...r.users]); setNext(r.next); }, (e) => setError(errorMessage(e)));
  const toggle = async (u: AdminUser) => {
    setBusy(u.id); setError("");
    try {
      await (u.suspended ? unsuspendUser : suspendUser)(u.id);
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, suspended: !u.suspended } : x)));
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <section className="card" aria-labelledby="adm-us">
      <div className="adm-head">
        <h3 id="adm-us" className="card-title">Users</h3>
        <label className="search">
          <span className="sr-only">Search users</span>
          <IconSearch />
          <input className="inp" type="search" placeholder="Name or email" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="adm-scroll">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Workspaces</th><th>Storage</th><th><span className="sr-only">Status</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Name"><strong>{u.name}</strong></td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Joined">{day(u.createdAt)}</td>
                <td data-label="Workspaces">{u.workspaces}</td>
                <td data-label="Storage">{formatBytes(u.usedBytes)}</td>
                <td className="adm-act">
                  {u.admin ? <span className="rs rs-on">Admin</span> : <>
                    {u.suspended && <span className="rs rs-err">Suspended</span>}
                    <button type="button" className="btn btn-sm" disabled={busy === u.id} onClick={() => toggle(u)}>{u.suspended ? "Unsuspend" : "Suspend"}</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users.length && q && <p className="muted">No users match “{q}”.</p>}
      {next && <div><button type="button" className="btn" onClick={more}>Load more</button></div>}
    </section>
  );
}

function WorkspacesTable() {
  const [list, setList] = useState<AdminWorkspace[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = (cursor?: string | null) =>
    adminWorkspaces(cursor).then((r) => { setList((l) => (cursor ? [...l, ...r.workspaces] : r.workspaces)); setNext(r.next); }, (e) => setError(errorMessage(e)));
  useEffect(() => { void load(); }, []);
  return (
    <section className="card" aria-labelledby="adm-ws">
      <h3 id="adm-ws" className="card-title">Workspaces</h3>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="adm-scroll">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Joining</th><th>Members</th><th>Designs</th><th>Storage</th></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td data-label="Name"><strong>{w.name}</strong></td>
                <td data-label="Joining">{JOIN[w.joinMode] ?? w.joinMode}</td>
                <td data-label="Members">{w.members}</td>
                <td data-label="Designs">{w.designs}</td>
                <td data-label="Storage">{formatBytes(w.usedBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next && <div><button type="button" className="btn" onClick={() => load(next)}>Load more</button></div>}
    </section>
  );
}

export default function Users() {
  return (
    <section className="sec" aria-labelledby="adm-h">
      <h2 id="adm-h" className="sec-title">Users & workspaces</h2>
      <UsersTable />
      <WorkspacesTable />
    </section>
  );
}
