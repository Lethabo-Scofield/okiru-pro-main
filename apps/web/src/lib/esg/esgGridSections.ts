/**
 * ESG register / row-grid column definitions — v1.7 workbook headers.
 * Keys map to Excel columns via esgGridRows (A=first column).
 */
export type EsgColumnDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "id" | "date";
  required?: boolean;
  options?: string[];
  yesNoBoolean?: boolean;
  width?: number;
  guidance?: string;
  optionGuidance?: Record<string, string>;
};

export type EsgGridSectionDef = {
  sectionId: string;
  sheet: string;
  description: string;
  columns: EsgColumnDef[];
  /** First data row on sheet (1-based). */
  startRow: number;
};

const KING5_STATUS = [
  "Applied",
  "Explained",
  "Partially Applied",
  "Not Applied",
] as const;

const IFRS_STATUS = [
  "Disclosed",
  "Partially Disclosed",
  "Not Disclosed",
  "N/A",
] as const;

const ISO_STATUS = [
  "Fully Compliant",
  "Partially Compliant",
  "Gap",
  "Not Applicable",
] as const;

const GARP_CONTROL = [
  "Effective",
  "Partially Effective",
  "Ineffective",
  "Not Assessed",
] as const;

const SAQ_SCORE = ["5", "4", "3", "2", "1", "N/A"] as const;

export const ESG_GRID_SECTION_IDS = [
  "fleet",
  "waste",
  "driver-debrief",
  "iso-tracker",
  "king5",
  "ifrs",
  "garp",
  "saq",
  "s-data-ofo",
  "s-data-csi",
] as const;

export type EsgGridSectionId = (typeof ESG_GRID_SECTION_IDS)[number];

