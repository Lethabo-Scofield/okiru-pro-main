// Validation rules for the Information Request workbook.
// Source of truth for rules content: apps/web/src/config/bbbeeInfoRequestRules.json
// (editable JSON copy of attached_assets/bbbee_info_request_rules_*.json).
//
// Excel toolkit convention (see docs/domain/sectors/sls-template.md §2): grey fill =
// required user input (editable), not locked/read-only. White/unfilled cells are
// optional or computed formula output. `required` flags here mirror grey cells.
//
// Field keys are intentionally preserved from previous versions to avoid breaking
// persisted workbook data; only validators and `required` flags were tightened to
// match the rules document.

import { fscSubSectorDisplayLabel, normalizeFscSubSector } from "@toolkit/lib/sectors/fsc-utils";
import { isBelowIndustryNormQuarterThreshold } from "@/lib/npatDeemedCalculation";

function numMeta(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type ColumnType = "text" | "number" | "select" | "boolean" | "id" | "date";

/** Yes/No dropdown options (Excel toolkit convention). */
export const YES_NO_OPTIONS = ["Yes", "No"] as const;

export interface GridTotalDef {
  /** Column key to sum across non-empty rows. */
  columnKey: string;
  /** Label shown in the totals row (defaults to "Total"). */
  label?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  options?: string[];
  /** When true, a Yes/No select is stored as boolean in row JSON. */
  yesNoBoolean?: boolean;
  width?: number;
  validate?: (value: unknown) => string | null;
  /** Inline guidance shown as a tooltip on hover (e.g. picker help text). */
  guidance?: string;
  /** Per-option guidance map (option label → short explanation). */
  optionGuidance?: Record<string, string>;
  /**
   * Optional alternate header labels recognised when normalising an uploaded
   * spreadsheet. Matching is whitespace/punctuation/case-insensitive (see
   * `mapHeaderToKey` in `workbookExcelNormalizer.ts`).
   */
  aliases?: string[];
  /**
   * Plain-English explanation of the validation rule shown in the
   * CellValidationPopup when the user types an unexpected value.
   * Example: "Enter EME, QSE, or Generic — not case sensitive"
   */
  validationMessage?: string;
  /**
   * Short hint appended below the suggested value in the popup.
   * Example: "B-BBEE level 1 is the highest contributor status"
   */
  suggestionHint?: string;
  /** Visually emphasise sector-specific configuration fields (e.g. FSC sub-sector). */
  emphasis?: boolean;
  /** Display-only field (auto-filled); user cannot edit in meta forms. */
  readOnly?: boolean;
}

export interface SectionDef {
  key: string;
  label: string;
  description: string;
  columns?: ColumnDef[];
  enabled: boolean;
  /** Optional single-record (meta) form. When set, the section is a key/value form, not a grid. */
  meta?: ColumnDef[];
  /**
   * Optional label for the grid (rows) portion of a hybrid section.
   * Defaults to "Section entries" when not set.
   */
  gridLabel?: string;
  /**
   * Optional cross-field row validator. Returns a map of `{ columnKey: errorMessage }`
   * for any rule violations spanning multiple columns within the same row.
   */
  rowValidate?: (row: Record<string, unknown>) => Record<string, string>;
  /** Optional summary row rendered above the data grid (Excel toolkit totals). */
  gridTotals?: GridTotalDef[];
}

/** Build a Yes/No select column that persists as boolean. */
export function yesNoColumn(
  key: string,
  label: string,
  extra: Omit<ColumnDef, "key" | "label" | "type" | "options" | "yesNoBoolean"> = {},
): ColumnDef {
  return {
    key,
    label,
    type: "select",
    options: [...YES_NO_OPTIONS],
    yesNoBoolean: true,
    ...extra,
  };
}

const RACE_OPTIONS = ["African", "Coloured", "Indian", "White"];
const GENDER_OPTIONS = ["Male", "Female"];
const DESIGNATION_OPTIONS = [
  "Executive Director",
  "Non-executive Director",
  "Other Executive Manager",
  "Senior Manager",
  "Middle Manager",
  "Junior Manager",
  "Semi-skilled",
  "Unskilled",
];
const OCC_LEVEL_OPTIONS = [
  "Top Management",
  "Senior Management",
  "Middle Management",
  "Junior Management",
  "Skilled",
  "Semi-Skilled",
  "Unskilled",
];
const PROVINCE_OPTIONS = [
  "Gauteng",
  "Western Cape",
  "Kwazulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
];

/** EAP target lookup includes National (Stats SA national table) plus all provinces. */
const EAP_PROVINCE_OPTIONS = ["National", ...PROVINCE_OPTIONS];
const SUPPLIER_SIZE_OPTIONS = ["Generic", "QSE", "EME"];
const MEASURED_UNDER_OPTIONS = ["CoGP", "RCoGP"];
const BBBEE_LEVEL_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "Non-compliant"];
const SKILLS_CATEGORY_OPTIONS = ["A", "B", "C", "D", "E", "F", "G"];

const FSC_SUB_SECTOR_OPTIONS = ["Others", "Banks", "Long-Term Insurers", "Short-Term Insurers"];

/**
 * Synonym maps consulted by the Excel normaliser when coercing a `select`
 * cell. Keys are lower-cased and stripped of non-alphanumerics; see
 * `norm()` in `workbookExcelNormalizer.ts`.
 */
export const SUPPLIER_SIZE_MAP: Record<string, string> = {
  eme: "EME",
  exemptedmicroenterprise: "EME",
  exemptmicroenterprise: "EME",
  micro: "EME",
  microenterprise: "EME",
  qse: "QSE",
  qualifyingsmallenterprise: "QSE",
  qualifyingsmall: "QSE",
  small: "QSE",
  smallenterprise: "QSE",
  large: "Generic",
  largeenterprise: "Generic",
  generic: "Generic",
  l: "Generic",
};

/** Synonyms for the MC/EE designation column (workbook select options). */
export const DESIGNATION_MAP: Record<string, string> = {
  executivedirector: "Executive Director",
  execdirector: "Executive Director",
  executive: "Executive Director",
  ed: "Executive Director",
  nonexecutivedirector: "Non-executive Director",
  nonexecdirector: "Non-executive Director",
  nonexecutive: "Non-executive Director",
  ned: "Non-executive Director",
  otherexecutivemanager: "Other Executive Manager",
  otherexecutivemanagement: "Other Executive Manager",
  otherexecmanager: "Other Executive Manager",
  otherexecmgmt: "Other Executive Manager",
  execmanager: "Other Executive Manager",
  seniormanager: "Senior Manager",
  seniormanagement: "Senior Manager",
  seniormgmt: "Senior Manager",
  snrmanager: "Senior Manager",
  snrmanagement: "Senior Manager",
  snrmgmt: "Senior Manager",
  senior: "Senior Manager",
  seniormgr: "Senior Manager",
  middlemanager: "Middle Manager",
  middlemanagement: "Middle Manager",
  middlemgmt: "Middle Manager",
  middle: "Middle Manager",
  midmanager: "Middle Manager",
  juniormanager: "Junior Manager",
  juniormanagement: "Junior Manager",
  juniormgmt: "Junior Manager",
  junior: "Junior Manager",
  jnrmanager: "Junior Manager",
  semiskilled: "Semi-skilled",
  semi: "Semi-skilled",
  unskilled: "Unskilled",
};

export const OCC_LEVEL_MAP: Record<string, string> = {
  topmanagement: "Top Management",
  topmgmt: "Top Management",
  top: "Top Management",
  executivemanagement: "Top Management",
  exec: "Top Management",
  seniormanagement: "Senior Management",
  seniormgmt: "Senior Management",
  snrmanagement: "Senior Management",
  snrmgmt: "Senior Management",
  senior: "Senior Management",
  middlemanagement: "Middle Management",
  middlemgmt: "Middle Management",
  middle: "Middle Management",
  midmgmt: "Middle Management",
  topmanager: "Top Management",
  seniormanager: "Senior Management",
  middlemanager: "Middle Management",
  juniormanagement: "Junior Management",
  juniormanager: "Junior Management",
  juniormgmt: "Junior Management",
  jnrmanagement: "Junior Management",
  jnrmanager: "Junior Management",
  jnrmgmt: "Junior Management",
  junior: "Junior Management",
  skilled: "Skilled",
  skilledtechnical: "Skilled",
  skilledtech: "Skilled",
  skilledtechnicalandacademicallyqualifiedworkers: "Skilled",
  semiskilled: "Semi-Skilled",
  semi: "Semi-Skilled",
  semiskilledanddiscretionarydecisionmaking: "Semi-Skilled",
  unskilled: "Unskilled",
  unskilledanddefineddecisionmaking: "Unskilled",
};

export const BBBEE_LEVEL_MAP: Record<string, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8",
  level1: "1", level2: "2", level3: "3", level4: "4",
  level5: "5", level6: "6", level7: "7", level8: "8",
  noncompliant: "Non-compliant",
  nc: "Non-compliant",
  none: "Non-compliant",
  na: "Non-compliant",
  notcompliant: "Non-compliant",
};
const ESD_CONTRIBUTION_TYPES = [
  "Grant Contribution",
  "Loan",
  "Guarantee",
  "Discount",
  "Payment Period Reduction",
  "Other Monetary",
  "Professional Services",
  "Human Resource Capacity",
  "Other Non-Monetary",
];
const SED_CONTRIBUTION_TYPES = [
  "Grant Contribution",
  "Discount",
  "Other Monetary",
  "Professional Services",
  "Human Resource Capacity",
  "Other Non-Monetary",
];

/**
 * Short, plain-language guidance per SED contribution type, sourced from the
 * Amended Generic Codes (Statement 500) – Socio-Economic Development. Used in
 * the SED column tooltip and in the exported Excel "Instructions" sheet so
 * users can pick the right category without leaving the workbook.
 */
