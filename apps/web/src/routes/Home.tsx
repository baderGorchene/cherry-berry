import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { myWorkspaces, signOut, type Workspace } from "../api";
import { currentWorkspace, useSession } from "../App";
import { initials } from "./Workspaces";

// ponytail: presets are display-only until the editor exists (Phase 2).
const PRESETS = [
  { name: "Social post", size: "1080 × 1080 px", w: 60, h: 60, bg: "var(--blush)" },
  { name: "A4 print", size: "210 × 297 mm · CMYK", w: 44, h: 64, bg: "var(--orchid)" },
  { name: "Presentation", size: "1920 × 1080 px", w: 96, h: 54, bg: "var(--berry)" },
  { name: "Story", size: "1080 × 1920 px", w: 40, h: 70, bg: "var(--petal)" },
  { name: "Business card", size: "85 × 55 mm · CMYK", w: 84, h: 48, bg: "#fff" },
];

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

export default function Home() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [currentId, setCurrentId] = useState(currentWorkspace.get());

  useEffect(() => { myWorkspaces().then((r) => setList(r.workspaces), () => setList([])); }, []);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (list.length === 0) return <Navigate to="/workspaces" replace />;
  const current = list.find((w) => w.id === currentId) ?? list[0]!;

  const switchTo = (id: string) => {
    if (id === "__new") return navigate("/workspaces");
    currentWorkspace.set(id);
    setCurrentId(id);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap" }}>
      <nav aria-label="Main" style={{
        flex: "1 1 220px", maxWidth: 260, background: "#fff", borderRight: "1px solid var(--line)",
        padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        <p className="brand" style={{ margin: "0 0 4px 12px" }}>Cherry Berry</p>
        <label className="sr-only" htmlFor="ws">Workspace</label>
        <select id="ws" className="inp" value={current.id} onChange={(e) => switchTo(e.target.value)} style={{ fontWeight: 600 }}>
          {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          <option value="__new">Join or create another…</option>
        </select>
        <div style={{ padding: "4px 12px", fontSize: 13 }} className="muted">
          <span>{ROLE[current.role ?? "viewer"]} · ID </span>
          <code data-testid="workspace-public-id" style={{ color: "var(--ink)", userSelect: "all" }}>{current.publicId}</code>
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={async () => { await signOut().catch(() => {}); setUser(null); }}>Sign out</button>
      </nav>

      <main style={{ flex: "999 1 560px", minWidth: 0, padding: "28px clamp(16px, 4vw, 40px) 48px", display: "flex", flexDirection: "column", gap: 36 }}>
        <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22 }}>{current.name}</h1>
          <span style={{ flex: 1 }} />
          <span aria-label={`Signed in as ${user?.name}`} title={user?.email} style={{
            width: 40, height: 40, borderRadius: "50%", background: "var(--berry)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>{initials(user?.name ?? "")}</span>
        </header>

        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.01em" }}>Start something</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="card" title="The editor arrives in the next release"
                style={{ padding: 14, gap: 10, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
                <span style={{ height: 84, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tint)", borderRadius: 10 }}>
                  <span style={{ width: p.w, height: p.h, background: p.bg, borderRadius: 5, border: p.bg === "#fff" ? "2px solid var(--berry)" : 0 }} />
                </span>
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{p.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{p.size}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 22 }}>Recent designs</h2>
          <div className="card" style={{ alignItems: "flex-start" }}>
            <p className="muted">No designs yet. Pick a size above to start your first one.</p>
            <Link to="/workspaces" style={{ fontSize: 14 }}>Join or create another workspace</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
