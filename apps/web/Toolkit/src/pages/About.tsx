import { useEffect } from "react";
import { GLOBAL_CSS } from "./LandingPage";
import { SiteNav, SiteFooter, Reveal, FullIcon } from "./siteChrome";
import ceoPortrait from "@assets/image_1783017832778.png";

/* ─────────────────────────────────────────────
   ABOUT PAGE
   Who We Are · The Okiru Difference · Outcomes ·
   Engagement Model · Okiru vs the Market · Sectors
───────────────────────────────────────────── */
export default function OkiruAbout({
  onNavigateAuth,
  onNavigateHome,
  onNavigateContact,
  onNavigateProduct,
}: {
  onNavigateAuth: () => void;
  onNavigateHome?: () => void;
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
        active="about"
        onNavigateHome={onNavigateHome}
        onNavigateAbout={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onNavigateContact={onNavigateContact}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main>
        {/* ── 01: WHO WE ARE ── */}
        <section className="ok-section ok-page-top" id="sec-about">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">01</span>
              <h2 className="ok-h2">Who We Are</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>A South African transformation advisory. Methodology specialists. Disclosure-fluent.</p>
            </Reveal>
            <div className="ok-about-grid">
              <div>
                <Reveal>
                  <h3 className="ok-h3">About Okiru Consulting</h3>
                  <p className="ok-lead" style={{ marginTop:14 }}>Founded in 2023, Okiru Consulting helps organisations turn ESG, B-BBEE, and compliance obligations into measurable, board-ready performance. Headquartered in Braamfontein, Johannesburg, our practice marries technology and human expertise to remove the friction between capturing data and disclosing it.</p>
                  <p style={{ marginTop:16, fontSize:14, color:"var(--muted)", lineHeight:1.7 }}><strong style={{ color:"rgba(255,255,255,.7)", fontStyle:"normal" }}>Our Mission</strong><br />To make transformation measurable, defensible and permanent for every South African organisation we serve.</p>
                </Reveal>
                <div className="ok-about-badges" style={{ marginTop:28 }}>
                  {[["Accuracy","Audit-grade outputs"],["Independence","Verifier-defensible"],["Transformation","Methodology-led"],["Innovation","60%+ time saved"]].map(([val, label]) => (
                    <Reveal key={val}>
                      <div className="ok-about-badge">
                        <div className="ok-about-badge-val">{val}</div>
                        <div className="ok-about-badge-label">{label}</div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:"flex", flexDirection:"column" }}>
                  {[
                    { num:"01", name:"ESG Advisory", sub:"IFRS S1/S2 · GRI · TCFD · CDP · SBTi", desc:"Net-Zero strategy, GHG measurement, and board-ready sustainability disclosure for JSE-listed and private companies." },
                    { num:"02", name:"B-BBEE & Compliance", sub:"Generic & sector codes · Verification", desc:"Sector code strategy, EE Act compliance, Skills Development WSP/ATR, Employment Equity plans, and ownership advisory." },
                    { num:"03", name:"AI & Digital Tools", sub:"Zoho & Microsoft 365 automation", desc:"AI-enabled compliance workflows and WSP integration for intelligent, scalable transformation reporting that cuts reporting time by 60%+." },
                  ].map((p, i) => (
                    <Reveal key={p.num} delay={i > 0 ? `ok-d${i}` : ""}>
                      <div className="ok-about-pillar">
                        <div className="ok-about-pillar-num">{p.num}</div>
                        <div>
                          <div className="ok-about-pillar-name">{p.name}</div>
                          <div className="ok-about-pillar-sub">{p.sub}</div>
                          <div className="ok-about-pillar-desc">{p.desc}</div>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOUNDER / CEO MESSAGE ── */}
        <section className="ok-section ok-ceo" id="sec-ceo">
          <div className="ok-w">
            <div className="ok-ceo-grid">
              <Reveal className="ok-ceo-photo-wrap">
                <img className="ok-ceo-photo" src={ceoPortrait} alt="Chengetai Myezwa, Chief Executive Officer of Okiru Consulting" loading="lazy" />
                <div className="ok-ceo-photo-glow" aria-hidden />
              </Reveal>
              <Reveal className="ok-ceo-body" delay="ok-d1">
                <span className="ok-eyebrow">A message from our CEO</span>
                <blockquote className="ok-ceo-quote">
                  “Transformation in South Africa has too often been reduced to a certificate at
                  the end of the year — a number chased, filed, and forgotten. We built Okiru to
                  change that. When your ESG, B-BBEE and Skills Development data all live in one
                  defensible system, compliance stops being a scramble and becomes a story of
                  real, measurable progress you can stand behind in any boardroom.
                  <br /><br />
                  Our promise is simple: we don't just hand you a tool and walk away. We build
                  the methodology inside your business, load the data, validate every number, and
                  stay accountable for the outcome. That's how transformation becomes permanent.”
                </blockquote>
                <div className="ok-ceo-sign">
                  <div className="ok-ceo-name">Chengetai Myezwa</div>
                  <div className="ok-ceo-role">Chief Executive Officer · Okiru Consulting</div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 02: THE OKIRU DIFFERENCE ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">02</span>
              <h2 className="ok-h2">The Okiru Difference</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Six reasons leading South African organisations choose our Transformation Toolkit.</p>
            </Reveal>
          </div>
          <div className="ok-diff-grid">
            {[
              { idx:"01", title:"One integrated toolkit", desc:"ESG, B-BBEE, EE, and Skills Dev in one workbook. No re-keying, no reconciliation gaps, no separate platforms." },
              { idx:"02", title:"Activity-based accuracy", desc:"DEFRA 2024, Eskom NERSA, SBTi CNZS 2.0. CDP-defensible, audit-grade outputs aligned to every major framework." },
              { idx:"03", title:"Deep local expertise", desc:"Built for SA regulation: King V, B-BBEE Codes, EE Act, POPIA, JSE ESG Guidance, and sector-specific requirements." },
              { idx:"04", title:"AI-powered innovation", desc:"AI-enabled workflows cut ESG reporting time by 60%+ and eliminate manual data consolidation risk." },
              { idx:"05", title:"Measurable business impact", desc:"Improved B-BBEE scores, reduced verification risk, stronger investor ESG ratings, and compliance-led growth." },
              { idx:"06", title:"Built-in capability transfer", desc:"Your team leaves every engagement knowing how to run the toolkit independently. We build capability, not dependency." },
            ].map((d, i) => (
              <Reveal key={d.idx} className="ok-diff-card" delay={i % 3 > 0 ? `ok-d${i % 3}` : ""}>
                <div className="ok-diff-idx">{d.idx}</div>
                <div className="ok-diff-title">{d.title}</div>
                <div className="ok-diff-desc">{d.desc}</div>
              </Reveal>
            ))}
          </div>
          <div className="ok-diff-stats">
            {[["29","Integrated sheets"],["1,583","Live formulas"],["12","Frameworks covered"],["120","Glossary entries"],["0","Reconciliation gaps"],["60%+","Time saved via AI"]].map(([n, l], i) => (
              <Reveal key={l} className="ok-diff-stat" delay={i > 0 ? `ok-d${Math.min(i,3)}` : ""}>
                <div className="ok-diff-stat-n">{n}</div>
                <div className="ok-diff-stat-l">{l}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── 03: OUTCOMES ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">03</span>
              <h2 className="ok-h2">Operational Outcomes</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Four shifts that change how your ESG function works — permanently.</p>
            </Reveal>
          </div>
          <div className="ok-outcomes-grid">
            {[
              { label:"Governance", title:"Single source of truth", desc:"One workbook. Every framework. Every number traces to a documented source row through a documented formula chain. The audit committee, auditor, JSE, and integrated report all see the same numbers calculated the same way." },
              { label:"Efficiency", title:"Clean data flows", desc:"Inputs captured once flow through to every framework simultaneously. No re-keying fleet litres into the GHG inventory, ISO 14083 register, Carbon Tax submission and CDP response separately." },
              { label:"Insight", title:"Embedded analytics", desc:"Year-on-year variance built in. Intensity ratios calculated automatically. Materiality flagged dynamically. The Stance toggle lets you stress-test performance under Lean, Standard and Strict scoring assumptions." },
              { label:"Reporting", title:"Board-ready disclosure", desc:"Pre-formatted disclosure blocks aligned to IFRS S1/S2, GRI, CDP and B-BBEE structures. Lift directly into your integrated annual report. Methodology lives inside your finance function — not on a consultant's hard drive.", footer:"Not a portal. Not a certificate. A measurement system with people behind it." },
            ].map((o, i) => (
              <Reveal key={o.label} delay={i % 2 === 1 ? "ok-d1" : ""}>
                <div className="ok-outcome-card">
                  <span className="ok-outcome-label">{o.label}</span>
                  <div className="ok-outcome-title">{o.title}</div>
                  <div className="ok-outcome-desc">{o.desc}</div>
                  {o.footer && <div className="ok-outcome-footer">{o.footer}</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── 04: ENGAGEMENT MODEL ── */}
        <section className="ok-section">
          <div className="ok-w">
            <div className="ok-eng-hdr">
              <Reveal>
                <span className="ok-sec-num">04</span>
                <h2 className="ok-h2">Engagement Model</h2>
              </Reveal>
              <Reveal delay="ok-d1">
                <p className="ok-lead">From scoping session to live reporting cadence in three structured phases.</p>
                <p style={{ marginTop:16, fontSize:13.5, color:"var(--muted)", lineHeight:1.75, fontStyle:"italic" }}>Your team owns the data and the strategy. Okiru owns the methodology, data loading, and framework refresh as standards evolve.</p>
              </Reveal>
            </div>
            <div className="ok-eng-phases">
              {[
                { num:"01", name:"Scoping & Configuration", sub:"2 weeks", items:["Sector-configured workbook","Data source map","Methodology sign-off"] },
                { num:"02", name:"Data Migration", sub:"3 weeks", items:["Reconciled historical data","Validation at zero errors","First dashboard refresh"] },
                { num:"03", name:"Live Reporting Cadence", sub:"Ongoing", items:["Monthly refresh cycle","Quarterly board pack","Annual report support"] },
              ].map((p, i) => (
                <Reveal key={p.num} delay={i > 0 ? `ok-d${i}` : ""}>
                  <div className="ok-eng-phase">
                    <div className="ok-eng-phase-num">Phase {p.num}</div>
                    <div className="ok-eng-phase-name">{p.name}</div>
                    <div className="ok-eng-phase-sub">{p.sub}</div>
                    <ul className="ok-eng-phase-items">
                      {p.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 05: OKIRU VS MARKET ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">05</span>
              <h2 className="ok-h2">Okiru vs the Market</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>We don't compete on cheaper software. We compete on what we own.</p>
            </Reveal>
            <div className="ok-vs-edges" style={{ marginTop:40 }}>
              {[
                { num:"Edge 01", title:"Only SA firm integrating B-BBEE + ESG in one toolkit", desc:"BEE platforms score pillars. Okiru links your B-BBEE score to your GHG inventory, EE plan, and IFRS S2 disclosure — one source of truth for every framework simultaneously." },
                { num:"Edge 02", title:"Methodology lives inside your business — not on our server", desc:"Every formula, factor, and threshold is documented in your own workbook. When the engagement ends, your finance team owns the methodology. No platform lock-in. No annual licence." },
                { num:"Edge 03", title:"Consultant accountability, not just software access", desc:"BEE123 gives you a tool. Updapt tracks your ESG data. Okiru builds the strategy, loads the data, validates every number, and stands behind the output when your verifier asks questions." },
              ].map((e, i) => (
                <Reveal key={e.num} delay={i > 0 ? `ok-d${Math.min(i,2)}` : ""}>
                  <div className="ok-vs-edge">
                    <div className="ok-vs-edge-num">{e.num}</div>
                    <div className="ok-vs-edge-body">
                      <div className="ok-vs-edge-title">{e.title}</div>
                      <div className="ok-vs-edge-desc">{e.desc}</div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <p className="ok-eyebrow" style={{ marginBottom:16, marginTop:40 }}>Capability Matrix</p>
              <div className="ok-vs-table-wrap">
                <table className="ok-vs-table">
                  <thead>
                    <tr>
                      <th>Capability</th><th>Okiru B-BBEE + ESG</th><th>BEE 123</th><th>Updapt ESG Tech</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["All 5 B-BBEE pillars scored","Full","Full","Full"],
                      ["AI toolkit upload → instant scorecard","Full","—","—"],
                      ["GHG Scope 1, 2 & 3 measurement","Full","—","—"],
                      ["IFRS S1/S2, TCFD, CDP, GRI, SBTi","Full","—","—"],
                      ["Net-Zero Roadmap (SBTi CNZS 2.0)","Full","—","—"],
                      ["Employment Equity (EEA2/EEA4)","Full","Basic","—"],
                      ["Dedicated consultant relationship","Full","—","Full"],
                      ["Board-ready disclosure outputs","Full","B-BBEE only","Cert. only"],
                      ["Annual framework refresh","Full","B-BBEE codes","—"],
                    ].map(([cap, ...vals]) => (
                      <tr key={cap}>
                        <td>{cap}</td>
                        {vals.map((v, i) => (
                          <td key={i} className={v==="Full"?"ok-vs-full":v==="Basic"||v.includes("only")||v.includes("codes")?"ok-vs-basic":"ok-vs-none"}>
                            {v==="Full"?<span style={{display:"inline-flex",alignItems:"center",gap:4}}><FullIcon/> Full</span>:v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ok-vs-table-note">Public information · May 2026</p>
            </Reveal>
          </div>
        </section>

        {/* ── 06: SECTORS ── */}
        <section className="ok-section" id="sec-sectors">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">06</span>
              <h2 className="ok-h2">Sectors We Serve</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Cross-sector advisory across South Africa's transformation economy. Client names withheld pending consent.</p>
            </Reveal>
            <div className="ok-sectors-list">
              {[["01","Financial Services"],["02","Chemicals"],["03","Retail & Pharmacy"],["04","Public Sector"],["05","Logistics"],["06","Water & Utilities"],["07","Mid-Cap Corporates"],["08","JSE-Listed Corporates"]].map(([num, name], i) => (
                <Reveal key={name} delay={i % 4 > 0 ? `ok-d${Math.min(i%4,3)}` : ""}>
                  <div className="ok-sector-item">
                    <div className="ok-sector-num">{num}</div>
                    <div className="ok-sector-name">{name}</div>
                    <span className="ok-sector-badge-sm">Toolkit deployed</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