export const SED_CONTRIBUTION_GUIDANCE: Record<string, string> = {
  "Grant Contribution":
    "Cash donation with no obligation to repay (e.g. funding to an NPO / community project).",
  "Discount":
    "Reduction in price on goods or services supplied to the beneficiary, over and above normal trade discounts.",
  "Other Monetary":
    "Any other cash-based contribution that is not a grant or discount (e.g. covering operating costs, bursaries paid direct to a beneficiary).",
  "Professional Services":
    "Free or below-market professional services provided to the beneficiary (e.g. legal, accounting, consulting) valued at cost to the measured entity.",
  "Human Resource Capacity":
    "Time of staff seconded or volunteering for the beneficiary, valued at the salary cost of the staff for the time given.",
  "Other Non-Monetary":
    "In-kind donations such as goods, equipment, training, premises or services that don't fit the categories above.",
};

/** Same shape as above for ESD — kept aligned with the Codes (Statement 400). */
export const ESD_CONTRIBUTION_GUIDANCE: Record<string, string> = {
  "Grant Contribution":
    "Cash contribution to an Exempted/Qualifying beneficiary, no obligation to repay.",
  "Loan":
    "Loan provided at below prime (interest-rate concession is the recognised contribution).",
  "Guarantee":
    "Standby guarantee or surety extended on behalf of the beneficiary.",
  "Discount":
    "Reduction in price on goods/services sold to the beneficiary (above normal trade terms).",
  "Payment Period Reduction":
    "Faster-than-standard payment terms — recognised value is the working-capital benefit to the supplier.",
  "Other Monetary":
    "Any other cash-based contribution not captured above (e.g. early payment, fee waiver).",
  "Professional Services":
    "Free or subsidised professional services (legal, accounting, BD, mentoring) at cost.",
  "Human Resource Capacity":
    "Time of staff seconded or coaching the beneficiary, valued at salary cost.",
  "Other Non-Monetary":
    "In-kind support such as goods, equipment, training, premises or shared infrastructure.",
};

// ---------- Validators ----------

const isBlank = (v: unknown): boolean =>
  v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Matches sector codes in apps/api/pipeline/sectorConfig.ts */
const SECTOR_CODE_OPTIONS = [
  "RCOGP",
  "ICT",
  "FSC",
  "AGRI",
  "TRANSPORT",
  "CONSTRUCTION",
];

/** All scorecard types referenced in apps/api/pipeline/sectorConfig.ts */
export const SCORECARD_TYPE_OPTIONS = ["Generic", "QSE", "Contractor", "BEP"] as const;

/** Valid scorecard types per sector (see docs/SCORECARD_GROUND_TRUTH.md §11). */
export function getScorecardTypeOptions(sectorCode: string): string[] {
  switch (String(sectorCode || "").trim().toUpperCase()) {
    case "RCOGP":
    case "ICT":
    case "TRANSPORT":
      return ["Generic", "QSE"];
    case "CONSTRUCTION":
      // Size axis. Sub-sector (Contractor/BEP) is a separate field
      // (constructionSubSector). Construction has no separate EME scorecard.
      return ["Generic", "QSE"];
    case "FSC":
    case "AGRI":
      return ["Generic"];
    default:
      return ["Generic"];
  }
}

/** Keep current scorecard type when still valid; auto-select when only one choice. */
export function resolveScorecardTypeForSector(
  sectorCode: string,
  current: unknown,
): string {
  const allowed = getScorecardTypeOptions(sectorCode);
  const value = String(current ?? "").trim();
  // Construction migration: the legacy single field used Contractor/BEP as the
  // "scorecard type". Those are the Generic (large) scorecards, so migrate them to
  // the Generic size — the constructionSubSector field now captures Contractor vs
  // BEP. This keeps existing entities valid under the new size-axis options.
  if (
    String(sectorCode ?? "").trim().toUpperCase() === "CONSTRUCTION" &&
    (value === "Contractor" || value === "BEP")
  ) {
    return "Generic";
  }
  if (value && allowed.includes(value)) return value;
  if (allowed.length === 1) return allowed[0];
  return "";
}

function insertFieldsAfter(
  fields: ColumnDef[],
  afterKey: string,
  toInsert: ColumnDef[],
): ColumnDef[] {
  if (toInsert.length === 0) return fields;
  const idx = fields.findIndex((f) => f.key === afterKey);
  if (idx < 0) return [...fields, ...toInsert];
  return [...fields.slice(0, idx + 1), ...toInsert, ...fields.slice(idx + 1)];
}

/** Company Information meta fields with scorecardType options filtered by sector. */
export function getCompanyInfoMetaFields(sectorCode?: string): ColumnDef[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const scorecardOptions = sector ? getScorecardTypeOptions(sector) : [];
  let base = COMPANY_INFO_META.map((f) =>
    f.key === "scorecardType" ? { ...f, options: scorecardOptions } : f,
  );
  // FSC: Senior/Middle/Junior MC bands are NOT AVAILABLE — no Exco+Senior merge toggle.
  if (sector === "FSC") {
    base = base.filter((f) => f.key !== "combineExcoSenior");
  }

  if (sector === "AGRI") {
    base = insertFieldsAfter(base, "industrySector", [
      {
        key: "farmWorkersIncluded",
        label: "Farm Workers included in Designated Groups?",
        type: "boolean",
        emphasis: true,
        guidance:
          "AgriBEE-specific. Tick if farm workers employed by the entity should be counted in the Designated Groups indicator for Ownership (4% EI target, 3 pts). Farm workers are a 5th qualifying category alongside ESOP, BBOS, Co-ops, and Black Designated Groups.",
      },
    ]);
  }

  if (sector === "FSC") {
    base = insertFieldsAfter(base, "industrySector", [
      {
        key: "fscSubSector",
        label: "FSC Sub-Sector",
        type: "select",
        required: true,
        emphasis: true,
        options: FSC_SUB_SECTOR_OPTIONS,
        guidance:
          "Required — choose immediately after selecting FSC. Switches Financial Information AFS inputs, SED/CE rules, and procurement sub-minimums (Others FS700, Banks FS701, LTI FS702, STI FS703).",
      },
      {
        key: "fscReinsurer",
        label: "Reinsurer entity?",
        type: "boolean",
        emphasis: true,
        guidance:
          "FSC-specific. Reinsurers use reduced Consumer Education scoring: Additional CE only (1 pt max) and the Additional CE bonus row is suppressed.",
      },
    ]);
  }

  if (sector === "CONSTRUCTION") {
    base = insertFieldsAfter(base, "industrySector", [
      {
        key: "constructionSubSector",
        label: "Construction Sub-Sector",
        type: "select",
        required: true,
        emphasis: true,
        options: ["Contractor", "BEP"],
        guidance:
          "Required for Construction. Contractor (CE) or BEP (Built Environment Professional) — they have different scorecards (per the Construction Sector Code). Pick the size separately under Scorecard Type (Generic vs QSE).",
      },
    ]);
  }

  return base;
}

const sectorCodeValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const code = String(v).trim().toUpperCase();
  if (!SECTOR_CODE_OPTIONS.includes(code)) {
    return `Use one of: ${SECTOR_CODE_OPTIONS.join(", ")}`;
  }
  return null;
};

const idValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  if (!/^\d{6,13}$/.test(s)) return "ID must be 6–13 digits";
  return null;
};

/**
 * Coerces user-entered amount text to a number. Tolerates the conventions
 * documented in the Instructions sheet of the downloaded Information Request
 * workbook: an optional `R` / `r` prefix, thousands separators (`,` or
 * non-breaking space), and surrounding whitespace. Returns `NaN` if the
 * value cannot be parsed.
 */
export function parseAmount(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return NaN;
  const cleaned = s
    .replace(/^R\s*/i, "")
    .replace(/[,\u00A0\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
}

// Numeric, non-negative (revenue, payroll, costs, spend, amount).
const numericValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = parseAmount(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (n < 0) return "Must be ≥ 0";
  return null;
};

// Numeric, allows negatives (e.g. NPAT can be a loss).
const signedNumericValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = parseAmount(v);
  if (Number.isNaN(n)) return "Must be a number";
  return null;
};

const percentValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (n < 0 || n > 100) return "0–100 only";
  return null;
};

const integerNonNegValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (!Number.isInteger(n)) return "Must be a whole number";
  if (n < 0) return "Must be ≥ 0";
  return null;
};

const positiveIntValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (!Number.isInteger(n)) return "Must be a whole number";
  if (n <= 0) return "Must be > 0";
  return null;
};

// Parses yyyy-mm-dd (HTML date input) or dd/mm/yyyy (manual entry per rules)
// and rejects calendar overflow (e.g. 31/02/2024 → would otherwise wrap to March).
export function parseWorkbookDate(input: unknown): Date | null {
  if (isBlank(input)) return null;
  const s = String(input).trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]); m = Number(dmy[2]); y = Number(dmy[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export const dateValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  const shape = /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s);
  if (!shape) return "Use dd/mm/yyyy";
  if (!parseWorkbookDate(s)) return "Invalid date";
  return null;
};

// Per rules, management "Start date / years of service" accepts either a date
// or a non-negative number (years of service).
const dateOrNumberValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  // Try number first if it looks numeric.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < 0) return "Must be ≥ 0";
    return null;
  }
  return dateValidator(s);
};

