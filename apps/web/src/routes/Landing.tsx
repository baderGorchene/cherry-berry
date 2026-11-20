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
    lead: "Start with a",
    words: ["social post", "pitch deck", "print flyer", "custom canvas"],
    lines: ["Page · 210 × 297 mm", "Bleed · 3 mm", "Print · CMYK"],
  },
  {
    num: "02 · Design",
    title: "Edit vectors, type & brand locks",
    body: "Shape bezier paths, swap brand swatches in live popovers, and lock approved layers so teams stay on brand.",
    lead: "Shape your",
    words: ["bezier paths", "headlines", "brand swatches", "locked layers"],
    lines: ["Space Grotesk · 64 pt", "Fill · #8E1EA2", "Brand lock · Fixed"],
  },
  {
    num: "03 · Review",
    title: "Collaborate live & run preflight",
    body: "Edit side by side with live teammate cursors while automated preflight checks fonts, bleed, and image sharpness.",
    lead: "Review with",
    words: ["live cursors", "your team", "preflight", "version history"],
    lines: ["✓ Fonts available", "✓ Bleed filled", "✓ Text inside safe area", "✓ Images sharp · 300 DPI", "✓ Licenses & attribution"],
  },
  {
    num: "04 · Export",
    title: "Ship to web, press, or .cherry",
    body: "Export print PDFs with crop marks, crisp SVGs, PNGs, PPTX decks, or open-source .cherry project files.",
    lead: "Ship it as a",
    words: ["print PDF", "crisp SVG", "PNG", "PPTX deck", ".cherry file"],
    lines: ["PDF · Print · crop marks", "300 DPI · CMYK", "saturday-market-flyer.pdf ready"],
  },
] as const;

const STEP_MS = 6000;
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Splits text into per-letter spans for staggered CSS animation; screen readers get the plain text. */
function Letters({ text }: { text: string }) {
  let i = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(" ").map((word, w) => (
          <span key={w}>
            <span className="hiw-word">
              {[...word].map((ch) => (
                <span key={i} className="hiw-ch" style={{ "--i": i++ } as React.CSSProperties}>{ch}</span>
              ))}
            </span>{" "}
          </span>
        ))}
      </span>
    </>
  );
}

/** Cycles through words, each one rolling in. Holds the first word under reduced motion. */
function Rotator({ words }: { words: readonly string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = setInterval(() => setN((x) => (x + 1) % words.length), 1500);
    return () => clearInterval(id);
  }, [words]);
  return <span key={n} className="hiw-rot">{words[n]}</span>;
}

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
  { kind: "social", name: "Social post", size: "1080 × 1080 px", note: "Square feed graphics & carousels" },
  { kind: "deck", name: "Presentation", size: "1920 × 1080 px", note: "Widescreen multi-page decks" },
  { kind: "flyer", name: "Print flyer", size: "A4 · 3 mm bleed", note: "Press-ready PDF with crop marks" },
  { kind: "card", name: "Business card", size: "85 × 55 mm · bleed", note: "Crisp typography & brand logos" },
  { kind: "poster", name: "Event poster", size: "A3 · 3 mm bleed", note: "Full-bleed backgrounds & vectors" },
  { kind: "custom", name: "Custom canvas", size: "px · mm · cm · in", note: "Any dimensions you need" },
] as const;

/** Decorative, looping mini design drawn at each format's real aspect ratio. */
function FormatArt({ kind }: { kind: (typeof FORMATS)[number]["kind"] }) {
  switch (kind) {
    case "social":
      return (
        <>
          <div className="fa fa-social">
            <div className="fa-slides">
              <span style={{ background: "#FFC0DE", color: "#4A0E56" }}>Fresh</span>
              <span style={{ background: "#8E1EA2", color: "#fff" }}>Local</span>
              <span style={{ background: "#C9303D", color: "#fff" }}>Sat 9am</span>
              <span style={{ background: "#FFC0DE", color: "#4A0E56" }}>Fresh</span>
            </div>
          </div>
          <span className="fa-dots"><i /><i /><i /></span>
        </>
      );
    case "deck":
      return (
        <div className="fa fa-deck">
          <b>Q3 growth</b>
          <span className="fa-bars"><i /><i /><i /><i /><i /></span>
        </div>
      );
    case "flyer":
      return (
        <div className="fa fa-flyer">
          <span className="fa-bleed" />
          <span className="fa-crop fa-crop-tl" /><span className="fa-crop fa-crop-tr" />
          <span className="fa-crop fa-crop-bl" /><span className="fa-crop fa-crop-br" />
          <span className="fa-flyer-sun" />
          <b>Saturday<br />Market</b>
          <i className="fa-line" /><i className="fa-line fa-line-s" />
        </div>
      );
    case "card":
      return (
        <div className="fa fa-bcard">
          <div className="fa-bcard-in">
            <div className="fa-bcard-front">
              <img src="/logo.png" alt="" />
              <span><b>Maya Lin</b><small>Art director</small></span>
            </div>
            <div className="fa-bcard-back">Cherry Berry</div>
          </div>
        </div>
      );
    case "poster":
      return (
        <div className="fa fa-poster">
          <span className="fa-poster-sun" />
          <b><span>JAZZ</span><span>NIGHT</span></b>
          <small>Fri · 8 pm</small>
        </div>
      );
    case "custom":
      return (
        <div className="fa fa-custom">
          <span className="fa-handle" />
          <span className="fa-units"><span>1200 px</span><span>210 mm</span><span>21 cm</span><span>8.5 in</span><span>1200 px</span></span>
        </div>
      );
  }
}

