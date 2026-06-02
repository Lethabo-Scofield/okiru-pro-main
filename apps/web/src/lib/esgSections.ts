/** ESG workbook input sections — Phase 1 (Assumptions + E/S/G data sheets). */

export type EsgSectionDef = {
  id: string;
  title: string;
  sheet: string;
  note?: string;
  /** Phase 1: persisted via esgWorkbookStorage */
  phase1: boolean;
};

export const ESG_INPUT_SECTIONS: EsgSectionDef[] = [
  {
    id: "assumptions",
    title: "Assumptions",
    sheet: "Assumptions",
    note: "Sector locked — Transport / FMCG Distribution (v1.7 instance)",
    phase1: true,
  },
  {
    id: "e-data",
    title: "Environmental data",
    sheet: "E_Data",
    note: "Fleet diesel, electricity, water — GHG totals",
    phase1: true,
  },
  {
    id: "s-data",
    title: "Social data",
    sheet: "S_Data",
    note: "EE headcount (L12), LTIFR (G35)",
    phase1: true,
  },
  {
    id: "g-data",
    title: "Governance data",
    sheet: "G_Data",
    note: "Column F: 0–5 maturity sliders",
    phase1: true,
  },
  {
    id: "ee",
    title: "EE Scorecard",
    sheet: "EE_Scorecard",
    phase1: false,
  },
  {
    id: "fleet",
    title: "Fleet register",
    sheet: "Fleet_Register",
    phase1: false,
  },
  {
    id: "waste",
    title: "Waste register",
    sheet: "Waste_Register",
    phase1: false,
  },
];

export const ESG_PHASE1_SECTION_IDS = ESG_INPUT_SECTIONS.filter((s) => s.phase1).map(
  (s) => s.id,
);