// ---------- Company Information (single-record form via meta) ----------
const COMPANY_INFO_META: ColumnDef[] = [
  { key: "companyName", label: "Company / Legal Name", type: "text", required: true },
  { key: "tradingName", label: "Trading Name", type: "text" },
  { key: "registrationNumber", label: "Registration Number", type: "text" },
  { key: "vatNumber", label: "VAT Number", type: "text" },
  { key: "taxNumber", label: "Tax Number", type: "text" },
  {
    key: "industrySector",
    label: "Industry / Sector Code",
    type: "select",
    required: true,
    options: SECTOR_CODE_OPTIONS,
    validate: sectorCodeValidator,
  },
  {
    key: "scorecardType",
    label: "Scorecard Type",
    type: "select",
    required: true,
    options: [...SCORECARD_TYPE_OPTIONS],
  },
  {
    key: "financialYearEnd",
    label: "Financial Year-End (dd/mm/yyyy)",
    type: "date",
    validate: dateValidator,
    validationMessage: "Enter date as dd/mm/yyyy (e.g. 28/2/2026)",
  },
  {
    key: "measurementPeriodStart",
    label: "Financial Period Start (dd/mm/yyyy)",
    type: "date",
    validate: dateValidator,
    validationMessage: "Enter date as dd/mm/yyyy (e.g. 1/3/2025)",
    guidance: "Start date of the measured financial period. Drives period filters on Skills, PP, ESD, SED scorecards.",
  },
  {
    key: "measurementPeriodEnd",
    label: "Financial Period End (dd/mm/yyyy)",
    type: "date",
    validate: dateValidator,
    validationMessage: "Enter date as dd/mm/yyyy (e.g. 28/2/2026)",
    guidance: "End date of the measured financial period.",
  },
  {
    key: "groupLeviableAmount",
    label: "Group Leviable Amount (R)",
    type: "number",
    validate: numericValidator,
    guidance: "Required when measuring at group level. Total group payroll-based leviable amount (≥ 0). Leave blank for single-entity measurement.",
  },
  {
    key: "combineExcoSenior",
    label: "Combine Other Executive & Senior Management?",
    type: "boolean",
    guidance: "Toolkit Client Information toggle. When yes, Other Executive and Senior Management merge into one MC band (4 + 2 points). Total MC points unchanged.",
  },
  { key: "physicalAddress", label: "Physical Address", type: "text" },
  { key: "postalAddress", label: "Postal Address", type: "text" },
  { key: "contactPerson", label: "Contact Person", type: "text" },
  { key: "contactEmail", label: "Contact Email", type: "text" },
  { key: "contactPhone", label: "Contact Phone", type: "text" },
];

// ---------- Financial Information (single-record meta form) ----------
// Actual financials only — no "forecast" inputs. Leviable Amount is derived
// automatically as `payroll × 1%` in `mapWorkbookFinancialsToClient` and is
// never entered by the user.
//
// FSC exception: prior year income is needed for FSC scoring. A `priorYearRevenue`
// field is appended by `getFinancialMetaFields` when sectorCode = "FSC".
const FINANCIAL_META: ColumnDef[] = [
  { key: "revenue", label: "Revenue (R)", type: "number", validate: numericValidator },
  { key: "npat", label: "NPAT — Net Profit After Tax (R)", type: "number", validate: signedNumericValidator },
  { key: "payroll", label: "Total Payroll (R)", type: "number", validate: numericValidator },
  {
    key: "tmpsBasis",
    label: "PP: Actual vs Projected TMPS",
    type: "select",
    options: ["Actual", "Projected"],
    guidance: "Select which TMPS base the Preferential Procurement scorecard uses. Projected uses Forecast TMPS when supplied.",
  },
  { key: "tmps", label: "Total Measured Procurement Spend — Actual (R)", type: "number", validate: numericValidator },
  {
    key: "forecastTmps",
    label: "Total Measured Procurement Spend — Projected (R)",
    type: "number",
    validate: numericValidator,
    guidance: "Forecast / projected TMPS. Used when PP basis is set to Projected.",
  },
  {
    key: "industryNormPercent",
    label: "Industry Norm (% of revenue)",
    type: "number",
    readOnly: true,
    validate: percentValidator,
    guidance:
      "Auto-filled from the industry/sector selected in Company Information (SARS reference norms). When actual NPAT margin is below 25% of this value, deemed NPAT / Leibrandt logic applies and prior-year financials may be required.",
  },
  {
    key: "deemedNpatOverride",
    label: "Deemed NPAT Override (R)",
    type: "number",
    validate: signedNumericValidator,
    guidance:
      "Optional manual deemed NPAT. Only applies when at least one prior-year row is completed in the section below.",
  },
  {
    key: "companyValueToUse",
    label: "Company Value to Use (R)",
    type: "number",
    validate: numericValidator,
    guidance: "Enterprise value for Ownership net-value scoring (NAV). Required when net-value points depend on share carrying values.",
  },
  {
    key: "outstandingDebt",
    label: "Outstanding Acquisition Debt (R)",
    type: "number",
    validate: numericValidator,
    guidance: "Debt attributable to the measured entity for net-value calculations.",
  },
];

/** Keys for the five prior-year rows used in Leibrandt / deemed NPAT (not FSC priorYearRevenue). */
export function isPriorYearLeibrandtMetaKey(key: string): boolean {
  return /^priorYear[1-5](Label|Revenue|Npat)$/.test(key);
}

/** Prior-year Leibrandt inputs apply only when current margin is below 25% of industry norm. */
export function priorYearLeibrandtInputsRelevant(finMeta: Record<string, unknown>): boolean {
  return isBelowIndustryNormQuarterThreshold(
    numMeta(finMeta.revenue),
    numMeta(finMeta.npat),
    numMeta(finMeta.industryNormPercent),
  );
}

/** Hide prior-year Leibrandt fields when the margin test does not apply. */
export function filterVisibleFinancialMetaFields(
  fields: ColumnDef[],
  finMeta: Record<string, unknown>,
): ColumnDef[] {
  if (priorYearLeibrandtInputsRelevant(finMeta)) return fields;
  return fields.filter((f) => !isPriorYearLeibrandtMetaKey(f.key));
}

/** Up to 5 prior financial years for deemed NPAT / Leibrandt (shown when margin test fails). */
function buildPriorYearMetaFields(): ColumnDef[] {
  const fields: ColumnDef[] = [];
  for (let i = 1; i <= 5; i++) {
    fields.push(
      {
        key: `priorYear${i}Label`,
        label: `Prior Year ${i} — year ending`,
        type: "text",
        guidance: i === 1 ? "Historical revenue and NPAT for deemed NPAT (Leibrandt). Enter up to 5 prior years, most recent first." : undefined,
      },
      {
        key: `priorYear${i}Revenue`,
        label: `Prior Year ${i} — Revenue (R)`,
        type: "number",
        validate: numericValidator,
      },
      {
        key: `priorYear${i}Npat`,
        label: `Prior Year ${i} — NPAT (R)`,
        type: "number",
        validate: signedNumericValidator,
      },
    );
  }
  return fields;
}

/**
 * Returns Financial Information meta fields for the given sector.
 * FSC requires a "Prior Year Revenue" field in addition to current-year financials
 * because FSC SED/income scoring uses prior financial year income.
 */
export function getFinancialMetaFields(sectorCode?: string): ColumnDef[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const priorYears = buildPriorYearMetaFields();
  const base = [...FINANCIAL_META, ...priorYears];
  if (sector !== "FSC") return base;
  return [
    ...base,
    {
      key: "priorYearRevenue",
      label: "Prior Year Revenue (R) — FSC only",
      type: "number" as const,
      required: true,
      validate: numericValidator,
      guidance:
        "FSC scoring uses prior financial year income for certain calculations. Enter the revenue / income from the previous completed financial year.",
    },
  ];
}

