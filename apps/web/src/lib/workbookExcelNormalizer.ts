/**
 * Excel → workbook section normalizer for Create Scorecard / Information Request flow.
 *
 * Pipeline: parse → map sheets → map columns → normalize types → structure → validate
 */
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import {
  SECTIONS,
  getSection,
  getScorecardTypeOptions,
  parseWorkbookDate,
  BBBEE_LEVEL_MAP,
  OCC_LEVEL_MAP,
  SUPPLIER_SIZE_MAP,
  type ColumnDef,
} from "@/components/workbook/sections";
import {
  validateWorkbook,
  isCriticalWorkbookIssue,
  type WorkbookValidationIssue,
} from "@/components/workbook/workbookValidation";
import { BOOLEAN_TRUE, BOOLEAN_FALSE } from "@/lib/tabularNormalize";

export type WorkbookRow = Record<string, unknown> & { _id: string };
export type WorkbookSectionPayload = { rows: WorkbookRow[]; meta?: Record<string, unknown> };
export type WorkbookSectionsInput = Record<string, WorkbookSectionPayload>;

export type ExcelImportResult = {
  sections: WorkbookSectionsInput;
  validationIssues: WorkbookValidationIssue[];
  criticalBlocked: boolean;
  warnings: string[];
  mappedSheets: Record<string, string>;
  /** Count of populated data points (non-empty meta fields + grid rows) across all
   *  sections — drives the "{n} fields extracted" preview line (was always 0 for the
   *  clean-importer path because this field was never set). */
  extractedFieldCount: number;
};

const SHEET_SECTION_HINTS: Array<{ sectionKey: string; hints: string[] }> = [
  { sectionKey: "company-information", hints: ["information request", "company information", "company info", "general", "client"] },
  // "financials" must be an EXACT hint: the afs-additions hint "access to financial
  // services" normalises to a string containing "financials", so without an exact
  // pass-1 match the real "Financials" sheet was swallowed by afs-additions (meta: [])
  // and every workbook's revenue/NPAT/payroll were silently dropped. (R21)
  { sectionKey: "financial-information", hints: ["financials", "financial information", "financial", "finance", "p&l", "revenue"] },
  { sectionKey: "afs-additions", hints: ["afs additions", "access to financial services", "afs scorecard", "afs banks", "afs long term", "afs short term"] },
  { sectionKey: "ownership", hints: ["ownership", "shareholder", "voting rights", "equity"] },
  { sectionKey: "management-control", hints: ["management control", "management", "board", "directors", "exco", "leadership", "mc data"] },
  { sectionKey: "employees", hints: ["employees", "employee", "staff list", "employment equity", "ee profile", "workforce", "headcount"] },
  { sectionKey: "skills-development", hints: ["skills development", "skills", "training", "learning", "learnership", "learnerships", "learning programme", "learning programmes", "skills report", "bursaries", "wsp atr", "skills dev"] },
  // The "suppliers" / "vendor" hints map to the canonical Procurement section
  // (the standalone "Suppliers" section was removed in May 2026).
  { sectionKey: "procurement", hints: ["procurement", "preferential procurement", "suppliers", "supplier", "vendor", "vendors"] },
  // "Enterprise & Supplier Developme" is the real export sheet name (Excel truncates
  // sheet names to 31 chars). The old hints "enterprise development" / "supplier
  // development" did NOT match it, so the whole ESD sheet was skipped and every
  // workbook lost its Supplier + Enterprise Development points. (W1a)
  { sectionKey: "esd", hints: ["enterprise & supplier development", "enterprise supplier development", "enterprise & supplier", "enterprise development", "supplier development", "esd", "es&sd"] },
  { sectionKey: "sed", hints: ["socioeconomic", "socio-economic", "socio economic", "sed", "csi"] },
];

const RACE_MAP: Record<string, string> = {
  african: "African",
  black: "African",
  coloured: "Coloured",
  colored: "Coloured",
  indian: "Indian",
  white: "White",
};

const GENDER_MAP: Record<string, string> = {
  male: "Male",
  m: "Male",
  female: "Female",
  f: "Female",
};