const MARQUEE = [
  "Vector booleans", "Bezier pen", "Multi-page layouts", "Brand kits", "Live cursors", "Version history",
  "Preflight checks", "3 mm bleed", "PDF · Print", "SVG", "PNG", "PPTX", ".cherry files", "Self-hostable",
];

const PV_TOOLS = [
  "M5 3l14 8-6 2-2 6z",
  "M4 4h16v16H4z",
  "M12 3l7 18-7-4-7 4z",
  "M5 5h14M12 5v14",
  "M4 16l5-5 4 4 3-3 4 4M4 4h16v16H4z",
];

const PV_LAYERS = ["Headline", "Subtitle", "Sun", "Hills", "Background"];

/** Animated, non-interactive replica of the editor for the hero. Base styles are the finished poster; keyframes build it. */
function AppPreview() {
  return (
    <div className="pv-stage">
      <div className="pv-win" role="img" aria-label="Cherry Berry editor building a market flyer with a teammate's live cursor">
        <div className="pv-bar" aria-hidden="true">
          <span className="pv-dots"><i /><i /><i /></span>
          <span className="pv-crumb"><b>Saturday Market Flyer</b><em>Saved</em></span>
          <span className="pv-url">cherry.local/d/saturday-market</span>
          <span className="pv-avs"><i style={{ background: "#8E1EA2" }}>M</i><i style={{ background: "#C654C3" }}>L</i></span>
          <span className="pv-export">Export</span>
        </div>
        <div className="pv-body" aria-hidden="true">
          <div className="pv-rail">
            <span className="pv-rail-hi" />
            {PV_TOOLS.map((d) => (
              <svg key={d} viewBox="0 0 24 24"><path d={d} /></svg>
            ))}
          </div>
          <div className="pv-layers">
            <span className="pv-h">Layers</span>
            <div className="pv-layer-list">
              <span className="pv-layer-hi" />
              {PV_LAYERS.map((l) => <span key={l} className="pv-layer"><i />{l}</span>)}
            </div>
            <span className="pv-h">Pages</span>
            <div className="pv-pages"><span className="pv-page-on" /><span /><span /></div>
          </div>
          <div className="pv-canvas">
            <div className="pv-board">
              <svg viewBox="0 0 300 400">
                <rect className="pv-bg" width="300" height="400" />
                <circle className="pv-sun" cx="210" cy="110" r="55" />
                <path className="pv-hills" pathLength="600" d="M0 330 C60 290 120 300 170 322 S260 300 300 312 L300 400 L0 400 Z" />
                <text className="pv-t pv-t1" x="20" y="208">Saturday</text>
                <text className="pv-t pv-t2" x="20" y="258">Market</text>
                <text className="pv-sub" x="22" y="290">Fresh berries · Local makers · 9 am</text>
                <g className="pv-badge">
                  <circle cx="248" cy="360" r="24" />
                  <text x="248" y="365">SAT</text>
                </g>
              </svg>
              <span className="pv-sel"><i /><i /><i /><i /></span>
              <span className="pv-cursor">
                <svg viewBox="0 0 16 16"><path d="M1 1l13 6-6 1.5L5.5 15z" /></svg>
                <b>Leo</b>
              </span>
            </div>
            <span className="pv-zoom">100%</span>
            <span className="pv-toast">✓ saturday-market.pdf exported</span>
          </div>
          <div className="pv-props">
            <span className="pv-h">Fill</span>
            <div className="pv-sw">
              <i style={{ background: "#4A0E56" }} /><i style={{ background: "#8E1EA2" }} />
              <i style={{ background: "#C654C3" }} /><i style={{ background: "#ED96D7" }} />
              <span className="pv-sw-ring" />
            </div>
            <span className="pv-h">Text</span>
            <span className="pv-field">Space Grotesk</span>
            <span className="pv-row"><span className="pv-field">700</span><span className="pv-field">48 pt</span></span>
            <span className="pv-h">Opacity</span>
            <span className="pv-slider"><i /></span>
            <span className="pv-h">Preflight</span>
            <span className="pv-ok">● 5/5 clear</span>
          </div>
        </div>
      </div>
      <span className="pv-chip pv-chip-a" aria-hidden="true"><i style={{ background: "#C654C3" }} /> Leo is editing</span>
      <span className="pv-chip pv-chip-b" aria-hidden="true">✓ Preflight 5/5</span>
      <span className="pv-chip pv-chip-c" aria-hidden="true">PDF · 300 DPI · crop marks</span>
    </div>
  );
}