// ---------- Ownership ----------
// Column order aligned with Excel "Ownership Data" (RCOGP toolkit row 6).
export const OWNERSHIP_COLUMNS: ColumnDef[] = [
  // Polo feedback #2: "Data Date" has no meaning per-shareholder in ownership and
  // is not consumed by the projection or scoring — removed. (The Skills section
  // keeps its own dataDate, which the Skills scorecard does use.)
  {
    key: "shareholderName",
    label: "Shareholder",
    type: "text",
    required: true,
    width: 200,
    aliases: ["Shareholder", "Shareholder Name", "Name"],
  },
  {
    key: "ownershipType",
    label: "Ownership Type",
    type: "text",
    width: 140,
    aliases: ["Ownership Type"],
  },
  yesNoColumn("soaBuyer", "Sale of Assets (SOA) Buyer", {
    width: 150,
    aliases: ["SOA Buyer", "Sale of Assets Buyer"],
    guidance:
      "SOA = Sale of Assets. Choose Yes if this shareholder acquired the holding via a Sale of Assets transaction.",
  }),
  {
    key: "transactionSoa",
    label: "Transaction (SOA)",
    type: "text",
    width: 150,
    aliases: ["Transaction (SOA)", "Transaction"],
    guidance: "SOA = Sale of Assets. Describe the Sale of Assets transaction, if applicable.",
  },
  {
    key: "rowOutstandingDebt",
    label: "Outstanding Debt (R)",
    type: "number",
    width: 160,
    validate: numericValidator,
    aliases: ["Outstaning Debt", "Outstanding Debt", "Outstanding Acquisition Debt"],
  },
  {
    key: "loanDate",
    label: "Loan Date (dd/mm/yyyy)",
    type: "date",
    width: 140,
    validate: dateValidator,
    aliases: ["Loan Date"],
    validationMessage: "Enter date as dd/mm/yyyy",
  },
  {
    key: "blackOwnership",
    label: "BO (%)",
    type: "number",
    width: 120,
    validate: percentValidator,
    aliases: ["BO%", "BO %", "Black Ownership", "Black Ownership %", "ME BO%"],
    validationMessage: "Enter a percentage between 0 and 100",
  },
  {
    key: "blackWomenOwnership",
    label: "BWO (%)",
    type: "number",
    width: 120,
    validate: percentValidator,
    aliases: ["BWO%", "BWO %", "Black Women Ownership", "ME BWO%"],
    validationMessage: "Enter a percentage between 0 and 100",
  },
  {
    key: "designatedGroupOwnership",
    label: "BDG (%)",
    type: "number",
    width: 120,
    validate: percentValidator,
    aliases: ["BDG%", "BDG %", "Designated Group", "ME BDG%"],
  },
  {
    key: "blackNewEntrantOwnership",
    label: "BNE (%)",
    type: "number",
    width: 120,
    validate: percentValidator,
    aliases: ["BNE%", "BNE %", "New Entrant", "ME BNE%"],
  },
  {
    key: "numberOfShares",
    label: "Number of Shares",
    type: "number",
    width: 140,
    validate: integerNonNegValidator,
    aliases: ["Number of Share", "Shares Held", "Shares"],
  },
  {
    key: "shareValue",
    label: "Share Value (R)",
    type: "number",
    width: 160,
    validate: numericValidator,
    aliases: ["Share Carrying Value (R)", "Share Carrying Value"],
    guidance: "Carrying value of this shareholder's stake. Required with Company Value to Use for net-value scoring.",
  },
  {
    key: "shareholding",
    label: "Share (%)",
    type: "number",
    width: 130,
    validate: percentValidator,
    aliases: ["Share %", "Shareholding (%)", "Shareholding"],
    validationMessage: "Enter a percentage between 0 and 100 (e.g. 51 not 0.51)",
    guidance:
      "Percentage shareholding. Used only to weight this shareholder against others when 'Number of Shares' is blank. Voting and economic-interest points come from the Voting Rights (%) and Economic Interest (%) columns.",
  },
  {
    key: "votingRights",
    label: "Voting Rights (%)",
    type: "number",
    width: 140,
    validate: percentValidator,
    aliases: ["Voting Rights"],
    validationMessage: "Enter a percentage between 0 and 100 (e.g. 51 not 0.51)",
    guidance:
      "This shareholder's share of the company's total exercisable voting rights (a 51% voting holder = 51), not the proportion of their own shares that carry votes.",
  },
  {
    key: "economicInterest",
    label: "Economic Interest (%)",
    type: "number",
    width: 160,
    validate: percentValidator,
    aliases: ["Economic Interest", "EI %"],
    validationMessage: "Enter a percentage between 0 and 100 (e.g. 51 not 0.51)",
  },
  { key: "yearsHeld", label: "Years Held", type: "number", width: 110, validate: integerNonNegValidator },
  { key: "idNumber", label: "ID / Reg Number", type: "text", width: 150, aliases: ["ID Number", "ID / Registration Number"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, width: 110 },
  yesNoColumn("isDisabled", "Disabled", { width: 100 }),
  yesNoColumn("isYouth", "Youth (<35)", { width: 110, aliases: ["Youth"] }),
  yesNoColumn("isBlack", "Black?", { width: 100, aliases: ["Black?"] }),
  yesNoColumn("hasDebt", "Debt?", { width: 100, aliases: ["Debt?"] }),
  yesNoColumn("modifiedFlowThrough", "Modified Flow-Through?", { width: 170 }),
];

// ---------- Management Control + Employment Equity (combined) ----------
// Per the SLS (docs/domain/sectors/rcogp/generic/sls.md §6.2 and ICT §6.2):
// MC and EE are a *single combined spreadsheet* (one MC Scorecard in the Excel
// toolkit). The `designation` column is the required discriminator that
// distinguishes board-level directors (Executive Director / Non-executive
// Director) from management/EE bands (Other Executive → Junior). Both groups
// populate the same grid; scoring logic routes each row to the correct
// indicator based on its designation value.
export const MC_EE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140, aliases: ["First Name", "Given Name", "Name"] },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140, aliases: ["Surname", "Last Name", "Family Name"] },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator, aliases: ["ID", "ID No", "Identity Number", "ID/Passport"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130, aliases: ["Race", "Population Group", "Ethnicity"] },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110, aliases: ["Gender", "Sex"] },
  {
    key: "designation",
    label: "Designation",
    type: "select",
    options: DESIGNATION_OPTIONS,
    required: true,
    width: 220,
    aliases: ["Designation", "Title", "Position", "Job Title", "Role", "Band"],
    guidance:
      "Required. Distinguishes board-level directors (Executive Director, Non-executive Director) from management/EE bands. Board-level rows are scored at fixed MC targets; Senior/Middle/Junior rows are scored against provincial EAP targets.",
  },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180, aliases: ["Occupational Level", "Occ Level", "Management Tier", "Tier", "Level", "Job Level"], guidance: "Optional reference only. Scoring uses the Designation column; Occupational Level is used only as a fallback if Designation is blank." },
  { key: "department", label: "Department", type: "text", width: 160, aliases: ["Department", "Dept", "Business Unit"] },
  { key: "salary", label: "Annual Salary (R)", type: "number", width: 150, validate: numericValidator, aliases: ["Salary", "Annual Salary", "Monthly Salary", "Remuneration", "Total Cost to Company", "CTC"] },
  yesNoColumn("isDisabled", "Disabled", { width: 100, required: false, aliases: ["Disabled *", "Disabled"] }),
  yesNoColumn("isForeign", "Foreign", { width: 100, aliases: ["Foreign *", "Foreign National", "Foreign"] }),
  {
    key: "votingRights",
    label: "Voting Rights (%)",
    type: "number",
    width: 140,
    validate: percentValidator,
    guidance: "Required for board directors. Enter the percentage of exercisable voting rights held by this person.",
  },
  {
    key: "startDate",
    label: "Start Date / Years of Service (dd/mm/yyyy or years)",
    type: "text",
    width: 200,
    validate: dateOrNumberValidator,
    aliases: ["Hire Date", "Hire Date (format: dd/mm/yyyy)"],
  },
  // Construction-only employee fields (surfaced for CONSTRUCTION via getSection;
  // stripped from the form for other sectors). Feed the construction
  // professional-registration and youth indicators. (Phase 1 template columns)
  yesNoColumn("professionallyRegistered", "Professionally Registered?", {
    width: 150,
    required: false,
    aliases: ["Professionally Registered", "Professionally Registered?", "Professional Registration", "Professionally Registered (Yes/No)"],
    guidance: "Construction only: is this employee professionally registered with a statutory built-environment / industry council?",
  }),
  yesNoColumn("isYouthEmployee", "Youth (under 35)?", {
    width: 120,
    required: false,
    aliases: ["Youth", "Youth (<35)", "Youth?", "Youth (under 35)", "Is Youth"],
    guidance: "Construction only: is this employee a black youth (under 35)? Feeds the Black Youth Employees bonus.",
  }),
];

/** Construction-only column keys, appended to the base arrays for the importer but
 *  hidden from non-construction forms via getSection. (Phase 1 template columns) */
export const CONSTRUCTION_ONLY_COLUMN_KEYS = new Set<string>([
  "professionallyRegistered",
  "isYouthEmployee",
  "industryRegistered",
  "learnerMgmtLevel",
  "mentorship",
  "mentorshipPromotion",
  "supplierDevProgramme",
]);

/**
 * @deprecated Use MC_EE_COLUMNS for the combined Management Control &
 * Employment Equity grid. Kept as an alias for backward-compatible imports
 * (e.g. workbookExcelNormalizer column-alias maps).
 */
export const MANAGEMENT_COLUMNS: ColumnDef[] = MC_EE_COLUMNS;

/**
 * @deprecated EMPLOYEE_COLUMNS is no longer used as a separate section.
 * The `employees` workbook section is hidden in the UI; all directors and
 * employees are entered in the `management-control` section using MC_EE_COLUMNS.
 * Kept for backward-compatible imports.
 */
export const EMPLOYEE_COLUMNS: ColumnDef[] = MC_EE_COLUMNS;

// ---------- Skills Development ----------

const SELECT_PERIOD_OPTIONS = ["Current YTD", "Full Year", "Prior Year"];

/**
 * Single-record meta form for Skills Development aggregate (grey-cell) inputs.
 * These correspond to the required inputs on the RCOGP Skills Scorecard tab and
 * Skills Toolkit tab. Source of truth: docs/domain/sectors/rcogp/generic/sls.md §3 + §6.3.
 *
 * Leviable Amount is NOT collected here — it is always derived as `payroll × 1%`
 * in `mapWorkbookFinancialsToClient`. Removing it as a user input eliminates the
 * duplicate-entry problem where Total Payroll and Leviable Amount could conflict.
 */
export const SKILLS_META: ColumnDef[] = [
  {
    key: "eapProvince",
    label: "Applicable EAP Targets (Province)",
    type: "select",
    // Optional: scoring defaults to National when blank. Marking it required
    // produced an advisory error on every import (workbooks rarely carry it). (W6)
    required: false,
    options: EAP_PROVINCE_OPTIONS,
    guidance: "National or province for EAP demographic lookup. Required for bursary demographic splits and Management Control scoring.",
    validationMessage: "Select National or a South African province from the dropdown",
    suggestionHint: "Use National for the Stats SA national EAP table, or select the province where the entity is registered or primarily operates",
  },
  {
    key: "eapYear",
    label: "EAP Targets Year",
    type: "number",
    required: false,
    validate: positiveIntValidator,
    guidance: "Year matching a row in the EAP table (e.g. 2025). Triggers 'EAP targets Year selected?' validation in the toolkit.",
  },
  {
    key: "headcount",
    label: "Headcount (Total Employees)",
    type: "number",
    // Optional: derived from the Management Control employee register when blank. (W6)
    required: false,
    validate: positiveIntValidator,
    guidance: "Total employee headcount of the entity (positive integer). Used as the base for the LAI target: 5% × headcount. Auto-derived from the employee register if left blank.",
  },
  {
    key: "trainingManagerSalary",
    label: "Training Manager's Salary (R)",
    type: "number",
    required: false,
    validate: numericValidator,
    guidance: "Annual salary of the Skills Development Facilitator / Training Manager (≥ 0). Admin costs are capped at 15% of total skills spend.",
  },
  {
    key: "trainingOverheadCost",
    label: "Training Overhead Cost (R)",
    type: "number",
    required: false,
    validate: numericValidator,
    guidance: "Total training overhead costs (venue hire, admin, etc.) (≥ 0). Also subject to the 15% admin cost cap.",
  },
  {
    key: "selectPeriod",
    label: "Select Period",
    type: "select",
    required: false,
    options: SELECT_PERIOD_OPTIONS,
    guidance: "Set to 'Current YTD' for active year-to-date measurement. The Summary scorecard warns when not set.",
  },
  {
    key: "dataDate",
    label: "Data Date (dd/mm/yyyy)",
    type: "date",
    required: false,
    validate: dateValidator,
    validationMessage: "Enter date as dd/mm/yyyy",
    guidance: "Reference date for this training dataset. Skills scorecard flags 'Data with no data date' when missing.",
  },
];

