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

export type ColumnType = "text" | "number" | "select" | "boolean" | "id" | "date";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  options?: string[];
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
const SUPPLIER_SIZE_OPTIONS = ["Large", "QSE", "EME"];
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
  large: "Large",
  largeenterprise: "Large",
  generic: "Large",
  l: "Large",
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
      return ["QSE", "Contractor", "BEP"];
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
  if (value && allowed.includes(value)) return value;
  if (allowed.length === 1) return allowed[0];
  return "";
}

/** Company Information meta fields with scorecardType options filtered by sector. */
export function getCompanyInfoMetaFields(sectorCode?: string): ColumnDef[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const scorecardOptions = sector ? getScorecardTypeOptions(sector) : [];
  const base = COMPANY_INFO_META.map((f) =>
    f.key === "scorecardType" ? { ...f, options: scorecardOptions } : f,
  );

  const extras: ColumnDef[] = [];

  // AGRI: farm workers qualify as a 5th Designated Group category (Ownership 4% EI target).
  if (sector === "AGRI") {
    extras.push({
      key: "farmWorkersIncluded",
      label: "Farm Workers included in Designated Groups?",
      type: "boolean",
      guidance:
        "AgriBEE-specific. Tick if farm workers employed by the entity should be counted in the Designated Groups indicator for Ownership (4% EI target, 3 pts). Farm workers are a 5th qualifying category alongside ESOP, BBOS, Co-ops, and Black Designated Groups.",
    });
  }

  // FSC: sub-sector picker drives which EF/AFS scorecard variant applies.
  if (sector === "FSC") {
    extras.push({
      key: "fscSubSector",
      label: "FSC Sub-Sector",
      type: "select",
      required: true,
      options: FSC_SUB_SECTOR_OPTIONS,
      guidance:
        "Required for FSC. Determines the applicable scorecard variant: Others (FS700), Banks (FS701), Long-Term Insurers (FS702), or Short-Term Insurers (FS703). Currently only the 'Others' variant is fully scored.",
    });
  }

  return extras.length > 0 ? [...base, ...extras] : base;
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

const dateValidator = (v: unknown): string | null => {
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
  { key: "financialYearEnd", label: "Financial Year-End (yyyy-mm-dd)", type: "date", validate: dateValidator },
  {
    key: "measurementPeriodStart",
    label: "Financial Period Start",
    type: "date",
    validate: dateValidator,
    guidance: "Start date of the measured financial period. Drives period filters on Skills, PP, ESD, SED scorecards.",
  },
  {
    key: "measurementPeriodEnd",
    label: "Financial Period End",
    type: "date",
    validate: dateValidator,
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
// Leviable Amount is intentionally NOT collected separately: per SARS the
// Skills Development levy is calculated on total payroll (with statutory
// exclusions), so we derive `leviableAmount` from `forecastPayroll` (preferred)
// or `payroll` in `mapWorkbookFinancialsToClient`. This removes the user-facing
// duplication that previously asked for both "Total Payroll" and "Leviable
// Amount". Legacy workbooks that still carry a `leviableAmount` value continue
// to be honoured by the mapping fallback.
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
    validate: numericValidator,
    guidance: "Industry norm margin (%). When actual NPAT margin falls below 25% of this norm, deemed NPAT (revenue × norm) drives SD/ED/SED targets.",
  },
  {
    key: "deemedNpatOverride",
    label: "Deemed NPAT Override (R)",
    type: "number",
    validate: signedNumericValidator,
    guidance: "Optional manual deemed NPAT when the automatic industry-norm test is unsuitable. Leave blank to use actual NPAT or auto-deemed NPAT.",
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
  { key: "forecastRevenue", label: "Forecast Revenue (R)", type: "number", validate: numericValidator },
  { key: "forecastNpat", label: "Forecast NPAT (R)", type: "number", validate: signedNumericValidator },
  { key: "forecastPayroll", label: "Forecast Payroll (R, used as Leviable Amount for Skills)", type: "number", validate: numericValidator },
];

// ---------- Ownership ----------
export const OWNERSHIP_COLUMNS: ColumnDef[] = [
  { key: "shareholderName", label: "Shareholder Name", type: "text", required: true, width: 200 },
  { key: "idNumber", label: "ID / Reg Number", type: "text", width: 150 },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, width: 110 },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isYouth", label: "Youth (<35)", type: "boolean", width: 110 },
  { key: "votingRights", label: "Voting Rights (%)", type: "number", width: 140, validate: percentValidator },
  { key: "economicInterest", label: "Economic Interest (%)", type: "number", width: 160, validate: percentValidator },
  { key: "shareholding", label: "Shareholding (%)", type: "number", width: 150, validate: percentValidator },
  {
    key: "shareValue",
    label: "Share Carrying Value (R)",
    type: "number",
    width: 160,
    validate: numericValidator,
    guidance: "Carrying value of this shareholder's stake. Required with Company Value to Use for net-value scoring.",
  },
  { key: "yearsHeld", label: "Years Held", type: "number", width: 110, validate: integerNonNegValidator },
  { key: "modifiedFlowThrough", label: "Modified Flow-Through?", type: "boolean", width: 170 },
];

// ---------- Management Control ----------
// Rules: Full Name*, Gender*, Race*, Designation* (enum), Disabled?, Foreign?,
// ID Number, Voting Rights*, Employee Code, Start date/years of service.
export const MANAGEMENT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140, aliases: ["First Name", "Given Name", "Name"] },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140, aliases: ["Surname", "Last Name", "Family Name"] },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator, aliases: ["ID", "ID No", "Identity Number", "ID/Passport"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130, aliases: ["Race", "Population Group", "Ethnicity"] },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110, aliases: ["Gender", "Sex"] },
  { key: "designation", label: "Designation", type: "select", options: DESIGNATION_OPTIONS, required: true, width: 200, aliases: ["Designation", "Title", "Position", "Job Title"] },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180, aliases: ["Occupational Level", "Occ Level", "Management Tier", "Tier", "Level"] },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "votingRights", label: "Voting Rights (%)", type: "number", required: true, width: 140, validate: percentValidator },
  { key: "startDate", label: "Start Date / Years of Service", type: "text", width: 180, validate: dateOrNumberValidator },
];

