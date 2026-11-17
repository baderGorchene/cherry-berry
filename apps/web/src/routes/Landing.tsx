import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BrandLogo } from "../BrandLogo";
import "./landing.css";

const WORKFLOW_STEPS = [
  {
    num: "01 · Start",
    title: "Pick a starter or custom size",
    body: "Launch social posts, presentation decks, or print-ready flyers with built-in bleed and safe margins.",
  },
  {
    num: "02 · Design",
    title: "Edit vectors, type & brand locks",
    body: "Shape bezier paths, swap brand swatches, and lock approved layers so teams stay consistent.",
  },
  {
    num: "03 · Review",
    title: "Collaborate live & run preflight",
    body: "Work together in real time while automated preflight checks fonts, bleed, and image sharpness.",
  },
  {
    num: "04 · Export",
    title: "Ship to web, press, or .cherry",
    body: "Download print PDFs with crop marks, crisp SVGs, PNGs, PPTX decks, or portable .cherry files.",
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

export default function Landing() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % WORKFLOW_STEPS.length), 3600);
    return () => clearInterval(id);
  }, []);

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
              <span className="land-card-badge">Interactive walkthrough</span>
              <h2>From blank page to press-ready in minutes</h2>
              <p className="muted">
                Watch how a design moves from starter template to vector editing, live preflight, and multi-format export.
              </p>
            </div>

            <div className="land-demo">
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
                  </button>
                ))}
              </div>

              <div className="land-stage" aria-live="polite">
                <div className="land-stage-bar">
                  <div className="land-stage-dots" aria-hidden="true"><i /><i /><i /></div>
                  <span>{WORKFLOW_STEPS[step]!.num} — {WORKFLOW_STEPS[step]!.title}</span>
                </div>
                <div className="land-sim">
                  {step === 0 && (
                    <div className="sim-starters">
                      <div className="sim-starter sim-starter-active">
                        <strong>A4 Print Flyer</strong>
                        <span>210 × 297 mm · 3 mm bleed</span>
                      </div>
                      <div className="sim-starter">
                        <strong>Social Square</strong>
                        <span>1080 × 1080 px</span>
                      </div>
                      <div className="sim-starter">
                        <strong>Pitch Deck</strong>
                        <span>1920 × 1080 px · 16:9</span>
                      </div>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="sim-canvas">
                      <div className="sim-shape" aria-hidden="true">
                        <span className="sim-handle sim-h-tl" />
                        <span className="sim-handle sim-h-tr" />
                        <span className="sim-handle sim-h-bl" />
                        <span className="sim-handle sim-h-br" />
                      </div>
                      <div className="sim-props">
                        <strong style={{ fontSize: 14 }}>Brand palette &amp; path handles</strong>
                        <div className="sim-swatch-row" aria-hidden="true">
                          <span className="sim-swatch" style={{ background: "#8E1EA2" }} />
                          <span className="sim-swatch" style={{ background: "#C654C3" }} />
                          <span className="sim-swatch" style={{ background: "#ED96D7" }} />
                          <span className="sim-swatch" style={{ background: "#FFC0DE" }} />
                        </div>
                        <span className="sim-lock">Brand lock enabled</span>
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="sim-collab">
                      <span className="sim-cursor" aria-hidden="true">Maya editing</span>
                      <div className="sim-check"><span>Fonts embedded &amp; ready</span><b>✓ Clear</b></div>
                      <div className="sim-check"><span>3 mm full-bleed background</span><b>✓ Clear</b></div>
                      <div className="sim-check"><span>Safe-area typography</span><b>✓ Clear</b></div>
                    </div>
                  )}
                  {step === 3 && (
                    <div>
                      <div className="sim-exports">
                        <span className="sim-exp-pill sim-exp-pill-on">PDF · Print</span>
                        <span className="sim-exp-pill">SVG</span>
                        <span className="sim-exp-pill">PNG</span>
                        <span className="sim-exp-pill">PPTX</span>
                        <span className="sim-exp-pill">.cherry</span>
                      </div>
                      <div className="sim-bar" aria-hidden="true"><div className="sim-bar-fill" /></div>
                      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                        Exporting crop marks &amp; bleed box — 100% open format, zero watermarks.
                      </p>
                    </div>
                  )}
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