// Rules require: program*, category*, learner*, gender*, race*. Costs ≥ 0.
export const SKILLS_COLUMNS: ColumnDef[] = [
  { key: "programName", label: "Training Program", type: "text", required: true, width: 200, aliases: ["Training Program Name", "Program Name", "Programme Name", "Course", "Course Name", "Intervention"] },
  { key: "categoryCode", label: "Category (A–G)", type: "select", options: SKILLS_CATEGORY_OPTIONS, required: true, width: 130, aliases: ["Category", "Skills Category", "Cat", "Category Code"] },
  { key: "trainingProvider", label: "Training Provider", type: "text", width: 180, aliases: ["Provider", "Service Provider", "Institution"] },
  { key: "province", label: "Province", type: "select", options: PROVINCE_OPTIONS, width: 150, validationMessage: "Select a South African province from the dropdown" },
  { key: "municipality", label: "Municipality", type: "text", width: 160 },
  { key: "learnerName", label: "Learner Name", type: "text", required: true, width: 180, aliases: ["Learner", "Trainee", "Employee Name", "Beneficiary"] },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator, aliases: ["ID", "ID No", "Identity Number"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130, aliases: ["Population Group", "Ethnicity"] },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110, aliases: ["Sex"] },
  yesNoColumn("isDisabled", "Disabled", { width: 100, aliases: ["Disabled *"] }),
  yesNoColumn("isForeign", "Foreign", { width: 100, aliases: ["Foreign *", "Foreign National"] }),
  yesNoColumn("employed", "Employed?", { width: 110 }),
  yesNoColumn("completed", "Completed?", { width: 110 }),
  yesNoColumn("absorbed", "Absorbed?", { width: 110 }),
  { key: "courseCost", label: "Course Cost (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Course Fees", "Tuition", "Training Cost", "Course"] },
  { key: "travelCost", label: "Travel Cost (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Travel", "Transport"] },
  { key: "accommodationCost", label: "Accommodation (R)", type: "number", width: 160, validate: numericValidator, aliases: ["Accommodation Cost", "Accommodation"] },
  { key: "cateringCost", label: "Catering (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Catering", "Food", "Meals"] },
  { key: "stationeryCost", label: "Stationery (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Stationery", "Materials", "Books"] },
  { key: "trainingFacilityCost", label: "Training Facility (R)", type: "number", width: 160, validate: numericValidator, aliases: ["Facility Cost", "Venue", "Venue Cost"] },
  { key: "salaryCost", label: "Salary Cost (R, cat B/C/D)", type: "number", width: 170, validate: numericValidator, aliases: ["Salary", "Salary Cost", "Wages"] },
  { key: "otherCosts", label: "Other Costs (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Other Cost", "Misc", "Miscellaneous"] },
  { key: "totalCost", label: "Total Cost (R)", type: "number", width: 140, validate: numericValidator, aliases: ["Total", "Total Spend", "Cost", "Amount"] },
  { key: "manHours", label: "Man Hours", type: "number", width: 120, validate: numericValidator },
  { key: "startDate", label: "Start Date (dd/mm/yyyy)", type: "date", width: 150, validate: dateValidator, validationMessage: "Enter date as dd/mm/yyyy" },
  { key: "endDate", label: "End Date (dd/mm/yyyy)", type: "date", width: 150, validate: dateValidator, validationMessage: "Enter date as dd/mm/yyyy" },
  // Construction-only learner fields (hidden from other sectors via getSection).
  // Feed the construction industry-registration, black-management-by-level and
  // mentorship indicators. (Phase 1 template columns)
  yesNoColumn("industryRegistered", "Registered with Industry Body?", {
    width: 160, required: false,
    aliases: ["Industry Body", "Registered with Industry Body", "Industry Registration", "Industry Body Registered"],
    guidance: "Construction only: is this black candidate registered with a recognised industry/professional body?",
  }),
  { key: "learnerMgmtLevel", label: "Management Level", type: "select", options: ["Executive", "Senior", "Middle", "Junior", "None"], width: 150, required: false,
    aliases: ["Management Level", "Mgmt Level", "Learner Management Level", "Management Band"],
    guidance: "Construction only: the learner's management band (Exec/Senior/Middle/Junior) for black-management skills indicators." },
  yesNoColumn("mentorship", "Mentorship Programme?", {
    width: 150, required: false,
    aliases: ["Mentorship", "Mentorship Programme", "Mentored", "On Mentorship"],
    guidance: "Construction only: is this learner on a structured mentorship programme?",
  }),
  yesNoColumn("mentorshipPromotion", "Promoted via Mentorship?", {
    width: 160, required: false,
    aliases: ["Mentorship Promotion", "Promoted via Mentorship", "Mentorship Promoted"],
    guidance: "Construction only: was this learner promoted through the mentorship programme? (bonus)",
  }),
];

// ---------- Procurement / Suppliers ----------
// Rules require: supplier_name*, current_company_size*, spend*. Sizes are
// {Generic, QSE, EME}; B-BBEE levels 1–8 or Non-compliant; CoGP/RCoGP enum.
export const PROCUREMENT_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Supplier Name", type: "text", required: true, width: 220, aliases: ["Supplier", "Vendor", "Vendor Name", "Name", "Trading Name", "Company", "Company Name", "Beneficiary"] },
  // Polo feedback #8: not all suppliers are VAT-registered — capture a company
  // registration number so unregistered-for-VAT suppliers can still be identified.
  { key: "registrationNumber", label: "Supplier Reg Number", type: "text", width: 180, aliases: ["Reg Number", "Reg No", "Registration Number", "Company Registration", "Supplier Registration"] },
  {
    key: "currentSize",
    label: "Current Size",
    type: "select",
    options: SUPPLIER_SIZE_OPTIONS,
    required: true,
    width: 130,
    aliases: ["Size", "Company Size", "Supplier Size", "Enterprise Size", "Entity Size", "EME/QSE/Generic", "EME/QSE/Large"],
    validationMessage: "Enter EME, QSE, or Generic — not case sensitive. Legacy 'Large' maps to Generic.",
    suggestionHint: "EME = Exempted Micro Enterprise, QSE = Qualifying Small Enterprise",
  },
  {
    key: "bbbeeLevel",
    label: "B-BBEE Level",
    type: "select",
    options: BBBEE_LEVEL_OPTIONS,
    width: 140,
    aliases: ["BEE Level", "BBBEE Level", "B-BBEE Status", "BEE Status", "Level", "Contributor Level"],
    validationMessage: "Enter a number 1–8 or 'Non-Compliant'. Level 1 is the highest contributor status.",
    suggestionHint: "Level 1 (highest) through Level 8 (lowest), or Non-Compliant",
  },
  { key: "vatNumber", label: "VAT Number", type: "text", width: 140, aliases: ["VAT", "VAT No"] },
  { key: "measuredUnder", label: "Measured Under", type: "select", options: MEASURED_UNDER_OPTIONS, width: 150, aliases: ["Code", "Codes", "Scorecard"] },
  yesNoColumn("empoweringSupplier", "Empowering Supplier?", {
    width: 180,
    aliases: ["Empowering Supplier", "Empowering Supplier? (Yes/No)", "ES"],
  }),
  {
    key: "firstProcurementDate",
    label: "First Procured (dd/mm/yyyy)",
    type: "date",
    width: 160,
    validate: dateValidator,
    aliases: ["First Procurement Date", "Date of first procurement (format: dd/mm/yyyy)", "First Spend Date", "Onboarded"],
    validationMessage: "Enter date as dd/mm/yyyy",
  },
  { key: "sizeAtFirstProcurement", label: "Size at First Procurement", type: "select", options: SUPPLIER_SIZE_OPTIONS, width: 180, aliases: ["Initial Size", "Original Size", "Size at first procurement"] },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", width: 160, validate: percentValidator, aliases: ["Black Ownership", "Current Black ownership", "% Black Ownership", "Black Owned %", "Black Owned"], validationMessage: "Enter a percentage between 0 and 100 (e.g. 51 not 0.51)" },
  { key: "currentBlackFemaleOwnership", label: "Black Female Ownership (%)", type: "number", width: 190, validate: percentValidator, aliases: ["Black Female Ownership", "Current Black Female ownership", "Black Women Ownership", "% Black Women", "Black Women Owned"], validationMessage: "Enter a percentage between 0 and 100 (e.g. 51 not 0.51)" },
  yesNoColumn("hasModifiedBlackOwnership", "Modified Black Ownership?", { width: 190, aliases: ["Flow through Black ownership"] }),
  { key: "unmodifiedBlackOwnership", label: "Unmodified Black Ownership (%)", type: "number", width: 200, validate: percentValidator },
  yesNoColumn("sdRecipient", "SD Recipient?", { width: 130, aliases: ["Supplier development recipient? (Yes/No)"] }),
  yesNoColumn("threeYearContract", "3yr Contract?", { width: 130, aliases: ["3 year contract in place? (Yes/No)"] }),
  yesNoColumn("designated", "Designated?", { width: 120, aliases: ["Black Designated Group  ownership"] }),
  { key: "spend", label: "Spend (R)", type: "number", required: true, width: 140, validate: numericValidator, aliases: ["Rand Value", "Amount", "Spend", "Spend *", "Procurement Spend", "Supplier Spend", "Value (R)", "R Spend", "Total Spend", "Annual Spend", "Spend Amount", "Spend (Excl VAT)"], validationMessage: "Enter amount in Rands (e.g. 1500000 or R1,500,000)" },
  { key: "certificateExpiryDate", label: "Cert Expiry (dd/mm/yyyy)", type: "date", width: 160, validate: dateValidator, aliases: ["Certificate Expiry", "Cert Expiry Date", "Expiry Date", "Valid Until"], validationMessage: "Enter date as dd/mm/yyyy", guidance: "Optional. When supplied, feeds the AI certificate parser and expiry checks." },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = PROCUREMENT_COLUMNS;