// ---------- Employees ----------
export const EMPLOYEE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140, aliases: ["First Name", "Given Name", "Name"] },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140, aliases: ["Surname", "Last Name", "Family Name"] },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator, aliases: ["ID", "ID No", "Identity Number", "ID/Passport"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130, aliases: ["Race", "Population Group", "Ethnicity"] },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110, aliases: ["Gender", "Sex"] },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180, aliases: ["Occupational Level", "Occ Level", "Management Tier", "Tier", "Level", "Job Level"] },
  { key: "department", label: "Department", type: "text", width: 160, aliases: ["Department", "Dept", "Business Unit"] },
  { key: "salary", label: "Annual Salary (R)", type: "number", width: 150, validate: numericValidator, aliases: ["Salary", "Annual Salary", "Remuneration", "Total Cost to Company", "CTC"] },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "startDate", label: "Start Date", type: "date", width: 140, validate: dateValidator },
];

// ---------- Skills Development ----------

const SELECT_PERIOD_OPTIONS = ["Current YTD", "Full Year", "Prior Year"];

/**
 * Single-record meta form for Skills Development aggregate (grey-cell) inputs.
 * These correspond to the required inputs on the RCOGP Skills Scorecard tab and
 * Skills Toolkit tab. Source of truth: docs/domain/sectors/rcogp/generic/sls.md §3 + §6.3.
 */