export const ESG_GRID_SECTIONS: Record<EsgGridSectionId, EsgGridSectionDef> = {
  fleet: {
    sectionId: "fleet",
    sheet: "Fleet_Register",
    description: "Per-vehicle CO₂, L/100km, service status",
    startRow: 4,
    columns: [
      { key: "reg", label: "Reg", type: "text", required: true, width: 110 },
      { key: "depot", label: "Depot", type: "text", width: 100 },
      { key: "model", label: "Model/Category", type: "text", width: 130 },
      { key: "gvm", label: "GVM (kg)", type: "number", width: 90 },
      { key: "tare", label: "Tare (kg)", type: "number", width: 90 },
      { key: "carry", label: "Carry (kg)", type: "number", width: 90 },
      { key: "fuelCap", label: "Fuel Cap (L)", type: "number", width: 95 },
      { key: "tracking", label: "Tracking", type: "text", width: 90 },
      { key: "monthlyKm", label: "Monthly km", type: "number", width: 100 },
      { key: "monthlyLitres", label: "Monthly Litres", type: "number", width: 110 },
      { key: "l100Actual", label: "L/100km Actual", type: "number", width: 115 },
      { key: "l100Norm", label: "L/100km Norm", type: "number", width: 110 },
      { key: "monthlyTco2", label: "Monthly tCO₂e", type: "number", width: 110 },
      { key: "serviceStatus", label: "Service Status", type: "text", width: 120 },
      { key: "licenceExpiry", label: "Licence Expiry", type: "date", width: 115 },
    ],
  },
  waste: {
    sectionId: "waste",
    sheet: "Waste_Register",
    description: "Monthly waste streams (summary cells B16–B18 preserved on save)",
    startRow: 5,
    columns: [
      { key: "month", label: "Month", type: "text", width: 90 },
      { key: "depot", label: "Depot", type: "text", width: 90 },
      { key: "wasteType", label: "Waste Type", type: "text", required: true, width: 160 },
      { key: "totalKg", label: "Total kg", type: "number", width: 95 },
      { key: "recycledKg", label: "Recycled kg", type: "number", width: 100 },
      { key: "landfillKg", label: "Landfill kg", type: "number", width: 100 },
      { key: "divertedPct", label: "Diverted %", type: "number", width: 95 },
      { key: "landfillTco2", label: "Landfill tCO₂e", type: "number", width: 110 },
    ],
  },
  "driver-debrief": {
    sectionId: "driver-debrief",
    sheet: "Driver_Debrief",
    description: "Route completion and customer hit %",
    startRow: 4,
    columns: [
      { key: "date", label: "Date", type: "date", required: true, width: 110 },
      { key: "depot", label: "Depot", type: "text", width: 90 },
      { key: "driver", label: "Driver Name", type: "text", width: 130 },
      { key: "vehicleReg", label: "Vehicle Reg", type: "text", width: 110 },
      { key: "route", label: "Route", type: "text", width: 120 },
      { key: "custHit", label: "Cust Hit%", type: "number", width: 95 },
      { key: "planStops", label: "Plan Stops", type: "number", width: 95 },
      { key: "actStops", label: "Act Stops", type: "number", width: 95 },
    ],
  },
  "iso-tracker": {
    sectionId: "iso-tracker",
    sheet: "ISO_Tracker",
    description: "ISO clause-level compliance status",
    startRow: 5,
    columns: [
      { key: "requirement", label: "Requirement", type: "text", required: true, width: 220 },
      { key: "clause", label: "Clause", type: "text", width: 70 },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [...ISO_STATUS],
        width: 150,
      },
      { key: "evidence", label: "Current Evidence", type: "text", width: 200 },
      { key: "netZeroLink", label: "Net-Zero / ESG Link", type: "text", width: 160 },
    ],
  },
  king5: {
    sectionId: "king5",
    sheet: "King5_Scorecard",
    description: "17 King V principles — Apply & Explain",
    startRow: 4,
    columns: [
      { key: "num", label: "#", type: "number", width: 50 },
      { key: "principle", label: "Principle", type: "text", required: true, width: 280 },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [...KING5_STATUS],
        required: true,
        width: 160,
      },
      { key: "weight", label: "Weight", type: "number", width: 80 },
      { key: "evidence", label: "Current Evidence", type: "text", width: 220 },
    ],
  },
  ifrs: {
    sectionId: "ifrs",
    sheet: "IFRS_S1_S2",
    description: "IFRS S1/S2 climate disclosure tracker",
    startRow: 5,
    columns: [
      { key: "requirement", label: "Disclosure Requirement", type: "text", required: true, width: 240 },
      { key: "pillar", label: "Pillar", type: "text", width: 100 },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [...IFRS_STATUS],
        width: 160,
      },
      { key: "evidence", label: "Current Status / Evidence", type: "text", width: 220 },
      { key: "action", label: "Action Required", type: "text", width: 180 },
    ],
  },
  garp: {
    sectionId: "garp",
    sheet: "GARP_GRAP",
    description: "GARP / GRAP risk & compliance",
    startRow: 5,
    columns: [
      { key: "risk", label: "Risk / Requirement", type: "text", required: true, width: 200 },
      { key: "description", label: "Description", type: "text", width: 200 },
      { key: "dataSource", label: "Data Source", type: "text", width: 110 },
      { key: "severity", label: "Severity", type: "text", width: 90 },
      {
        key: "controlStatus",
        label: "Control Status",
        type: "select",
        options: [...GARP_CONTROL],
        width: 150,
      },
      { key: "evidence", label: "Current Control / Evidence", type: "text", width: 200 },
      { key: "likelihood", label: "Likelihood (1-5)", type: "number", width: 110 },
    ],
  },
  saq: {
    sectionId: "saq",
    sheet: "SAQ_Supplier",
    description: "Supplier ESG assessment (1–5 per criterion)",
    startRow: 5,
    columns: [
      { key: "supplier", label: "Supplier Name", type: "text", required: true, width: 200 },
      { key: "onTime", label: "On-Time Del", type: "select", options: [...SAQ_SCORE], width: 100 },
      { key: "quality", label: "Quality", type: "select", options: [...SAQ_SCORE], width: 90 },
      { key: "healthSafety", label: "H&S", type: "select", options: [...SAQ_SCORE], width: 90 },
      { key: "environmental", label: "Environmental", type: "select", options: [...SAQ_SCORE], width: 110 },
      { key: "foodSafety", label: "Food Safety", type: "select", options: [...SAQ_SCORE], width: 100 },
      { key: "invoicing", label: "Correct Invoicing", type: "select", options: [...SAQ_SCORE], width: 120 },
      { key: "backup", label: "Backup Support", type: "select", options: [...SAQ_SCORE], width: 110 },
    ],
  },
  "s-data-ofo": {
    sectionId: "s-data-ofo",
    sheet: "S_Data",
    description: "OFO codes — training interventions (S_Data rows 57–68)",
    startRow: 59,
    columns: [
      { key: "ofoCode",    label: "OFO Code",       type: "text",   required: true, width: 90 },
      { key: "occupation", label: "Occupation",      type: "text",   required: true, width: 200 },
      { key: "learners",   label: "Learners (#)",    type: "number", width: 95 },
      { key: "programme",  label: "Programme",       type: "text",   width: 200 },
      { key: "duration",   label: "Duration",        type: "text",   width: 90 },
      { key: "seta",       label: "SETA",            type: "text",   width: 90 },
      { key: "status",     label: "Status",          type: "text",   width: 90 },
      { key: "netZeroLink",label: "Net-Zero Link",   type: "text",   width: 140 },
    ],
  },
  "s-data-csi": {
    sectionId: "s-data-csi",
    sheet: "S_Data",
    description: "Community & Social Investment register (S_Data rows 70–82)",
    startRow: 72,
    columns: [
      { key: "initiative",  label: "Initiative",      type: "text",   required: true, width: 200 },
      { key: "month",       label: "Month",           type: "text",   width: 80 },
      { key: "beneficiaries", label: "Beneficiaries", type: "text",   width: 200 },
      { key: "spend",       label: "Spend (R)",       type: "number", width: 95 },
      { key: "category",    label: "Category",        type: "text",   width: 130 },
      { key: "netZeroLink", label: "Net-Zero Link",   type: "text",   width: 120 },
    ],
  },
};

export function isEsgGridSection(sectionId: string): sectionId is EsgGridSectionId {
  return (ESG_GRID_SECTION_IDS as readonly string[]).includes(sectionId);
}

export function esgGridSectionDef(sectionId: string): EsgGridSectionDef | undefined {
  if (!isEsgGridSection(sectionId)) return undefined;
  return ESG_GRID_SECTIONS[sectionId];
}
