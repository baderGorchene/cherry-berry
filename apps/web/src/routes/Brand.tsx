import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import {
  ColorRole, colorBadge, defaultKitContent, parseKitFile, serializeKitFile, type BrandKitContent,
} from "@cherry/doc";
import {
  ApiError, assetUrl, createKit, deleteFont, deleteKit, errorMessage, instanceInfo, listKits, listTemplates, myWorkspaces, saveKit,
  templateThumbUrl, uploadAsset, uploadFont, type BrandKit, type Template, type Workspace,
} from "../api";
import { currentWorkspace, useSession } from "../App";
import AppShell from "../AppShell";
import { kitFamilies, useKitFonts } from "../brand/fonts";
import { precheck, tooLarge } from "../library/upload";

type KitColor = BrandKitContent["colors"][number];
type Logos = BrandKitContent["logos"];
type Rules = BrandKitContent["rules"];
type Style = "heading" | "subheading" | "body";

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const MAX_FONT = 5 * 1024 * 1024;
export const BADGE = { "AAA text": "aa-good", "AA text": "aa-good", "Large text only": "aa-warn", "Background only": "aa-bg" } as const;
const STYLES: [Style, string, string][] = [
  ["heading", "Heading", "Fresh picks, every week"],
  ["subheading", "Subheading", "Small batch, big flavor"],
  ["body", "Body", "Use body text for anything longer than one line. Keep it on white or Petal backgrounds."],
];
export const SLOTS: [keyof Logos, string, string][] = [
  ["primary", "Primary", "SVG or PNG"], ["onDark", "On dark", "SVG or PNG"],
  ["mark", "Icon / mark", "Square, 512 px+"], ["wordmark", "Wordmark", "SVG preferred"],
];
export const RULES: [keyof Rules, string, string][] = [
  ["kitColorsOnly", "Only allow kit colors in brand templates", "Only allow kit colors"],
  ["warnOffBrandFonts", "Warn when off-brand fonts are used", "Warn on off-brand fonts"],
  ["lockLogos", "Lock logos against stretching and recoloring", "Lock logos"],
  ["flagContrast", "Flag text that fails contrast (AA)", "Flag low contrast"],
  ["requireApproval", "Require approval before publishing", "Require approval"],
];

