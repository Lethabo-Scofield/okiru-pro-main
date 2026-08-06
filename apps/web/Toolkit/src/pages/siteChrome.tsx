import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import okiruLogo from "@toolkit-assets/okiru_logo_v2.png";
import { PRODUCT_TABS } from "./productLandingConfig";

/* ─────────────────────────────────────────────
   SHARED ICONS
───────────────────────────────────────────── */
export const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
export const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
export const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
export const CheckIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
export const FullIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
export const LinkedInIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.53C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);

export const OKIRU_LINKEDIN_URL = "https://www.linkedin.com/company/okiru.co.za/posts/?feedView=all";

/* ─────────────────────────────────────────────
   REVEAL-ON-SCROLL
───────────────────────────────────────────── */
export function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

export function Reveal({ children, delay = "", className = "" }: { children: React.ReactNode; delay?: string; className?: string }) {
  const [ref, visible] = useReveal();
  return <div ref={ref} className={`ok-reveal ${visible ? "ok-in" : ""} ${delay} ${className}`}>{children}</div>;
}

/* ─────────────────────────────────────────────
   SITE NAV — shared across landing, about, contact & product pages
───────────────────────────────────────────── */
export interface SiteNavProps {
  /** "home" | "about" | "contact" | product slug — highlights the matching link */
  active?: string;
  onNavigateHome?: () => void;
  onNavigateAbout?: () => void;
  onNavigateContact?: () => void;
  onNavigateProduct?: (slug: string) => void;
  onNavigateAuth?: () => void;
}