/** Feeds the pointer position to the card's CSS spotlight. */
function spotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export default function Landing() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setStep((s) => (s + 1) % WORKFLOW_STEPS.length), STEP_MS);
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
              <p className="land-kicker land-rise"><i className="land-ping" aria-hidden="true" /> Open-source design studio</p>
              <h1 className="land-h1 land-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
                Design freely. <span>Own every file.</span>
              </h1>
              <p className="land-lead land-rise" style={{ "--d": "160ms" } as React.CSSProperties}>
                Cherry Berry brings vector editing, multi-page layouts, brand kits, and print-ready export together in a fast, self-hostable studio with zero paywalls.
              </p>
              <div className="land-cta land-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
                <Link to="/sign-in" className="btn btn-p land-btn-glow">Start designing <span aria-hidden="true">→</span></Link>
                <a href="#how-it-works" className="btn">See how it works</a>
              </div>
              <div className="land-meta land-rise" style={{ "--d": "320ms" } as React.CSSProperties}>
                <span><i className="land-dot" aria-hidden="true" /> Real-time collaboration</span>
                <span><i className="land-dot" aria-hidden="true" /> 24+ built-in starters</span>
                <span><i className="land-dot" aria-hidden="true" /> Export PDF, PNG, SVG, PPTX &amp; .cherry</span>
              </div>
            </div>

            <div className="land-hero-art">
              <img
                src="/hero.png"
                alt="Cherry Berry illustration"
                className="land-hero-img"
              />
              <span className="land-spark land-spark-a" aria-hidden="true" />
              <span className="land-spark land-spark-b" aria-hidden="true" />
              <span className="land-spark land-spark-c" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="land-preview" aria-label="Editor preview">
          <div className="land-in">
            <AppPreview />
          </div>
        </section>

        <div className="land-marquee" aria-label="Highlights">
          <div className="land-marquee-track">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 || undefined}>
                {MARQUEE.map((m) => <li key={m}>{m}</li>)}
              </ul>
            ))}
          </div>
        </div>

        <section id="how-it-works" className="land-sec">
          <div className="land-in">
            <div className="land-sec-center rv">
              <span className="land-card-badge">Interactive studio walkthrough</span>
              <h2>From blank page to press-ready in minutes</h2>
              <p className="muted">
                Four steps from first idea to finished file. Hover to pause, or pick any step.
              </p>
            </div>

            <div
              className="hiw"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
              }}
            >
              <div className="hiw-tabs rv" role="tablist" aria-label="Workflow steps">
                {WORKFLOW_STEPS.map((item, i) => (
                  <button
                    key={item.num}
                    id={`hiw-tab-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={step === i}
                    aria-controls="hiw-panel"
                    className="hiw-tab"
                    onClick={() => setStep(i)}
                  >
                    <span className="hiw-tab-num">{item.num}</span>
                    <span className="hiw-tab-title">{item.title}</span>
                    {step === i && (
                      <span
                        className={paused ? "hiw-prog hiw-prog-paused" : "hiw-prog"}
                        style={{ animationDuration: `${STEP_MS}ms` }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div
                id="hiw-panel"
                key={step}
                className="hiw-stage"
                role="tabpanel"
                aria-labelledby={`hiw-tab-${step}`}
                aria-live="polite"
              >
                <span className="hiw-ghost" aria-hidden="true">{activeStep.num.slice(0, 2)}</span>
                <h3 className="hiw-title"><Letters text={activeStep.title} /></h3>
                <p className="hiw-lead">
                  {activeStep.lead} <Rotator words={activeStep.words} />
                </p>
                <p className="hiw-body">{activeStep.body}</p>
                <ul className="hiw-lines">
                  {activeStep.lines.map((line, i) => (
                    <li key={line} style={{ "--i": i, "--c": line.length } as React.CSSProperties}>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
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
                <div className="land-story-art rv-art">
                  <img src={story.img} alt={story.alt} />
                </div>
                <div className="land-story-copy rv">
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
            <div className="land-sec-head rv">
              <h2>Start from any format</h2>
              <p className="muted">
                Pick a preset size or start from a built-in starter template across social, presentation, and print categories.
              </p>
            </div>
            <div className="land-grid-3">
              {FORMATS.map((fmt) => (
                <article key={fmt.name} className="land-card fmt-card rv" onPointerMove={spotlight}>
                  <div className="fmt-stage" aria-hidden="true">
                    <FormatArt kind={fmt.kind} />
                  </div>
                  <div className="fmt-copy">
                    <span className="land-card-badge">{fmt.size}</span>
                    <h3>{fmt.name}</h3>
                    <p>{fmt.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-sec">
          <div className="land-in">
            <div className="land-banner rv">
              <span className="land-banner-orb" aria-hidden="true" />
              <div>
                <h2>Ready to create your first workspace?</h2>
                <p>
                  Sign in or create an account to start designing, share brand kits with your team, and export open .cherry files anytime.
                </p>
              </div>
              <Link to="/sign-in" className="btn land-banner-btn" style={{ background: "#fff", color: "#4A0E56", borderColor: "#fff" }}>
                Open Cherry Berry <span aria-hidden="true">→</span>
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
