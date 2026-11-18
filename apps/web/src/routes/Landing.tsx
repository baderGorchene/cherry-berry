import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BrandLogo } from "../BrandLogo";
import { ThemeToggle } from "../ThemeToggle";
import "./landing.css";

const WORKFLOW_STEPS = [
  {
    num: "01 · Start",
    title: "Pick a starter or custom size",
    body: "Launch social posts, presentation decks, or print-ready flyers with built-in 3 mm bleed and safe margins.",
    rail: "Templates",
    toolbar: ["Page · 210 × 297 mm", "Bleed · 3 mm", "Print · CMYK"],
  },
  {
    num: "02 · Design",
    title: "Edit vectors, type & brand locks",
    body: "Shape bezier paths, swap brand swatches in live popovers, and lock approved layers so teams stay on brand.",
    rail: "Design",
    toolbar: ["Space Grotesk · 64 pt", "B · I", "#8E1EA2", "Brand lock · Fixed"],
  },
  {
    num: "03 · Review",
    title: "Collaborate live & run preflight",
    body: "Edit side by side with live teammate cursors while automated preflight checks fonts, bleed, and image sharpness.",
    rail: "Preflight",
    toolbar: ["Live sync · 2 editors", "Preflight · 5/5 Clear"],
  },
  {
    num: "04 · Export",
    title: "Ship to web, press, or .cherry",
    body: "Export print PDFs with crop marks, crisp SVGs, PNGs, PPTX decks, or open-source .cherry project files.",
    rail: "Export",
    toolbar: ["PDF · Print", "300 DPI", "Crop marks"],
  },
] as const;

const STORIES = [
  {
    badge: "01 · Vector & Layout Engine",
    title: "Big projects, zero bloat",
    body: "Tackle complex multi-page designs with boolean vector operations, path editing, and a fast canvas built for real illustration and layout work.",
    img: "/scene-boss.png",
    alt: "Cherry Berry character facing a giant mossy forest creature",
    reverse: false,
  },
  {
    badge: "02 · Print & Pixel Precision",
    title: "Craft every detail from screen to press",
    body: "Switch effortlessly between px, mm, cm, and inches. Paint backgrounds edge to edge across 3 mm bleed zones and inspect trim lines right on the canvas.",
    img: "/scene-craft.png",
    alt: "Cherry Berry character fishing peacefully beside a stream",
    reverse: true,
  },
  {
    badge: "03 · Real-time Collaboration",
    title: "Multiplayer by default, calm by design",
    body: "Invite teammates into shared workspaces with live cursors, automatic version history, and role-based permissions — no seat tax or paywalls.",
    img: "/scene-collab.png",
    alt: "Cherry Berry character resting and sharing tea with a small bird",
    reverse: false,
  },
  {
    badge: "04 · Shared Brand & Asset Library",
    title: "One workspace for kits, fonts & shapes",
    body: "Stock your studio with approved logos, custom WOFF2 typography, reusable vector shapes, and workspace templates you control completely.",
    img: "/scene-library.png",
    alt: "Cherry Berry character visiting a woodland badger merchant stall",
    reverse: true,
  },
] as const;

const FORMATS = [
  { name: "Social post", size: "1080 × 1080 px", note: "Square feed graphics & carousels" },
  { name: "Presentation", size: "1920 × 1080 px", note: "Widescreen multi-page decks" },
  { name: "Print flyer", size: "A4 · 3 mm bleed", note: "Press-ready PDF with crop marks" },
  { name: "Business card", size: "85 × 55 mm · bleed", note: "Crisp typography & brand logos" },
  { name: "Event poster", size: "A3 · 3 mm bleed", note: "Full-bleed backgrounds & vectors" },
  { name: "Custom canvas", size: "px · mm · cm · in", note: "Any dimensions you need" },
];

const SIM_EXPORT_FORMATS = [
  { id: "pdf-print", label: "PDF · Print", hint: "Bleed, crop marks" },
  { id: "pdf-digital", label: "PDF · Digital", hint: "Smallest PDF" },
  { id: "png", label: "PNG", hint: "Transparent" },
  { id: "svg", label: "SVG", hint: "True vectors" },
  { id: "pptx", label: "PPTX", hint: "Editable slides" },
  { id: "cherry", label: ".cherry", hint: "Open-source file" },
] as const;

