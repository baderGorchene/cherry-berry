import { Link } from "react-router";
import { BrandLogo } from "../BrandLogo";
import "./landing.css";

const FEATURES = [
  {
    badge: "Vector engine",
    title: "True paths & boolean ops",
    body: "Edit anchor points, convert shapes to paths, and combine geometry cleanly without leaving the browser.",
  },
  {
    badge: "Print-ready",
    title: "Bleed, crop marks & preflight",
    body: "Work in mm, cm, in, or px with 3 mm bleed guides, safe-area checks, and PDF/PNG/SVG/PPTX export.",
  },
  {
    badge: "Brand kits",
    title: "Shared colors, fonts & locks",
    body: "Keep every workspace design on brand with shared palettes, custom WOFF2 fonts, and layer brand-locks.",
  },
  {
    badge: "Open format",
    title: "Portable .cherry files",
    body: "Own your work with open-source .cherry documents, live multiplayer editing, and self-hostable storage.",
  },
];

const FORMATS = [
  { name: "Social post", size: "1080 × 1080 px", note: "Square feed graphics & carousels" },
  { name: "Presentation", size: "1920 × 1080 px", note: "Widescreen multi-page decks" },
  { name: "Print flyer", size: "A4 · 3 mm bleed", note: "Press-ready PDF with crop marks" },
  { name: "Business card", size: "85 × 55 mm · bleed", note: "Crisp typography & brand logos" },
  { name: "Event poster", size: "A3 · 3 mm bleed", note: "Full-bleed backgrounds & vectors" },
  { name: "Custom canvas", size: "px · mm · cm · in", note: "Any dimensions you need" },
];

export default function Landing() {
  return (
    <div className="land">
      <header className="land-nav">
        <div className="land-in land-nav-in">
          <Link to="/" className="brand" style={{ textDecoration: "none" }}>
            <BrandLogo />
          </Link>
          <nav aria-label="Landing" className="land-links">
            <a href="#features" className="land-link">Features</a>
            <a href="#formats" className="land-link">Formats</a>
            <a href="#print" className="land-link">Print &amp; Self-host</a>
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
                <a href="#features" className="btn">Explore features</a>
              </div>
              <div className="land-meta">
                <span><i className="land-dot" aria-hidden="true" /> Real-time collaboration</span>
                <span><i className="land-dot" aria-hidden="true" /> 24+ built-in starters</span>
                <span><i className="land-dot" aria-hidden="true" /> Export PDF, PNG, SVG, PPTX &amp; .cherry</span>
              </div>
            </div>
            <div className="land-stage" aria-label="Cherry Berry studio preview">
              <img
                src="/hero.png"
                alt="Cherry Berry illustration"
                className="land-hero-img"
              />
            </div>
          </div>
        </section>

        <section id="features" className="land-sec">
          <div className="land-in">
            <div className="land-sec-head">
              <h2>Built for real design work</h2>
              <p className="muted">
                Every tool you need from quick social graphics to print-ready flyers, without locking your documents in a proprietary cloud.
              </p>
            </div>
            <div className="land-grid-4">
              {FEATURES.map((f) => (
                <article key={f.title} className="land-card">
                  <span className="land-card-badge">{f.badge}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
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

        <section id="print" className="land-sec">
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
