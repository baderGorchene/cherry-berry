import { useEffect, useRef, useState } from "react";

export type FileItem = [label: string, run: () => void, disabled?: boolean];

/** The top bar's File menu: Enter or click opens it on the first item, arrows move, Escape or a click outside closes it and focus returns to File. */
export default function FileMenu({ items }: { items: FileItem[] }) {
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
      <button ref={btn} type="button" className="btn ed-file" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>File</button>
      {open && (
        <div ref={menu} role="menu" aria-label="File" className="ed-ctx ed-menu"
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
