// Validation rules for the Information Request workbook.
// Source of truth for rules content: apps/web/src/config/bbbeeInfoRequestRules.json
// (editable JSON copy of attached_assets/bbbee_info_request_rules_*.json).
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

// ---------- Validators ----------

const isBlank = (v: unknown): boolean =>
  v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const idValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  if (!/^\d{6,13}$/.test(s)) return "ID must be 6–13 digits";
  return null;
};

// Numeric, non-negative (revenue, payroll, costs, spend, amount).
const numericValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (n < 0) return "Must be ≥ 0";
  return null;
};

// Numeric, allows negatives (e.g. NPAT can be a loss).
const signedNumericValidator = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  const n = Number(v);
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
  { key: "industrySector", label: "Industry / Sector Code", type: "text" },
  { key: "financialYearEnd", label: "Financial Year-End (yyyy-mm-dd)", type: "date", validate: dateValidator },
  { key: "physicalAddress", label: "Physical Address", type: "text" },
  { key: "postalAddress", label: "Postal Address", type: "text" },
  { key: "contactPerson", label: "Contact Person", type: "text" },
  { key: "contactEmail", label: "Contact Email", type: "text" },
  { key: "contactPhone", label: "Contact Phone", type: "text" },
];

// ---------- Financial Information (single-record meta form) ----------
const FINANCIAL_META: ColumnDef[] = [
  { key: "revenue", label: "Revenue (R)", type: "number", required: true, validate: numericValidator },
  { key: "npat", label: "NPAT — Net Profit After Tax (R)", type: "number", required: true, validate: signedNumericValidator },
  { key: "payroll", label: "Total Payroll (R)", type: "number", required: true, validate: numericValidator },
  { key: "leviableAmount", label: "Leviable Amount (R)", type: "number", validate: numericValidator },
  { key: "tmps", label: "Total Measured Procurement Spend (R)", type: "number", validate: numericValidator },
  { key: "forecastRevenue", label: "Forecast Revenue (R)", type: "number", required: true, validate: numericValidator },
  { key: "forecastNpat", label: "Forecast NPAT (R)", type: "number", required: true, validate: signedNumericValidator },
  { key: "forecastPayroll", label: "Forecast Payroll (R)", type: "number", required: true, validate: numericValidator },
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
  { key: "modifiedFlowThrough", label: "Modified Flow-Through?", type: "boolean", width: 170 },
];

// ---------- Management Control ----------
// Rules: Full Name*, Gender*, Race*, Designation* (enum), Disabled?, Foreign?,
// ID Number, Voting Rights*, Employee Code, Start date/years of service.
export const MANAGEMENT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140 },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110 },
  { key: "designation", label: "Designation", type: "select", options: DESIGNATION_OPTIONS, required: true, width: 200 },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180 },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "votingRights", label: "Voting Rights (%)", type: "number", required: true, width: 140, validate: percentValidator },
  { key: "startDate", label: "Start Date / Years of Service", type: "text", width: 180, validate: dateOrNumberValidator },
];

// ---------- Employees ----------
export const EMPLOYEE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140 },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110 },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180 },
  { key: "department", label: "Department", type: "text", width: 160 },
  { key: "salary", label: "Annual Salary (R)", type: "number", width: 150, validate: numericValidator },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "startDate", label: "Start Date", type: "date", width: 140, validate: dateValidator },
];