export const SKILLS_META: ColumnDef[] = [
  {
    key: "leviableAmount",
    label: "Leviable Amount (R)",
    type: "number",
    required: true,
    validate: (v: unknown): string | null => {
      if (isBlank(v)) return null;
      const n = parseAmount(v);
      if (Number.isNaN(n)) return "Must be a number";
      if (n <= 0) return "Must be > 0";
      return null;
    },
    guidance: "Entity payroll-based leviable amount (> 0). Drives the 3.5%, 2.5%, and 0.3% spend targets. Overrides Forecast Payroll in Financial Information when set.",
  },
  {
    key: "eapProvince",
    label: "Applicable EAP Targets (Province)",
    type: "select",
    required: true,
    options: PROVINCE_OPTIONS,
    guidance: "Province for EAP demographic lookup. Required for bursary demographic splits and Management Control scoring.",
  },
  {
    key: "eapYear",
    label: "EAP Targets Year",
    type: "number",
    required: true,
    validate: positiveIntValidator,
    guidance: "Year matching a row in the EAP table (e.g. 2025). Triggers 'EAP targets Year selected?' validation in the toolkit.",
  },
  {
    key: "headcount",
    label: "Headcount (Total Employees)",
    type: "number",
    required: true,
    validate: positiveIntValidator,
    guidance: "Total employee headcount of the entity (positive integer). Used as the base for the LAI target: 5% × headcount.",
  },
  {
    key: "trainingManagerSalary",
    label: "Training Manager's Salary (R)",
    type: "number",
    required: true,
    validate: numericValidator,
    guidance: "Annual salary of the Skills Development Facilitator / Training Manager (≥ 0). Admin costs are capped at 15% of total skills spend.",
  },
  {
    key: "trainingOverheadCost",
    label: "Training Overhead Cost (R)",
    type: "number",
    required: true,
    validate: numericValidator,
    guidance: "Total training overhead costs (venue hire, admin, etc.) (≥ 0). Also subject to the 15% admin cost cap.",
  },
  {
    key: "selectPeriod",
    label: "Select Period",
    type: "select",
    required: true,
    options: SELECT_PERIOD_OPTIONS,
    guidance: "Set to 'Current YTD' for active year-to-date measurement. The Summary scorecard warns when not set.",
  },
  {
    key: "dataDate",
    label: "Data Date",
    type: "date",
    required: true,
    validate: dateValidator,
    guidance: "Reference date for this training dataset. Skills scorecard flags 'Data with no data date' when missing.",
  },
];

// Rules require: program*, category*, learner*, gender*, race*. Costs ≥ 0.
export const SKILLS_COLUMNS: ColumnDef[] = [
  { key: "programName", label: "Training Program", type: "text", required: true, width: 200, aliases: ["Training Program Name", "Program Name", "Programme Name", "Course", "Course Name", "Intervention"] },
  { key: "categoryCode", label: "Category (A–G)", type: "select", options: SKILLS_CATEGORY_OPTIONS, required: true, width: 130, aliases: ["Category", "Skills Category", "Cat", "Category Code"] },
  { key: "trainingProvider", label: "Training Provider", type: "text", width: 180, aliases: ["Provider", "Service Provider", "Institution"] },
  { key: "province", label: "Province", type: "select", options: PROVINCE_OPTIONS, width: 150 },
  { key: "municipality", label: "Municipality", type: "text", width: 160 },
  { key: "learnerName", label: "Learner Name", type: "text", required: true, width: 180, aliases: ["Learner", "Trainee", "Employee Name", "Beneficiary"] },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator, aliases: ["ID", "ID No", "Identity Number"] },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130, aliases: ["Population Group", "Ethnicity"] },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110, aliases: ["Sex"] },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "age", label: "Age", type: "number", width: 90, validate: integerNonNegValidator },
  { key: "employed", label: "Employed?", type: "boolean", width: 110 },
  { key: "completed", label: "Completed?", type: "boolean", width: 110 },
  { key: "absorbed", label: "Absorbed?", type: "boolean", width: 110 },
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
  { key: "startDate", label: "Start Date", type: "date", width: 140, validate: dateValidator },
  { key: "endDate", label: "End Date", type: "date", width: 140, validate: dateValidator },
];