// Summary / total / note rows the grid parser ingests below the real shareholder
// rows (e.g. "TOTALS" at 100% voting, "Black voting rights", a "Net value:" note).
// The projection (workbookRoutes) already drops these for scoring, but the import
// PREVIEW shows the raw ingested rows — so they surfaced as bogus shareholders with
// a percentage in the Race column, flooding validation. Filter at ingestion. (W-validate)
const JUNK_OWNERSHIP_NAME =
  /^(totals?|sub-?totals?|grand\s+total|net\s+value|black\s+(voting|women|economic|new|people|disabled))/i;

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchSheetName(sheetName: string): string | null {
  const n = norm(sheetName);
  if (!n) return null;
  // Two-pass match. (1) exact normalised match. (2) substring containment but
  // only against hints of length ≥ 4 so short noise tokens like "pl" (from
  // "p&l") don't accidentally swallow "Suppliers" → "financial-information".
  for (const { sectionKey, hints } of SHEET_SECTION_HINTS) {
    if (hints.some((h) => norm(h) === n)) return sectionKey;
  }
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const { sectionKey, hints } of SHEET_SECTION_HINTS) {
    for (const h of hints) {
      const a = norm(h);
      if (a.length < 4) continue;
      if (n.includes(a) || a.includes(n)) {
        if (a.length > bestLen) {
          bestLen = a.length;
          bestKey = sectionKey;
        }
      }
    }
  }
  return bestKey;
}

function buildColumnAliases(col: ColumnDef): string[] {
  const aliases = [col.key, col.label];
  const label = col.label.replace(/\*+$/, "").trim();
  aliases.push(label);
  if (label.includes("—")) aliases.push(label.split("—")[0].trim());
  if (label.includes("(")) aliases.push(label.split("(")[0].trim());
  if (col.aliases) aliases.push(...col.aliases);
  return aliases;
}

function mapHeaderToKey(header: string, columns: ColumnDef[], excludeKeys?: Set<string>): string | null {
  const h = norm(header);
  if (!h) return null;
  // First pass: exact normalised match — beats substring matches when both
  // would qualify (e.g. "Spend" vs "Total Spend" → prefer the exact "Spend").
  for (const col of columns) {
    if (excludeKeys?.has(col.key)) continue;
    for (const alias of buildColumnAliases(col)) {
      if (norm(alias) === h) return col.key;
    }
  }
  // Second pass: substring/contains match (looser). Skipping already-claimed keys
  // lets a header whose FIRST substring match is taken fall through to its next
  // valid key (e.g. "Current Company Size *" → sizeAtFirstProcurement is claimed →
  // currentSize). (W-proc)
  for (const col of columns) {
    if (excludeKeys?.has(col.key)) continue;
    for (const alias of buildColumnAliases(col)) {
      const a = norm(alias);
      if (!a) continue;
      if (h.includes(a) || a.includes(h)) return col.key;
    }
  }
  return null;
}

/**
 * Robust currency / numeric parser. Tolerates:
 *  - `R` / `$` / `€` / `£` prefix
 *  - thin/non-breaking spaces, plain spaces as thousands separators
 *  - parentheses indicating negatives `(1,234)`
 *  - either `,` or `.` as decimal separator (last separator wins)
 *  - mixed thousands + decimal e.g. `R 1,234.50` or `R 1.234,50`
 */
export function parseLooseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^-/.test(s) || /^\(.+\)$/.test(s);
  s = s
    .replace(/[Rr$€£]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(/[()]/g, "")
    .replace(/^[+-]/, "");
  if (!s || s === "." || s === ",") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const commaCount = (s.match(/,/g) || []).length;
    const after = s.length - lastComma - 1;
    if (commaCount === 1 && after !== 3) {
      // Single comma not followed by exactly 3 digits → decimal.
      normalized = s.replace(",", ".");
    } else {
      // Otherwise treat all commas as thousands separators.
      normalized = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      // e.g. 1.234.567 → European thousands → 1234567
      normalized = s.replace(/\./g, "");
    } else {
      // Single dot → keep as decimal (covers "1234.5" and "1.234" which we
      // intentionally read as 1.234, not 1234 — without ambiguity we trust
      // the user's punctuation).
      normalized = s;
    }
  } else {
    normalized = s;
  }
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return negative && n > 0 ? -n : n;
}