// ---------- Skills Development ----------
// Rules require: program*, category*, learner*, gender*, race*. Costs ≥ 0.
export const SKILLS_COLUMNS: ColumnDef[] = [
  { key: "programName", label: "Training Program", type: "text", required: true, width: 200 },
  { key: "categoryCode", label: "Category (A–G)", type: "select", options: SKILLS_CATEGORY_OPTIONS, required: true, width: 130 },
  { key: "trainingProvider", label: "Training Provider", type: "text", width: 180 },
  { key: "province", label: "Province", type: "select", options: PROVINCE_OPTIONS, width: 150 },
  { key: "municipality", label: "Municipality", type: "text", width: 160 },
  { key: "learnerName", label: "Learner Name", type: "text", required: true, width: 180 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, required: true, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, required: true, width: 110 },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "age", label: "Age", type: "number", width: 90, validate: integerNonNegValidator },
  { key: "employed", label: "Employed?", type: "boolean", width: 110 },
  { key: "completed", label: "Completed?", type: "boolean", width: 110 },
  { key: "absorbed", label: "Absorbed?", type: "boolean", width: 110 },
  { key: "courseCost", label: "Course Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "travelCost", label: "Travel Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "accommodationCost", label: "Accommodation (R)", type: "number", width: 160, validate: numericValidator },
  { key: "cateringCost", label: "Catering (R)", type: "number", width: 140, validate: numericValidator },
  { key: "stationeryCost", label: "Stationery (R)", type: "number", width: 140, validate: numericValidator },
  { key: "trainingFacilityCost", label: "Training Facility (R)", type: "number", width: 160, validate: numericValidator },
  { key: "salaryCost", label: "Salary Cost (R, cat B/C/D)", type: "number", width: 170, validate: numericValidator },
  { key: "otherCosts", label: "Other Costs (R)", type: "number", width: 140, validate: numericValidator },
  { key: "totalCost", label: "Total Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "manHours", label: "Man Hours", type: "number", width: 120, validate: numericValidator },
  { key: "startDate", label: "Start Date", type: "date", width: 140, validate: dateValidator },
  { key: "endDate", label: "End Date", type: "date", width: 140, validate: dateValidator },
];

// ---------- Procurement / Suppliers ----------
// Rules require: supplier_name*, current_company_size*, spend*. Sizes are
// {Large, QSE, EME}; B-BBEE levels 1–8 or Non-compliant; CoGP/RCoGP enum.
export const PROCUREMENT_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Supplier Name", type: "text", required: true, width: 220 },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, required: true, width: 130 },
  { key: "bbbeeLevel", label: "B-BBEE Level", type: "select", options: BBBEE_LEVEL_OPTIONS, width: 140 },
  { key: "vatNumber", label: "VAT Number", type: "text", width: 140 },
  { key: "measuredUnder", label: "Measured Under", type: "select", options: MEASURED_UNDER_OPTIONS, width: 150 },
  { key: "empoweringSupplier", label: "Empowering Supplier?", type: "boolean", width: 180 },
  { key: "firstProcurementDate", label: "First Procured", type: "date", width: 140, validate: dateValidator },
  { key: "sizeAtFirstProcurement", label: "Size at First Procurement", type: "select", options: SUPPLIER_SIZE_OPTIONS, width: 180 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", width: 160, validate: percentValidator },
  { key: "currentBlackFemaleOwnership", label: "Black Female Ownership (%)", type: "number", width: 190, validate: percentValidator },
  { key: "hasModifiedBlackOwnership", label: "Modified Black Ownership?", type: "boolean", width: 190 },
  { key: "unmodifiedBlackOwnership", label: "Unmodified Black Ownership (%)", type: "number", width: 200, validate: percentValidator },
  { key: "sdRecipient", label: "SD Recipient?", type: "boolean", width: 130 },
  { key: "threeYearContract", label: "3yr Contract?", type: "boolean", width: 130 },
  { key: "designated", label: "Designated?", type: "boolean", width: 120 },
  { key: "spend", label: "Spend (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "certificateExpiryDate", label: "Cert Expiry", type: "date", width: 140, validate: dateValidator },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = PROCUREMENT_COLUMNS;

// ---------- ESD ----------
export const ESD_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Beneficiary / Supplier", type: "text", required: true, width: 220 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", required: true, width: 160, validate: percentValidator },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, required: true, width: 130 },
  { key: "contributionDescription", label: "Description", type: "text", required: true, width: 240 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: ESD_CONTRIBUTION_TYPES, required: true, width: 200 },
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
  { key: "contributionType", label: "Contribution Type", type: "select", options: SED_CONTRIBUTION_TYPES, required: true, width: 200 },
  { key: "percentBenefitingBlack", label: "% Benefiting Black", type: "number", required: true, width: 170, validate: percentValidator },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "dateOfTransaction", label: "Date of Transaction", type: "date", width: 160, validate: dateValidator },
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
    key: "procurement",
    label: "Procurement",
    description: "Supplier spend and B-BBEE certificate aggregation.",
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
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier register with B-BBEE level and spend.",
    enabled: true,
    columns: SUPPLIER_COLUMNS,
    rowValidate: (row) => {
      const errs: Record<string, string> = {};
      if (!isBlank(row.bbbeeLevel) && isBlank(row.certificateExpiryDate)) {
        errs.certificateExpiryDate = "Required when B-BBEE level is set";
      }
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

export function getSection(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}
