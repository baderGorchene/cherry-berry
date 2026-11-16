import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { createDesign, errorMessage, importDesign, myWorkspaces, type NewDesign } from "../api";
import { currentWorkspace } from "../App";
import { IconSearch } from "../icons";
import Modal from "../Modal";
import { CATEGORY_LABEL, POPULAR, SIZES, filterSizes, recentSizes, rememberSize, sizeBody, sizeLabel, type CreatePane, type Size } from "./sizes";

const Ctx = createContext<{ open(pane?: CreatePane): void }>({ open: () => {} });
export const useCreateDialog = () => useContext(Ctx);

const PANES: [CreatePane, string][] = [
  ["for-you", "For you"], ["social", CATEGORY_LABEL.social], ["presentation", CATEGORY_LABEL.presentation], ["print", CATEGORY_LABEL.print],
  ["cards", CATEGORY_LABEL.cards], ["custom", "Custom size"], ["open", "Open a .cherry file"],
];
const paneOf = (v: string | null): CreatePane => PANES.find(([id]) => id === v)?.[0] ?? "for-you";
const DEFAULT_BLEED: Record<string, number> = { mm: 3, in: 0.125 };

/** Owns the Create a design dialog. `/new?category=<pane>` is the same dialog, opened over Home. */
export function CreateDialogProvider({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [pane, setPane] = useState<CreatePane | null>(null);
  const onNew = loc.pathname === "/new";
  useEffect(() => setPane(null), [loc.pathname]); // navigating anywhere (into the editor) closes it
  useEffect(() => { if (onNew) setPane(paneOf(new URLSearchParams(loc.search).get("category"))); }, [onNew, loc.search]);
  const open = useCallback((p: CreatePane = "for-you") => setPane(p), []);
  const close = useCallback(() => { setPane(null); if (onNew) navigate("/", { replace: true }); }, [onNew, navigate]);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {pane && <Create pane={pane} setPane={setPane} onClose={close} />}
    </Ctx.Provider>
  );
}

function Preview({ z }: { z: Size }) {
  const k = 56 / Math.max(z.width, z.height);
  return <span className="sz-prev" aria-hidden="true"><span style={{ width: z.width * k, height: z.height * k }} /></span>;
}

