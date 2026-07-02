import { useState, useEffect } from "react";
import { GLOBAL_CSS } from "./LandingPage";
import { SiteNav, SiteFooter, Reveal, DemoModal, ArrowRight } from "./siteChrome";

/* ─────────────────────────────────────────────
   CONTACT PAGE — Get in touch · Book a demo
───────────────────────────────────────────── */
export default function OkiruContact({
  onNavigateAuth,
  onNavigateHome,
  onNavigateAbout,
  onNavigateProduct,
}: {
  onNavigateAuth: () => void;
  onNavigateHome?: () => void;
  onNavigateAbout?: () => void;
  onNavigateProduct?: (slug: string) => void;
}) {
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);

  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = GLOBAL_CSS; document.head.appendChild(s);
    }
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    document.body.style.overflow = demoOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [demoOpen]);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}

      <SiteNav
        active="contact"
        onNavigateHome={onNavigateHome}
        onNavigateAbout={onNavigateAbout}
        onNavigateContact={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main>
        {/* ── CONTACT / BOOK A DEMO ── */}
        <section className="ok-section ok-page-top" id="sec-contact">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">Contact</span>
              <h2 className="ok-h2" style={{ marginTop:8 }}>Let's make your transformation measurable.</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>A 45-minute working session — not a sales pitch. We'll walk through the live Okiru Toolkit, map it to your reporting cycle, and show you the Net-Zero pathway implied by your own data.</p>
            </Reveal>
            <div className="ok-demo-grid">
              <div className="ok-demo-l">
                <h3 className="ok-h3" style={{ marginBottom:8 }}>Get in touch</h3>
                <div className="ok-demo-contact">
                  {[["Email","contact@okiru.co.za"],["Phone","+27 78 104 6527"],["Office","Braamfontein, Johannesburg"],["Web","okiru.co.za"],["Registration","2023/597303/07"]].map(([label, val]) => (
                    <div key={label} className="ok-demo-contact-item">
                      <span className="ok-demo-contact-label">{label}</span>
                      <span className="ok-demo-contact-val">
                        {label==="Email"?<a href={`mailto:${val}`}>{val}</a>:label==="Web"?<a href={`https://${val}`} target="_blank" rel="noopener">{val}</a>:val}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:36 }}>
                  <button className="ok-btn-cta" onClick={openDemo}>
                    Book a 45-min demo <span className="arr"><ArrowRight size={14} /></span>
                  </button>
                </div>
              </div>
              <div className="ok-demo-r">
                <div className="ok-demo-agenda-title">
                  <span>Demo Agenda</span>
                  <span style={{ color:"var(--pur-l)" }}>45 min</span>
                </div>
                {[["00:00 – 10:00","Your transformation reporting today"],["10:00 – 25:00","Live walkthrough · Okiru Toolkit"],["25:00 – 35:00","Net-Zero Roadmap · your data"],["35:00 – 45:00","Engagement model & next steps"]].map(([time, desc]) => (
                  <div key={time} className="ok-demo-agenda-item">
                    <span className="ok-demo-agenda-time">{time}</span>
                    <span className="ok-demo-agenda-desc">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
