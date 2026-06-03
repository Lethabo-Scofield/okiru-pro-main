import type { EsgFieldDef } from "./EsgScalarForm";
import type { MaturityRowDef } from "./EsgMaturityGrid";
import { ESG_DEFAULT_DEPOTS } from "./EsgMonthlyGrid";

const ESG_SOLAR_SOURCES = ["ISANDO (JHB)", "DBN (EDGE)", "CPT", "BLOEM", "PE"] as const;

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

export const S_DATA_HS_FIELDS: EsgFieldDef[] = [
  { cell: "C26", label: "Total employees Q1 (Jul-Sep)", type: "number" },
  { cell: "D26", label: "Total employees Q2 (Oct-Dec)", type: "number" },
  { cell: "E26", label: "Total employees Q3 (Jan-Mar)", type: "number" },
  { cell: "F26", label: "Total employees Q4 (Apr-Jun)", type: "number" },
  { cell: "C27", label: "Hours worked Q1", type: "number" },
  { cell: "D27", label: "Hours worked Q2", type: "number" },
  { cell: "E27", label: "Hours worked Q3", type: "number" },
  { cell: "F27", label: "Hours worked Q4", type: "number" },
  { cell: "C29", label: "LTI Q1", type: "number" },
  { cell: "D29", label: "LTI Q2", type: "number" },
  { cell: "E29", label: "LTI Q3", type: "number" },
  { cell: "F29", label: "LTI Q4", type: "number" },
  { cell: "C30", label: "MTI Q1", type: "number" },
  { cell: "D30", label: "MTI Q2", type: "number" },
  { cell: "E30", label: "MTI Q3", type: "number" },
  { cell: "F30", label: "MTI Q4", type: "number" },
  { cell: "C31", label: "First Aid Q1", type: "number" },
  { cell: "D31", label: "First Aid Q2", type: "number" },
  { cell: "E31", label: "First Aid Q3", type: "number" },
  { cell: "F31", label: "First Aid Q4", type: "number" },
  { cell: "C32", label: "Near Miss Q1", type: "number" },
  { cell: "D32", label: "Near Miss Q2", type: "number" },
  { cell: "E32", label: "Near Miss Q3", type: "number" },
  { cell: "F32", label: "Near Miss Q4", type: "number" },
  { cell: "C33", label: "Vehicle accidents Q1", type: "number" },
  { cell: "D33", label: "Vehicle accidents Q2", type: "number" },
  { cell: "E33", label: "Vehicle accidents Q3", type: "number" },
  { cell: "F33", label: "Vehicle accidents Q4", type: "number" },
  { cell: "C34", label: "Driver fatigue Q1", type: "number" },
  { cell: "D34", label: "Driver fatigue Q2", type: "number" },
  { cell: "E34", label: "Driver fatigue Q3", type: "number" },
  { cell: "F34", label: "Driver fatigue Q4", type: "number" },
  { cell: "C37", label: "H&S training hrs Q1", type: "number" },
  { cell: "D37", label: "H&S training hrs Q2", type: "number" },
  { cell: "E37", label: "H&S training hrs Q3", type: "number" },
  { cell: "F37", label: "H&S training hrs Q4", type: "number" },
  { cell: "C38", label: "% employees H&S induction Q1", type: "number" },
  { cell: "D38", label: "% employees H&S induction Q2", type: "number" },
  { cell: "E38", label: "% employees H&S induction Q3", type: "number" },
  { cell: "F38", label: "% employees H&S induction Q4", type: "number" },
  { cell: "G35", label: "LTIFR (computed)", type: "number" },
];

export const S_DATA_TRAINING_FIELDS: EsgFieldDef[] = [
  { cell: "B45", label: "WSP submitted (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B46", label: "ATR submitted (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B47", label: "Mandatory grant claimed (R)", type: "number" },
  { cell: "B49", label: "Total training hours delivered", type: "number" },
  { cell: "B50", label: "Training spend (R)", type: "number" },
  { cell: "B51", label: "% employees trained YTD", type: "number" },
  { cell: "B52", label: "Black employees trained (%)", type: "number" },
  { cell: "B53", label: "Female employees trained (%)", type: "number" },
  { cell: "B54", label: "Youth (≤35) trained (%)", type: "number" },
  { cell: "B55", label: "PWD employees trained (%)", type: "number" },
];

export const S_DATA_PAYROLL_FIELDS: EsgFieldDef[] = [
  { cell: "B43", label: "Leviable payroll (R)", type: "number" },
  { cell: "B44", label: "NPAT (R)", type: "number" },
  { cell: "B71", label: "SDL levy paid (1% of payroll)", type: "number" },
];

/** @deprecated Use split field groups (S_DATA_HS_FIELDS, etc.) */
export const S_DATA_SCALAR_FIELDS: EsgFieldDef[] = [
  ...S_DATA_HS_FIELDS,
  ...S_DATA_TRAINING_FIELDS.filter((f) => f.cell !== "B43"),
  ...S_DATA_PAYROLL_FIELDS,
];