function coerceValue(key: string, col: ColumnDef | undefined, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return "";
  // Yes/No select columns (yesNoBoolean) and plain booleans both normalise via the
  // shared synonym set, so "true"/"t"/"✓"/"x"/"checked"/"compliant"/"yebo" all
  // become Yes and "no"/"false"/"n/a"/"none" become No — not a raw string that
  // then fails strict-select validation.
  if (col?.yesNoBoolean || col?.type === "boolean") {
    const s = String(raw).trim().toLowerCase();
    if (BOOLEAN_TRUE.has(s)) return true;
    if (BOOLEAN_FALSE.has(s)) return false;
    return false;
  }
  if (col?.type === "number") {
    const n = parseLooseNumber(raw);
    return n === null ? "" : n;
  }
  if (col?.type === "date") {
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const parsed = parseWorkbookDate(raw);
    if (parsed) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(raw).trim();
  }
  if (col?.type === "select") {
    const s = String(raw).trim();
    const n = norm(s);
    if (col.key === "race") {
      const mapped = RACE_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "gender") {
      const mapped = GENDER_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "currentSize" || col.key === "sizeAtFirstProcurement") {
      const mapped = SUPPLIER_SIZE_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "occupationalLevel") {
      const mapped = OCC_LEVEL_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "bbbeeLevel") {
      const mapped = BBBEE_LEVEL_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "industrySector") return s.toUpperCase();
    return s;
  }
  if (key === "industrySector") return String(raw).trim().toUpperCase();
  return String(raw).trim();
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] || [];
    const filled = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
    if (filled >= 2) return i;
  }
  return 0;
}

/**
 * R21: real toolkit Financials sheets lay values out as
 * `Metric | Prior FYE… | Measured FYE… | Forecast FYE…`. The scorecard is built
 * on the MEASURED (current) year, so meta values must come from that column —
 * not column B (Prior). Find the year-header row (one carrying both a "Prior…"
 * and a "Measured…" cell, columns ≥ 1) and return the Measured column index.
 * Returns null for ordinary single-value meta sheets (value in column B), which
 * therefore keep their existing behaviour.
 */
function findMeasuredColumn(rows: unknown[][]): number | null {
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    let measuredIdx = -1;
    let hasPrior = false;
    for (let c = 1; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      if (/^measured\b/i.test(cell)) measuredIdx = c;
      else if (/^prior\b/i.test(cell)) hasPrior = true;
    }
    if (measuredIdx >= 0 && hasPrior) return measuredIdx;
  }
  return null;
}

function parseMetaFromSheet(
  rows: unknown[][],
  columns: ColumnDef[],
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  // R21: prefer the Measured column when the sheet has a Prior|Measured|Forecast header.
  const measuredCol = findMeasuredColumn(rows);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.length >= 2) {
      const label = String(row[0] ?? "").trim();
      if (!label) continue;
      const key = mapHeaderToKey(label, columns);
      if (key) {
        const col = columns.find((c) => c.key === key);
        // Default to column B; override with the Measured column when present and
        // non-empty (so single-value rows above the year header still read column B).
        let value = row[1];
        if (measuredCol != null) {
          const m = row[measuredCol];
          if (m !== "" && m !== null && m !== undefined) value = m;
        }
        meta[key] = coerceValue(key, col, value);
      }
    }
  }
  return meta;
}

/**
 * W-fsc: FSC test/export workbooks express "Access to Financial Services" as a
 * generic indicator table — `Access Indicator | Unit | Notional Target | Achieved
 * | Qualifying? (Yes/No)` — NOT the structured per-field layout the afs-additions
 * section meta expects (afsActiveAccountsCompliant, afsElectronicAccessCompliant …).
 * So parseMetaFromSheet matched nothing and AFS scored 0, dropping every FSC
 * Banks/LTI/STI workbook to Level 2 purely on unscored AFS.
 *
 * Read the table faithfully: for each indicator the workbook marks "Qualifying"
 * (explicit Yes, or Achieved ≥ Target), set the matching afs* compliance flag so
 * the existing AFS calculator (calculateAfsScore) can score it. Indicators the
 * sheet does NOT carry (e.g. geographic point-coverage %) are left unset → 0,
 * never fabricated. Keyword matching is union across sub-sectors; the calculator
 * only reads the fields relevant to its sub-sector, so extra flags are harmless.
 */
