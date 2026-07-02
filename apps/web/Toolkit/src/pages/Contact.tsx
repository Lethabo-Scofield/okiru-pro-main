import { useEffect } from "react";
import { GLOBAL_CSS } from "./LandingPage";
import { SiteNav, SiteFooter, Reveal, LinkedInIcon, OKIRU_LINKEDIN_URL } from "./siteChrome";

/* ─────────────────────────────────────────────
   CONTACT PAGE — Get in touch
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
  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = GLOBAL_CSS; document.head.appendChild(s);
    }
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      <SiteNav
        active="contact"
        onNavigateHome={onNavigateHome}
        onNavigateAbout={onNavigateAbout}
        onNavigateContact={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main>
        {/* ── CONTACT ── */}
        <section className="ok-section ok-page-top" id="sec-contact">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">Contact</span>
              <h2 className="ok-h2" style={{ marginTop:8 }}>Let's make your transformation measurable.</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Questions about the toolkit, a sector code, or your reporting cycle? Reach out. We usually reply within one business day.</p>
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
              </div>
              <div className="ok-demo-r">
                <h3 className="ok-h3" style={{ marginBottom:8 }}>Follow us</h3>
                <p className="ok-lead" style={{ marginTop:0, marginBottom:24 }}>Keep up with product updates, sector guidance, and transformation insights.</p>
                <div className="ok-social-list">
                  <a className="ok-social-link" href={OKIRU_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                    <span className="ok-social-icon"><LinkedInIcon size={18} /></span>
                    <span className="ok-social-meta">
                      <span className="ok-social-name">LinkedIn</span>
                      <span className="ok-social-handle">Okiru Consulting</span>
                    </span>
                  </a>
                  <a className="ok-social-link" href="mailto:contact@okiru.co.za">
                    <span className="ok-social-icon" aria-hidden>@</span>
                    <span className="ok-social-meta">
                      <span className="ok-social-name">Email</span>
                      <span className="ok-social-handle">contact@okiru.co.za</span>
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
