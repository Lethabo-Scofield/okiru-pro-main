import type { EsgFieldDef } from "./EsgScalarForm";
import type { MaturityRowDef } from "./EsgMaturityGrid";
import { ESG_DEFAULT_DEPOTS } from "./EsgMonthlyGrid";

export const COVER_FIELDS: EsgFieldDef[] = [
  { cell: "entity", label: "Entity" },
  { cell: "period", label: "Reporting period" },
  { cell: "baselineYear", label: "Baseline year", type: "number" },
  { cell: "netZeroTargetYear", label: "Net-zero target year", type: "number" },
  {
    cell: "sector",
    label: "Sector",
    type: "select",
    options: [
      "Generic",
      "FMCG / Distribution",
      "Transport / Logistics",
      "Manufacturing",
      "Financial Services",
      "ICT / Technology",
      "Agriculture",
      "Mining",
      "Construction",
      "Retail",
      "Hospitality",
      "Healthcare",
      "Education",
      "Public Sector",
    ],
  },
];

export const ASSUMPTIONS_FIELDS: EsgFieldDef[] = [
  {
    cell: "B6",
    label: "Scoring stance",
    type: "select",
    options: ["Lean", "Standard", "Strict"],
  },
  { cell: "B8", label: "Sector", type: "select", options: COVER_FIELDS[4].options },
  { cell: "B9", label: "Stance floor (B9)", type: "number" },
  { cell: "B107", label: "Net-zero target year", type: "number" },
  { cell: "B55", label: "LTIFR threshold", type: "number" },
];

export const S_DATA_SCALAR_FIELDS: EsgFieldDef[] = [
  { cell: "G28", label: "Hours worked", type: "number" },
  { cell: "G29", label: "Incidents", type: "number" },
  { cell: "G35", label: "LTIFR (computed)", type: "number" },
  { cell: "B45", label: "WSP submitted", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B46", label: "ATR submitted", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B70", label: "Total payroll", type: "number" },
  { cell: "B71", label: "SDL (1%)", type: "number" },
];

export const E_DATA_SUMMARY_FIELDS: EsgFieldDef[] = [
  { cell: "L19", label: "Fleet diesel YTD", type: "number" },
  { cell: "L46", label: "Electricity kWh YTD", type: "number" },
  { cell: "L63", label: "Water kL YTD", type: "number" },
  { cell: "B90", label: "Net-zero baseline tCO₂e", type: "number" },
  { cell: "_months_C_K", label: "Months with data", type: "number" },
];

export const G_DATA_MATURITY_ROWS: MaturityRowDef[] = [
  { cell: "B15", scoreCell: "F15", label: "Code of ethics", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B16", scoreCell: "F16", label: "Whistleblower", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B17", scoreCell: "F17", label: "POPIA IO", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B18", scoreCell: "F18", label: "Cyber risk", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "F13", scoreCell: "F13", label: "S&EC maturity", kind: "numeric" },
  { cell: "F14", scoreCell: "F14", label: "ESG remuneration", kind: "numeric" },
];

export const EE_MATURITY_ROWS: MaturityRowDef[] = [
  { cell: "B9", scoreCell: "E9", label: "EE Plan", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B10", scoreCell: "E10", label: "EE forum", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B5", scoreCell: "E5", label: "% Black employees", kind: "numeric" },
];

export function eDataDepotRows() {
  return ESG_DEFAULT_DEPOTS.map((depot) => ({ depot, months: [] as (number | "")[] }));
}
