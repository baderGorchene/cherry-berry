import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { colorBadge, contrast } from "@cherry/doc";
import { assetUrl, getKit, myWorkspaces, type BrandKit } from "../api";
import { useKitFonts } from "../brand/fonts";
import { BADGE, RULES, SLOTS, cap } from "./Brand";

const SAMPLE = "The quick brown fox jumps over the lazy dog";

export default function StyleGuide() {
  const { id = "" } = useParams();
  const [kit, setKit] = useState<BrandKit | null | undefined>(undefined); // undefined = loading, null = unavailable
  const [wsName, setWsName] = useState("");
  useKitFonts(kit ?? null);
  useEffect(() => {
    setKit(undefined);
    getKit(id).then(async (k) => {
      setKit(k);
      setWsName((await myWorkspaces().catch(() => ({ workspaces: [] }))).workspaces.find((w) => w.id === k.workspaceId)?.name ?? "");
    }, () => setKit(null));
  }, [id]);

  if (kit === undefined) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!kit) return <main className="guide"><p>This brand kit isn't available.</p><Link to="/">Home</Link></main>;

  const { colors, typography, logos, rules } = kit.content;
  const filled = SLOTS.filter(([k]) => logos[k]);
  const on = RULES.filter(([k]) => rules[k]);
  return (
    <main className="guide">
      <header className="page-head" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">{kit.name} · Style guide</h1>
          <p className="muted">{wsName}</p>
        </div>
        <button type="button" className="btn no-print" onClick={() => window.print()}>Print or save as PDF</button>
      </header>

      <section className="card" aria-labelledby="gc">
        <h2 id="gc" className="card-title">Colors</h2>
        {colors.length === 0 && <p className="muted">No colors yet.</p>}
        <ul className="sw-grid">
          {colors.map((c) => {
            const badge = colorBadge(c.hex);
            return (
              <li key={c.id} className="sw">
                <div className="sw-c" style={{ background: c.hex, height: 120 }} />
                <div className="sw-t">
                  <strong>{c.name} · {cap(c.role)}</strong>
                  <span>{c.hex}</span>
                  <span className="muted">{contrast(c.hex, "#FFFFFF").toFixed(1)}:1 on white</span>
                  <span className={`aa ${BADGE[badge]}`}>{badge}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="gt">
        <h2 id="gt" className="card-title">Typography</h2>
        {(["heading", "subheading", "body"] as const).map((k) => {
          const s = typography[k];
          return (
            <div key={k} className="tt-row">
              <span className="ph">{cap(k)} · {s.fontFamily} {s.fontWeight} · {s.fontSize} pt</span>
              <p style={{ fontFamily: `"${s.fontFamily}", Inter, sans-serif`, fontWeight: s.fontWeight, fontSize: s.fontSize * 4 / 3, lineHeight: s.lineHeight, margin: "6px 0 0" }}>{SAMPLE}</p>
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="gl">
        <h2 id="gl" className="card-title">Logos</h2>
        {filled.length === 0 ? <p className="muted">No logos yet.</p> : (
          <div className="slots">
            {filled.map(([k, label]) => (
              <div key={k} className={`slot slot-full${k === "onDark" ? " slot-dark" : ""}`}>
                <img src={assetUrl(logos[k]!, "file")} alt={`${label} logo`} />
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="gr">
        <h2 id="gr" className="card-title">Rules</h2>
        {on.length === 0 ? <p className="muted">No rules are on.</p> : <ul>{on.map(([k, text]) => <li key={k}>{text}.</li>)}</ul>}
      </section>
    </main>
  );
}
