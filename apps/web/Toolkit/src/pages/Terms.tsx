import { useEffect } from "react";
import { useLocation } from "wouter";
import { GLOBAL_CSS } from "./LandingPage";
import { SiteNav, SiteFooter, Reveal } from "./siteChrome";

/* ─────────────────────────────────────────────
   TERMS OF SERVICE
───────────────────────────────────────────── */
const SECTIONS: { idx: string; title: string; body: React.ReactNode }[] = [
  {
    idx: "01",
    title: "Agreement to terms",
    body: (
      <p>
        These Terms of Service govern your access to and use of the Okiru platform and
        related advisory services provided by Okiru Consulting (“Okiru”, “we”, “us”). By
        creating an account or using the service, you agree to these terms on behalf of
        yourself and the organisation you represent.
      </p>
    ),
  },
  {
    idx: "02",
    title: "Use of the service",
    body: (
      <>
        <p>You agree to:</p>
        <ul>
          <li>Provide accurate account and compliance information.</li>
          <li>Keep your login credentials confidential and secure.</li>
          <li>Use the platform only for lawful, authorised business purposes.</li>
          <li>Not attempt to disrupt, reverse-engineer, or gain unauthorised access to the service.</li>
        </ul>
        <p>
          You are responsible for the activity that occurs under your account and for the
          accuracy of the data your team enters or uploads.
        </p>
      </>
    ),
  },
  {
    idx: "03",
    title: "Your data and outputs",
    body: (
      <>
        <p>
          You retain ownership of the data you provide and the reports generated from it.
          You grant Okiru a limited licence to process that data solely to deliver the
          service. Our handling of personal information is described in our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          Scorecards, calculations, and reports are produced using the methodology and
          codes in force at the time. While we take great care with accuracy, final
          verification and certification remain the responsibility of your accredited
          verification agency.
        </p>
      </>
    ),
  },
  {
    idx: "04",
    title: "Intellectual property",
    body: (
      <p>
        The Okiru platform, its toolkits, formulas, methodology, and design are the
        intellectual property of Okiru Consulting and are protected by law. These terms
        do not transfer any ownership of our intellectual property to you.
      </p>
    ),
  },
  {
    idx: "05",
    title: "Availability and support",
    body: (
      <p>
        We work to keep the platform available and reliable but do not guarantee
        uninterrupted access. We may perform maintenance, updates, or changes to features
        from time to time. Support is provided through the channels described in your
        engagement.
      </p>
    ),
  },
  {
    idx: "06",
    title: "Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, Okiru is not liable for any indirect,
        incidental, or consequential loss arising from your use of the service. Nothing
        in these terms limits liability that cannot be excluded under South African law.
      </p>
    ),
  },
  {
    idx: "07",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the Republic of South Africa. Any dispute
        will be subject to the exclusive jurisdiction of the South African courts.
      </p>
    ),
  },
  {
    idx: "08",
    title: "Contact",
    body: (
      <p>
        Questions about these terms can be sent to{" "}
        <a href="mailto:contact@okiru.co.za">contact@okiru.co.za</a>.
      </p>
    ),
  },
];

export default function OkiruTerms({
  onNavigateAuth,
  onNavigateHome,
  onNavigateAbout,
  onNavigateContact,
  onNavigateProduct,
}: {
  onNavigateAuth: () => void;
  onNavigateHome?: () => void;
  onNavigateAbout?: () => void;
  onNavigateContact?: () => void;
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

  const [, navigate] = useLocation();
  const handleContentClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("/")) {
      e.preventDefault();
      navigate(href);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      <SiteNav
        active="legal"
        onNavigateHome={onNavigateHome}
        onNavigateAbout={onNavigateAbout}
        onNavigateContact={onNavigateContact}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main onClick={handleContentClick}>
        <section className="ok-section ok-page-top">
          <div className="ok-w">
            <Reveal>
              <div className="ok-legal">
                <span className="ok-sec-num">Legal</span>
                <h2 className="ok-h2">Terms of Service</h2>
                <div className="ok-legal-meta">Last updated July 2026</div>
                <p className="ok-legal-intro">
                  The terms below set out the agreement between you and Okiru Consulting
                  when you use our platform and advisory services. Please read them
                  carefully.
                </p>
              </div>
            </Reveal>

            {SECTIONS.map((s) => (
              <Reveal key={s.idx}>
                <div className="ok-legal ok-legal-block">
                  <h3><span className="ok-legal-idx">{s.idx}</span>{s.title}</h3>
                  {s.body}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
