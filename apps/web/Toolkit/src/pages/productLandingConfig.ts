/* ─────────────────────────────────────────────
   PRODUCT LANDING CONFIG
   Content for the three tailored product landing
   pages reachable from the main landing nav:
   B-BBEE Toolkit · ESG Toolkit · B-BBEE Certificate
───────────────────────────────────────────── */

export interface ProductStat {
  name: string;
  meta: string;
}

export interface ProductFeature {
  label: string;
  title: string;
  stat: string;
  statLabel: string;
  desc: string;
}

export interface ProductStep {
  num: string;
  name: string;
  desc: string;
}

export type ProductTheme = "purple" | "blue" | "orange";

export interface ProductConfig {
  slug: string;
  navLabel: string;
  /** Drives the per-page accent colour + card treatment. */
  theme: ProductTheme;
  heroTag: string;
  heroBrand: string;
  titleLead: string;
  titleGradient: string;
  heroSub: string;
  primaryCta: string;
  /** Which host handler the primary CTA should fire. */
  primaryAction: "register" | "certificates";
  stats: ProductStat[];
  overviewNum: string;
  overviewKicker: string;
  overviewTitle: string;
  overviewLead: string;
  features: ProductFeature[];
  howTitle: string;
  howLead: string;
  steps: ProductStep[];
  ctaTitle: string;
  ctaSub: string;
}