// ESD category — Supplier Development vs Enterprise Development
// Per docs/LAKE_TRADING_FIX_PLAN.md §1 Bug 4: the workbook ESD section captures
// both SD and ED contributions on one sheet; this column tells the scoring
// engine which sub-element a row belongs to.
export const ESD_CATEGORY_OPTIONS = ["Supplier Development", "Enterprise Development"] as const;

/** Synonyms for ESD category (batch upload / AI / paste). */
export const ESD_CATEGORY_MAP: Record<string, string> = {
  sd: "Supplier Development",
  supplierdevelopment: "Supplier Development",
  supplierdev: "Supplier Development",
  supplier: "Supplier Development",
  ed: "Enterprise Development",
  enterprisedevelopment: "Enterprise Development",
  enterprisedev: "Enterprise Development",
  enterprise: "Enterprise Development",
  enterprisedevelopmentcontributions: "Enterprise Development",
};

// ---------- ESD ----------
export const ESD_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Beneficiary / Supplier", type: "text", required: true, width: 220 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", required: true, width: 160, validate: percentValidator },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, required: true, width: 130, validationMessage: "Enter EME, QSE, or Generic — not case sensitive. Legacy 'Large' maps to Generic.", suggestionHint: "EME = Exempted Micro Enterprise, QSE = Qualifying Small Enterprise" },
  {
    key: "esdCategory",
    label: "Category (SD / ED)",
    type: "select",
    options: [...ESD_CATEGORY_OPTIONS],
    required: false,
    width: 190,
    aliases: ["Pillar", "SD / ED", "SD/ED", "Category", "ED/SD"],
    validationMessage: "Enter Supplier Development or Enterprise Development (or SD / ED)",
  },
  { key: "contributionDescription", label: "Description", type: "text", required: true, width: 240 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: ESD_CONTRIBUTION_TYPES, required: true, width: 200, guidance: "Pick the recognition category from the Codes (Statement 400). Hover an option for the definition.", optionGuidance: ESD_CONTRIBUTION_GUIDANCE },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator, validationMessage: "Enter amount in Rands (e.g. 1500000 or R1,500,000)" },
  { key: "dateOfTransaction", label: "Date of Transaction (dd/mm/yyyy)", type: "date", width: 180, validate: dateValidator, aliases: ["Date of Transaction * (format: dd/mm/yyyy)"], validationMessage: "Enter date as dd/mm/yyyy" },
  { key: "invoiceDate", label: "Invoice Date (dd/mm/yyyy)", type: "date", width: 160, validate: dateValidator, aliases: ["Invoice date (format: dd/mm/yyyy)"], validationMessage: "Enter date as dd/mm/yyyy" },
  { key: "paymentDate", label: "Payment Date (dd/mm/yyyy)", type: "date", width: 160, validate: dateValidator, aliases: ["Payment date (format: dd/mm/yyyy)"], validationMessage: "Enter date as dd/mm/yyyy" },
  { key: "primeRate", label: "Prime Rate (%)", type: "number", width: 130, validate: percentValidator },
  { key: "actualRate", label: "Actual Rate (%)", type: "number", width: 130, validate: percentValidator },
  // Construction-only (hidden from other sectors via getSection): flags a recognised
  // Supplier & Contractor Development programme (Annex CSC 400). (Phase 1 template column)
  yesNoColumn("supplierDevProgramme", "Supplier/Contractor Dev Programme?", {
    width: 200, required: false,
    aliases: ["Supplier Development Programme", "Contractor Development Programme", "Supplier/Contractor Dev Programme", "Dev Programme"],
    guidance: "Construction only: is this a recognised Supplier & Contractor Development programme (Annex CSC 400)?",
  }),
];

// ---------- SED ----------
export const SED_COLUMNS: ColumnDef[] = [
  { key: "beneficiaryName", label: "Beneficiary Name", type: "text", required: true, width: 220 },
  { key: "descriptionOfSpend", label: "Description of Spend", type: "text", required: true, width: 260 },
  yesNoColumn("ictSpecificInitiative", "ICT-Specific?", { width: 130 }),
  { key: "contributionType", label: "Contribution Type", type: "select", options: SED_CONTRIBUTION_TYPES, required: true, width: 200, guidance: "Pick the recognition category from the Codes (Statement 500). Hover an option for the definition.", optionGuidance: SED_CONTRIBUTION_GUIDANCE },
  { key: "percentBenefitingBlack", label: "% Benefiting Black", type: "number", required: true, width: 170, validate: percentValidator, validationMessage: "Enter a percentage between 0 and 100 (e.g. 80 not 0.80)" },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator, validationMessage: "Enter amount in Rands (e.g. 1500000 or R1,500,000)" },
  { key: "dateOfTransaction", label: "Date of Transaction (dd/mm/yyyy)", type: "date", width: 180, validate: dateValidator, aliases: ["Date of Transaction * (format: dd/mm/yyyy)"], validationMessage: "Enter date as dd/mm/yyyy" },
];

/**
 * FSC-specific aggregate meta inputs for the SED & CE scorecard.
 * Consumer Education (CE) is a separate scored pillar in the Financial Sector Code —
 * it does not exist in RCOGP, AGRI, or ICT. These fields appear only when sector = FSC.
 * Source of truth: docs/domain/sectors/fsc/generic/sls.md §6.7.
 */
export const FSC_SED_META: ColumnDef[] = [
  {
    key: "ceSpend",
    label: "Consumer Education Contributions (R)",
    type: "number",
    required: true,
    validate: numericValidator,
    guidance:
      "FSC-specific pillar. Total Consumer Education spend for the period (target 0.4% of NPAT = 2 pts). CE is scored separately from SED under the FSC 'SED & CE Scorecard'.",
  },
  {
    key: "ceBonusSpend",
    label: "Additional CE Contributions (R, bonus)",
    type: "number",
    validate: numericValidator,
    guidance:
      "Additional CE contributions above the 0.4% base target (threshold 0.1% of NPAT = 1 bonus pt). Leave blank if not achieved.",
  },
  {
    key: "fundisaSpend",
    label: "Fundisa Retail Fund Grant (R, bonus)",
    type: "number",
    validate: numericValidator,
    guidance:
      "Grant contribution to the Fundisa Retail Fund or a similar qualifying financial education initiative (target 0.2% of NPAT = 2 bonus pts).",
  },
];

/** Canonical FSC sub-sector codes that include a scored AFS pillar (12 pts). */
export function normalizeFscAfsSubSector(fscSubSector?: string): "" | "Banks" | "LTI" | "STI" {
  const v = String(fscSubSector ?? "").trim();
  if (v === "Banks") return "Banks";
  if (v === "LTI" || v === "Long-Term Insurers") return "LTI";
  if (v === "STI" || v === "Short-Term Insurers") return "STI";
  return "";
}

export function fscSubSectorHasAfs(fscSubSector?: string): boolean {
  return normalizeFscAfsSubSector(fscSubSector) !== "";
}

/** AFS indicator meta fields for the selected FSC sub-sector (empty when not applicable). */
export function getFscAfsMetaFields(fscSubSector?: string, sectorCode?: string): ColumnDef[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  if (sector !== "FSC") return [];
  const subNorm = normalizeFscAfsSubSector(fscSubSector);
  if (subNorm === "Banks") return FSC_AFS_META_BANKS;
  if (subNorm === "LTI") return FSC_AFS_META_LTI;
  if (subNorm === "STI") return FSC_AFS_META_STI;
  return [];
}

/** FSC AFS (Banks FS701) — geographic / electronic access inputs (12 pts total). */
export const FSC_AFS_META_BANKS: ColumnDef[] = [
  { key: "afsTransactionPointCoverage", label: "Transaction Point within 5km (% of qualifying area)", type: "number", validate: percentValidator, guidance: "Target 85% — 1 pt" },
  { key: "afsServicePointCoverage", label: "Service Point within 10km (%)", type: "number", validate: percentValidator, guidance: "Target 70% — 1 pt" },
  { key: "afsSalesPointCoverage", label: "Sales Point within 15km (%)", type: "number", validate: percentValidator, guidance: "Target 60% — 2 pts" },
  { key: "afsElectronicAccessCompliant", label: "Electronic access compliant (target market)?", type: "boolean", guidance: "National target — 2 pts" },
  { key: "afsHasPointOfPresence", label: "Point of Presence per measurement unit?", type: "boolean", guidance: "At least one PoP per unit — 3 pts" },
  { key: "afsActiveAccountsCompliant", label: "Active qualifying accounts in target market?", type: "boolean", guidance: "National target — 3 pts" },
];

