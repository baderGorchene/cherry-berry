import { useEffect, useRef, useState, type ReactNode } from "react";

export type FileItem = [label: string, run: () => void, disabled?: boolean];

/** A menu button (the top bar's File menu by default): Enter or click opens it on the first item, arrows move, Escape or a click outside closes it and focus returns to the button. */
export default function FileMenu({ items, label = "File", button = label, className = "btn ed-file" }: {
  items: FileItem[]; label?: string; button?: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const entries = () => [...menu.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")];
  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  return (
    <div className="ed-more-w" ref={wrap}>
      <button ref={btn} type="button" className={className} aria-label={typeof button === "string" ? undefined : label} title={typeof button === "string" ? undefined : label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{button}</button>
      {open && (
        <div ref={menu} role="menu" aria-label={label} className="ed-ctx ed-menu"
          // Keys here belong to the menu, not to the editor's shortcuts.
          onKeyDown={(e) => {
            e.stopPropagation();
            const list = entries(), i = list.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
            else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
            else if (e.key === "End") { e.preventDefault(); list.at(-1)?.focus(); }
          }}>
          {items.map(([label, run, disabled]) => (
            <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { setOpen(false); run(); }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