export default function Brand() {
  const { setUser } = useSession();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState("");
  const [colorForm, setColorForm] = useState<(KitColor & { isNew: boolean }) | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoSlot = useRef<keyof Logos>("primary");
  const [maxMb, setMaxMb] = useState(50);
  useEffect(() => { instanceInfo().then((i) => setMaxMb(i.maxUploadMb), () => {}); }, []);
  const [, setCurrentId] = useState<string | null>(null); // re-render when the sidebar switches workspace

  useEffect(() => {
    myWorkspaces().then((r) => setList(r.workspaces), (e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null); else setList([]);
    });
  }, []);
  const ws = list && currentWorkspace.pick(list);
  const canEdit = ws?.role === "owner" || ws?.role === "admin";
  const kit = kits?.find((k) => k.id === kitId) ?? null;
  const kitsRef = useRef(kits);
  kitsRef.current = kits;
  useKitFonts(kit);

  const load = (pick?: string) => ws && listKits(ws.id).then((k) => {
    setKits(k);
    setKitId((cur) => pick ?? (k.some((x) => x.id === cur) ? cur : (k[0]?.id ?? null)));
  }, (e) => { setKits([]); setError(errorMessage(e)); });
  useEffect(() => { setKits(null); setKitId(null); setError(""); void load(); }, [ws?.id]);
  useEffect(() => {
    setTemplates([]);
    if (ws && kit) listTemplates("workspace", { workspaceId: ws.id }).then((t) => setTemplates(t.filter((x) => x.kitId === kit.id).slice(0, 3)), () => {});
  }, [ws?.id, kit?.id]);

  if (list === null) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!ws) return <Navigate to="/workspaces" replace />;

  const fail = (e: unknown) => setError(errorMessage(e));
  // ponytail: whole-kit PUT, last write wins; add per-field patches if two admins edit at once
  // Every change is computed from the latest kit state (a ref, so awaits and quick successive edits never use a stale render).
  const update = (id: string, fn: (c: BrandKitContent) => BrandKitContent) => {
    const cur = kitsRef.current?.find((k) => k.id === id);
    if (!cur) return;
    const content = fn(cur.content);
    kitsRef.current = kitsRef.current!.map((k) => (k.id === id ? { ...k, content } : k));
    setKits(kitsRef.current);
    setError("");
    saveKit(id, { name: cur.name, content }).catch((e) => { fail(e); void load(); });
  };
  const edit = (fn: (c: BrandKitContent) => BrandKitContent) => update(kit!.id, fn);

  const newKit = async (name: string | null, content?: BrandKitContent) => {
    if (!name?.trim()) return;
    try { await load((await createKit(ws.id, { name: name.trim(), content })).id); setError(""); } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!kit || !confirm(`Delete "${kit.name}"? This can't be undone.`)) return;
    try { await deleteKit(kit.id); await load(); } catch (e) { fail(e); }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serializeKitFile(kit!.name, kit!.content)], { type: "application/json" }));
    a.download = `${kit!.name}.cherrykit.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importKit = async (file: File | undefined) => {
    if (!file) return;
    const r = parseKitFile(await file.text().catch(() => ""));
    if (!r.ok) return setError("That file isn't a Cherry Berry kit.");
    await newKit(r.name, r.content);
  };
  const promptNew = () => void newKit(prompt("Name your brand kit"), defaultKitContent());

  const saveColor = () => {
    if (!colorForm) return;
    const { isNew, ...c } = colorForm;
    edit((k) => ({ ...k, colors: isNew ? [...k.colors, c] : k.colors.map((x) => (x.id === c.id ? c : x)) }));
    setColorForm(null);
  };

  const pickLogo = (key: keyof Logos) => {
    if (!confirm("Only upload a logo your organisation owns. Continue?")) return;
    logoSlot.current = key;
    logoInput.current?.click();
  };
  const onLogo = async (file: File | undefined) => {
    if (!file || !kit) return;
    const pre = precheck(file, maxMb);
    if (pre === "too_large") return setError(tooLarge(maxMb));
    if (pre !== "ok") return fail(new ApiError(400, pre));
    const key = logoSlot.current, id = kit.id;
    try {
      const { asset } = await uploadAsset(file, {
        title: `${kit.name} logo – ${SLOTS.find((s) => s[0] === key)![1]}`, tags: ["logo"], license: "own", attribution: "",
        visibility: "workspace", workspaceId: ws.id,
      });
      update(id, (c) => ({ ...c, logos: { ...c.logos, [key]: asset.id } }));
    } catch (e) { fail(e); }
  };

  const importLabel = (
    <label className="btn">
      Import kit
      <input type="file" className="sr-only" accept=".json,application/json" onChange={(e) => { void importKit(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );

  return (
    <AppShell active="brand" onSwitch={setCurrentId}>
      {error && <p role="alert" className="field-error">{error}</p>}
      {kits === null ? <p className="muted">Loading…</p> : !kit ? (
        <section className="card empty">
          <h1 className="page-title">Brand kits</h1>
          <p><strong>No brand kit yet.</strong></p>
          <p className="muted">A brand kit keeps your colors, fonts and logos in one place, so every design in the workspace stays on brand. You can also lock parts of a template so they can't be changed by mistake.</p>
          {canEdit ? (
            <div className="chips">
              <button type="button" className="btn btn-p" onClick={promptNew}>Create a brand kit</button>
              {importLabel}
            </div>
          ) : <p className="muted">Ask a workspace owner or admin to create one.</p>}
        </section>
      ) : (
        <>
          <header className="page-head" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="kit" className="ph">Brand kit</label>
              <select id="kit" className="kit-select" value={kit.id} onChange={(e) => setKitId(e.target.value)}>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div className="chips">
              {canEdit && <button type="button" className="btn" onClick={promptNew}>+ New brand kit</button>}
              <Link to={`/brand/${kit.id}/guide`} className="btn">Style guide</Link>
              <button type="button" className="btn" onClick={download}>Download kit</button>
              {canEdit && importLabel}
              {canEdit && <button type="button" className="btn" onClick={() => void remove()}>Delete kit</button>}
            </div>
          </header>

          <section className="card" aria-labelledby="c">
            <div className="card-head">
              <h2 id="c" className="card-title">Colors</h2>
              {canEdit && !colorForm && (
                <button type="button" className="btn" onClick={() => setColorForm({ isNew: true, id: crypto.randomUUID().slice(0, 8), name: "", role: "primary", hex: "#8E1EA2" })}>+ Add color</button>
              )}
            </div>
            {colorForm && (
              <form className="color-form" onSubmit={(e) => { e.preventDefault(); saveColor(); }}>
                <div><label className="lbl" htmlFor="cn">Color name</label>
                  <input id="cn" className="inp" maxLength={40} value={colorForm.name} onChange={(e) => setColorForm({ ...colorForm, name: e.target.value })} /></div>
                <div><label className="lbl" htmlFor="cr">Color role</label>
                  <select id="cr" className="inp" value={colorForm.role} onChange={(e) => setColorForm({ ...colorForm, role: e.target.value as KitColor["role"] })}>
                    {ColorRole.options.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
                  </select></div>
                <div><label className="lbl" htmlFor="ch">Hex</label>
                  <div className="chips" style={{ flexWrap: "nowrap" }}>
                    <input type="color" aria-label="Pick color" className="color-pick" value={HEX.test(colorForm.hex) ? colorForm.hex : "#000000"}
                      onChange={(e) => setColorForm({ ...colorForm, hex: e.target.value.toUpperCase() })} />
                    <input id="ch" className="inp" maxLength={7} value={colorForm.hex} onChange={(e) => setColorForm({ ...colorForm, hex: e.target.value.toUpperCase() })} />
                  </div></div>
                <div className="chips">
                  <button type="submit" className="btn btn-p" disabled={!colorForm.name.trim() || !HEX.test(colorForm.hex)}>Save color</button>
                  <button type="button" className="btn" onClick={() => setColorForm(null)}>Cancel</button>
                </div>
              </form>
            )}
            {kit.content.colors.length === 0 && !colorForm && <p className="muted">No colors yet.</p>}
            <ul className="sw-grid">
              {kit.content.colors.map((c) => {
                const badge = colorBadge(c.hex);
                return (
                  <li key={c.id} className="sw">
                    <div className="sw-c" style={{ background: c.hex }} />
                    <div className="sw-t">
                      <strong>{c.name} · {cap(c.role)}</strong>
                      <span className="muted">{c.hex}</span>
                      <span className={`aa ${BADGE[badge]}`}>{badge}</span>
                      {canEdit && (
                        <span className="chips" style={{ marginTop: 6 }}>
                          <button type="button" className="btn btn-sm" aria-label={`Edit ${c.name}`} onClick={() => setColorForm({ ...c, isNew: false })}>Edit</button>
                          <button type="button" className="btn btn-sm" aria-label={`Remove ${c.name}`} onClick={() => edit((k) => ({ ...k, colors: k.colors.filter((x) => x.id !== c.id) }))}>Remove</button>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="brand-grid">
            <section className="card" aria-labelledby="t">
              <div className="card-head">
                <h2 id="t" className="card-title">Typography</h2>
                {canEdit && <button type="button" className="btn" onClick={() => setFontOpen(true)}>Upload font</button>}
              </div>
              {STYLES.map(([key, label, sample]) => {
                const s = kit.content.typography[key];
                const set = (p: Partial<typeof s>) => edit((c) => ({ ...c, typography: { ...c.typography, [key]: { ...c.typography[key], ...p } } }));
                const families = kitFamilies(kit);
                return (
                  <div key={key} className="tt-row">
                    <span className="ph">{label} · {s.fontFamily} {s.fontWeight} · {s.fontSize} pt</span>
                    <p style={{ fontFamily: `"${s.fontFamily}", Inter, sans-serif`, fontWeight: s.fontWeight, fontSize: Math.min(s.fontSize * 4 / 3, 40), lineHeight: s.lineHeight, margin: "6px 0 0" }}>{sample}</p>
                    {canEdit && (
                      <div className="tt-edit">
                        <select className="inp" aria-label={`${label} font`} value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                          {(families.includes(s.fontFamily) ? families : [s.fontFamily, ...families]).map((f) => <option key={f}>{f}</option>)}
                        </select>
                        <select className="inp" aria-label={`${label} weight`} value={s.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
                          {WEIGHTS.map((w) => <option key={w}>{w}</option>)}
                        </select>
                        <input className="inp" type="number" min={1} max={500} step="any" aria-label={`${label} size (pt)`} key={s.fontSize} defaultValue={s.fontSize}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 500 && n !== s.fontSize) set({ fontSize: n }); else e.target.value = String(s.fontSize); }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {kit.fonts.length > 0 && (
                <ul className="fonts">
                  {kit.fonts.map((f) => (
                    <li key={f.id} className="row">
                      <span style={{ flex: 1 }}>{f.family} · {f.weight}{f.style === "italic" ? " italic" : ""}</span>
                      {canEdit && (
                        <button type="button" className="btn btn-sm" aria-label={`Remove ${f.family}`}
                          onClick={() => deleteFont(f.id).then(() => setKits((ks) => ks && ks.map((k) => (k.id === kit.id ? { ...k, fonts: k.fonts.filter((x) => x.id !== f.id) } : k))), fail)}>Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="l">
              <h2 id="l" className="card-title">Logos</h2>
              <p className="muted" style={{ fontSize: 14 }}>Upload each version once. The editor picks the right one for light or dark backgrounds.</p>
              <input ref={logoInput} type="file" className="sr-only" tabIndex={-1} aria-label="Logo file" accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
                onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="slots">
                {SLOTS.map(([key, label, hint]) => {
                  const id = kit.content.logos[key];
                  const cls = `slot${key === "onDark" ? " slot-dark" : ""}`;
                  return (
                    <div key={key} data-testid={`slot-${key}`} className="slot-wrap">
                      {id ? (
                        <div className={`${cls} slot-full`}>
                          <img src={assetUrl(id, "thumb")} alt={`${label} logo`} />
                          {canEdit && (
                            <span className="chips">
                              <button type="button" className="btn btn-sm" aria-label={`Replace ${label}`} onClick={() => pickLogo(key)}>Replace</button>
                              <button type="button" className="btn btn-sm" aria-label={`Remove ${label}`} onClick={() => edit((c) => ({ ...c, logos: { ...c.logos, [key]: null } }))}>Remove</button>
                            </span>
                          )}
                        </div>
                      ) : canEdit ? (
                        <button type="button" className={cls} onClick={() => pickLogo(key)}>
                          <span aria-hidden="true">+</span><strong>{label}</strong><span>{hint}</span>
                        </button>
                      ) : (
                        <div className={cls}><strong>{label}</strong><span>Not set</span></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="brand-grid">
            <section className="card" aria-labelledby="bt">
              <div className="card-head">
                <h2 id="bt" className="card-title">Brand templates</h2>
                <Link to="/templates" style={{ fontWeight: 600, fontSize: 14 }}>See all</Link>
              </div>
              {templates.length === 0 ? <p className="muted">Publish a design as a brand template from the editor.</p> : (
                <ul className="tpl-grid">
                  {templates.map((t) => (
                    <li key={t.id} className="tpl">
                      <img src={templateThumbUrl(t.id)} alt={t.name} />
                      <span className="tpl-lock">LOCKED</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted" style={{ fontSize: 13 }}>Locked layers stay put. Editors can change only text and images marked editable.</p>
            </section>

            <section className="card" aria-labelledby="r" style={{ gap: 0 }}>
              <h2 id="r" className="card-title" style={{ marginBottom: 8 }}>Brand rules</h2>
              {RULES.map(([key, text, name]) => {
                const on = kit.content.rules[key];
                return (
                  <div key={key} className="tgl">
                    <span>{text}</span>
                    <button type="button" role="switch" aria-checked={on} aria-label={name} className="tgl-sw" disabled={!canEdit}
                      onClick={() => edit((c) => ({ ...c, rules: { ...c.rules, [key]: !c.rules[key] } }))} />
                  </div>
                );
              })}
            </section>
          </div>
        </>
      )}
      {fontOpen && kit && (
        <FontDialog kit={kit} onClose={() => setFontOpen(false)}
          onDone={(font) => { setKits((ks) => ks && ks.map((k) => (k.id === kit.id ? { ...k, fonts: [...k.fonts, font] } : k))); setFontOpen(false); }} />
      )}
    </AppShell>
  );
}

function FontDialog({ kit, onClose, onDone }: { kit: BrandKit; onClose(): void; onDone(font: BrandKit["fonts"][number]): void }) {
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState(400);
  const [italic, setItalic] = useState(false);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(f.size > MAX_FONT ? "That file is too large (5 MB max)." : "");
    setFamily((cur) => cur || f.name.replace(/\.[^.]*$/, "").slice(0, 60));
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true); setError("");
    try { onDone(await uploadFont(kit.id, file, { family: family.trim(), weight, style: italic ? "italic" : "normal" })); } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  const ok = !!file && file.size <= MAX_FONT && !!family.trim() && rights && !busy;

  return (
    <div className="overlay" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="font-h" className="card" style={{ width: "min(480px, 100%)", outline: "none" }}>
        <h2 id="font-h" className="card-title">Upload font</h2>
        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (ok) void submit(); }}>
          <div><label className="lbl" htmlFor="ff">Font file</label>
            <input id="ff" type="file" accept=".woff2,.woff,.ttf,.otf" onChange={(e) => pick(e.target.files?.[0])} /></div>
          <div><label className="lbl" htmlFor="fy">Family</label>
            <input id="fy" className="inp" maxLength={60} value={family} onChange={(e) => setFamily(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="fw">Weight</label>
            <select id="fw" className="inp" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>{WEIGHTS.map((w) => <option key={w}>{w}</option>)}</select></div>
          <label className="opt"><input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />Italic</label>
          <label className="opt"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />I have the right to use this font in this workspace.</label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="chips" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-p" disabled={!ok}>Upload</button>
          </div>
        </form>
      </div>
    </div>
  );
}
