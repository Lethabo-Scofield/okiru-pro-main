import { useEffect } from "react";
import { GLOBAL_CSS } from "./LandingPage";
import { type ProductConfig } from "./productLandingConfig";
import { SiteNav, SiteFooter, ArrowRight } from "./siteChrome";

/* ─────────────────────────────────────────────
   PRODUCT PAGE THEMES — each tab gets its own identity
   within the purple / blue / orange palette.
   • purple (B-BBEE Toolkit) — top-accent cards
   • blue   (ESG Toolkit)    — left-accent cards
   • orange (Certificate)    — soft-filled cards
   Scoped to `.okiru-product` so the main landing is untouched.
───────────────────────────────────────────── */
const PRODUCT_CSS = `
  /* ── SHARED STRUCTURE (theme-agnostic, uses themed tokens) ── */
  .okiru-product .ok-nav-link { position: relative; }
  .okiru-product .ok-nav-active { color: #fff; background: rgba(255,255,255,0.06); }
  .okiru-product .ok-nav-active::after {
    content: ''; position: absolute; left: 12px; right: 12px; bottom: 3px; height: 2px;
    border-radius: 2px; background: var(--grad-h);
  }

  .okiru-product .ok-hero { min-height: 0; display: block; padding: 132px 0 52px; align-items: initial; }
  .okiru-product .ok-hero-bg {
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.9) 55%, #ffffff 100%);
  }
  .okiru-product .ok-hero-waves {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 1;
    pointer-events: none;
  }
  .okiru-product .ok-hero-wave {
    position: absolute;
    right: -18%;
    width: min(1120px, 92vw);
    height: 230px;
    border-radius: 999px;
    transform: rotate(-8deg);
    border: 1px solid var(--wave-border);
    background:
      linear-gradient(90deg, transparent 0%, var(--wave-strong) 34%, var(--wave-soft) 74%, transparent 100%);
    box-shadow:
      0 28px 80px var(--wave-shadow),
      inset 0 1px 0 rgba(255,255,255,0.64);
  }
  .okiru-product .ok-hero-wave:nth-child(1) { top: 34px; transform: rotate(-8deg) translateX(2%); opacity: 0.9; }
  .okiru-product .ok-hero-wave:nth-child(2) { top: 142px; transform: rotate(-5deg) translateX(-9%); opacity: 0.64; }
  .okiru-product .ok-hero-wave:nth-child(3) { top: 254px; transform: rotate(-9deg) translateX(7%); opacity: 0.42; }

  /* ── FEATURE CARDS (icon-driven, distinct per tab) ── */
  .okiru-product .ok-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 44px; }
  .okiru-product .ok-feat-card {
    position: relative; display: flex; flex-direction: column; gap: 13px;
    padding: 28px 26px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.022);
    transition: transform .25s ease, border-color .25s ease, background .25s ease, box-shadow .25s ease;
  }
  .okiru-product .ok-feat-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
  .okiru-product .ok-feat-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
  .okiru-product .ok-feat-title { font-family: var(--serif); font-size: 1.28rem; font-weight: 600; color: var(--hi); letter-spacing: -0.01em; line-height: 1.2; }
  .okiru-product .ok-feat-desc { font-size: 13.5px; line-height: 1.65; color: var(--muted); }
  .okiru-product .ok-feat-meta { display: flex; align-items: baseline; gap: 8px; margin-top: auto; padding-top: 4px; }
  .okiru-product .ok-feat-stat { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--hi); letter-spacing: 0.01em; }
  .okiru-product .ok-feat-stat-label { font-size: 11px; color: var(--muted); }

  .okiru-product .ok-about-pillar { grid-template-columns: 64px 1fr; padding: 26px 0; }
  .okiru-product .ok-about-pillar-num {
    font-family: var(--serif); font-weight: 700; font-size: 1.6rem; letter-spacing: -0.02em; padding-top: 0;
    background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }

  .okiru-product #product-cta { border-bottom: none; }
  .okiru-product #product-cta .ok-w > div {
    max-width: 860px; padding: 48px 44px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.09);
  }

  @media (max-width: 900px) { .okiru-product .ok-feat-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 620px) { .okiru-product .ok-feat-grid { grid-template-columns: 1fr; } }
  @media (max-width: 860px) { .okiru-product .ok-services { flex-wrap: wrap; } }

  /* ══════════════ PURPLE — B-BBEE Toolkit ══════════════ */
  .okiru-root.okiru-purple {
    --grad:      linear-gradient(135deg, #9333ea 0%, #a855f7 45%, #f97316 100%);
    --grad-r:    linear-gradient(135deg, #f97316 0%, #a855f7 55%, #9333ea 100%);
    --grad-text: linear-gradient(100deg, #a855f7 0%, #c084fc 48%, #fb923c 100%);
    --grad-h:    linear-gradient(90deg, #9333ea, #f97316);
    --accent:    #a855f7;
    --wave-strong: rgba(147,51,234,0.30);
    --wave-soft: rgba(168,85,247,0.16);
    --wave-border: rgba(147,51,234,0.32);
    --wave-shadow: rgba(147,51,234,0.12);
  }
  .okiru-purple .ok-hero-tag-dot { background: #a855f7; box-shadow: 0 0 10px rgba(168,85,247,0.7); }
  .okiru-purple .ok-hero-glow   { background: radial-gradient(circle, rgba(147,51,234,0.14) 0%, rgba(168,85,247,0.06) 42%, transparent 70%); }
  .okiru-purple .ok-hero-glow-2 { background: radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 65%); }
  .okiru-purple .ok-hero-beam   { background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(147,51,234,0.12) 14deg, rgba(168,85,247,0.09) 22deg, rgba(249,115,22,0.05) 30deg, transparent 40deg); }
  .okiru-purple .ok-hero-beam-2 { background: conic-gradient(from 200deg at 90% 18%, transparent 0deg, rgba(249,115,22,0.05) 6deg, rgba(147,51,234,0.09) 14deg, rgba(168,85,247,0.05) 20deg, transparent 30deg); }
  .okiru-purple .ok-service:hover { background: rgba(147,51,234,0.06); }
  /* B-BBEE: outlined rounded-square icon tile, left-aligned, divider footer */
  .okiru-purple .ok-feat-icon { width: 48px; height: 48px; border-radius: 13px; border: 1px solid rgba(168,85,247,0.38); background: rgba(147,51,234,0.10); }
  .okiru-purple .ok-feat-meta { border-top: 1px solid rgba(255,255,255,0.07); padding-top: 13px; }
  .okiru-purple .ok-feat-stat { background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .okiru-purple .ok-feat-card:hover { transform: translateY(-4px); border-color: rgba(147,51,234,0.5); box-shadow: 0 16px 40px -18px rgba(147,51,234,0.6); background: rgba(147,51,234,0.045); }
  .okiru-purple .ok-feat-card:hover .ok-feat-icon { background: rgba(147,51,234,0.18); border-color: rgba(168,85,247,0.6); }
  .okiru-purple #product-cta .ok-w > div { background: linear-gradient(135deg, rgba(147,51,234,0.13) 0%, rgba(168,85,247,0.06) 55%, rgba(249,115,22,0.07) 100%); }

  /* ══════════════ BLUE — ESG Toolkit (centred instrument cards) ══════════════ */
  .okiru-root.okiru-blue {
    --grad:      linear-gradient(135deg, #2563eb 0%, #3b82f6 45%, #9333ea 100%);
    --grad-r:    linear-gradient(135deg, #9333ea 0%, #3b82f6 55%, #2563eb 100%);
    --grad-text: linear-gradient(100deg, #3b82f6 0%, #60a5fa 48%, #a855f7 100%);
    --grad-h:    linear-gradient(90deg, #2563eb, #9333ea);
    --accent:    #3b82f6;
    --wave-strong: rgba(37,99,235,0.28);
    --wave-soft: rgba(59,130,246,0.15);
    --wave-border: rgba(37,99,235,0.30);
    --wave-shadow: rgba(37,99,235,0.12);
  }
  .okiru-blue .ok-hero-tag-dot { background: #3b82f6; box-shadow: 0 0 10px rgba(59,130,246,0.7); }
  .okiru-blue .ok-hero-glow   { background: radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(59,130,246,0.06) 42%, transparent 70%); }
  .okiru-blue .ok-hero-glow-2 { background: radial-gradient(circle, rgba(147,51,234,0.06) 0%, transparent 65%); }
  .okiru-blue .ok-hero-beam   { background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(37,99,235,0.12) 14deg, rgba(59,130,246,0.09) 22deg, rgba(147,51,234,0.05) 30deg, transparent 40deg); }
  .okiru-blue .ok-hero-beam-2 { background: conic-gradient(from 200deg at 90% 18%, transparent 0deg, rgba(147,51,234,0.05) 6deg, rgba(37,99,235,0.09) 14deg, rgba(59,130,246,0.05) 20deg, transparent 30deg); }
  .okiru-blue .ok-service:hover { background: rgba(37,99,235,0.06); }
  /* ESG: circular icon, centred instrument layout */
  .okiru-blue .ok-feat-card { align-items: center; text-align: center; border-radius: 14px; padding: 30px 26px; }
  .okiru-blue .ok-feat-icon { width: 54px; height: 54px; border-radius: 50%; border: 1px solid rgba(59,130,246,0.32); background: radial-gradient(circle at 50% 32%, rgba(59,130,246,0.22), rgba(37,99,235,0.05)); }
  .okiru-blue .ok-feat-desc { max-width: 34ch; }
  .okiru-blue .ok-feat-meta { flex-direction: column; align-items: center; gap: 2px; margin-top: 8px; padding-top: 0; }
  .okiru-blue .ok-feat-stat { font-family: var(--serif); font-size: 1.5rem; font-weight: 500; background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .okiru-blue .ok-feat-stat-label { text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; font-family: var(--mono); }
  .okiru-blue .ok-feat-card:hover { transform: translateY(-4px); border-color: rgba(37,99,235,0.5); box-shadow: 0 16px 40px -18px rgba(37,99,235,0.6); background: rgba(37,99,235,0.04); }
  .okiru-blue #product-cta .ok-w > div { background: linear-gradient(135deg, rgba(37,99,235,0.13) 0%, rgba(59,130,246,0.06) 55%, rgba(147,51,234,0.07) 100%); }

  /* ══════════════ GREEN — ESG Toolkit (centred instrument cards) ══════════════ */
  .okiru-root.okiru-green {
    --grad:      linear-gradient(135deg, #16a34a 0%, #22c55e 45%, #0ea5e9 100%);
    --grad-r:    linear-gradient(135deg, #0ea5e9 0%, #22c55e 55%, #16a34a 100%);
    --grad-text: linear-gradient(100deg, #22c55e 0%, #4ade80 48%, #38bdf8 100%);
    --grad-h:    linear-gradient(90deg, #16a34a, #0ea5e9);
    --accent:    #22c55e;
    --wave-strong: rgba(22,163,74,0.28);
    --wave-soft: rgba(34,197,94,0.16);
    --wave-border: rgba(22,163,74,0.30);
    --wave-shadow: rgba(22,163,74,0.12);
  }
  .okiru-green .ok-hero-tag-dot { background: #22c55e; box-shadow: 0 0 10px rgba(34,197,94,0.7); }
  .okiru-green .ok-hero-glow   { background: radial-gradient(circle, rgba(22,163,74,0.15) 0%, rgba(34,197,94,0.06) 42%, transparent 70%); }
  .okiru-green .ok-hero-glow-2 { background: radial-gradient(circle, rgba(14,165,233,0.06) 0%, transparent 65%); }
  .okiru-green .ok-hero-beam   { background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(22,163,74,0.12) 14deg, rgba(34,197,94,0.09) 22deg, rgba(14,165,233,0.05) 30deg, transparent 40deg); }
  .okiru-green .ok-hero-beam-2 { background: conic-gradient(from 200deg at 90% 18%, transparent 0deg, rgba(14,165,233,0.05) 6deg, rgba(22,163,74,0.09) 14deg, rgba(34,197,94,0.05) 20deg, transparent 30deg); }
  .okiru-green .ok-service:hover { background: rgba(22,163,74,0.06); }
  /* ESG: circular icon, centred instrument layout */
  .okiru-green .ok-feat-card { align-items: center; text-align: center; border-radius: 14px; padding: 30px 26px; }
  .okiru-green .ok-feat-icon { width: 54px; height: 54px; border-radius: 50%; border: 1px solid rgba(34,197,94,0.32); background: radial-gradient(circle at 50% 32%, rgba(34,197,94,0.22), rgba(22,163,74,0.05)); }
  .okiru-green .ok-feat-desc { max-width: 34ch; }
  .okiru-green .ok-feat-meta { flex-direction: column; align-items: center; gap: 2px; margin-top: 8px; padding-top: 0; }
  .okiru-green .ok-feat-stat { font-family: var(--serif); font-size: 1.5rem; font-weight: 500; background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .okiru-green .ok-feat-stat-label { text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; font-family: var(--mono); }
  .okiru-green .ok-feat-card:hover { transform: translateY(-4px); border-color: rgba(22,163,74,0.5); box-shadow: 0 16px 40px -18px rgba(22,163,74,0.6); background: rgba(22,163,74,0.04); }
  .okiru-green #product-cta .ok-w > div { background: linear-gradient(135deg, rgba(22,163,74,0.13) 0%, rgba(34,197,94,0.06) 55%, rgba(14,165,233,0.07) 100%); }

  /* ══════════════ ORANGE — B-BBEE Certificate (soft-filled, icon-chip cards) ══════════════ */
  .okiru-root.okiru-orange {
    --grad:      linear-gradient(135deg, #f97316 0%, #fb923c 45%, #2563eb 100%);
    --grad-r:    linear-gradient(135deg, #2563eb 0%, #fb923c 55%, #f97316 100%);
    --grad-text: linear-gradient(100deg, #fb923c 0%, #fdba74 45%, #3b82f6 100%);
    --grad-h:    linear-gradient(90deg, #f97316, #2563eb);
    --accent:    #fb923c;
    --wave-strong: rgba(249,115,22,0.30);
    --wave-soft: rgba(251,146,60,0.17);
    --wave-border: rgba(249,115,22,0.32);
    --wave-shadow: rgba(249,115,22,0.12);
  }
  .okiru-orange .ok-hero-tag-dot { background: #fb923c; box-shadow: 0 0 10px rgba(251,146,60,0.7); }
  .okiru-orange .ok-hero-glow   { background: radial-gradient(circle, rgba(249,115,22,0.14) 0%, rgba(251,146,60,0.06) 42%, transparent 70%); }
  .okiru-orange .ok-hero-glow-2 { background: radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 65%); }
  .okiru-orange .ok-hero-beam   { background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(249,115,22,0.11) 14deg, rgba(251,146,60,0.08) 22deg, rgba(37,99,235,0.05) 30deg, transparent 40deg); }
  .okiru-orange .ok-hero-beam-2 { background: conic-gradient(from 200deg at 90% 18%, transparent 0deg, rgba(37,99,235,0.05) 6deg, rgba(249,115,22,0.08) 14deg, rgba(251,146,60,0.05) 20deg, transparent 30deg); }
  .okiru-orange .ok-service:hover { background: rgba(249,115,22,0.06); }
  /* Certificate: soft-filled card, gradient icon chip in the top-right */
  .okiru-orange .ok-feat-card { border-radius: 18px; padding-top: 30px; background: linear-gradient(160deg, rgba(249,115,22,0.06) 0%, rgba(37,99,235,0.02) 100%); }
  .okiru-orange .ok-feat-icon { position: absolute; top: 22px; right: 22px; width: 44px; height: 44px; border-radius: 12px; color: #fff; background: var(--grad); box-shadow: 0 10px 22px -10px rgba(249,115,22,0.75); }
  .okiru-orange .ok-feat-label { padding-right: 56px; }
  .okiru-orange .ok-feat-title { padding-right: 24px; }
  .okiru-orange .ok-feat-meta { padding-top: 12px; }
  .okiru-orange .ok-feat-stat { display: inline-flex; align-items: center; padding: 3px 11px; border-radius: 999px; background: rgba(249,115,22,0.13); color: var(--accent); font-family: var(--mono); font-size: 11px; }
  .okiru-orange .ok-feat-card:hover {
    transform: translateY(-4px); border-color: rgba(249,115,22,0.5); box-shadow: 0 16px 40px -18px rgba(249,115,22,0.55);
    background: linear-gradient(160deg, rgba(249,115,22,0.11) 0%, rgba(37,99,235,0.04) 100%);
  }
  .okiru-orange #product-cta .ok-w > div { background: linear-gradient(135deg, rgba(249,115,22,0.13) 0%, rgba(251,146,60,0.06) 55%, rgba(37,99,235,0.07) 100%); }

  .okiru-product .ok-nav-active {
    color: #18181b;
    background: #f4f4f5;
  }
  .okiru-product .ok-feat-card,
  .okiru-product #product-cta .ok-w > div {
    border-color: #e4e4e7;
    background: #ffffff;
    box-shadow: 0 18px 48px rgba(24,24,27,0.07);
  }
  .okiru-product .ok-feat-meta,
  .okiru-purple .ok-feat-meta {
    border-top-color: #e4e4e7;
  }
  .okiru-product .ok-feat-card:hover {
    background: #f4f4f5;
    box-shadow: 0 20px 52px rgba(24,24,27,0.10);
  }
  @media (max-width: 760px) {
    .okiru-product .ok-hero-waves {
      opacity: 0.72;
    }
    .okiru-product .ok-hero-wave {
      right: -58%;
      width: 760px;
      height: 168px;
    }
    .okiru-product .ok-hero-wave:nth-child(1) { top: 66px; }
    .okiru-product .ok-hero-wave:nth-child(2) { top: 168px; }
    .okiru-product .ok-hero-wave:nth-child(3) { top: 270px; }
  }
`;