const PREFLIGHT_CHECKS = [
  ["Fonts available", "All document fonts loaded"],
  ["Bleed filled", "3 mm background edge to edge"],
  ["Text inside safe area", "All headlines inside trim margin"],
  ["Images sharp", "All visuals >= 300 DPI"],
  ["Licenses & attribution", "Team assets verified"],
] as const;

export default function Landing() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [simFmt, setSimFmt] = useState<string>("pdf-print");
  const [simCropMarks, setSimCropMarks] = useState(true);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setStep((s) => (s + 1) % WORKFLOW_STEPS.length), 4600);
    return () => clearInterval(id);
  }, [paused]);

  const activeStep = WORKFLOW_STEPS[step]!;

  return (
    <div className="land">
      <header className="land-nav">
        <div className="land-in land-nav-in">
          <Link to="/" className="brand" style={{ textDecoration: "none" }}>
            <BrandLogo />
          </Link>
          <nav aria-label="Landing" className="land-links">
            <a href="#how-it-works" className="land-link">How it works</a>
            <a href="#features" className="land-link">Features</a>
            <a href="#formats" className="land-link">Formats</a>
          </nav>
          <div className="land-actions">
            <ThemeToggle />
            <Link to="/sign-in" className="btn">Sign in</Link>
            <Link to="/sign-in" className="btn btn-p">Get started</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="land-hero">
          <div className="land-in land-hero-grid">
            <div>
              <p className="land-kicker">Open-source design studio</p>
              <h1 className="land-h1">
                Design freely. <span>Own every file.</span>
              </h1>
              <p className="land-lead">
                Cherry Berry brings vector editing, multi-page layouts, brand kits, and print-ready export together in a fast, self-hostable studio with zero paywalls.
              </p>
              <div className="land-cta">
                <Link to="/sign-in" className="btn btn-p">Start designing</Link>
                <a href="#how-it-works" className="btn">See how it works</a>
              </div>
              <div className="land-meta">
                <span><i className="land-dot" aria-hidden="true" /> Real-time collaboration</span>
                <span><i className="land-dot" aria-hidden="true" /> 24+ built-in starters</span>
                <span><i className="land-dot" aria-hidden="true" /> Export PDF, PNG, SVG, PPTX &amp; .cherry</span>
              </div>
            </div>

            <img
              src="/hero.png"
              alt="Cherry Berry illustration"
              className="land-hero-img"
            />
          </div>
        </section>

        <section id="how-it-works" className="land-sec">
          <div className="land-in">
            <div className="land-sec-center">
              <span className="land-card-badge">Interactive studio walkthrough</span>
              <h2>From blank page to press-ready in minutes</h2>
              <p className="muted">
                Watch the Cherry Berry editor move from starter templates and vector anchor editing to live preflight and export. Hover or click any step to inspect it.
              </p>
            </div>

            <div
              className="land-demo"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
              }}
            >
              <div className="land-steps" role="tablist" aria-label="Workflow steps">
                {WORKFLOW_STEPS.map((item, i) => (
                  <button
                    key={item.num}
                    type="button"
                    role="tab"
                    aria-selected={step === i}
                    className="land-step"
                    onClick={() => setStep(i)}
                  >
                    <span className="land-step-num">{item.num}</span>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    {step === i && (
                      <span
                        key={`prog-${step}`}
                        className={paused ? "land-step-prog land-step-prog-paused" : "land-step-prog"}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="land-stage" aria-live="polite">
                {/* Miniature Editor Header */}
                <div className="sim-ed-head">
                  <div className="sim-ed-left-head">
                    <span className="sim-ed-back" aria-hidden="true">‹</span>
                    <span className="sim-ed-pill">File</span>
                    <span className="sim-ed-title">Saturday Market Flyer</span>
                    <span className="sim-ed-saved">Saved</span>
                  </div>
                  <div className="sim-ed-right-head">
                    <span className="sim-ed-avs" aria-hidden="true">
                      <i style={{ background: "#8E1EA2" }}>M</i>
                      <i style={{ background: "#C654C3" }}>L</i>
                    </span>
                    <span className="sim-ed-export-btn">Export</span>
                  </div>
                </div>

                {/* Miniature Context Toolbar */}
                <div className="sim-ed-tb">
                  {activeStep.toolbar.map((t) => (
                    <span key={t} className="sim-ed-tbb">{t}</span>
                  ))}
                </div>

                {/* Miniature Editor Body */}
                <div className="sim-ed-body">
                  <div className="sim-ed-rail" aria-hidden="true">
                    {(["Templates", "Design", "Preflight", "Export"] as const).map((r) => (
                      <span key={r} className={activeStep.rail === r ? "sim-rail-item sim-rail-on" : "sim-rail-item"}>
                        {r.slice(0, 3)}
                      </span>
                    ))}
                  </div>

                  <div className="sim-sim" key={`stage-${step}`}>
                    {step === 0 && (
                      <div className="sim-step0">
                        <div className="sim-drawer">
                          <span className="sim-drawer-h">Print Starters</span>
                          <div className="sim-starter sim-starter-active">
                            <strong>Saturday Market</strong>
                            <span>A4 · 3 mm bleed</span>
                          </div>
                          <div className="sim-starter">
                            <strong>Jazz Night Poster</strong>
                            <span>A3 · 3 mm bleed</span>
                          </div>
                          <div className="sim-starter">
                            <strong>Brand Deck</strong>
                            <span>1920 × 1080 px</span>
                          </div>
                        </div>
                        <div className="sim-page-wrap">
                          <div className="sim-page">
                            <span className="sim-bleed-box" aria-hidden="true" />
                            <span className="sim-bleed-tag">3 mm bleed trim</span>
                            <h4>Saturday Market</h4>
                            <p>Fresh berries · Local print</p>
                            <span className="sim-insert-btn">Insert as new page</span>
                          </div>
                          <span className="sim-pointer sim-pointer-s0" aria-hidden="true">▲</span>
                        </div>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="sim-step1">
                        <div className="sim-vec-stage">
                          <span className="sim-hud">X: 105 mm · Y: 148 mm</span>
                          <svg className="sim-vec-svg" viewBox="0 0 220 140" aria-hidden="true">
                            <path
                              className="sim-vec-path"
                              d="M 40 95 C 55 25, 165 25, 180 95 C 145 125, 75 125, 40 95 Z"
                            />
                            <line className="sim-vec-handle-line" x1="40" y1="95" x2="55" y2="25" />
                            <line className="sim-vec-handle-line" x1="180" y1="95" x2="165" y2="25" />
                            <circle className="sim-vec-pt" cx="40" cy="95" r="4.5" />
                            <circle className="sim-vec-pt sim-vec-pt-drag" cx="180" cy="95" r="4.5" />
                            <circle className="sim-vec-cp" cx="55" cy="25" r="3.5" />
                            <circle className="sim-vec-cp sim-vec-cp-drag" cx="165" cy="25" r="3.5" />
                          </svg>
                          <span className="sim-pointer sim-pointer-s1" aria-hidden="true">▲</span>
                        </div>
                        <div className="sim-popover">
                          <span className="sim-drawer-h">Brand Palette</span>
                          <div className="sim-swatch-row">
                            <span className="sim-swatch sim-sw-a" style={{ background: "#8E1EA2" }} />
                            <span className="sim-swatch sim-sw-b" style={{ background: "#C654C3" }} />
                            <span className="sim-swatch" style={{ background: "#ED96D7" }} />
                            <span className="sim-swatch" style={{ background: "#FFC0DE" }} />
                          </div>
                          <span className="sim-lock">Brand lock · Fixed</span>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="sim-step2">
                        <div className="sim-collab-canvas">
                          <div className="sim-sel-box sim-sel-maya">
                            <span>Hero Title</span>
                          </div>
                          <div className="sim-sel-box sim-sel-leo">
                            <span>Berry Badge</span>
                          </div>
                          <span className="sim-cursor sim-cursor-maya" aria-hidden="true">Maya</span>
                          <span className="sim-cursor sim-cursor-leo" aria-hidden="true">Leo</span>
                        </div>
                        <div className="sim-preflight">
                          <div className="sim-pf-head">
                            <strong>Preflight</strong>
                            <span className="sim-pf-ok">All clear</span>
                          </div>
                          {PREFLIGHT_CHECKS.map(([title, detail], idx) => (
                            <div
                              key={title}
                              className="sim-check"
                              style={{ animationDelay: `${idx * 90}ms` }}
                            >
                              <div>
                                <b>{title}</b>
                                <span>{detail}</span>
                              </div>
                              <span className="sim-check-badge">✓</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="sim-step3">
                        <div className="sim-exp-cards">
                          {SIM_EXPORT_FORMATS.map((fmt) => (
                            <label key={fmt.id} className="sim-exp-card">
                              <input
                                type="radio"
                                name="sim-format"
                                checked={simFmt === fmt.id}
                                onChange={() => setSimFmt(fmt.id)}
                              />
                              <b>{fmt.label}</b>
                              <span>{fmt.hint}</span>
                            </label>
                          ))}
                        </div>
                        <div className="sim-exp-foot">
                          <label className="sim-exp-chk">
                            <input
                              type="checkbox"
                              checked={simCropMarks}
                              onChange={(e) => setSimCropMarks(e.target.checked)}
                            />
                            <span>Include 3 mm crop marks</span>
                          </label>
                          <div className="sim-bar" aria-hidden="true"><div className="sim-bar-fill" /></div>
                          <div className="sim-exp-status">
                            <span>
                              ✓ saturday-market-flyer.{simFmt.startsWith("pdf") ? "pdf" : simFmt} ready
                            </span>
                            <span className="sim-ed-export-btn">Export</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Miniature Bottom Page Strip */}
                <div className="sim-ed-bottom">
                  <div className="sim-strip" aria-hidden="true">
                    <span className="sim-thumb sim-thumb-on">Page 1</span>
                    <span className="sim-thumb">Page 2</span>
                    <span className="sim-thumb">+</span>
                  </div>
                  <span className="sim-zoom">100%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="land-sec">
          <div className="land-in land-stories">
            {STORIES.map((story) => (
              <article
                key={story.badge}
                className={story.reverse ? "land-story land-story-rev" : "land-story"}
              >
                <div className="land-story-art">
                  <img src={story.img} alt={story.alt} />
                </div>
                <div className="land-story-copy">
                  <span className="land-card-badge">{story.badge}</span>
                  <h3>{story.title}</h3>
                  <p>{story.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="formats" className="land-sec">
          <div className="land-in">
            <div className="land-sec-head">
              <h2>Start from any format</h2>
              <p className="muted">
                Pick a preset size or start from a built-in starter template across social, presentation, and print categories.
              </p>
            </div>
            <div className="land-grid-3">
              {FORMATS.map((fmt) => (
                <article key={fmt.name} className="land-card">
                  <span className="land-card-badge">{fmt.size}</span>
                  <h3>{fmt.name}</h3>
                  <p>{fmt.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-sec">
          <div className="land-in">
            <div className="land-banner">
              <div>
                <h2>Ready to create your first workspace?</h2>
                <p>
                  Sign in or create an account to start designing, share brand kits with your team, and export open .cherry files anytime.
                </p>
              </div>
              <Link to="/sign-in" className="btn" style={{ background: "#fff", color: "#4A0E56", borderColor: "#fff" }}>
                Open Cherry Berry
              </Link>
            </div>
          </div>
        </section>

        <section className="land-cover" aria-label="Cherry Berry world cover">
          <img
            src="/cover-wide.jpg"
            alt="Cherry Berry character overlooking a lush forest valley"
            className="land-cover-img"
          />
          <div className="land-cover-scrim">
            <div className="land-in land-cover-copy">
              <p>An open-source creative studio where your files stay yours forever.</p>
              <span className="land-cover-tag">Self-hostable · .cherry format</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="land-foot">
        <div className="land-in land-foot-in">
          <span className="brand"><BrandLogo size={24} /></span>
          <p className="muted" style={{ fontSize: 13 }}>
            Open-source vector &amp; print design studio · Own every <code>.cherry</code> file.
          </p>
          <Link to="/sign-in" className="land-link">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
