import { useState, useEffect } from "react";
import okiruLogo from "@toolkit-assets/okiru_logo_v2.png";
import { GLOBAL_CSS } from "./LandingPage";
import { PRODUCT_TABS, type ProductConfig } from "./productLandingConfig";

const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
);
const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

interface ProductLandingPageProps {
  product: ProductConfig;
  onNavigateHome: () => void;
  onNavigateAuth: () => void;
  onNavigateRegister?: () => void;
  onNavigateProduct: (slug: string) => void;
  onNavigateCertificates?: () => void;
}

export default function ProductLandingPage({
  product,
  onNavigateHome,
  onNavigateAuth,
  onNavigateRegister,
  onNavigateProduct,
  onNavigateCertificates,
}: ProductLandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const goRegister = () => { setMenuOpen(false); (onNavigateRegister ?? onNavigateAuth)(); };
  const goPrimary = () => {
    setMenuOpen(false);
    if (product.primaryAction === "certificates" && onNavigateCertificates) onNavigateCertificates();
    else goRegister();
  };
  const scrollTo = (id: string) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = GLOBAL_CSS; document.head.appendChild(s);
    }
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Reset scroll when switching between product pages.
  useEffect(() => { window.scrollTo(0, 0); }, [product.slug]);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      {/* ── NAV ── */}
      <nav className="ok-nav">
        <div className="ok-nav-inner">
          <button onClick={onNavigateHome} className="ok-brand" aria-label="Okiru home" style={{ background: "none", border: "none", cursor: "pointer" }}>
            <img src={okiruLogo} alt="" className="ok-brand-mark" />
            <span className="ok-wordmark"><strong>Okiru</strong><span> Consulting</span></span>
          </button>

          <div className="ok-nav-center">
            <button className="ok-nav-link" onClick={onNavigateHome}>Home</button>
            {PRODUCT_TABS.map((t) => (
              <button
                key={t.slug}
                className={`ok-nav-link ${t.slug === product.slug ? "ok-nav-active" : ""}`}
                aria-current={t.slug === product.slug ? "page" : undefined}
                onClick={() => onNavigateProduct(t.slug)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ok-nav-right">
            <button className="ok-nav-signin" onClick={onNavigateAuth}>Sign in</button>
            <button className="ok-nav-signin" onClick={goRegister}>Get started</button>
            <button className="ok-nav-demo-btn" onClick={goPrimary}>
              {product.primaryCta} <span className="arr"><ArrowRight size={13} /></span>
            </button>
            <button className="ok-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── MOBILE MENU ── */}
      <div className={`ok-mobile-menu ${menuOpen ? "ok-menu-open" : ""}`}>
        <button className="ok-mobile-link" onClick={() => { setMenuOpen(false); onNavigateHome(); }}>Home</button>
        {PRODUCT_TABS.map((t) => (
          <button key={t.slug} className="ok-mobile-link" onClick={() => { setMenuOpen(false); onNavigateProduct(t.slug); }}>{t.label}</button>
        ))}
        <button className="ok-mobile-link" onClick={() => { setMenuOpen(false); onNavigateAuth(); }}>Sign in</button>
        <button className="ok-mobile-link" onClick={goRegister}>Get started</button>
        <button className="ok-mobile-cta" onClick={goPrimary}>{product.primaryCta} →</button>
      </div>

      <main>
        {/* ── HERO ── */}
        <section className="ok-hero">
          <div className="ok-hero-bg" aria-hidden>
            <div className="ok-hero-beam" /><div className="ok-hero-beam-2" />
            <div className="ok-hero-glow" /><div className="ok-hero-glow-2" />
          </div>
          <div className="ok-w" style={{ position: "relative", zIndex: 1, width: "100%" }}>
            <div className="ok-hero-tag ok-anim-1">
              <span className="ok-hero-tag-dot" />
              {product.heroTag}
              <span className="ok-hero-tag-div" />
              <span className="ok-hero-tag-brand">{product.heroBrand}</span>
            </div>
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
            <div className="ok-challenge-grid" style={{ marginTop: 40 }}>
              {product.features.map((f) => (
                <div key={f.title} className="ok-challenge-card">
                  <span className="ok-challenge-label">{f.label}</span>
                  <div className="ok-challenge-title">{f.title}</div>
                  <div className="ok-challenge-stat">{f.stat}</div>
                  <div className="ok-challenge-stat-label">{f.statLabel}</div>
                  <div className="ok-challenge-desc">{f.desc}</div>
                </div>
              ))}
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
    </div>
  );
}
