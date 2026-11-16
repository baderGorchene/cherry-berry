import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const FOCUSABLE = "input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * A button and the dialog it opens next to it (below, or above when there is no room).
 * Focus moves into the dialog; Escape closes it and returns focus to the button; a press outside closes it.
 * Keys inside belong to the dialog, not to the editor's shortcuts. Fixed positioning, so a scrolling toolbar never clips it.
 */
export default function Popover({ label, button, buttonLabel, title, className = "ed-tbb", disabled, children }: {
  label: string; button: ReactNode; buttonLabel?: string; title?: string; className?: string; disabled?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = (refocus: boolean) => { setOpen(false); setPos(null); if (refocus) btn.current?.focus(); };

  useLayoutEffect(() => {
    if (!open) return;
    const b = btn.current!.getBoundingClientRect(), p = pop.current!;
    const w = p.offsetWidth, h = p.offsetHeight;
    const below = b.bottom + 6, above = b.top - 6 - h;
    const top = below + h <= innerHeight - 8 || above < 8 ? below : above;
    setPos({ left: Math.max(8, Math.min(b.left, innerWidth - w - 8)), top: Math.max(8, top) });
    (p.querySelector<HTMLElement>(FOCUSABLE) ?? p).focus(); // a dialog with nothing to focus takes focus itself
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);

  return (
    <span className="ed-popw" ref={wrap}>
      <button ref={btn} type="button" className={className} aria-label={buttonLabel} title={title ?? buttonLabel} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close(false) : setOpen(true))}>{button}</button>
      {open && (
        <div ref={pop} role="dialog" aria-label={label} tabIndex={-1} className="ed-pop2" style={pos ?? { left: 0, top: 0, opacity: 0 }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); close(true); }
          }}>
          {children}
        </div>
      )}
    </span>
  );
}