export const FSC_AFS_META_LTI: ColumnDef[] = [
  { key: "afsAppropriateProductsNumerator", label: "Compliant appropriate products (count)", type: "number", validate: numericValidator, guidance: "Appropriate Products — 3 pts" },
  { key: "afsAppropriateProductsDenominator", label: "Total developed products (count)", type: "number", validate: numericValidator },
  { key: "afsMarketPenetrationPolicies", label: "On-book policies (Market Penetration)", type: "number", validate: numericValidator, guidance: "7 pts vs SAIA communicated" },
  { key: "afsSaiaCommunicatedPolicies", label: "SAIA communicated policies (denominator)", type: "number", validate: numericValidator },
  { key: "afsTransactionalAccessCoverage", label: "Transactional access — polygon coverage (%)", type: "number", validate: percentValidator, guidance: "Target 80% — 2 pts" },
];

export const FSC_AFS_META_STI: ColumnDef[] = [
  { key: "afsCommercialEquipment", label: "Commercial line: Equipment offered?", type: "boolean" },
  { key: "afsCommercialLiability", label: "Commercial line: Liability offered?", type: "boolean" },
  { key: "afsCommercialProperty", label: "Commercial line: Property offered?", type: "boolean" },
  { key: "afsCommercialAgriculture", label: "Commercial line: Agriculture offered?", type: "boolean" },
  { key: "afsCommercialLivestock", label: "Commercial line: Livestock offered?", type: "boolean" },
  { key: "afsCommercialOther", label: "Commercial line: Other offered?", type: "boolean", guidance: "Appropriate Products sub-total — 2 pts (6 lines × ⅓ pt)" },
  { key: "afsInsurancePoliciesCompliant", label: "Personal lines insurance policies at 100%?", type: "boolean", guidance: "Insurance Policies — 10 pts" },
];

export const SECTIONS: SectionDef[] = [
  {
    key: "company-information",
    label: "Company Information",
    description: "Legal entity, registration, and contact details.",
    enabled: true,
    meta: COMPANY_INFO_META,
  },
  {
    key: "financial-information",
    label: "Financial Information",
    description: "Revenue, NPAT, payroll, and procurement totals.",
    enabled: true,
    meta: FINANCIAL_META,
  },
  {
    key: "afs-additions",
    label: "AFS Additions",
    description:
      "Access to Financial Services (AFS) indicator inputs for FSC Banks, Long-Term Insurers, and Short-Term Insurers.",
    enabled: false,
    meta: [],
  },
  {
    key: "ownership",
    label: "Ownership",
    description: "Shareholders, voting rights, and economic interest.",
    enabled: true,
    columns: OWNERSHIP_COLUMNS,
  },
  {
    key: "management-control",
    label: "Management Control & Employment Equity",
    description:
      "All directors and employees in one register. Use the Designation column to distinguish board-level directors (Executive Director, Non-executive Director) from management/EE bands (Other Executive Manager → Junior Manager). MC scoring applies fixed targets to directors and provincial EAP targets to management bands. Employment Equity (disabled employees) is scored from the same grid.",
    enabled: true,
    columns: MC_EE_COLUMNS,
    gridTotals: [{ columnKey: "salary", label: "Total Annual Salary" }],
  },
  {
    // The `employees` section key is preserved for backward-compatible workbook
    // data already persisted in MongoDB. The section is disabled in the UI —
    // users now enter all directors and employees in `management-control`.
    // The workbook projection (workbookRoutes.ts `projectWorkbookToClient`)
    // continues to merge both sections, so any legacy rows are included in scoring.
    key: "employees",
    label: "Employees (legacy — use Management Control & EE)",
    description: "Legacy section — hidden. All entries should be in Management Control & EE.",
    enabled: false,
    columns: MC_EE_COLUMNS,
  },
  {
    key: "skills-development",
    label: "Skills Development",
    description: "Training programmes, learnerships, and spend.",
    enabled: true,
    meta: SKILLS_META,
    columns: SKILLS_COLUMNS,
    gridTotals: [{ columnKey: "totalCost", label: "Total Training Cost" }],
    rowValidate: (row) => {
      const errs: Record<string, string> = {};
      // SD_DATE_001: end_date >= start_date when both supplied
      const sd = parseWorkbookDate(row.startDate);
      const ed = parseWorkbookDate(row.endDate);
      if (sd && ed && ed.getTime() < sd.getTime()) {
        errs.endDate = "End date must be on/after start date";
      }
      // SD_COST_001: at least one cost or man-hours when training program present
      if (!isBlank(row.programName)) {
        const costFields = [
          "courseCost", "travelCost", "accommodationCost",
          "cateringCost", "stationeryCost", "trainingFacilityCost",
          "salaryCost", "otherCosts", "totalCost", "manHours",
        ];
        const sum = costFields.reduce((acc, k) => {
          const n = Number(row[k]);
          return acc + (Number.isFinite(n) && n > 0 ? n : 0);
        }, 0);
        if (sum <= 0) {
          errs.totalCost = "At least one cost or man-hours value is required";
        }
      }
      return errs;
    },
  },
  {
    // NOTE: section key remains "procurement" to preserve previously persisted
    // workbook data. The legacy "suppliers" section was removed in May 2026 —
    // see workbookExcelNormalizer.ts SHEET_SECTION_HINTS for the sheet alias,
    // and workbookRoutes.ts SECTION_KEYS which still loads any legacy
    // "suppliers" rows and merges them at projection time.
    key: "procurement",
    label: "Procurement / Suppliers",
    description: "Supplier register: spend, B-BBEE certificate, ownership.",
    enabled: true,
    columns: PROCUREMENT_COLUMNS,
    gridTotals: [{ columnKey: "spend", label: "Total Spend" }],
    rowValidate: (row) => {
      const errs: Record<string, string> = {};
      // PP_OWN_001: black female ownership <= total black ownership
      if (!isBlank(row.currentBlackOwnership) && !isBlank(row.currentBlackFemaleOwnership)) {
        const total = Number(row.currentBlackOwnership);
        const female = Number(row.currentBlackFemaleOwnership);
        if (Number.isFinite(total) && Number.isFinite(female) && female > total) {
          errs.currentBlackFemaleOwnership = "Cannot exceed Black ownership";
        }
      }
      return errs;
    },
  },
  {
    key: "esd",
    label: "Enterprise & Supplier Development",
    description: "ESD beneficiaries and contributions.",
    enabled: true,
    columns: ESD_COLUMNS,
    rowValidate: (row) => {
      const errs: Record<string, string> = {};
      // ESD_DATE_001: payment_date >= invoice_date
      const inv = parseWorkbookDate(row.invoiceDate);
      const pay = parseWorkbookDate(row.paymentDate);
      if (inv && pay && pay.getTime() < inv.getTime()) {
        errs.paymentDate = "Payment date must be on/after invoice date";
      }
      return errs;
    },
  },
  {
    key: "sed",
    label: "Socio-Economic Development",
    description: "SED beneficiaries and contributions.",
    enabled: true,
    columns: SED_COLUMNS,
  },
];

/**
 * Looks up a section by key, optionally filtering its columns and meta to match
 * the caller's sector and scorecard type. Sector-aware transformations applied:
 *  - SED "ICT-Specific?" column: only shown for ICT sector.
 *  - SED section gets CE/Fundisa meta for FSC sector (hybrid: meta + columns).
 *  - Ownership section gets "Farm Worker?" column for AGRI sector.
 *  - Skills Development: eapProvince and eapYear excluded for QSE (fixed % targets, no EAP lookup).
 */
export function getSection(
  key: string,
  sectorCode?: string,
  scorecardType?: string,
  fscSubSector?: string,
  fscReinsurer?: boolean,
): SectionDef | undefined {
  const result = getSectionInner(key, sectorCode, scorecardType, fscSubSector, fscReinsurer);
  // Construction-only columns live in the base arrays so the importer (which calls
  // getSection with NO sector) always parses them. Hide them from EXPLICIT
  // non-construction sector forms; keep them for the importer and for Construction.
  if (!result?.columns || sectorCode === undefined) return result;
  const sector = String(sectorCode).trim().toUpperCase();
  if (sector === "" || sector === "CONSTRUCTION") return result;
  const cols = result.columns.filter((c) => !CONSTRUCTION_ONLY_COLUMN_KEYS.has(c.key));
  return cols.length === result.columns.length ? result : { ...result, columns: cols };
}

