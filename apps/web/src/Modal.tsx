import { useEffect, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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

/** In-app replacement for window.confirm / window.prompt. Resolves to true/the typed text, or false/null when cancelled. */
export function ask(opts: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean>;
export function ask(opts: { title: string; body?: string; ok?: string; input: string }): Promise<string | null>;
export function ask({ title, body, ok = "OK", danger, input }: { title: string; body?: string; ok?: string; danger?: boolean; input?: string }) {
  return new Promise<boolean | string | null>((resolve) => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const done = (v: boolean | string | null) => { root.unmount(); host.remove(); resolve(v); };
    const cancel = () => done(input === undefined ? false : null);
    root.render(
      <Modal title={title} onClose={cancel}>
        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => {
          e.preventDefault();
          done(input === undefined ? true : String(new FormData(e.currentTarget).get("v") ?? ""));
        }}>
          {body && <p className="muted" style={{ margin: 0 }}>{body}</p>}
          {input !== undefined && <input className="inp" name="v" aria-label={title} defaultValue={input} required data-autofocus />}
          <div className="hist-actions">
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
            <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-p"}`} data-autofocus={input === undefined ? true : undefined}>{ok}</button>
          </div>
        </form>
      </Modal>,
    );
  });
}
