/**
 * How every ESG screen writes a number, a field name, a date and an element.
 *
 * Each surface used to pick its own: the summary wrote "8,6" (en-ZA, decimal
 * comma) beside a grid total of "1,630" (thousands comma), the review wrote
 * "14 820" and the library "14820". "8,6" next to "1,630" is genuinely
 * ambiguous — one of them has to be read the wrong way. So there is one rule:
 * a space between thousands and a point before decimals ("1 630", "8.6",
 * "14 820"), which no reader can take for anything else.
 *
 * Field names get the same treatment: one function, with the unit fixes
 * (kWh, kL, tCO2e, LTIFR) the review and the library each lacked.
 */

/** A non-breaking space, so "14 820" never wraps between its digits. */
const GROUP = " ";

/**
 * A number as every ESG screen shows it: "14 820", "8.6", "0.25".
 * `digits` caps the decimals (2 unless said otherwise); trailing zeros go.
 */
export function formatEsgNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, useGrouping: true }).format(value);
  return fixed.replace(/,/g, GROUP);
}

/** Field-name words whose case or spelling a title-caser gets wrong. */
const WORD_FIXES: Array<[RegExp, string]> = [
  [/\bkwh\b/gi, "kWh"],
  [/\bmwh\b/gi, "MWh"],
  [/\bkva\b/gi, "kVA"],
  [/\bkl\b/gi, "kL"],
  [/\bkg\b/gi, "kg"],
  [/\bkm\b/gi, "km"],
  [/\btco2e?\b/gi, "tCO2e"],
  [/\bco2e?\b/gi, "CO2e"],
  [/\bghg\b/gi, "GHG"],
  [/\bltifr\b/gi, "LTIFR"],
  [/\btrifr\b/gi, "TRIFR"],
  [/\blti\b/gi, "LTI"],
  [/\besg\b/gi, "ESG"],
  [/\biso\b/gi, "ISO"],
  [/\bcsi\b/gi, "CSI"],
  [/\bsbti\b/gi, "SBTi"],
  [/\bnpat\b/gi, "NPAT"],
  [/\bppe\b/gi, "PPE"],
  [/\bvat\b/gi, "VAT"],
  [/\bid\b/gi, "ID"],
  [/\blpg\b/gi, "LPG"],
  [/\bpv\b/gi, "PV"],
];

/**
 * `electricity_kwh` → "Electricity kWh"; `billing_period_end` → "Billing
 * period end"; `energy.site_name` → "Site name". Sentence case, units right.
 */
export function esgFieldLabel(field: string): string {
  const raw = String(field ?? "").trim();
  if (!raw) return "";
  // A namespaced key ("energy.electricity_kwh") is named by its last part.
  const last = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
  let text = last
    .replace(/^(current_year_|cy_)/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  for (const [pattern, replacement] of WORD_FIXES) text = text.replace(pattern, replacement);
  return text.replace(/^[a-z]/, (c) => c.toUpperCase());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-07-31" → "31 Jul 2025". Anything that is not an ISO date comes back null. */
export function formatEsgDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[month - 1]} ${m[1]}`;
}

/**
 * A scalar as every ESG screen shows it. Numbers and numeric strings take
 * the one number rule, ISO dates read as dates, booleans as Yes / No.
 * Lists and records are the caller's to describe — this returns null for them.
 */
export function formatEsgScalar(value: unknown, options: { digits?: number; field?: string } = {}): string | null {
  const digits = options.digits ?? 2;
  // A year is a label, not a quantity: "2025", never "2 025".
  const isYear = /year/i.test(options.field ?? "");
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return isYear && Number.isInteger(value) ? String(value) : formatEsgNumber(value, digits);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return null;
  const s = String(value).trim();
  if (!s) return null;
  const date = formatEsgDate(s);
  if (date) return date;
  // A plain number written as text ("14820", "-3.5") — never a code like "0012",
  // and a four-digit whole number stays as written (it is as often a year as a quantity).
  if (!isYear && /^-?\d+(\.\d+)?$/.test(s) && !/^-?0\d/.test(s) && !/^\d{4}$/.test(s)) {
    return formatEsgNumber(Number(s), digits);
  }
  return s;
}

/** Element code → the wording a practitioner would recognise. */
export const ESG_ELEMENT_LABELS: Record<string, string> = {
  GHG_ENERGY: "Energy & emissions",
  FLEET: "Fleet",
  WASTE: "Waste",
  WATER: "Water",
  ISO_ENVIRONMENTAL: "Environmental management",
  ENVIRONMENTAL_MANAGEMENT: "Environmental management",
  BIODIVERSITY: "Biodiversity",
  EMPLOYMENT_EQUITY: "Employment equity",
  HEALTH_SAFETY: "Health & safety",
  TRAINING: "Skills & training",
  COMMUNITY_CSI: "Community & CSI",
  SUPPLIER_ESG: "Supplier ESG",
  BOARD_GOVERNANCE: "Board & governance",
  ETHICS_COMPLIANCE: "Ethics & compliance",
  RISK_ASSURANCE: "Risk & assurance",
  FINANCIAL: "Financials",
  CLIMATE: "Climate strategy",
  PRIVACY: "Data privacy",
  HUMAN_RIGHTS: "Human rights",
};

/**
 * Whether a library run is an ESG document's — its fields then take the ESG
 * names and number rule. The ESG reader stamps `domain: "esg"`; a signed run
 * that does not still files its element under `pillar`.
 */
export function isEsgParserOutput(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as { domain?: unknown; pillar?: unknown };
  if (String(o.domain ?? "").toLowerCase() === "esg") return true;
  return Object.prototype.hasOwnProperty.call(ESG_ELEMENT_LABELS, String(o.pillar ?? ""));
}

/**
 * An element's name. A code the table does not know is still said in words
 * ("LAND_USE" → "Land use"), never shown raw.
 */
export function esgElementLabel(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  if (!c) return "Unclassified";
  const known = ESG_ELEMENT_LABELS[c] ?? ESG_ELEMENT_LABELS[c.toUpperCase()];
  if (known) return known;
  return esgFieldLabel(c.toLowerCase());
}