// ---------- Procurement / Suppliers ----------
// Rules require: supplier_name*, current_company_size*, spend*. Sizes are
// {Large, QSE, EME}; B-BBEE levels 1–8 or Non-compliant; CoGP/RCoGP enum.
export const PROCUREMENT_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Supplier Name", type: "text", required: true, width: 220, aliases: ["Supplier", "Vendor", "Vendor Name", "Name", "Trading Name", "Company", "Company Name", "Beneficiary"] },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, required: true, width: 130, aliases: ["Size", "Company Size", "Supplier Size", "Enterprise Size", "Entity Size", "EME/QSE/Large"] },
  { key: "bbbeeLevel", label: "B-BBEE Level", type: "select", options: BBBEE_LEVEL_OPTIONS, width: 140, aliases: ["BEE Level", "BBBEE Level", "B-BBEE Status", "BEE Status", "Level", "Contributor Level"] },
  { key: "vatNumber", label: "VAT Number", type: "text", width: 140, aliases: ["VAT", "VAT No"] },
  { key: "measuredUnder", label: "Measured Under", type: "select", options: MEASURED_UNDER_OPTIONS, width: 150, aliases: ["Code", "Codes", "Scorecard"] },
  { key: "empoweringSupplier", label: "Empowering Supplier?", type: "boolean", width: 180, aliases: ["Empowering Supplier", "ES"] },
  { key: "firstProcurementDate", label: "First Procured", type: "date", width: 140, validate: dateValidator, aliases: ["First Procurement Date", "First Spend Date", "Onboarded"] },
  { key: "sizeAtFirstProcurement", label: "Size at First Procurement", type: "select", options: SUPPLIER_SIZE_OPTIONS, width: 180, aliases: ["Initial Size", "Original Size"] },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", width: 160, validate: percentValidator, aliases: ["Black Ownership", "% Black Ownership", "Black Owned %", "Black Owned"] },
  { key: "currentBlackFemaleOwnership", label: "Black Female Ownership (%)", type: "number", width: 190, validate: percentValidator, aliases: ["Black Female Ownership", "Black Women Ownership", "% Black Women", "Black Women Owned"] },
  { key: "hasModifiedBlackOwnership", label: "Modified Black Ownership?", type: "boolean", width: 190 },
  { key: "unmodifiedBlackOwnership", label: "Unmodified Black Ownership (%)", type: "number", width: 200, validate: percentValidator },
  { key: "sdRecipient", label: "SD Recipient?", type: "boolean", width: 130 },
  { key: "threeYearContract", label: "3yr Contract?", type: "boolean", width: 130 },
  { key: "designated", label: "Designated?", type: "boolean", width: 120 },
  { key: "spend", label: "Spend (R)", type: "number", required: true, width: 140, validate: numericValidator, aliases: ["Rand Value", "Amount", "Spend", "Procurement Spend", "Supplier Spend", "Value (R)", "R Spend", "Total Spend", "Annual Spend", "Spend Amount", "Spend (Excl VAT)"] },
  { key: "certificateExpiryDate", label: "Cert Expiry", type: "date", width: 140, validate: dateValidator, aliases: ["Certificate Expiry", "Cert Expiry Date", "Expiry Date", "Valid Until"] },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = PROCUREMENT_COLUMNS;

// ESD category — Supplier Development vs Enterprise Development
// Per docs/LAKE_TRADING_FIX_PLAN.md §1 Bug 4: the workbook ESD section captures
// both SD and ED contributions on one sheet; this column tells the scoring
// engine which sub-element a row belongs to.
const ESD_CATEGORY_OPTIONS = ["Supplier Development", "Enterprise Development"];

