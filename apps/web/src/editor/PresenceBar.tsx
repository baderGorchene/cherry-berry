import { useEffect, useState } from "react";
import { initials, type PresenceUser } from "./presence";

/** Distinct people (me first), up to 4 circles then "+N". */
export function Avatars({ people }: { people: PresenceUser[] }) {
  const shown = people.slice(0, 4), more = people.length - shown.length;
  return (
    <div className="ed-avatars" role="group" aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} editing`}>
      {shown.map((u) => (
        <span key={u.id} className="ed-avatar" title={u.name} style={{ background: u.color }}>{initials(u.name)}</span>
      ))}
      {more > 0 && <span className="ed-avatar" style={{ background: "#5D4E66" }}>+{more}</span>}
    </div>
  );
}

export function SharePopover({ workspace }: { workspace: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = location.origin + location.pathname;
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
  return (
    <div className="ed-share">
      <button className="btn" aria-expanded={open} onClick={() => { setOpen(!open); setCopied(false); }}>Share</button>
      {open && (
        <div className="ed-pop" role="dialog" aria-label="Share">
          <input className="inp" readOnly aria-label="Design link" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-p" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true), () => {})}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="muted">People in {workspace} can open this link.</p>
        </div>
      )}
    </div>
  );
}