function deriveAfsMetaFromIndicatorTable(rows: unknown[][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Find the header row: one carrying an indicator/target/achieved/qualifying header.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const joined = (rows[i] || []).map((c) => norm(String(c ?? ""))).join("|");
    if (/indicator/.test(joined) && (/qualifying/.test(joined) || /achieved/.test(joined) || /target/.test(joined))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return out;
  const header = (rows[headerIdx] as unknown[]).map((c) => norm(String(c ?? "")));
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const labelCol = Math.max(0, find("indicator", "accessindicator", "measure"));
  const targetCol = find("notionaltarget", "target");
  const achievedCol = find("achieved", "actual");
  const qualCol = find("qualifying", "qualify", "compliant");

  const setTrue = (k: string) => { out[k] = true; };
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r) continue;
    const label = norm(String(r[labelCol] ?? ""));
    if (!label) continue;
    const target = targetCol >= 0 ? Number(String(r[targetCol] ?? "").replace(/[^0-9.\-]/g, "")) : NaN;
    const achieved = achievedCol >= 0 ? Number(String(r[achievedCol] ?? "").replace(/[^0-9.\-]/g, "")) : NaN;
    const qualText = qualCol >= 0 ? norm(String(r[qualCol] ?? "")) : "";
    const qualifies = qualText
      ? /^y|^yes|^true|^compliant|^pass/.test(qualText)
      : Number.isFinite(achieved) && Number.isFinite(target) && target > 0 && achieved >= target;
    if (!qualifies) continue;

    // ---- Banks (FS701) ----
    if (/account/.test(label)) setTrue("afsActiveAccountsCompliant");
    if (/electronic|digital|mobile|ussd|online/.test(label)) setTrue("afsElectronicAccessCompliant");
    if (/servicepoint|accesspoint|serviceaccess|branch|atm|agent|pointofpresence|claimsservice/.test(label)) setTrue("afsHasPointOfPresence");
    // ---- STI (FS703) commercial lines + insurance policies ----
    if (/equipment/.test(label)) setTrue("afsCommercialEquipment");
    if (/liability|sme|business|asset/.test(label)) setTrue("afsCommercialLiability");
    if (/property|personalline|household|motor/.test(label)) setTrue("afsCommercialProperty");
    if (/agri|crop|farmer/.test(label)) { setTrue("afsCommercialAgriculture"); setTrue("afsCommercialLivestock"); }
    if (/livestock/.test(label)) setTrue("afsCommercialLivestock");
    if (/broker|intermediar|procurement|other/.test(label)) setTrue("afsCommercialOther");
    if (/policy|policies|premium|covertotarget|insurance|riskcover|shorttermcover|longtermrisk/.test(label)) setTrue("afsInsurancePoliciesCompliant");
    // ---- LTI (FS702) ----
    if (/appropriateproduct|productrange|developedproduct/.test(label) && Number.isFinite(achieved) && Number.isFinite(target) && target > 0) {
      out.afsAppropriateProductsNumerator = Math.min(achieved, target);
      out.afsAppropriateProductsDenominator = target;
    }
    if (/marketpenetration|onbookpolic/.test(label) && Number.isFinite(achieved) && Number.isFinite(target) && target > 0) {
      out.afsMarketPenetrationPolicies = achieved;
      out.afsSaiaCommunicatedPolicies = target;
    }
  }
  return out;
}

