import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createDesign, errorMessage, myWorkspaces } from "../api";
import { currentWorkspace } from "../App";

const DEFAULT_BLEED: Record<string, number> = { mm: 3, in: 0.125 };

export default function NewDesign() {
  const navigate = useNavigate();
  const [unit, setUnit] = useState("px");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const ws = currentWorkspace.pick((await myWorkspaces()).workspaces);
      if (!ws) return navigate("/workspaces");
      const { design } = await createDesign(ws.id, {
        title: String(f.get("title")).trim() || "Untitled design",
        width: Number(f.get("width")),
        height: Number(f.get("height")),
        unit,
        colorMode: String(f.get("colorMode")),
        ...(unit === "px" ? {} : { bleed: Number(f.get("bleed")) }),
      });
      navigate(`/d/${design.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", padding: "48px 16px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <form className="card" onSubmit={submit} style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ fontSize: 22 }}>New design</h1>
        <div>
          <label className="lbl" htmlFor="title">Title</label>
          <input id="title" name="title" className="inp" defaultValue="Untitled design" maxLength={120} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <div>
            <label className="lbl" htmlFor="width">Width</label>
            <input id="width" name="width" className="inp" type="number" min="0.01" step="any" defaultValue={1080} required />
          </div>
          <div>
            <label className="lbl" htmlFor="height">Height</label>
            <input id="height" name="height" className="inp" type="number" min="0.01" step="any" defaultValue={1080} required />
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
            <label className="opt"><input type="radio" name="colorMode" value="rgb" defaultChecked />RGB · screen</label>
            <label className="opt"><input type="radio" name="colorMode" value="cmyk" />CMYK · print</label>
          </div>
        </fieldset>
        {unit !== "px" && (
          <div>
            <label className="lbl" htmlFor="bleed">Bleed ({unit})</label>
            <input id="bleed" key={unit} name="bleed" className="inp" type="number" min="0" step="any" defaultValue={DEFAULT_BLEED[unit]} required />
          </div>
        )}
        {error && <p role="alert" className="field-error">{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Link to="/" className="btn">Cancel</Link>
          <button className="btn btn-p" type="submit" disabled={busy}>Create</button>
        </div>
      </form>
    </div>
  );
}