export const PRODUCTS: ProductConfig[] = [
  {
    slug: "bbbee-toolkit",
    navLabel: "B-BBEE Toolkit",
    theme: "purple",
    heroTag: "Scorecard · Sector Codes · Verification",
    heroBrand: "Okiru Pro · B-BBEE",
    titleLead: "B-BBEE",
    titleGradient: "Toolkit.",
    heroSub:
      "Automated scorecard calculation across all five pillars — with AI-powered evidence extraction and audit-grade outputs your verifier can defend.",
    primaryCta: "Model your scorecard",
    primaryAction: "register",
    stats: [
      { name: "Ownership", meta: "25 points" },
      { name: "Mgmt Control", meta: "19 points" },
      { name: "Skills Dev", meta: "25 points" },
      { name: "ESD", meta: "29 points" },
      { name: "SED · YES", meta: "8 points" },
    ],
    overviewNum: "01",
    overviewKicker: "The engine",
    overviewTitle: "One toolkit for every B-BBEE pillar",
    overviewLead:
      "Capture once, calculate everywhere. Okiru Pro turns raw evidence into a defensible scorecard with a dependency-aware formula graph behind every number.",
    features: [
      {
        label: "Automation",
        title: "Five-pillar scoring",
        stat: "5 / 5",
        statLabel: "pillars automated",
        desc: "Ownership, Management Control, Skills Development, Enterprise & Supplier Development and Socio-Economic Development — scored end to end.",
      },
      {
        label: "Coverage",
        title: "Sector code support",
        stat: "9+",
        statLabel: "sector codes",
        desc: "Generic plus ICT, FSC, Construction, AgriBEE, Property, Tourism, MAC and Transport — each with its own targets and sub-elements.",
      },
      {
        label: "Intelligence",
        title: "AI evidence extraction",
        stat: "60%+",
        statLabel: "less manual capture",
        desc: "Parse PDFs and Excel toolkits automatically — entities, values and categories mapped straight into the scorecard.",
      },
      {
        label: "Compliance",
        title: "WSP / ATR & EE ready",
        stat: "Integrated",
        statLabel: "skills & equity",
        desc: "Skills Development WSP/ATR and Employment Equity plans feed the scorecard without re-keying across systems.",
      },
      {
        label: "Defensibility",
        title: "Verifier-defensible output",
        stat: "Audit-grade",
        statLabel: "every calculation",
        desc: "Every score traces back to its evidence and formula, so verifiers can follow the logic instead of second-guessing it.",
      },
      {
        label: "Modelling",
        title: "What-if scenarios",
        stat: "Live",
        statLabel: "scenario planning",
        desc: "Test spend, ownership and skills decisions against your level before you commit — and see the point movement instantly.",
      },
    ],
    howTitle: "From evidence to certificate",
    howLead: "A single, auditable pipeline from data capture to a board-ready scorecard.",
    steps: [
      { num: "01", name: "Capture", desc: "Upload evidence or import your toolkit — AI maps it into the right pillar." },
      { num: "02", name: "Calculate", desc: "The formula graph scores every pillar with sector-correct targets." },
      { num: "03", name: "Verify & export", desc: "Produce a defensible scorecard, certificate and verification report." },
    ],
    ctaTitle: "Model your B-BBEE scorecard in minutes.",
    ctaSub: "See your level, your point gaps and the fastest path to improve them.",
  },
  {
    slug: "esg-toolkit",
    navLabel: "ESG Toolkit",
    theme: "blue",
    heroTag: "Scope 1·2·3 · IFRS S1/S2 · Net-Zero",
    heroBrand: "Okiru · ESG",
    titleLead: "ESG",
    titleGradient: "Toolkit.",
    heroSub:
      "Activity-based carbon measurement aligned to IFRS S1/S2 and the GHG Protocol — with a Net-Zero roadmap projected to 2050.",
    primaryCta: "Start measuring",
    primaryAction: "register",
    stats: [
      { name: "Scope 1", meta: "Direct emissions" },
      { name: "Scope 2", meta: "Purchased energy" },
      { name: "Scope 3", meta: "Value chain" },
      { name: "IFRS S1/S2", meta: "Disclosure-ready" },
      { name: "SBTi", meta: "Net-Zero targets" },
    ],
    overviewNum: "01",
    overviewKicker: "The engine",
    overviewTitle: "Measure what you can't yet see",
    overviewLead:
      "Most organisations measure Scope 1 confidently and Scope 3 with guesswork. Okiru's activity-based engine closes the gap with defensible emission factors.",
    features: [
      {
        label: "Method",
        title: "Activity-based measurement",
        stat: "1 · 2 · 3",
        statLabel: "all three scopes",
        desc: "Move beyond spend-based estimates — quantify emissions from real activity data across your operations and supply chain.",
      },
      {
        label: "Standards",
        title: "IFRS S1/S2 & TCFD",
        stat: "Aligned",
        statLabel: "global frameworks",
        desc: "Outputs map directly to IFRS S1/S2, TCFD and the GHG Protocol so disclosure isn't rebuilt every reporting cycle.",
      },
      {
        label: "Factors",
        title: "DEFRA & Eskom factors",
        stat: "Curated",
        statLabel: "emission factors",
        desc: "GHG Protocol factors including DEFRA and Eskom / NERSA, kept current so your footprint reflects the right basis.",
      },
      {
        label: "Strategy",
        title: "Net-Zero roadmap",
        stat: "2050",
        statLabel: "SBTi CNZS 2.0",
        desc: "Project your trajectory to Net-Zero with milestone targets and levers like EV fleet and solar modelled in.",
      },
      {
        label: "Focus",
        title: "Materiality matrix",
        stat: "Ranked",
        statLabel: "by impact",
        desc: "Prioritise what matters to your stakeholders and your risk profile with a structured materiality assessment.",
      },
      {
        label: "Risk",
        title: "Climate risk taxonomy",
        stat: "Board-ready",
        statLabel: "risk register",
        desc: "Classify physical and transition risks in a taxonomy your board and auditors can act on.",
      },
    ],
    howTitle: "Measure, disclose, reduce",
    howLead: "A closed loop from raw activity data to a credible reduction pathway.",
    steps: [
      { num: "01", name: "Measure", desc: "Capture activity data across Scope 1, 2 and 3 with the right factors." },
      { num: "02", name: "Disclose", desc: "Generate IFRS S1/S2 and TCFD-aligned, board-ready disclosure." },
      { num: "03", name: "Reduce", desc: "Model a Net-Zero pathway and track progress against SBTi targets." },
    ],
    ctaTitle: "Make your carbon footprint measurable.",
    ctaSub: "From first baseline to a credible Net-Zero roadmap — on one platform.",
  },
  {
    slug: "bbbee-certificate",
    navLabel: "B-BBEE Certificate",
    theme: "orange",
    heroTag: "Registry · Extraction · Validity",
    heroBrand: "Okiru · Certificate Hub",
    titleLead: "Certificate",
    titleGradient: "Hub.",
    heroSub:
      "A centralised supplier certificate registry with AI metadata extraction, expiry tracking and full-text search — so your procurement spend stays compliant.",
    primaryCta: "Explore the hub",
    primaryAction: "certificates",
    stats: [
      { name: "Registry", meta: "All suppliers" },
      { name: "Validity", meta: "Live tracking" },
      { name: "Extraction", meta: "AI-powered" },
      { name: "Search", meta: "Full-text PDF" },
      { name: "Alerts", meta: "Expiry warnings" },
    ],
    overviewNum: "01",
    overviewKicker: "The hub",
    overviewTitle: "Every supplier certificate, one source of truth",
    overviewLead:
      "Stop chasing PDFs across inboxes. The Certificate Hub keeps every supplier certificate, its level and its expiry in a single, searchable registry.",
    features: [
      {
        label: "Registry",
        title: "Centralised registry",
        stat: "One place",
        statLabel: "all certificates",
        desc: "A sortable, filterable registry of every supplier with B-BBEE level badges, status indicators and expiry dates.",
      },
      {
        label: "Intelligence",
        title: "AI metadata extraction",
        stat: "Auto",
        statLabel: "level · expiry · %",
        desc: "Reads each certificate and extracts B-BBEE level, expiry date and Black ownership — no manual data entry.",
      },
      {
        label: "Validity",
        title: "Expiry tracking & alerts",
        stat: "Live",
        statLabel: "expiring / expired",
        desc: "See what's valid, expiring soon and expired at a glance, with KPI cards that filter the registry in one click.",
      },
      {
        label: "Search",
        title: "Full-text PDF search",
        stat: "Deep",
        statLabel: "inside every doc",
        desc: "Search the contents of scanned and text PDFs — powered by OCR and Azure AI Search, not just filenames.",
      },
      {
        label: "Filter",
        title: "Filter by VAT & sector",
        stat: "Instant",
        statLabel: "any supplier",
        desc: "Find any supplier by VAT number, sector or status and export the filtered registry to CSV.",
      },
      {
        label: "Verification",
        title: "Verification status",
        stat: "At a glance",
        statLabel: "compliance view",
        desc: "Track empowering suppliers and average B-BBEE level so procurement spend stays defensible.",
      },
    ],
    howTitle: "Upload, extract, track",
    howLead: "Turn a pile of certificate PDFs into a live compliance dashboard.",
    steps: [
      { num: "01", name: "Upload", desc: "Drag and drop certificates — PDF, image or Excel, in bulk." },
      { num: "02", name: "Extract", desc: "AI reads each document and pulls level, expiry and ownership." },
      { num: "03", name: "Track", desc: "Monitor validity, get expiry alerts and search every document." },
    ],
    ctaTitle: "Keep every supplier certificate compliant.",
    ctaSub: "One registry, live validity tracking and full-text search across all your certificates.",
  },
];

export const PRODUCT_TABS = PRODUCTS.map((p) => ({ slug: p.slug, label: p.navLabel }));

export const getProduct = (slug?: string): ProductConfig | undefined =>
  PRODUCTS.find((p) => p.slug === slug);
