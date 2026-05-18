export type ColumnType = "text" | "number" | "select" | "boolean" | "id";

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
];

export const SECTIONS: SectionDef[] = [
  { key: "company-information", label: "Company Information", description: "Legal entity, registration, and contact details.", enabled: false },
  { key: "financial-information", label: "Financial Information", description: "Revenue, NPAT, payroll, and procurement totals.", enabled: false },
  { key: "ownership", label: "Ownership", description: "Shareholders, voting rights, and economic interest.", enabled: false },
  { key: "management-control", label: "Management Control", description: "Directors and executive composition.", enabled: false },
  { key: "skills-development", label: "Skills Development", description: "Training programmes, learnerships, and spend.", enabled: false },
  { key: "procurement", label: "Procurement", description: "Supplier spend and B-BBEE certificate aggregation.", enabled: false },
  { key: "esd", label: "Enterprise & Supplier Development", description: "ESD beneficiaries and contributions.", enabled: false },
  { key: "sed", label: "Socio-Economic Development", description: "SED beneficiaries and contributions.", enabled: false },
  {
    key: "employees",
    label: "Employees",
    description: "Employee register with race, gender, occupational level, and salary.",
    enabled: true,
    columns: EMPLOYEE_COLUMNS,
  },
  { key: "suppliers", label: "Suppliers", description: "Supplier register with B-BBEE level and spend.", enabled: false },
];

export function getSection(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}