function getSectionInner(
  key: string,
  sectorCode?: string,
  scorecardType?: string,
  fscSubSector?: string,
  fscReinsurer?: boolean,
): SectionDef | undefined {
  const section = SECTIONS.find((s) => s.key === key);
  if (!section) return undefined;
  if (
    sectorCode === undefined
    && scorecardType === undefined
    && fscSubSector === undefined
    && fscReinsurer === undefined
  ) {
    return section;
  }
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const cardType = String(scorecardType ?? "").trim().toUpperCase();

  // FSC Financial Information: prior year revenue only (AFS lives in afs-additions).
  if (key === "financial-information") {
    const meta = getFinancialMetaFields(sector);
    const subNorm = normalizeFscSubSector(fscSubSector);
    if (meta !== section.meta || (sector === "FSC" && subNorm !== "Others")) {
      const afsLabel = fscSubSectorDisplayLabel(subNorm);
      return {
        ...section,
        meta,
        ...(sector === "FSC"
          ? {
              label: section.label,
              description:
                subNorm === "Others"
                  ? `Revenue, NPAT, and payroll for ${afsLabel}. Select Banks, Long-Term Insurers, or Short-Term Insurers under Company Information to unlock the AFS Additions pillar.`
                  : `Revenue, NPAT, payroll, and procurement totals for ${afsLabel}. Complete AFS Additions separately for Access to Financial Services scoring.`,
            }
          : {}),
      };
    }
    return section;
  }

  // FSC AFS Additions — separate required pillar for Banks / LTI / STI sub-sectors.
  if (key === "afs-additions") {
    const afsMeta = getFscAfsMetaFields(fscSubSector, sector);
    if (afsMeta.length === 0) {
      return { ...section, enabled: false, meta: [] };
    }
    const subNorm = normalizeFscSubSector(fscSubSector);
    const afsLabel = fscSubSectorDisplayLabel(subNorm);
    return {
      ...section,
      enabled: true,
      meta: afsMeta,
      description: `Access to Financial Services (12 pts) — ${afsLabel} AFS indicators.`,
    };
  }

  // QSE uses fixed percentage targets (60% Black, 30% Black Female for SMJ band) —
  // no provincial EAP lookup. Remove eapProvince and eapYear from the skills meta.
  if (key === "skills-development" && cardType === "QSE" && section.meta) {
    const EAP_FIELDS = new Set(["eapProvince", "eapYear"]);
    return {
      ...section,
      meta: section.meta.filter((f) => !EAP_FIELDS.has(f.key)),
    };
  }

  if (key === "sed") {
    let columns = section.columns;
    // ICT-Specific initiative column: only for ICT
    if (sector !== "ICT" && columns) {
      columns = columns.filter((c) => c.key !== "ictSpecificInitiative");
    }
    // FSC: add Consumer Education aggregate meta (hybrid section)
    if (sector === "FSC") {
      let meta = FSC_SED_META;
      if (fscReinsurer) {
        meta = meta.filter((f) => f.key !== "ceBonusSpend");
      }
      return {
        ...section,
        label: "SED & Consumer Education",
        description: fscReinsurer
          ? "SED beneficiaries and contributions, plus Consumer Education (reinsurer: 1 pt max, no Additional CE bonus)."
          : "SED beneficiaries and contributions, plus Consumer Education and Fundisa aggregates (FSC-specific).",
        meta,
        gridLabel: "SED & CE transaction entries",
        columns: columns ?? section.columns,
      };
    }
    if (columns !== section.columns) {
      return { ...section, columns };
    }
    return section;
  }

  // FSC MC: Senior/Middle/Junior bands are permanently NOT AVAILABLE (0 target points).
  if (key === "management-control" && sector === "FSC" && section.columns) {
    return {
      ...section,
      description:
        "All directors and employees in one register. FSC MC scores Board, Executive Directors, Other Executive Management, and Employees with Disabilities only. Senior, Middle, and Junior designations may be used for workforce data collection but do NOT contribute to the MC score (NOT AVAILABLE, 0 pts each).",
      columns: section.columns.map((c) =>
        c.key === "designation"
          ? {
              ...c,
              guidance:
                "Required. FSC MC scores Board, Executive Director, and Other Executive Management at fixed targets. Senior, Middle, and Junior are collected for data purposes only — they are NOT AVAILABLE for MC scoring (0 target points each, all FSC sub-sectors).",
            }
          : c,
      ),
    };
  }

  if (key === "management-control" && sector === "TRANSPORT" && section.columns) {
    return {
      ...section,
      label: "Management Control & Employment Equity",
      description:
        "Transport Large Enterprise: Board and executive bands (11 MC pts) plus senior/middle/junior/semi-unskilled EE bands (18 EE pts) in one register. Use Designation to assign each employee to the correct Transport band.",
    };
  }

  if (key === "management-control" && sector === "CONSTRUCTION" && section.columns) {
    return {
      ...section,
      description:
        "Construction sector MC and EE in one register. Band labels follow the Construction Sector Code (Contractor, BEP, or QSE scorecard).",
    };
  }

  if (key === "skills-development" && sector === "TRANSPORT") {
    return {
      ...section,
      description:
        "Transport sector skills: learning programmes, bursaries, and absorption targets per the Transport Sector Code (Large: 15 pts max; QSE: elective pillar).",
    };
  }

  if (key === "procurement" && sector === "TRANSPORT") {
    return {
      ...section,
      label: "Preferential Procurement",
      description:
        "Transport TMPS-based procurement indicators (Large Enterprise: 20 pts). QSE entities may treat PP as an elective pillar.",
    };
  }

  if (key === "procurement" && sector === "CONSTRUCTION") {
    return {
      ...section,
      label: "Preferential Procurement",
      description:
        "Construction sector procurement spend against TMPS. Indicator rows follow the selected Construction scorecard type (QSE / Contractor / BEP).",
    };
  }

  // Construction is scored on Supplier Development; the Construction Sector Code
  // has no *scored* Enterprise Development pillar (ED contributions score 0).
  // We steer users to SD via the label/guidance but keep both options so strict
  // validation never rejects an imported row that carries "Enterprise Development".
  if (key === "esd" && sector === "CONSTRUCTION" && section.columns) {
    return {
      ...section,
      label: "Supplier Development",
      description:
        "Construction is scored on Supplier Development. The Construction Sector Code has no scored Enterprise Development pillar — ED contributions score 0 points.",
      columns: section.columns.map((c) =>
        c.key === "esdCategory"
          ? {
              ...c,
              guidance:
                "Construction is scored on Supplier Development only — Enterprise Development contributions are not scored (0 pts). Use Supplier Development.",
              validationMessage: "Construction is scored on Supplier Development (Enterprise Development is not scored).",
            }
          : c,
      ),
    };
  }

  if (key === "ownership" && sector === "AGRI" && section.columns) {
    // AgriBEE: farm workers qualify as a Designated Group for Ownership (4% EI target).
    const farmWorkerCol: ColumnDef = yesNoColumn("isFarmWorker", "Farm Worker?", {
      width: 120,
      guidance:
        "AgriBEE-specific. Tick if this shareholder is a farm worker who qualifies under the Designated Groups indicator (combined EI target 4%, 3 pts). Farm workers are a 5th Designated Group category in AgriBEE.",
    });
    // Only add if not already present (prevents duplicate on re-render)
    if (!section.columns.find((c) => c.key === "isFarmWorker")) {
      return {
        ...section,
        columns: [...section.columns, farmWorkerCol],
      };
    }
  }

  return section;
}

/**
 * A logical grouping of one-or-more sections rendered together in the workbook
 * navigation. Storage keys for each section remain unchanged regardless of
 * grouping, so persisted workbooks stay compatible across sectors.
 */
export interface SectionGroup {
  /** Stable identifier (used for React keys / data-testids). */
  key: string;
  /** Visible parent label. Empty for ungrouped (single-section) entries. */
  label: string;
  /** Section keys in display order. */
  sectionKeys: string[];
  /** True when the group contains more than one section. */
  isGroup: boolean;
}

const BASE_SECTION_KEYS_PRE_MGMT = [
  "company-information",
  "financial-information",
  "ownership",
] as const;

const BASE_SECTION_KEYS_POST_MGMT = [
  "skills-development",
  "procurement",
  "esd",
  "sed",
] as const;

/**
 * Returns the visible section navigation per sector rules.
 *
 * MC and EE are now a **single combined spreadsheet** (`management-control`)
 * for all sectors, including TRANSPORT. The `employees` section is disabled and
 * never shown in the nav — legacy data stored there is still included in scoring
 * via the merge in `projectWorkbookToClient`.
 *
 * Storage keys are unchanged, so all previously persisted workbook data remains
 * readable.
 */
export function getSectionGroupsForSector(sectorCode?: string, fscSubSector?: string): SectionGroup[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const groups: SectionGroup[] = [];
  for (const key of BASE_SECTION_KEYS_PRE_MGMT) {
    groups.push({ key, label: SECTIONS.find((s) => s.key === key)?.label ?? key, sectionKeys: [key], isGroup: false });
    if (key === "financial-information" && sector === "FSC" && fscSubSectorHasAfs(fscSubSector)) {
      groups.push({
        key: "afs-additions",
        label: "AFS Additions",
        sectionKeys: ["afs-additions"],
        isGroup: false,
      });
    }
  }
  // Management Control & EE is a single flat section for all sectors.
  groups.push({
    key: "management-control",
    label: "Management Control & Employment Equity",
    sectionKeys: ["management-control"],
    isGroup: false,
  });
  for (const key of BASE_SECTION_KEYS_POST_MGMT) {
    groups.push({ key, label: SECTIONS.find((s) => s.key === key)?.label ?? key, sectionKeys: [key], isGroup: false });
  }
  return groups;
}

/** Convenience: flat ordered list of enabled section keys per sector. */
export function getOrderedSectionKeysForSector(sectorCode?: string, fscSubSector?: string): string[] {
  const out: string[] = [];
  for (const g of getSectionGroupsForSector(sectorCode, fscSubSector)) {
    out.push(...g.sectionKeys);
  }
  return out;
}

/**
 * Cross-field validator for the financial-information meta section.
 *
 * Returns a map of { fieldKey: errorMessage } for fields that fail
 * rules that depend on more than one field value.
 *
 * Currently enforced:
 *  - payroll must be >= 0 (Leviable Amount is derived as payroll × 1%).
 */
export function validateFinancialMetaCrossFields(
  meta: Record<string, unknown>,
): Record<string, string> {
  const issues: Record<string, string> = {};

  const payrollRaw = meta.payroll;
  const payroll =
    typeof payrollRaw === "number" ? payrollRaw : parseAmount(payrollRaw);
  if (!isNaN(payroll) && payroll < 0) {
    issues["payroll"] = "Total Payroll must be zero or positive.";
  }

  const hasPriorYears = (() => {
    for (let i = 1; i <= 5; i++) {
      const rev = Number(meta[`priorYear${i}Revenue`]);
      const npat = meta[`priorYear${i}Npat`];
      if ((Number.isFinite(rev) && rev > 0) || (npat !== "" && npat != null && npat !== undefined)) {
        return true;
      }
    }
    return false;
  })();

  const overrideRaw = meta.deemedNpatOverride;
  const hasOverride =
    overrideRaw !== "" &&
    overrideRaw !== undefined &&
    overrideRaw !== null &&
    !(typeof overrideRaw === "string" && overrideRaw.trim() === "");

  if (
    hasOverride &&
    !hasPriorYears &&
    priorYearLeibrandtInputsRelevant(meta)
  ) {
    issues.deemedNpatOverride =
      "Deemed NPAT override requires at least one prior-year revenue/NPAT row.";
  }

  return issues;
}
