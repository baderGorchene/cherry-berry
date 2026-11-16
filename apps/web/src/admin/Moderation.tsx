import { useEffect, useRef, useState } from "react";
import { ApiError, assetUrl, errorMessage, moderate, moderationQueue, templateThumbUrl, type QueueAction, type QueueItem } from "../api";
import { LICENSES } from "../library/assets";
import Modal from "../Modal";

const REASON = { copyright: "Copyright claim", inappropriate: "Inappropriate", spam: "Spam", other: "Other" } as const;
const NOUN = { asset: ["Visual", "uploaded"], shape: ["Shape", "saved"], template: ["Template", "published"] } as const;
const key = (i: QueueItem) => `${i.kind}:${i.targetType}:${i.targetId}`;
const sameTarget = (a: QueueItem, b: QueueItem) => a.targetType === b.targetType && a.targetId === b.targetId;

function Thumb({ item }: { item: QueueItem }) {
  const [failed, setFailed] = useState(false);
  const src = item.targetType === "asset" ? assetUrl(item.targetId, "thumb") : item.targetType === "template" ? templateThumbUrl(item.targetId) : null;
  if (!src || failed) return <span className="rep-th" aria-hidden="true">{NOUN[item.targetType][0]}</span>;
  return <img className="rep-th" src={src} alt="" onError={() => setFailed(true)} />;
}

function Card({ item, busy, onAct }: { item: QueueItem; busy: boolean; onAct(action: QueueAction): void }) {
  const [noun, verb] = NOUN[item.targetType];
  const license = item.kind === "report" ? LICENSES.find((l) => l.value === item.license)?.badge : undefined;
  const id = `rep-${item.kind}-${item.targetId}`;
  return (
    <article className="rep" aria-labelledby={id}>
      <Thumb item={item} />
      <div className="rep-body">
        <h3 id={id} className="rep-title">{item.title}</h3>
        <p className="muted">{noun} {verb} by {item.uploader.name} · public{license ? ` · ${license}` : ""}</p>
        {item.kind === "report" ? (
          <p className="rep-why">
            <span className={item.reason === "copyright" ? "rs rs-err" : "rs"}>{REASON[item.reason]}</span>
            <span className="muted">{item.count === 1 ? "1 report" : `${item.count} reports`}</span>
            {item.note && <span className="muted">“{item.note}”</span>}
          </p>
        ) : (
          <p className="rep-why">
            <span className="rs rs-warn">Sanitizer flagged</span>
            <span className="muted">Unsafe parts were removed on upload. Review the cleaned file.</span>
          </p>
        )}
      </div>
      <div className="rep-act">
        {item.kind === "report" ? <>
          <button type="button" className="btn" disabled={busy} onClick={() => onAct("keep")}>Keep</button>
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => onAct("remove")}>Remove</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onAct("suspend")}>Suspend uploader</button>
        </> : <>
          <button type="button" className="btn" disabled={busy} onClick={() => onAct("approve")}>Approve cleaned file</button>
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => onAct("remove")}>Remove</button>
        </>}
      </div>
    </article>
  );
}

export default function Moderation() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ item: QueueItem; action: "remove" | "suspend" } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAt = useRef<number | null>(null); // where the removed card was, so focus lands on what took its place
  useEffect(() => { moderationQueue().then(setItems, (e) => setError(errorMessage(e))); }, []);
  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    const cards = list.current?.querySelectorAll<HTMLElement>(".rep") ?? [];
    const next = cards[Math.min(at, cards.length - 1)];
    (next?.querySelector<HTMLElement>("button") ?? heading.current)?.focus();
  }, [items]);

  const act = async (item: QueueItem, action: QueueAction) => {
    setConfirm(null); setBusy(key(item)); setError("");
    // Removing deletes the target, so every row for it goes; keep and approve settle only this row.
    const drop = () => {
      focusAt.current = items?.findIndex((i) => key(i) === key(item)) ?? 0;
      setItems((is) => is?.filter((i) => (action === "remove" || action === "suspend" ? !sameTarget(i, item) : key(i) !== key(item))) ?? null);
    };
    try {
      await moderate(item, action);
      drop();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) drop(); // someone else already dealt with it
      else setError(action === "suspend" && e instanceof ApiError && e.code === "invalid_body" ? "Admins can't be suspended." : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const c = confirm;
  return (
    <section className="sec" aria-labelledby="adm-h">
      <div className="adm-head">
        <h2 id="adm-h" ref={heading} tabIndex={-1} className="sec-title">Moderation</h2>
        <p className="page-sub">Reported public visuals, shapes and templates, and SVGs the sanitizer changed</p>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      {items?.length === 0 && <p className="card muted">Nothing to review.</p>}
      {items && items.length > 0 && (
        <div className="rep-list" ref={list}>
          {items.map((i) => (
            <Card key={key(i)} item={i} busy={busy === key(i)}
              onAct={(action) => (action === "remove" || action === "suspend" ? setConfirm({ item: i, action }) : act(i, action))} />
          ))}
        </div>
      )}
      {c && (
        <Modal title={c.action === "remove" ? "Remove for everyone?" : `Suspend ${c.item.uploader.name}?`} onClose={() => setConfirm(null)}>
          <p>
            {c.action === "remove"
              ? `“${c.item.title}” will be deleted.${c.item.targetType === "asset" ? " Designs that placed it show a placeholder instead." : ""}`
              : `“${c.item.title}” will be deleted and ${c.item.uploader.name} won't be able to sign in until you unsuspend them.`}
          </p>
          <div className="hist-actions">
            <button type="button" className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className={c.action === "remove" ? "btn btn-p" : "btn btn-danger"} onClick={() => act(c.item, c.action)}>
              {c.action === "remove" ? "Remove" : "Suspend uploader"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