function parseGridFromSheet(
  rows: unknown[][],
  columns: ColumnDef[],
): WorkbookRow[] {
  if (rows.length < 2) return [];
  const headerIdx = findHeaderRow(rows);
  const headers = (rows[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  // Two-pass column→key mapping. A column whose header EXACTLY matches a key's alias
  // owns that key; a looser substring match cannot override an exact-claimed key.
  // Without this, "Salary Cost (category B,C,D only)" and "Location" both substring-
  // matched "category" and overwrote the real "Category *" -> categoryCode slot with
  // the Location value, breaking category-based skills scoring for every workbook. (W-skills)
  const exactKeyForHeader = (h: string): string | null => {
    const hn = norm(h);
    if (!hn) return null;
    for (const col of columns) for (const alias of buildColumnAliases(col)) if (norm(alias) === hn) return col.key;
    return null;
  };
  const exactKeys = headers.map(exactKeyForHeader);
  const claimedExact = new Set(exactKeys.filter((k): k is string => Boolean(k)));
  const keyByCol: (string | null)[] = headers.map((h, i) => {
    if (exactKeys[i]) return exactKeys[i];
    // Substring match, skipping keys already exact-claimed so the header can fall
    // through to its next valid (unclaimed) key instead of being dropped.
    return mapHeaderToKey(h, columns, claimedExact);
  });

  const out: WorkbookRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const vals = rows[i] as unknown[];
    if (!vals || vals.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    const row: WorkbookRow = { _id: uuidv4() };
    let hasData = false;
    keyByCol.forEach((key, colIdx) => {
      if (!key) return;
      const col = columns.find((c) => c.key === key);
      const val = coerceValue(key, col, vals[colIdx]);
      if (val !== "" && val !== null && val !== undefined) hasData = true;
      row[key] = val;
    });
    if (hasData) out.push(row);
  }
  // W3: workbooks commonly put the full name in a single "Name" column while the
  // grid also defines a separate (required) "Surname". Split "First Last" so the
  // surname isn't flagged Required and per-person scoring has both parts. Last
  // whitespace token is the surname; everything before it is the given name(s).
  if (columns.some((c) => c.key === "name") && columns.some((c) => c.key === "surname")) {
    for (const r of out) {
      const nm = String(r.name ?? "").trim();
      const sn = String(r.surname ?? "").trim();
      if (nm && !sn && /\s/.test(nm)) {
        const parts = nm.split(/\s+/);
        r.surname = parts.pop() as string;
        r.name = parts.join(" ");
      }
    }
  }
  return out;
}

/** Count populated data points (non-empty meta values + grid rows) across all
 *  sections — drives the "{n} fields extracted" preview line. */
function countExtractedFields(sections: WorkbookSectionsInput): number {
  let n = 0;
  for (const sec of Object.values(sections)) {
    if (sec?.meta) n += Object.values(sec.meta).filter((v) => v !== "" && v != null).length;
    if (Array.isArray(sec?.rows)) n += sec.rows.length;
  }
  return n;
}

/**
 * Fill fields the workbook didn't provide but we CAN derive, so the form/preview
 * show real values instead of blanks (and they aren't flagged). Score-neutral: the
 * projection already derives the same headcount + defaults EAP to National — this
 * just surfaces those values in the imported data. (user request)
 */
function deriveSectionDefaults(sections: WorkbookSectionsInput): void {
  const mcRows = sections['management-control']?.rows?.length ?? 0;
  const empRows = sections['employees']?.rows?.length ?? 0;
  const headcount = mcRows || empRows;
  const skills = sections['skills-development'];
  if (skills) {
    const meta = ((skills as { meta?: Record<string, unknown> }).meta ??=
      {}) as Record<string, unknown>;
    if ((meta.headcount == null || meta.headcount === '') && headcount > 0) meta.headcount = headcount;
    if (meta.eapProvince == null || meta.eapProvince === '') meta.eapProvince = 'National';
  }
}

function emptySections(): WorkbookSectionsInput {
  const sections: WorkbookSectionsInput = {};
  for (const s of SECTIONS) {
    if (!s.enabled) continue;
    sections[s.key] = s.meta ? { rows: [], meta: {} } : { rows: [] };
  }
  return sections;
}

function hasCriticalGaps(issues: WorkbookValidationIssue[]): boolean {
  return issues.some(isCriticalWorkbookIssue);
}

/**
 * Map a free-text "Sector / Codes" string (as written in the toolkit header,
 * e.g. "Generic - Amended Codes of Good Practice", "ICT Sector Code",
 * "Construction Sector Code (Contractor scorecard)", "Financial Sector Code
 * (FSC) - Banks", "...QSE scorecard") to the company-info meta the scorer needs.
 */
function mapSectorString(raw: string): Record<string, string> {
  const s = raw.toLowerCase();
  const out: Record<string, string> = {};
  let sector: string;
  if (s.includes("ict")) sector = "ICT";
  else if (s.includes("construction")) sector = "CONSTRUCTION";
  else if (s.includes("financial sector") || /\bfsc\b/.test(s)) sector = "FSC";
  else if (s.includes("transport")) sector = "TRANSPORT";
  else if (s.includes("agri")) sector = "AGRI";
  else sector = "RCOGP"; // "Generic - Amended Codes of Good Practice"
  out.industrySector = sector;
  const allowed = getScorecardTypeOptions(sector);
  out.scorecardType = /\bqse\b/.test(s) && allowed.includes("QSE")
    ? "QSE"
    : (allowed.includes("Generic") ? "Generic" : allowed[0] ?? "Generic");
  if (sector === "FSC") {
    out.fscSubSector = s.includes("bank") ? "Banks"
      : s.includes("long") ? "Long-Term Insurers"
      : s.includes("short") ? "Short-Term Insurers"
      : "Others";
  }
  if (sector === "CONSTRUCTION") {
    out.constructionSubSector = (s.includes("bep") || s.includes("built environment")) ? "BEP" : "Contractor";
  }
  return out;
}

const NAME_LABELS = new Set([
  "measured entity", "measured entity name", "company / legal name", "company name",
  "legal name", "entity name", "company",
]);
const SECTOR_LABELS = ["sector / codes", "sector/codes", "sector codes", "industry / sector code", "industry sector", "applicable codes"];

/**
 * R19: real export workbooks put the measured entity name + sector on the
 * Financials sheet header (not the "Information Request" checklist sheet that
 * maps to company-information), so the required company meta was never read and
 * every standalone upload was critically blocked. Scan all sheets' header rows
 * for a "Measured Entity"/"Sector / Codes" key-value pair and derive the meta.
 */
function deriveCompanyMetaFromSheets(wb: XLSX.WorkBook): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][];
    for (const r of rows.slice(0, 15)) {
      const label = String(r?.[0] ?? "").trim().toLowerCase();
      const value = String(r?.[1] ?? "").trim();
      if (!label || !value) continue;
      if (out.companyName === undefined && NAME_LABELS.has(label)) out.companyName = value;
      if (out.industrySector === undefined && SECTOR_LABELS.some((l) => label === l || label.startsWith(l))) {
        Object.assign(out, mapSectorString(value));
      }
    }
    if (out.companyName !== undefined && out.industrySector !== undefined) break;
  }
  return out;
}

