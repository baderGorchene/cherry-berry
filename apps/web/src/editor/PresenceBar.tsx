import { useEffect, useRef, useState } from "react";
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
  const [manual, setManual] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const link = location.origin + location.pathname;
  const close = () => { setOpen(false); toggle.current?.focus(); };
  useEffect(() => { if (open) copyBtn.current?.focus(); }, [open]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link); // undefined on non-secure origins
      setCopied(true);
      setManual(false);
    } catch {
      setCopied(false);
      setManual(true);
      input.current?.select();
    }
  };
  return (
    <div className="ed-share">
      <button ref={toggle} className="btn" aria-expanded={open} onClick={() => { if (open) close(); else { setOpen(true); setCopied(false); setManual(false); } }}>Share</button>
      {open && (
        <div className="ed-pop" role="dialog" aria-label="Share" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <input ref={input} className="inp" readOnly aria-label="Design link" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button ref={copyBtn} className="btn btn-p" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          {manual && <p role="status">Press Ctrl+C to copy</p>}
          <p className="muted">People in {workspace} can open this link.</p>
        </div>
      )}
    </div>
  );
}