function Create({ pane, setPane, onClose }: { pane: CreatePane; setPane(p: CreatePane): void; onClose(): void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [unit, setUnit] = useState("px");
  useEffect(() => {
    myWorkspaces().then((r) => setViewOnly(currentWorkspace.pick(r.workspaces)?.role === "viewer"), () => {});
  }, []);

  async function run(make: (workspaceId: string) => Promise<string>) {
    setBusy(true); setError("");
    try {
      const ws = currentWorkspace.pick((await myWorkspaces()).workspaces);
      if (!ws) return navigate("/workspaces");
      navigate(`/d/${await make(ws.id)}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  const make = (body: NewDesign) => (ws: string) => createDesign(ws, body).then((r) => r.design.id);
  const pick = (z: Size) => { rememberSize(z.id); return run(make(sizeBody(z))); };
  const off = busy || viewOnly;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    return run(make({
      title: String(f.get("title")).trim() || "Untitled design",
      width: Number(f.get("width")), height: Number(f.get("height")), unit, colorMode: String(f.get("colorMode")),
      ...(unit === "px" ? {} : { bleed: Number(f.get("bleed")) }),
    }));
  }
  const openFile = (file: File | undefined) => file && run(async (ws) => (await importDesign(ws, await file.text())).id);

  const cards = (list: Size[]) => (
    <ul className="sz-grid">
      {list.map((z) => (
        <li key={z.id}>
          <button type="button" className="sz-card" disabled={off} title={viewOnly ? "View-only access" : undefined} onClick={() => pick(z)}>
            <Preview z={z} />
            <strong>{z.name}</strong>
            <span className="muted">{sizeLabel(z)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const searching = q.trim() !== "";
  const recents = recentSizes();
  const popular = POPULAR.flatMap((id) => SIZES.find((z) => z.id === id) ?? []);
  let body: ReactNode;
  if (searching) {
    const r = filterSizes(q);
    body = r.length ? cards(r) : <p className="muted">No sizes match “{q.trim()}”. Try Custom size.</p>;
  } else if (pane === "for-you") {
    body = (
      <>
        {recents.length > 0 && <><h3 className="ph">Recent</h3>{cards(recents)}</>}
        <h3 className="ph">Popular</h3>{cards(popular)}
      </>
    );
  } else if (pane === "custom") {
    body = (
      <form onSubmit={submit} className="sz-form">
        <div>
          <label className="lbl" htmlFor="title">Title</label>
          <input id="title" name="title" className="inp" defaultValue="Untitled design" maxLength={120} />
        </div>
        <div className="sz-dims">
          <div><label className="lbl" htmlFor="width">Width</label>
            <input id="width" name="width" className="inp" type="number" min="0.01" step="any" defaultValue={1080} required /></div>
          <div><label className="lbl" htmlFor="height">Height</label>
            <input id="height" name="height" className="inp" type="number" min="0.01" step="any" defaultValue={1080} required /></div>
          <div><label className="lbl" htmlFor="unit">Unit</label>
            <select id="unit" className="inp" value={unit} onChange={(e) => setUnit(e.target.value)}><option>px</option><option>mm</option><option>in</option></select></div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl">Color mode</legend>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="opt"><input type="radio" name="colorMode" value="rgb" defaultChecked />RGB · screen</label>
            <label className="opt"><input type="radio" name="colorMode" value="cmyk" />CMYK · print</label>
          </div>
        </fieldset>
        {unit !== "px" && (
          <div><label className="lbl" htmlFor="bleed">Bleed ({unit})</label>
            <input id="bleed" key={unit} name="bleed" className="inp" type="number" min="0" step="any" defaultValue={DEFAULT_BLEED[unit]} required /></div>
        )}
        <div><button className="btn btn-p" type="submit" disabled={off} title={viewOnly ? "View-only access" : undefined}>Create</button></div>
      </form>
    );
  } else if (pane === "open") {
    body = (
      <div className="sz-open">
        <p className="muted">Open a design saved from Cherry Berry as a .cherry file. It becomes a new design in this workspace.</p>
        <input type="file" accept=".cherry,application/json" disabled={off} aria-label="Choose a .cherry file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void openFile(f); }} />
      </div>
    );
  } else {
    body = cards(SIZES.filter((z) => z.category === pane));
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = PANES.findIndex(([id]) => id === pane);
    const next = PANES[(i + d + PANES.length) % PANES.length]![0];
    setPane(next); setQ("");
    requestAnimationFrame(() => document.getElementById(`ct-${next}`)?.focus());
  };

  return (
    <Modal title="Create a design" onClose={onClose} closeButton className="create-dlg">
      <label className="search create-search">
        <IconSearch />
        <input type="search" className="inp" aria-label="Search sizes" placeholder="Search sizes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="create-cols">
        <div role="tablist" aria-label="Categories" aria-orientation="vertical" className="create-tabs" onKeyDown={onTabKey}>
          {PANES.map(([id, label]) => (
            <button key={id} id={`ct-${id}`} type="button" role="tab" aria-selected={pane === id && !searching} tabIndex={pane === id ? 0 : -1}
              onClick={() => { setPane(id); setQ(""); setError(""); }}>{label}</button>
          ))}
        </div>
        <div role="tabpanel" aria-labelledby={`ct-${pane}`} className="create-body">
          {viewOnly && <p className="muted" style={{ fontSize: 14 }}>You have view-only access to this workspace.</p>}
          {error && <p role="alert" className="field-error">{error}</p>}
          {body}
        </div>
      </div>
    </Modal>
  );
}