export function normalizeExcelBuffer(buffer: ArrayBuffer): ExcelImportResult {
  const warnings: string[] = [];
  const mappedSheets: Record<string, string> = {};
  const sections = emptySections();

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const sectionKey = matchSheetName(sheetName);
    if (!sectionKey) {
      warnings.push(`Skipped unmapped sheet "${sheetName}".`);
      continue;
    }
    mappedSheets[sheetName] = sectionKey;
    const def = getSection(sectionKey);
    if (!def) continue;

    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];

    // Sections may carry meta (key-value) and/or grid columns — e.g. Skills Development
    // has leviable/EAP meta plus training-program rows. Parse both when present.
    let payload: WorkbookSectionPayload = sections[sectionKey] ?? { rows: [] };
    if (def.meta) {
      const meta = parseMetaFromSheet(matrix, def.meta);
      payload = { ...payload, meta: { ...payload.meta, ...meta } };
    }
    // W-fsc: the AFS sheet is a generic indicator table, not key/value meta, so
    // parseMetaFromSheet finds nothing. Derive the afs* compliance flags from the
    // "Qualifying" column so calculateAfsScore can score it (was silently 0).
    if (sectionKey === "afs-additions") {
      const afsMeta = deriveAfsMetaFromIndicatorTable(matrix);
      if (Object.keys(afsMeta).length > 0) {
        payload = { ...payload, meta: { ...payload.meta, ...afsMeta } };
      }
    }
    if (def.columns) {
      let rows = parseGridFromSheet(matrix, def.columns);
      // Drop summary/total/note rows the grid parser picks up below the shareholder
      // data so they don't show as bogus shareholders in the import preview. (W-validate)
      if (sectionKey === "ownership") {
        rows = rows.filter((r) => {
          const nm = String((r as Record<string, unknown>).shareholderName ?? (r as Record<string, unknown>).name ?? "").trim();
          return !JUNK_OWNERSHIP_NAME.test(nm);
        });
      }
      payload = { ...payload, rows: [...(payload.rows ?? []), ...rows] };
    }
    sections[sectionKey] = payload;
  }

  // R19: derive missing company meta (name/sector/type/sub-sector) from any
  // sheet's header — real export workbooks carry it on the Financials sheet, not
  // the "Information Request" checklist. Existing explicit company-info wins.
  const derived = deriveCompanyMetaFromSheets(wb);
  if (Object.keys(derived).length > 0) {
    const ci = sections["company-information"] ?? { rows: [] };
    sections["company-information"] = { ...ci, meta: { ...derived, ...(ci.meta ?? {}) } };
  }

  // Fill derivable fields (headcount from the employee register, EAP → National)
  // so the form/preview show them instead of blanks. (user request)
  deriveSectionDefaults(sections);

  // Strict select-option enforcement is on for the Excel import-preview path
  // so unrecognised dropdown values (e.g. "Mega Corp" supplier size,
  // "Garbage Level" occupational level) surface as validation issues the
  // user can fix before submission. Task #18 areas 1/2.
  const validationIssues = validateWorkbook(sections, { strictSelectOptions: true });
  const criticalBlocked = hasCriticalGaps(validationIssues);

  return { sections, validationIssues, criticalBlocked, warnings, mappedSheets, extractedFieldCount: countExtractedFields(sections) };
}

