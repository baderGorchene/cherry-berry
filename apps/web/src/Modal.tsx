import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/** A modal dialog: focuses inside on open, traps Tab, closes on Escape, and gives focus back to its opener. */
export default function Modal({ title, onClose, children, className, closeButton }: {
  title: string; onClose(): void; children: ReactNode; className?: string; closeButton?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement); // read during the first render, before any autofocus
  const focusables = () => [...box.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select, textarea, a[href]")];
  useEffect(() => {
    const el = opener.current;
    if (!box.current!.contains(document.activeElement)) (box.current!.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
    return () => { if (el instanceof HTMLElement && el.isConnected) el.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const f = focusables(), first = f[0], end = f[f.length - 1];
    if (!first || !end) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  };
  const heading = <h2 id="hist-dlg" style={{ fontSize: 18 }}>{title}</h2>;
  return (
    <div className="hist-scrim">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="hist-dlg" className={`card hist-dlg${className ? ` ${className}` : ""}`} onKeyDown={trap}>
        {closeButton ? (
          <div className="modal-head">{heading}<button type="button" className="ed-ib" aria-label="Close" onClick={onClose}><IconClose /></button></div>
        ) : heading}
        {children}
      </div>
    </div>
  );
}
