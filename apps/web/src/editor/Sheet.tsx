import { useEffect, useRef, type ReactNode } from "react";

/** Phone bottom sheet above the tool bar: focus moves in on open and back on close; Escape, the handle or a scrim tap close it. */
export default function Sheet({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current!.focus();
    return () => { if (back?.isConnected) back.focus(); };
  }, []);
  return (
    <>
      <div className="ed-scrim" data-testid="sheet-scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className="ed-sheet"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
        <button type="button" className="ed-handle" aria-label="Close" onClick={onClose} />
        {children}
      </div>
    </>
  );
}
