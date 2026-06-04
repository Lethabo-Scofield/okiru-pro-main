/** ESG workbook input sections — v1.7 sheet map (input layer only). */

export type EsgEditorType =
  | "scalar"
  | "monthly-grid"
  | "headcount-grid"
  | "maturity-grid"
  | "register-grid"
  | "subtab";

export type EsgSectionDef = {
  id: string;
  title: string;
  sheet: string;
  note?: string;
  phase1: boolean;
  editorType?: EsgEditorType;
};

export const ESG_INPUT_SECTIONS: EsgSectionDef[] = [
  {
    id: "company-reporting-setup",
    title: "Company & Reporting Setup",
    sheet: "Cover",
    note: "Entity, reporting period, sector",
    phase1: true,
    editorType: "scalar",
  },
  {
    id: "assumptions",
    title: "Assumptions",
    sheet: "Assumptions",
    note: "Sector, scoring stance, Science Based Targets initiative (SBTi) net-zero year, threshold registry (THR_* codes)",
    phase1: true,
    editorType: "scalar",
  },
  {
    id: "e-data",
    title: "Environmental data",
    sheet: "E_Data",
    note: "9 monthly periods — diesel, electricity, water",
    phase1: true,
    editorType: "subtab",
  },
  {
    id: "s-data",
    title: "Social data",
    sheet: "S_Data",
    note: "EE headcount, H&S metrics, WSP/ATR",
    phase1: true,
    editorType: "subtab",
  },
  {
    id: "s-data-ofo",
    title: "Training OFO codes",
    sheet: "S_Data",
    note: "WSP/ATR OFO code training interventions (S_Data rows 57–68)",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "s-data-csi",
    title: "CSI / Community",
    sheet: "S_Data",
    note: "Community & Social Investment register (S_Data rows 70–82)",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "g-data",
    title: "Governance data",
    sheet: "G_Data",
    note: "Column F: 0–5 maturity sliders",
    phase1: true,
    editorType: "maturity-grid",
  },
  {
    id: "ee",
    title: "EE Scorecard",
    sheet: "EE_Scorecard",
    phase1: true,
    editorType: "maturity-grid",
  },
  {
    id: "fleet",
    title: "Fleet register",
    sheet: "Fleet_Register",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "waste",
    title: "Waste register",
    sheet: "Waste_Register",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "driver-debrief",
    title: "Driver debrief",
    sheet: "Driver_Debrief",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "iso-tracker",
    title: "ISO tracker",
    sheet: "ISO_Tracker",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "king5",
    title: "King V scorecard",
    sheet: "King5_Scorecard",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "ifrs",
    title: "IFRS S1/S2",
    sheet: "IFRS_S1_S2",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "garp",
    title: "GARP / GRAP",
    sheet: "GARP_GRAP",
    phase1: true,
    editorType: "register-grid",
  },
  {
    id: "saq",
    title: "SAQ supplier",
    sheet: "SAQ_Supplier",
    phase1: true,
    editorType: "register-grid",
  },
];

export const ESG_SECTION_IDS = ESG_INPUT_SECTIONS.map((s) => s.id);

export const ESG_PHASE1_SECTION_IDS = ESG_INPUT_SECTIONS.filter((s) => s.phase1).map(
  (s) => s.id,
);

export function esgSectionById(id: string): EsgSectionDef | undefined {
  return ESG_INPUT_SECTIONS.find((s) => s.id === id);
}
