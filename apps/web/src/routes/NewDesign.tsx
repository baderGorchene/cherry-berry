import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { createDesign, errorMessage, myWorkspaces, type NewDesign } from "../api";
import { currentWorkspace } from "../App";
import { IconClose } from "../icons";
import { PRESETS } from "./Home";

const DEFAULT_BLEED: Record<string, number> = { mm: 3, in: 0.125 };

export default function NewDesign() {
  const navigate = useNavigate();
  // ?preset=<name> (the phone size row) fills the custom form with that preset
  const [params] = useSearchParams();
  const preset = PRESETS.find((p) => p.name === params.get("preset"))?.body;
  const [unit, setUnit] = useState(preset?.unit ?? "px");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  useEffect(() => {
    myWorkspaces().then((r) => setViewOnly(currentWorkspace.pick(r.workspaces)?.role === "viewer"), () => {});
  }, []);

  async function create(body: NewDesign) {
    setBusy(true); setError("");
    try {
      const ws = currentWorkspace.pick((await myWorkspaces()).workspaces);
      if (!ws) return navigate("/workspaces");
      const { design } = await createDesign(ws.id, body);
      navigate(`/d/${design.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    return create({
      title: String(f.get("title")).trim() || "Untitled design",
      width: Number(f.get("width")),
      height: Number(f.get("height")),
      unit,
      colorMode: String(f.get("colorMode")),
      ...(unit === "px" ? {} : { bleed: Number(f.get("bleed")) }),
    });
  }

  return (
    <div className="dlg-page">
      <div className="dlg">
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ fontSize: 24 }}>New design</h1>
          <Link to="/" className="btn" aria-label="Close" style={{ padding: 0, width: 44 }}><IconClose /></Link>
        </header>
        {viewOnly && <p className="muted" style={{ fontSize: 14 }}>You have view-only access to this workspace.</p>}
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="dlg-cols">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p className="ph">Presets</p>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="row" disabled={busy || viewOnly} title={viewOnly ? "View-only access" : undefined} onClick={() => create(p.body)}
                style={{ background: "#fff", font: "inherit", color: "inherit", textAlign: "left" }}>
                <span style={{ width: 48, height: 48, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tint)", borderRadius: 10 }}>
                  <span style={{ width: p.w / 2, height: p.h / 2, background: p.bg, borderRadius: 3, border: p.bg === "#fff" ? "2px solid var(--berry)" : 0 }} />
                </span>
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{p.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{p.size}</span>
                </span>
              </button>
            ))}
          </div>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="ph">Custom size</p>
        <div>
          <label className="lbl" htmlFor="title">Title</label>
          <input id="title" name="title" className="inp" defaultValue="Untitled design" maxLength={120} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <div>
            <label className="lbl" htmlFor="width">Width</label>
            <input id="width" name="width" className="inp" type="number" min="0.01" step="any" defaultValue={preset?.width ?? 1080} required />
          </div>
          <div>
            <label className="lbl" htmlFor="height">Height</label>
            <input id="height" name="height" className="inp" type="number" min="0.01" step="any" defaultValue={preset?.height ?? 1080} required />
          </div>
          <div>
            <label className="lbl" htmlFor="unit">Unit</label>
            <select id="unit" className="inp" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option>px</option><option>mm</option><option>in</option>
            </select>
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl">Color mode</legend>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="opt"><input type="radio" name="colorMode" value="rgb" defaultChecked={preset?.colorMode !== "cmyk"} />RGB · screen</label>
            <label className="opt"><input type="radio" name="colorMode" value="cmyk" defaultChecked={preset?.colorMode === "cmyk"} />CMYK · print</label>
          </div>
        </fieldset>
        {unit !== "px" && (
          <div>
            <label className="lbl" htmlFor="bleed">Bleed ({unit})</label>
            <input id="bleed" key={unit} name="bleed" className="inp" type="number" min="0" step="any" defaultValue={unit === preset?.unit ? preset.bleed ?? DEFAULT_BLEED[unit] : DEFAULT_BLEED[unit]} required />
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-p" type="submit" disabled={busy || viewOnly} title={viewOnly ? "View-only access" : undefined}>Create</button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
}