interface ProductLandingPageProps {
  product: ProductConfig;
  onNavigateHome: () => void;
  onNavigateAuth: () => void;
  onNavigateRegister?: () => void;
  onNavigateProduct: (slug: string) => void;
  onNavigateCertificates?: () => void;
  onNavigateAbout?: () => void;
  onNavigateContact?: () => void;
}

export default function ProductLandingPage({
  product,
  onNavigateHome,
  onNavigateAuth,
  onNavigateRegister,
  onNavigateProduct,
  onNavigateCertificates,
  onNavigateAbout,
  onNavigateContact,
}: ProductLandingPageProps) {
  const goRegister = () => { (onNavigateRegister ?? onNavigateAuth)(); };
  const goPrimary = () => {
    if (product.primaryAction === "certificates" && onNavigateCertificates) onNavigateCertificates();
    else goRegister();
  };
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const base = "okiru-styles";
    let baseStyle = document.getElementById(base) as HTMLStyleElement | null;
    if (!baseStyle) {
      baseStyle = document.createElement("style");
      baseStyle.id = base;
      document.head.appendChild(baseStyle);
    }
    baseStyle.textContent = GLOBAL_CSS;
    const themeId = "okiru-product-styles";
    let themeStyle = document.getElementById(themeId) as HTMLStyleElement | null;
    if (!themeStyle) {
      themeStyle = document.createElement("style");
      themeStyle.id = themeId;
      document.head.appendChild(themeStyle);
    }
    themeStyle.textContent = PRODUCT_CSS;
    return () => {
      document.getElementById(base)?.remove();
      document.getElementById(themeId)?.remove();
    };
  }, []);

  // Reset scroll when switching between product pages.
  useEffect(() => { window.scrollTo(0, 0); }, [product.slug]);

  return (
    <div className={`okiru-root okiru-product okiru-${product.theme}`}>
      <div className="okiru-grain" aria-hidden />

      <SiteNav
        active={product.slug}
        onNavigateHome={onNavigateHome}
        onNavigateAbout={onNavigateAbout}
        onNavigateContact={onNavigateContact}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main>
        {/* ── HERO ── */}
        <section className="ok-hero">
          <div className="ok-hero-bg" aria-hidden>
            <div className="ok-hero-beam" /><div className="ok-hero-beam-2" />
            <div className="ok-hero-glow" /><div className="ok-hero-glow-2" />
            <div className="ok-hero-waves">
              <span className="ok-hero-wave" />
              <span className="ok-hero-wave" />
              <span className="ok-hero-wave" />
            </div>
          </div>
          <div className="ok-w" style={{ position: "relative", zIndex: 1, width: "100%" }}>
            <h1 className="ok-h1 ok-anim-2">
              {product.titleLead}<br />
              <span className="ok-h1-gradient">{product.titleGradient}</span>
            </h1>
            <p className="ok-hero-sub ok-anim-3">{product.heroSub}</p>
            <div className="ok-hero-btns ok-anim-4">
              <button className="ok-btn-cta" onClick={goPrimary}>
                {product.primaryCta} <span className="arr"><ArrowRight size={14} /></span>
              </button>
              <button className="ok-btn-sec" onClick={() => scrollTo("product-features")}>Explore features</button>
              <button className="ok-btn-sec" onClick={onNavigateHome}>Back to overview</button>
            </div>
          </div>
        </section>

        {/* ── STAT STRIP ── */}
        <div className="ok-services">
          {product.stats.map((s) => (
            <div key={s.name} className="ok-service">
              <div className="ok-service-name">{s.name}</div>
              <div className="ok-service-meta">{s.meta}</div>
            </div>
          ))}
        </div>

        {/* ── FEATURES ── */}
        <section className="ok-section" id="product-features">
          <div className="ok-w">
            <span className="ok-sec-num">{product.overviewNum}</span>
            <h2 className="ok-h2" style={{ marginBottom: 12 }}>{product.overviewTitle}</h2>
            <p className="ok-lead-l">{product.overviewLead}</p>
            <div className="ok-feat-grid">
              {product.features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="ok-feat-card">
                    <div className="ok-feat-icon"><Icon size={22} strokeWidth={1.6} /></div>
                    <span className="ok-feat-label">{f.label}</span>
                    <div className="ok-feat-title">{f.title}</div>
                    <div className="ok-feat-desc">{f.desc}</div>
                    <div className="ok-feat-meta">
                      <span className="ok-feat-stat">{f.stat}</span>
                      <span className="ok-feat-stat-label">{f.statLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="ok-section">
          <div className="ok-w">
            <span className="ok-sec-num">02</span>
            <h2 className="ok-h2" style={{ marginBottom: 12 }}>{product.howTitle}</h2>
            <p className="ok-lead-l">{product.howLead}</p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
              {product.steps.map((step) => (
                <div key={step.num} className="ok-about-pillar">
                  <div className="ok-about-pillar-num">{step.num}</div>
                  <div>
                    <div className="ok-about-pillar-name">{step.name}</div>
                    <div className="ok-about-pillar-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="ok-section" id="product-cta">
          <div className="ok-w">
            <div style={{ maxWidth: 720 }}>
              <h2 className="ok-h2" style={{ marginBottom: 14 }}>{product.ctaTitle}</h2>
              <p className="ok-lead" style={{ marginBottom: 28 }}>{product.ctaSub}</p>
              <div className="ok-hero-btns">
                <button className="ok-btn-cta" onClick={goPrimary}>
                  {product.primaryCta} <span className="arr"><ArrowRight size={14} /></span>
                </button>
                <button className="ok-btn-sec" onClick={onNavigateAuth}>Sign in</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