// ---------- ESD ----------
export const ESD_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Beneficiary / Supplier", type: "text", required: true, width: 220 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", required: true, width: 160, validate: percentValidator },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, required: true, width: 130 },
  { key: "esdCategory", label: "Category (SD / ED)", type: "select", options: ESD_CATEGORY_OPTIONS, required: false, width: 190 },
  { key: "contributionDescription", label: "Description", type: "text", required: true, width: 240 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: ESD_CONTRIBUTION_TYPES, required: true, width: 200, guidance: "Pick the recognition category from the Codes (Statement 400). Hover an option for the definition.", optionGuidance: ESD_CONTRIBUTION_GUIDANCE },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "dateOfTransaction", label: "Date of Transaction", type: "date", width: 160, validate: dateValidator },
  { key: "invoiceDate", label: "Invoice Date", type: "date", width: 140, validate: dateValidator },
  { key: "paymentDate", label: "Payment Date", type: "date", width: 140, validate: dateValidator },
  { key: "primeRate", label: "Prime Rate (%)", type: "number", width: 130, validate: percentValidator },
  { key: "actualRate", label: "Actual Rate (%)", type: "number", width: 130, validate: percentValidator },
];

// ---------- SED ----------
export const SED_COLUMNS: ColumnDef[] = [
  { key: "beneficiaryName", label: "Beneficiary Name", type: "text", required: true, width: 220 },
  { key: "descriptionOfSpend", label: "Description of Spend", type: "text", required: true, width: 260 },
  { key: "ictSpecificInitiative", label: "ICT-Specific?", type: "boolean", width: 130 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: SED_CONTRIBUTION_TYPES, required: true, width: 200, guidance: "Pick the recognition category from the Codes (Statement 500). Hover an option for the definition.", optionGuidance: SED_CONTRIBUTION_GUIDANCE },
  { key: "percentBenefitingBlack", label: "% Benefiting Black", type: "number", required: true, width: 170, validate: percentValidator },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "dateOfTransaction", label: "Date of Transaction", type: "date", width: 160, validate: dateValidator },
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
    key: "ownership",
    label: "Ownership",
    description: "Shareholders, voting rights, and economic interest.",
    enabled: true,
    columns: OWNERSHIP_COLUMNS,
  },
  {
    key: "management-control",
    label: "Management Control",
    description: "Directors and executive composition.",
    enabled: true,
    columns: MANAGEMENT_COLUMNS,
  },
  {
    key: "employees",
    label: "Employees",
    description: "Employee register with race, gender, occupational level, and salary.",
    enabled: true,
    columns: EMPLOYEE_COLUMNS,
  },
  {
    key: "skills-development",
    label: "Skills Development",
    description: "Training programmes, learnerships, and spend.",
    enabled: true,
    meta: SKILLS_META,
    columns: SKILLS_COLUMNS,
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
    rowValidate: (row) => {
      const errs: Record<string, string> = {};
      // PP_CERT_001: if B-BBEE level is supplied, expect a certificate expiry date
      if (!isBlank(row.bbbeeLevel) && isBlank(row.certificateExpiryDate)) {
        errs.certificateExpiryDate = "Required when B-BBEE level is set";
      }
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
 * the caller's sector. Sector-aware transformations applied:
 *  - SED "ICT-Specific?" column: only shown for ICT sector.
 *  - SED section gets CE/Fundisa meta for FSC sector (hybrid: meta + columns).
 *  - Ownership section gets "Farm Worker?" column for AGRI sector.
 *  - Management Control EAP note differs for QSE vs Generic but columns are shared.
 */
export function getSection(key: string, sectorCode?: string): SectionDef | undefined {
  const section = SECTIONS.find((s) => s.key === key);
  if (!section) return undefined;
  if (sectorCode === undefined) return section;
  const sector = String(sectorCode ?? "").trim().toUpperCase();

  if (key === "sed") {
    let columns = section.columns;
    // ICT-Specific initiative column: only for ICT
    if (sector !== "ICT" && columns) {
      columns = columns.filter((c) => c.key !== "ictSpecificInitiative");
    }
    // FSC: add Consumer Education aggregate meta (hybrid section)
    if (sector === "FSC") {
      return {
        ...section,
        label: "SED & Consumer Education",
        description:
          "SED beneficiaries and contributions, plus Consumer Education and Fundisa aggregates (FSC-specific).",
        meta: FSC_SED_META,
        gridLabel: "SED & CE transaction entries",
        columns: columns ?? section.columns,
      };
    }
    if (columns !== section.columns) {
      return { ...section, columns };
    }
    return section;
  }

  if (key === "ownership" && sector === "AGRI" && section.columns) {
    // AgriBEE: farm workers qualify as a Designated Group for Ownership (4% EI target).
    const farmWorkerCol: ColumnDef = {
      key: "isFarmWorker",
      label: "Farm Worker?",
      type: "boolean",
      width: 120,
      guidance:
        "AgriBEE-specific. Tick if this shareholder is a farm worker who qualifies under the Designated Groups indicator (combined EI target 4%, 3 pts). Farm workers are a 5th Designated Group category in AgriBEE.",
    };
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
 * Returns the visible section navigation grouped per sector rules:
 *  - TRANSPORT: Management Control and Employees are rendered as separate
 *    top-level sections (Transport scorecard splits them).
 *  - All other sectors: Management Control and Employees are nested under a
 *    single "Management Control & Employment Equity" parent group.
 * Storage keys are untouched in both branches.
 */
export function getSectionGroupsForSector(sectorCode?: string): SectionGroup[] {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  const groups: SectionGroup[] = [];
  for (const key of BASE_SECTION_KEYS_PRE_MGMT) {
    groups.push({ key, label: SECTIONS.find((s) => s.key === key)?.label ?? key, sectionKeys: [key], isGroup: false });
  }
  if (sector === "TRANSPORT") {
    groups.push({ key: "management-control", label: "Management Control", sectionKeys: ["management-control"], isGroup: false });
    groups.push({ key: "employees", label: "Employees", sectionKeys: ["employees"], isGroup: false });
  } else {
    groups.push({
      key: "management-control-ee",
      label: "Management Control & Employment Equity",
      sectionKeys: ["management-control", "employees"],
      isGroup: true,
    });
  }
  for (const key of BASE_SECTION_KEYS_POST_MGMT) {
    groups.push({ key, label: SECTIONS.find((s) => s.key === key)?.label ?? key, sectionKeys: [key], isGroup: false });
  }
  return groups;
}

/** Convenience: flat ordered list of enabled section keys per sector. */
export function getOrderedSectionKeysForSector(sectorCode?: string): string[] {
  const out: string[] = [];
  for (const g of getSectionGroupsForSector(sectorCode)) {
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
 *  - payroll must be >= 0 because it is used as Leviable Amount for Skills
 *    Development calculations.
 */
export function validateFinancialMetaCrossFields(
  meta: Record<string, unknown>,
): Record<string, string> {
  const issues: Record<string, string> = {};

  const pairs: Array<[string, string, string]> = [
    ["revenue", "forecastRevenue", "Revenue"],
    ["npat", "forecastNpat", "NPAT"],
    ["payroll", "forecastPayroll", "Payroll"],
  ];

  for (const [actualKey, forecastKey, label] of pairs) {
    const actualBlank = isBlank(meta[actualKey]);
    const forecastBlank = isBlank(meta[forecastKey]);
    if (actualBlank && forecastBlank) {
      issues[actualKey] = `${label}: provide actual or forecast`;
      issues[forecastKey] = `${label}: provide actual or forecast`;
    }
  }

  const payroll = typeof meta.payroll === "number" ? meta.payroll : undefined;
  if (payroll !== undefined && payroll < 0) {
    issues["payroll"] =
      "Total Payroll (used as Leviable Amount for Skills) must be zero or positive.";
  }

  return issues;
}
