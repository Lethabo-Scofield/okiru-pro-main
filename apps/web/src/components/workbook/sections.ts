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
}

const RACE_OPTIONS = ["African", "Coloured", "Indian", "White", "Other"];
const GENDER_OPTIONS = ["Male", "Female"];
const OCC_LEVEL_OPTIONS = [
  "Top Management",
  "Senior Management",
  "Middle Management",
  "Junior Management",
  "Skilled",
  "Semi-Skilled",
  "Unskilled",
];
const SUPPLIER_SIZE_OPTIONS = ["EME", "QSE", "Generic"];
const BBBEE_LEVEL_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "Non-Compliant"];
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

const idValidator = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{6,13}$/.test(s)) return "ID must be 6–13 digits";
  return null;
};

const numericValidator = (v: unknown): string | null => {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (n < 0) return "Must be ≥ 0";
  return null;
};

const percentValidator = (v: unknown): string | null => {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return "Must be a number";
  if (n < 0 || n > 100) return "0–100 only";
  return null;
};

// ---------- Company Information (single-record form via meta) ----------
const COMPANY_INFO_META: ColumnDef[] = [
  { key: "companyName", label: "Company / Legal Name", type: "text", required: true },
  { key: "tradingName", label: "Trading Name", type: "text" },
  { key: "registrationNumber", label: "Registration Number", type: "text" },
  { key: "vatNumber", label: "VAT Number", type: "text" },
  { key: "taxNumber", label: "Tax Number", type: "text" },
  { key: "industrySector", label: "Industry / Sector Code", type: "text" },
  { key: "financialYearEnd", label: "Financial Year-End (yyyy-mm-dd)", type: "date" },
  { key: "physicalAddress", label: "Physical Address", type: "text" },
  { key: "postalAddress", label: "Postal Address", type: "text" },
  { key: "contactPerson", label: "Contact Person", type: "text" },
  { key: "contactEmail", label: "Contact Email", type: "text" },
  { key: "contactPhone", label: "Contact Phone", type: "text" },
];

// ---------- Financial Information (single-record meta form) ----------
const FINANCIAL_META: ColumnDef[] = [
  { key: "revenue", label: "Revenue (R)", type: "number", validate: numericValidator },
  { key: "npat", label: "NPAT — Net Profit After Tax (R)", type: "number", validate: numericValidator },
  { key: "payroll", label: "Total Payroll (R)", type: "number", validate: numericValidator },
  { key: "leviableAmount", label: "Leviable Amount (R)", type: "number", validate: numericValidator },
  { key: "tmps", label: "Total Measured Procurement Spend (R)", type: "number", validate: numericValidator },
  { key: "forecastRevenue", label: "Forecast Revenue (R)", type: "number", validate: numericValidator },
  { key: "forecastNpat", label: "Forecast NPAT (R)", type: "number", validate: numericValidator },
  { key: "forecastPayroll", label: "Forecast Payroll (R)", type: "number", validate: numericValidator },
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
export const MANAGEMENT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140 },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, width: 110 },
  { key: "designation", label: "Designation / Role", type: "text", width: 200 },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180 },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "votingRights", label: "Voting Rights (%)", type: "number", width: 140, validate: percentValidator },
  { key: "startDate", label: "Start Date", type: "date", width: 140 },
];

// ---------- Employees ----------
export const EMPLOYEE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", required: true, width: 140 },
  { key: "surname", label: "Surname", type: "text", required: true, width: 140 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, width: 110 },
  { key: "occupationalLevel", label: "Occupational Level", type: "select", options: OCC_LEVEL_OPTIONS, width: 180 },
  { key: "department", label: "Department", type: "text", width: 160 },
  { key: "salary", label: "Annual Salary (R)", type: "number", width: 150, validate: numericValidator },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "startDate", label: "Start Date", type: "date", width: 140 },
];