export function SiteNav({
  active,
  onNavigateHome,
  onNavigateAbout,
  onNavigateContact,
  onNavigateProduct,
  onNavigateAuth,
}: SiteNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const go = (fn?: () => void) => () => { setMenuOpen(false); fn?.(); };
  const goProduct = (slug: string) => () => { setMenuOpen(false); onNavigateProduct?.(slug); };

  return (
    <>
      <nav className={`ok-nav ${scrolled ? "ok-nav-scrolled" : ""}`}>
        <div className="ok-nav-inner">
          <button className="ok-brand" aria-label="Okiru home" onClick={go(onNavigateHome)} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <img src={okiruLogo} alt="" className="ok-brand-mark" />
            <span className="ok-wordmark"><strong>Okiru</strong></span>
          </button>

          <div className="ok-nav-center">
            <button className={`ok-nav-link ${active === "about" ? "ok-nav-active" : ""}`} aria-current={active === "about" ? "page" : undefined} onClick={go(onNavigateAbout)}>About</button>
            {PRODUCT_TABS.map(t => (
              <button
                key={t.slug}
                className={`ok-nav-link ${active === t.slug ? "ok-nav-active" : ""}`}
                aria-current={active === t.slug ? "page" : undefined}
                onClick={goProduct(t.slug)}
              >
                {t.label}
              </button>
            ))}
            <div className="ok-nav-div" />
            <button className={`ok-nav-link ${active === "contact" ? "ok-nav-active" : ""}`} aria-current={active === "contact" ? "page" : undefined} onClick={go(onNavigateContact)}>Contact</button>
          </div>

          <div className="ok-nav-right">
            <a
              className="ok-nav-linkedin"
              href={OKIRU_LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Okiru on LinkedIn"
            >
              <LinkedInIcon size={18} />
            </a>
            <button className="ok-nav-demo-btn" onClick={go(onNavigateAuth)}>
              Sign in <span className="arr"><ArrowRight size={13} /></span>
            </button>
            <button className="ok-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── MOBILE MENU ── */}
      <div className={`ok-mobile-menu ${menuOpen ? "ok-menu-open" : ""}`}>
        <button className="ok-mobile-link" onClick={go(onNavigateAbout)}>About</button>
        {PRODUCT_TABS.map(t => (
          <button key={t.slug} className="ok-mobile-link" onClick={goProduct(t.slug)}>{t.label}</button>
        ))}
        <button className="ok-mobile-link" onClick={go(onNavigateContact)}>Contact</button>
        <a className="ok-mobile-link" href={OKIRU_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>LinkedIn</a>
        <button className="ok-mobile-cta" onClick={go(onNavigateAuth)}>Sign in →</button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   SITE FOOTER — shared across all marketing pages
───────────────────────────────────────────── */
export function SiteFooter({ onNavigateAuth }: { onNavigateAuth?: () => void }) {
  const [, navigate] = useLocation();
  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(path);
    window.scrollTo(0, 0);
  };
  const year = new Date().getFullYear();
  return (
    <footer>
      <div className="ok-w">
        <div className="ok-foot-grid">
          <div className="ok-foot-brand">
            <span className="ok-foot-brand-top">
              <img src={okiruLogo} alt="" />
              Okiru
            </span>
            <p className="ok-foot-brand-desc">
              ESG, B-BBEE &amp; Skills Development in one audit-grade toolkit. Compliance. Strategy. Growth — built for South African organisations.
            </p>
            <div className="ok-foot-social">
              <a href={OKIRU_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="Okiru on LinkedIn">
                <LinkedInIcon size={16} />
              </a>
            </div>
          </div>
          <div>
            <div className="ok-foot-col-title">Company</div>
            <div className="ok-foot-col-items">
              <div className="ok-foot-col-item"><a href="/about" onClick={go("/about")}>About</a></div>
              <div className="ok-foot-col-item"><a href="/contact" onClick={go("/contact")}>Contact</a></div>
              <div className="ok-foot-col-item"><button className="ok-foot-linkbtn" onClick={onNavigateAuth}>Sign in</button></div>
            </div>
          </div>
          <div>
            <div className="ok-foot-col-title">Practice</div>
            <div className="ok-foot-col-items">
              {["ESG Advisory", "B-BBEE & Compliance", "AI & Digital Tools", "Skills Development"].map(p => (
                <div key={p} className="ok-foot-col-item">{p}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="ok-foot-col-title">Legal</div>
            <div className="ok-foot-col-items">
              <div className="ok-foot-col-item"><a href="/privacy" onClick={go("/privacy")}>Privacy Policy</a></div>
              <div className="ok-foot-col-item"><a href="/terms" onClick={go("/terms")}>Terms of Service</a></div>
              <div className="ok-foot-col-item"><a href="/privacy" onClick={go("/privacy")}>POPIA Compliance</a></div>
            </div>
          </div>
          <div>
            <div className="ok-foot-col-title">Contact</div>
            <div className="ok-foot-col-items">
              <div className="ok-foot-col-item"><a href="mailto:contact@okiru.co.za">contact@okiru.co.za</a></div>
              <div className="ok-foot-col-item">+27 78 104 6527</div>
              <div className="ok-foot-col-item"><a href="https://okiru.co.za" target="_blank" rel="noopener">okiru.co.za</a></div>
              <div className="ok-foot-col-item">Braamfontein, Johannesburg</div>
            </div>
          </div>
        </div>
        <div className="ok-foot-frameworks">
          <span className="ok-foot-col-title" style={{ marginBottom: 0 }}>Frameworks</span>
          <span className="ok-foot-fw-list">IFRS S1/S2 · GRI · TCFD · CDP · SBTi CNZS 2.0 · King V · B-BBEE Codes · EE Act · ISO 14001 · POPIA · ISO 14083</span>
        </div>
        <div className="ok-foot-bottom">
          <span className="ok-foot-wm">
            <img src={okiruLogo} alt="" style={{ width: 22, height: 22, opacity: 0.85 }} />
            Okiru
          </span>
          <span className="ok-foot-c">© {year} Okiru · All rights reserved</span>
          <div className="ok-foot-links">
            <a href="/privacy" className="ok-foot-link" onClick={go("/privacy")}>Privacy</a>
            <a href="/terms" className="ok-foot-link" onClick={go("/terms")}>Terms</a>
            <a href="/devmode" className="ok-foot-link" data-testid="link-devmode">{`{DevMode}`}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────
   DEMO MODAL — book-a-demo lead form
───────────────────────────────────────────── */
interface DemoFormState {
  name: string; company: string; email: string; phone: string; message: string;
}
interface DemoFormErrors {
  name?: string; company?: string; email?: string;
}

export function DemoModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<DemoFormState>({ name: "", company: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<DemoFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof DemoFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k as keyof DemoFormErrors]) setErrors(er => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const errs: DemoFormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.company.trim()) errs.company = "Company is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Enter a valid email";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="ok-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ok-modal" role="dialog" aria-modal="true" aria-label="Book a demo">
        {submitted ? (
          <div className="ok-modal-success">
            <div className="ok-success-icon"><CheckIcon /></div>
            <div className="ok-success-title">Request received.</div>
            <p className="ok-success-sub">
              Thank you, <strong style={{ color: "var(--hi)" }}>{form.name}</strong>. We'll be in touch within one business day to confirm your 45-minute session.
            </p>
            <button className="ok-form-submit" style={{ marginTop: 28, maxWidth: 200, margin: "28px auto 0" }} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="ok-modal-head">
              <div>
                <div className="ok-modal-title">Book a 45-min demo</div>
                <p className="ok-modal-sub">A working session, not a sales pitch. We'll walk through the live Okiru Toolkit mapped to your reporting cycle.</p>
              </div>
              <button className="ok-modal-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <div className="ok-modal-body">
              <form className="ok-form" onSubmit={handleSubmit} noValidate>
                <div className="ok-form-row">
                  <div className="ok-field">
                    <label className="ok-label">Name<span className="ok-req">*</span></label>
                    <input className={`ok-input${errors.name ? " ok-err" : ""}`} value={form.name} onChange={set("name")} placeholder="Thabo Nkosi" autoFocus />
                    {errors.name && <span className="ok-field-err">{errors.name}</span>}
                  </div>
                  <div className="ok-field">
                    <label className="ok-label">Company<span className="ok-req">*</span></label>
                    <input className={`ok-input${errors.company ? " ok-err" : ""}`} value={form.company} onChange={set("company")} placeholder="Acme Corp" />
                    {errors.company && <span className="ok-field-err">{errors.company}</span>}
                  </div>
                </div>
                <div className="ok-form-row">
                  <div className="ok-field">
                    <label className="ok-label">Email<span className="ok-req">*</span></label>
                    <input type="email" className={`ok-input${errors.email ? " ok-err" : ""}`} value={form.email} onChange={set("email")} placeholder="you@company.co.za" />
                    {errors.email && <span className="ok-field-err">{errors.email}</span>}
                  </div>
                  <div className="ok-field">
                    <label className="ok-label">Phone <span style={{ opacity: .5, fontSize: 9 }}>(optional)</span></label>
                    <input className="ok-input" value={form.phone} onChange={set("phone")} placeholder="+27 78 000 0000" />
                  </div>
                </div>
                <div className="ok-field">
                  <label className="ok-label">Anything specific you'd like to cover? <span style={{ opacity: .5, fontSize: 9 }}>(optional)</span></label>
                  <textarea className="ok-textarea" value={form.message} onChange={set("message")} placeholder="e.g. We need to submit our B-BBEE certificate in Q1 and want to understand our Scope 2 exposure…" />
                </div>
                <button type="submit" className="ok-form-submit" disabled={loading}>
                  {loading ? "Sending…" : <><span>Send request</span><span className="arr"><ArrowRight size={15} /></span></>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
