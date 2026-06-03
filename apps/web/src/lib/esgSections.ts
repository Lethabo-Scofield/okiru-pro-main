/** ESG workbook input sections — v1.7 sheet map. */

export type EsgSectionDef = {
  id: string;
  title: string;
  sheet: string;
  note?: string;
  toolkitPath: string;
  phase1: boolean;
};

export const ESG_INPUT_SECTIONS: EsgSectionDef[] = [
  {
    id: "assumptions",
    title: "Assumptions",
    sheet: "Assumptions",
    note: "Sector, stance floor (B9), thresholds",
    toolkitPath: "/assumptions",
    phase1: true,
  },
  {
    id: "e-data",
    title: "Environmental data",
    sheet: "E_Data",
    note: "9 monthly periods — diesel, electricity, water",
    toolkitPath: "/ghg",
    phase1: true,
  },
  {
    id: "s-data",
    title: "Social data",
    sheet: "S_Data",
    note: "EE headcount, LTIFR, WSP/ATR",
    toolkitPath: "/social",
    phase1: true,
  },
  {
    id: "g-data",
    title: "Governance data",
    sheet: "G_Data",
    note: "Column F: 0–5 maturity sliders",
    toolkitPath: "/governance",
    phase1: true,
  },
  {
    id: "ee",
    title: "EE Scorecard",
    sheet: "EE_Scorecard",
    toolkitPath: "/ee-scorecard",
    phase1: true,
  },
  {
    id: "fleet",
    title: "Fleet register",
    sheet: "Fleet_Register",
    toolkitPath: "/fleet",
    phase1: true,
  },
  {
    id: "waste",
    title: "Waste register",
    sheet: "Waste_Register",
    toolkitPath: "/waste",
    phase1: true,
  },
  {
    id: "driver-debrief",
    title: "Driver debrief",
    sheet: "Driver_Debrief",
    toolkitPath: "/social",
    phase1: true,
  },
  {
    id: "iso-tracker",
    title: "ISO tracker",
    sheet: "ISO_Tracker",
    toolkitPath: "/iso-tracker",
    phase1: true,
  },
  {
    id: "king5",
    title: "King V scorecard",
    sheet: "King5_Scorecard",
    toolkitPath: "/king5",
    phase1: true,
  },
  {
    id: "ifrs",
    title: "IFRS S1/S2",
    sheet: "IFRS_S1_S2",
    toolkitPath: "/ifrs",
    phase1: true,
  },
  {
    id: "garp",
    title: "GARP / GRAP",
    sheet: "GARP_GRAP",
    toolkitPath: "/garp",
    phase1: true,
  },
  {
    id: "saq",
    title: "SAQ supplier",
    sheet: "SAQ_Supplier",
    toolkitPath: "/saq",
    phase1: true,
  },
];

export const ESG_SECTION_IDS = ESG_INPUT_SECTIONS.map((s) => s.id);

export const ESG_PHASE1_SECTION_IDS = ESG_INPUT_SECTIONS.filter((s) => s.phase1).map(
  (s) => s.id,
);

export function esgSectionById(id: string): EsgSectionDef | undefined {
  return ESG_INPUT_SECTIONS.find((s) => s.id === id);
}