export const E_DATA_GHG_SUMMARY_FIELDS: EsgFieldDef[] = [
  { cell: "L75", label: "Scope 1A Fleet Diesel YTD (tCO₂e)", type: "number" },
  { cell: "L76", label: "Scope 1B Generator YTD (tCO₂e)", type: "number" },
  { cell: "L77", label: "Scope 1C LPG YTD (tCO₂e)", type: "number" },
  { cell: "L78", label: "Scope 1D Business cars YTD (tCO₂e)", type: "number" },
  { cell: "L79", label: "SCOPE 1 TOTAL (tCO₂e)", type: "number" },
  { cell: "L82", label: "SCOPE 2 NET (tCO₂e)", type: "number" },
  { cell: "L84", label: "Scope 3 — Water (tCO₂e)", type: "number" },
  { cell: "L86", label: "TOTAL GHG (Scope 1+2+3) tCO₂e", type: "number" },
];

export const E_DATA_NZ_FIELDS: EsgFieldDef[] = [
  { cell: "B90", label: "Net-zero baseline tCO₂e (Scope 1+2)", type: "number" },
  { cell: "F90", label: "Current YTD Scope 1+2 (derived)", type: "number" },
  { cell: "G90", label: "On track for SBTi target (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
];

export const E_DATA_SUMMARY_FIELDS: EsgFieldDef[] = [
  ...E_DATA_GHG_SUMMARY_FIELDS,
  ...E_DATA_NZ_FIELDS,
];

export const G_DATA_MATURITY_ROWS: MaturityRowDef[] = [
  { cell: "B5",  scoreCell: "F5",  label: "Board members (total)",                kind: "numeric" },
  { cell: "B6",  scoreCell: "F6",  label: "Independent non-executive directors",  kind: "numeric" },
  { cell: "B7",  scoreCell: "F7",  label: "Executive directors",                  kind: "numeric" },
  { cell: "B8",  scoreCell: "F8",  label: "% Black board members",                kind: "numeric" },
  { cell: "B9",  scoreCell: "F9",  label: "% Female board members",               kind: "numeric" },
  { cell: "B10", scoreCell: "F10", label: "Board meetings held YTD",              kind: "numeric" },
  { cell: "B11", scoreCell: "F11", label: "Audit committee meetings YTD",         kind: "numeric" },
  { cell: "B12", scoreCell: "F12", label: "Risk committee active (Y/N)",          kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B13", scoreCell: "F13", label: "Social & Ethics committee active (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B14", scoreCell: "F14", label: "ESG linked to exec remuneration (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B15", scoreCell: "F15", label: "Code of ethics in place (Y/N)",        kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B16", scoreCell: "F16", label: "Whistleblower hotline active (Y/N)",   kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B17", scoreCell: "F17", label: "POPIA Information Officer appointed (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B18", scoreCell: "F18", label: "POPIA impact assessment done (Y/N)",   kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B19", scoreCell: "F19", label: "External assurance of ESG report (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B20", scoreCell: "F20", label: "Integrated report published (Y/N)",    kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B21", scoreCell: "F21", label: "Risk register updated (Y/N)",          kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B22", scoreCell: "F22", label: "Number of material risks identified",  kind: "numeric" },
  { cell: "B23", scoreCell: "F23", label: "Climate risk in risk register (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B24", scoreCell: "F24", label: "Anti-corruption training done (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
];

export const EE_MATURITY_ROWS: MaturityRowDef[] = [
  { cell: "B9", scoreCell: "E9", label: "EE Plan", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B10", scoreCell: "E10", label: "EE forum", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B5", scoreCell: "E5", label: "% Black employees", kind: "numeric" },
];

export function eDataDepotRows() {
  return ESG_DEFAULT_DEPOTS.map((depot) => ({ depot, months: [] as (number | "")[] }));
}

export function eDataGeneratorRows() {
  return ESG_DEFAULT_DEPOTS.map((depot) => ({
    depot: `Generator – ${depot}`,
    months: [] as (number | "")[],
  }));
}

export function eDataLpgRows() {
  return [{ depot: "LPG Forklifts – DBN", months: [] as (number | "")[] }];
}

export function eDataBusinessCarRows() {
  return [{ depot: "Solly's Car – ISANDO", months: [] as (number | "")[] }];
}

export function eDataSolarRows() {
  return ESG_SOLAR_SOURCES.map((src) => ({
    depot: `Solar – ${src}`,
    months: [] as (number | "")[],
  }));
}

export function eDataWaterRows() {
  return ESG_DEFAULT_DEPOTS.map((depot) => ({
    depot: `SG Consumer – ${depot}`,
    months: [] as (number | "")[],
  }));
}

export function eDataWasteRows() {
  return [{ depot: "% Waste Recycled (all depots)", months: [] as (number | "")[] }];
}

export const WASTE_SCALAR_FIELDS: EsgFieldDef[] = [
  { cell: "L68", label: "CPT Oricol – Total Waste (kg)", type: "number" },
  { cell: "L69", label: "CPT Oricol – % Landfill", type: "number" },
  { cell: "L70", label: "CPT Oricol – % Diversion (recycled + recovery)", type: "number" },
];
