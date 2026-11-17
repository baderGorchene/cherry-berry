import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router";
import { BrandLogo } from "../BrandLogo";
import { instanceInfo } from "../api";
import Moderation from "../admin/Moderation";
import Overview from "../admin/Overview";
import Registration from "../admin/Registration";
import Storage from "../admin/Storage";
import Users from "../admin/Users";
import "../admin/admin.css";

const SECTIONS = [
  ["", "Overview", Overview], ["moderation", "Moderation", Moderation], ["users", "Users & workspaces", Users],
  ["storage", "Storage", Storage], ["registration", "Sign-in & registration", Registration],
] as const;

/** Instance admin: its own frame (left nav of sections, a chip row on phones). Non-admins go home. */
export default function Admin() {
  const { section = "" } = useParams();
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => { instanceInfo().then((i) => setAdmin(i.admin), () => setAdmin(false)); }, []);
  const current = SECTIONS.find(([id]) => id === section);
  // Phones: keep the active chip in view in the scrolling row.
  useEffect(() => { document.querySelector(".adm-nav [aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [section, admin]);
  if (admin === false) return <Navigate to="/" replace />;
  if (!current) return <Navigate to="/admin" replace />;
  if (admin === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  const Section = current[2];
  return (
    <div className="adm">
      <div className="adm-side">
        <p className="brand"><BrandLogo /></p>
        <nav aria-label="Instance admin" className="adm-nav">
          <Link to="/" className="nav">Home</Link>
          <p className="ph adm-ph">Instance</p>
          {SECTIONS.map(([id, label]) => <NavLink key={id} to={id ? `/admin/${id}` : "/admin"} end className="nav">{label}</NavLink>)}
        </nav>
      </div>
      <main className="page adm-main">
        <header>
          <h1 className="page-title">Instance admin</h1>
          <p className="page-sub">{location.host}</p>
        </header>
        <Section />
      </main>
    </div>
  );
}