// ---------- Skills Development ----------
export const SKILLS_COLUMNS: ColumnDef[] = [
  { key: "programName", label: "Training Program", type: "text", required: true, width: 200 },
  { key: "categoryCode", label: "Category (A–G)", type: "select", options: SKILLS_CATEGORY_OPTIONS, width: 130 },
  { key: "trainingProvider", label: "Training Provider", type: "text", width: 180 },
  { key: "learnerName", label: "Learner Name", type: "text", required: true, width: 180 },
  { key: "idNumber", label: "ID Number", type: "id", width: 150, validate: idValidator },
  { key: "race", label: "Race", type: "select", options: RACE_OPTIONS, width: 130 },
  { key: "gender", label: "Gender", type: "select", options: GENDER_OPTIONS, width: 110 },
  { key: "isDisabled", label: "Disabled", type: "boolean", width: 100 },
  { key: "isForeign", label: "Foreign", type: "boolean", width: 100 },
  { key: "employed", label: "Employed?", type: "boolean", width: 110 },
  { key: "completed", label: "Completed?", type: "boolean", width: 110 },
  { key: "absorbed", label: "Absorbed?", type: "boolean", width: 110 },
  { key: "courseCost", label: "Course Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "travelCost", label: "Travel Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "accommodationCost", label: "Accommodation (R)", type: "number", width: 160, validate: numericValidator },
  { key: "salaryCost", label: "Salary Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "otherCosts", label: "Other Costs (R)", type: "number", width: 140, validate: numericValidator },
  { key: "totalCost", label: "Total Cost (R)", type: "number", width: 140, validate: numericValidator },
  { key: "startDate", label: "Start Date", type: "date", width: 140 },
  { key: "endDate", label: "End Date", type: "date", width: 140 },
];

// ---------- Procurement / Suppliers ----------
export const PROCUREMENT_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Supplier Name", type: "text", required: true, width: 220 },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, width: 130 },
  { key: "bbbeeLevel", label: "B-BBEE Level", type: "select", options: BBBEE_LEVEL_OPTIONS, width: 140 },
  { key: "vatNumber", label: "VAT Number", type: "text", width: 140 },
  { key: "measuredUnder", label: "Measured Under", type: "text", width: 150 },
  { key: "empoweringSupplier", label: "Empowering Supplier?", type: "boolean", width: 180 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", width: 160, validate: percentValidator },
  { key: "currentBlackFemaleOwnership", label: "Black Female Ownership (%)", type: "number", width: 190, validate: percentValidator },
  { key: "sdRecipient", label: "SD Recipient?", type: "boolean", width: 130 },
  { key: "threeYearContract", label: "3yr Contract?", type: "boolean", width: 130 },
  { key: "designated", label: "Designated?", type: "boolean", width: 120 },
  { key: "spend", label: "Spend (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "firstProcurementDate", label: "First Procured", type: "date", width: 140 },
  { key: "certificateExpiryDate", label: "Cert Expiry", type: "date", width: 140 },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = PROCUREMENT_COLUMNS;

// ---------- ESD ----------
export const ESD_COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Beneficiary / Supplier", type: "text", required: true, width: 220 },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number", width: 160, validate: percentValidator },
  { key: "currentSize", label: "Current Size", type: "select", options: SUPPLIER_SIZE_OPTIONS, width: 130 },
  { key: "contributionDescription", label: "Description", type: "text", required: true, width: 240 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: ESD_CONTRIBUTION_TYPES, required: true, width: 200 },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "dateOfTransaction", label: "Date of Transaction", type: "date", width: 160 },
  { key: "invoiceDate", label: "Invoice Date", type: "date", width: 140 },
  { key: "paymentDate", label: "Payment Date", type: "date", width: 140 },
  { key: "primeRate", label: "Prime Rate (%)", type: "number", width: 130, validate: percentValidator },
  { key: "actualRate", label: "Actual Rate (%)", type: "number", width: 130, validate: percentValidator },
];

// ---------- SED ----------
export const SED_COLUMNS: ColumnDef[] = [
  { key: "beneficiaryName", label: "Beneficiary Name", type: "text", required: true, width: 220 },
  { key: "descriptionOfSpend", label: "Description of Spend", type: "text", required: true, width: 260 },
  { key: "ictSpecificInitiative", label: "ICT-Specific?", type: "boolean", width: 130 },
  { key: "contributionType", label: "Contribution Type", type: "select", options: SED_CONTRIBUTION_TYPES, required: true, width: 200 },
  { key: "percentBenefitingBlack", label: "% Benefiting Black", type: "number", width: 170, validate: percentValidator },
  { key: "amount", label: "Amount (R)", type: "number", required: true, width: 140, validate: numericValidator },
  { key: "dateOfTransaction", label: "Date of Transaction", type: "date", width: 160 },
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
  },
  {
    key: "procurement",
    label: "Procurement",
    description: "Supplier spend and B-BBEE certificate aggregation.",
    enabled: true,
    columns: PROCUREMENT_COLUMNS,
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier register with B-BBEE level and spend.",
    enabled: true,
    columns: SUPPLIER_COLUMNS,
  },
  {
    key: "esd",
    label: "Enterprise & Supplier Development",
    description: "ESD beneficiaries and contributions.",
    enabled: true,
    columns: ESD_COLUMNS,
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
