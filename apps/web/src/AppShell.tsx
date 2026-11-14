import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ApiError, myWorkspaces, signOut, type Workspace } from "./api";
import { currentWorkspace, useSession } from "./App";
import { IconBrand, IconChevron, IconHome, IconImage, IconShapes, IconTemplate } from "./icons";
import { initials } from "./routes/Workspaces";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const LINKS = [
  ["home", "/", "Home", IconHome], ["templates", "/templates", "Templates", IconTemplate], ["library", "/library", "Visual library", IconImage],
  ["shapes", "/shapes", "Shapes", IconShapes], ["brand", "/brand", "Brand kits", IconBrand],
] as const;

/** Page frame: brand, workspace switcher, page links and sign out (bottom tab bar on phones). `onSwitch` lets the page follow a workspace change; `bleed` drops the page padding so the page can run a flush side panel. */
export default function AppShell({ active, onSwitch, bleed, children }: { active: "home" | "templates" | "library" | "shapes" | "brand"; onSwitch?(id: string): void; bleed?: boolean; children: ReactNode }) {
  const { setUser } = useSession();
  const [list, setList] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState(currentWorkspace.get());
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => { if (e instanceof ApiError && e.status === 401) setUser(null); });
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); btn.current?.focus(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", down); };
  }, [open]);
  const current = list.find((w) => w.id === currentId) ?? list[0];

  const switchTo = (id: string) => {
    currentWorkspace.set(id);
    setCurrentId(id);
    setOpen(false);
    btn.current?.focus();
    onSwitch?.(id);
  };
  const out = async () => { await signOut().catch(() => {}); setUser(null); };

  return (
    <div className="shell">
      <nav aria-label="Main" className="side">
        <p className="brand">Cherry Berry</p>
        <div className="ws" ref={wrap}>
          <button ref={btn} type="button" className="ws-btn" aria-haspopup="true" aria-expanded={open}
            aria-label={`Workspace: ${current?.name ?? ""}`} onClick={() => setOpen((o) => !o)}>
            <span className="av" aria-hidden="true">{initials(current?.name ?? "")}</span>
            <span className="ws-name">
              <strong className="ell">{current?.name}</strong>
              <span className="muted">{ROLE[current?.role ?? "viewer"]}</span>
            </span>
            <IconChevron />
          </button>
          {open && current && (
            <div className="ws-menu">
              {list.map((w) => (
                <button key={w.id} type="button" className="nav" aria-current={w.id === current.id ? "true" : undefined} onClick={() => switchTo(w.id)}>
                  <span className="ell">{w.name}</span>
                </button>
              ))}
              <p className="muted ws-id">{ROLE[current.role ?? "viewer"]} · ID <code data-testid="workspace-public-id">{current.publicId}</code></p>
              <Link to="/workspaces" className="nav">Join or create another workspace</Link>
              <button type="button" className="nav only-m" onClick={out}>Sign out</button>
            </div>
          )}
        </div>
        {LINKS.map(([id, to, label, Icon]) => (
          <Link key={id} to={to} className={`nav${active === id ? " nav-on" : ""}`} aria-current={active === id ? "page" : undefined}>
            <Icon />{label}
          </Link>
        ))}
        <span style={{ flex: 1 }} className="only-d" />
        <button type="button" className="nav only-d" onClick={out}>Sign out</button>
      </nav>
      <main className={bleed ? "page bleed" : "page"}>{children}</main>
    </div>
  );
}