export async function normalizeExcelFile(file: File): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  return normalizeExcelBuffer(buffer);
}

/**
 * Full-workbook import with AI-assisted sheet→section recovery.
 *
 * Runs the deterministic {@link normalizeExcelBuffer} first, then asks the AI
 * mapping service to classify any sheets whose names did not match a known
 * section (e.g. renamed or non-standard tabs). Recovered grid sheets are parsed
 * with the shared header matcher and appended — never replacing or dropping
 * what deterministic parsing already found. Falls back to the deterministic
 * result on any failure.
 */
export async function normalizeExcelFileWithAi(
  file: File,
  apiBase: string,
): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const base = normalizeExcelBuffer(buffer);

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const unmapped = wb.SheetNames.filter((n) => !base.mappedSheets[n]);
  if (unmapped.length === 0) return base;

  const readMatrix = (name: string): unknown[][] =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][];

  const sheetSummaries = unmapped.map((name) => {
    const matrix = readMatrix(name);
    const headerIdx = findHeaderRow(matrix);
    return {
      name,
      headers: (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim()),
      sampleRows: matrix
        .slice(headerIdx + 1, headerIdx + 4)
        .map((r) => r.map((c) => String(c ?? ""))),
    };
  });

  const sectionSummaries = SECTIONS.filter((s) => s.enabled).map((s) => ({
    key: s.key,
    label: s.label,
    fields: (s.columns ?? s.meta ?? []).map((c) => ({ key: c.key, label: c.label })),
  }));

  try {
    const { importMapSheets } = await import("@/lib/aiMappingClient");
    const { sheetToSection, usedAi, notes } = await importMapSheets(
      sheetSummaries,
      sectionSummaries,
      apiBase,
    );

    const sections = { ...base.sections };
    const mappedSheets = { ...base.mappedSheets };
    const warnings = [...base.warnings];
    let recovered = 0;

    const cellFilled = (v: unknown) =>
      v !== "" && v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");

    for (const name of unmapped) {
      const key = sheetToSection[name];
      if (!key) continue;
      const def = getSection(key);
      if (!def?.columns) continue; // only grid sections support generic recovery
      const rows = parseGridFromSheet(readMatrix(name), def.columns);
      if (!rows.length) continue;
      // Quality gate: only accept the AI's sheet→section guess if the parsed rows
      // actually populate the section's REQUIRED columns. Without this, a sheet the
      // AI mis-maps (e.g. an FSC "Empowerment Financing" / "Consumer Education" sheet
      // forced into ESD/SED) injects junk rows that fill only a label/amount and leave
      // Beneficiary/Type/etc. blank — a flood of "Required" errors + bogus dropdown
      // values. A genuinely-matching sheet fills most required columns. (W-airec)
      const requiredKeys = def.columns.filter((c) => c.required).map((c) => c.key);
      const avgFill = requiredKeys.length
        ? rows.reduce((s, r) => s + requiredKeys.filter((k) => cellFilled((r as Record<string, unknown>)[k])).length, 0) / (rows.length * requiredKeys.length)
        : 1;
      if (requiredKeys.length && avgFill < 0.5) {
        warnings.push(`Skipped "${name}" — its columns don't match ${def.label} (only ${Math.round(avgFill * 100)}% of required fields present), so it was not imported.`);
        continue;
      }
      sections[key] = { rows: [...(sections[key]?.rows ?? []), ...rows] };
      mappedSheets[name] = key;
      recovered++;
      warnings.push(`Recovered "${name}" → ${def.label} (${rows.length} rows)${usedAi ? " via AI" : ""}.`);
    }

    if (recovered === 0) {
      if (notes.length) base.warnings.push(...notes);
      return base;
    }

    const validationIssues = validateWorkbook(sections, { strictSelectOptions: true });
    return {
      sections,
      validationIssues,
      criticalBlocked: hasCriticalGaps(validationIssues),
      warnings: [...warnings, ...notes],
      mappedSheets,
      extractedFieldCount: countExtractedFields(sections),
    };
  } catch {
    return base;
  }
}
