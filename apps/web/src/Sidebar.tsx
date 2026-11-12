import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, myWorkspaces, signOut, type Workspace } from "./api";
import { currentWorkspace, useSession } from "./App";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const LINKS = [["home", "/", "Home"], ["library", "/library", "Visual library"], ["shapes", "/shapes", "Shapes"]] as const;

/** Brand, workspace picker, page links and sign out. `onSwitch` lets the page follow a workspace change. */
export default function Sidebar({ active, onSwitch }: { active: "home" | "library" | "shapes"; onSwitch?(id: string): void }) {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [list, setList] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState(currentWorkspace.get());
  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => { if (e instanceof ApiError && e.status === 401) setUser(null); });
  }, []);
  const current = list.find((w) => w.id === currentId) ?? list[0];

  const switchTo = (id: string) => {
    if (id === "__new") return navigate("/workspaces");
    currentWorkspace.set(id);
    setCurrentId(id);
    onSwitch?.(id);
  };

  return (
    <nav aria-label="Main" style={{
      flex: "1 1 220px", maxWidth: 260, background: "#fff", borderRight: "1px solid var(--line)",
      padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <p className="brand" style={{ margin: "0 0 4px 12px" }}>Cherry Berry</p>
      <label className="sr-only" htmlFor="ws">Workspace</label>
      <select id="ws" className="inp" value={current?.id ?? ""} onChange={(e) => switchTo(e.target.value)} style={{ fontWeight: 600 }}>
        {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        <option value="__new">Join or create another…</option>
      </select>
      {current && (
        <div style={{ padding: "4px 12px", fontSize: 13 }} className="muted">
          <span>{ROLE[current.role ?? "viewer"]} · ID </span>
          <code data-testid="workspace-public-id" style={{ color: "var(--ink)", userSelect: "all" }}>{current.publicId}</code>
        </div>
      )}
      {LINKS.map(([id, to, label]) => (
        <Link key={id} to={to} aria-current={active === id ? "page" : undefined}
          style={{ padding: "6px 12px", fontWeight: active === id ? 700 : 600, ...(active === id ? { color: "var(--berry)" } : {}) }}>{label}</Link>
      ))}
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={async () => { await signOut().catch(() => {}); setUser(null); }}>Sign out</button>
    </nav>
  );
}
