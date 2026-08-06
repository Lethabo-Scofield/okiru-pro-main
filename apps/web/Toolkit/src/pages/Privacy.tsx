import { useEffect } from "react";
import { GLOBAL_CSS } from "./LandingPage";
import { SiteNav, SiteFooter, Reveal } from "./siteChrome";

/* ─────────────────────────────────────────────
   PRIVACY POLICY (POPIA-aligned)
───────────────────────────────────────────── */
const SECTIONS: { idx: string; title: string; body: React.ReactNode }[] = [
  {
    idx: "01",
    title: "Who we are",
    body: (
      <>
        <p>
          Okiru (“we”, “us”) is a South African transformation
          advisory based in Braamfontein, Johannesburg. We are the responsible party
          for the personal information processed through the Okiru platform and our
          advisory engagements, as contemplated by the Protection of Personal
          Information Act, 2013 (“POPIA”).
        </p>
        <p>
          Questions about this policy or your personal information can be directed to
          our Information Officer at <a href="mailto:privacy@okiru.co.za">privacy@okiru.co.za</a>.
        </p>
      </>
    ),
  },
  {
    idx: "02",
    title: "Information we collect",
    body: (
      <>
        <p>We collect only what we need to deliver our services:</p>
        <ul>
          <li><strong>Account details</strong> — name, work email, organisation, role, and login credentials.</li>
          <li><strong>Compliance data</strong> — the B-BBEE, ESG, employment equity, and skills development figures you or your team enter or upload.</li>
          <li><strong>Documents</strong> — certificates, toolkits, and supporting files you provide for extraction and reporting.</li>
          <li><strong>Usage data</strong> — log data, device and browser information, and analytics used to keep the platform secure and reliable.</li>
        </ul>
      </>
    ),
  },
  {
    idx: "03",
    title: "How we use it",
    body: (
      <>
        <p>Personal information is processed for the following lawful purposes:</p>
        <ul>
          <li>Providing and maintaining the platform and advisory services.</li>
          <li>Calculating scorecards, generating reports, and preparing audit-ready outputs.</li>
          <li>Securing accounts, preventing fraud, and meeting our legal obligations.</li>
          <li>Communicating with you about your account, support requests, and service updates.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use your compliance
          data for any purpose other than delivering the service you engaged us for.
        </p>
      </>
    ),
  },
  {
    idx: "04",
    title: "Sharing and processors",
    body: (
      <>
        <p>
          We share personal information only with trusted operators who help us run the
          service — such as cloud hosting, storage, and analytics providers — under
          written agreements that require them to protect it and process it solely on
          our instructions. We may also disclose information where required by law or to
          protect our rights.
        </p>
      </>
    ),
  },
  {
    idx: "05",
    title: "Security and retention",
    body: (
      <>
        <p>
          We apply appropriate technical and organisational safeguards — including
          access controls, encryption in transit, tenant isolation, and audit logging —
          to protect personal information against loss, unauthorised access, and misuse.
        </p>
        <p>
          We retain personal information only for as long as necessary to fulfil the
          purposes described here or to comply with legal, verification, and record-keeping
          obligations, after which it is securely deleted or anonymised.
        </p>
      </>
    ),
  },
  {
    idx: "06",
    title: "Your rights under POPIA",
    body: (
      <>
        <p>Subject to applicable law, you have the right to:</p>
        <ul>
          <li>Request access to the personal information we hold about you.</li>
          <li>Request correction or deletion of inaccurate or outdated information.</li>
          <li>Object to processing in certain circumstances.</li>
          <li>Lodge a complaint with the Information Regulator of South Africa.</li>
        </ul>
        <p>
          To exercise any of these rights, contact our Information Officer at{" "}
          <a href="mailto:privacy@okiru.co.za">privacy@okiru.co.za</a>. Complaints may be
          submitted to the Information Regulator at{" "}
          <a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer">inforegulator.org.za</a>.
        </p>
      </>
    ),
  },
  {
    idx: "07",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time to reflect changes in our practices
        or legal requirements. Material changes will be communicated through the platform
        or by email. The date below reflects the latest revision.
      </p>
    ),
  },
];

export default function OkiruPrivacy({
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

      <main>
        <section className="ok-section ok-page-top">
          <div className="ok-w">
            <Reveal>
              <div className="ok-legal">
                <span className="ok-sec-num">Legal</span>
                <h2 className="ok-h2">Privacy Policy</h2>
                <div className="ok-legal-meta">POPIA-aligned · Last updated July 2026</div>
                <p className="ok-legal-intro">
                  Your data — and your clients' compliance data — sits at the centre of
                  what we do. This policy explains what we collect, why we collect it, and
                  the rights you have over it under South Africa's Protection of Personal
                  Information Act.
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
