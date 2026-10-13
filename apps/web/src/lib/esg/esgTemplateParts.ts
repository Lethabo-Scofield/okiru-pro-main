/**
 * The ESG template, in parts (C3).
 *
 * A fifteen-sheet workbook is the wrong thing to send the fleet manager, who
 * owns one register in it, or the HR officer, who owns the social sheets. So
 * the template downloads as the whole workbook, as one pillar, or as one sheet,
 * and every part imports back on its own. An import merges into what is
 * already captured, so a part fills in the sheets it carries and leaves the
 * rest of the workbook as it is.
 *
 * A part is a set of SHEETS, not sections. `S_Data` carries three sections —
 * the social figures, the OFO training register and the CSI register — and
 * they share that sheet in the client's own v1.7 workbook too, so the sheet is
 * the unit a person is handed.
 *
 * Pure data: the menu bundles it, the route checks `?part=` against it, and
 * the template builder turns a part into sheets. No `xlsx` here, on purpose.
 */

export type EsgTemplateSheet =
  | "Cover"
  | "Assumptions"
  | "E_Data"
  | "S_Data"
  | "G_Data"
  | "EE_Scorecard"
  | "Waste_Register"
  | "Fleet_Register"
  | "Driver_Debrief"
  | "ISO_Tracker"
  | "King5_Scorecard"
  | "IFRS_S1_S2"
  | "GARP_GRAP"
  | "SAQ_Supplier";

export interface EsgTemplateSheetPart {
  /** The `?part=` value: the input section the sheet is named for. */
  id: string;
  sheet: EsgTemplateSheet;
  title: string;
  /** What the sheet collects, in a line — the menu and the Instructions sheet both say it. */
  collects: string;
}

export type EsgTemplateGroupId = "setup" | "environmental" | "social" | "governance";

export interface EsgTemplateGroup {
  id: EsgTemplateGroupId;
  title: string;
  sheets: readonly EsgTemplateSheetPart[];
}

/**
 * Which pillar each sheet belongs to is where its figures SCORE, read from the
 * indicator specs in `esgIndicatorCoverage.ts`: the ISO tracker feeds the
 * environmental management indicators, the driver debrief the social driver
 * fatigue one, the supplier self-assessment the social supply-chain ones.
 * Cover and Assumptions score nowhere; they set the company up.
 */
export const ESG_TEMPLATE_GROUPS: readonly EsgTemplateGroup[] = [
  {
    id: "setup",
    title: "Company setup",
    sheets: [
      {
        id: "company-reporting-setup",
        sheet: "Cover",
        title: "Company & reporting setup",
        collects: "Entity, reporting period, organisational boundary, sector, baseline year",
      },
      {
        id: "assumptions",
        sheet: "Assumptions",
        title: "Assumptions",
        collects: "Scoring stance, reporting standard and the scoring thresholds",
      },
    ],
  },
  {
    id: "environmental",
    title: "Environmental",
    sheets: [
      {
        id: "e-data",
        sheet: "E_Data",
        title: "Energy, fuel and water",
        collects: "Monthly diesel, electricity, solar and water by site; annual GHG totals",
      },
      { id: "fleet", sheet: "Fleet_Register", title: "Fleet register", collects: "One row per vehicle" },
      {
        id: "waste",
        sheet: "Waste_Register",
        title: "Waste register",
        collects: "One row per waste stream per month, plus the annual totals",
      },
      { id: "iso-tracker", sheet: "ISO_Tracker", title: "ISO 14001 tracker", collects: "ISO 14001 clause-by-clause status" },
    ],
  },
  {
    id: "social",
    title: "Social",
    sheets: [
      {
        id: "s-data",
        sheet: "S_Data",
        title: "People, safety and training",
        collects: "Headcount, health and safety, training, payroll, OFO codes, CSI",
      },
      { id: "ee", sheet: "EE_Scorecard", title: "Employment equity", collects: "Employment equity" },
      { id: "driver-debrief", sheet: "Driver_Debrief", title: "Driver debrief", collects: "One row per trip" },
      {
        id: "saq",
        sheet: "SAQ_Supplier",
        title: "Supplier self-assessment",
        collects: "Supplier self-assessment, 1-5 per criterion",
      },
    ],
  },
  {
    id: "governance",
    title: "Governance",
    sheets: [
      {
        id: "g-data",
        sheet: "G_Data",
        title: "Governance data",
        collects: "Governance maturity, board composition, penalties, policies",
      },
      { id: "king5", sheet: "King5_Scorecard", title: "King V principles", collects: "The 17 King V principles" },
      { id: "ifrs", sheet: "IFRS_S1_S2", title: "IFRS S1 / S2", collects: "IFRS S1/S2 disclosure readiness" },
      { id: "garp", sheet: "GARP_GRAP", title: "Risk register (GARP / GRAP)", collects: "ESG risk register" },
    ],
  },
];

/** What one download carries. */
export interface EsgTemplatePart {
  /** `all`, a group id, or a sheet part id. */
  id: string;
  title: string;
  sheets: readonly EsgTemplateSheetPart[];
  fileName: string;
}

export const ESG_TEMPLATE_WHOLE = "all";

const ALL_SHEETS = ESG_TEMPLATE_GROUPS.flatMap((g) => g.sheets);

/**
 * The part a `?part=` value names, or null for one that names nothing.
 *
 * No value is the whole workbook — the link every existing button and bookmark
 * already holds — and it keeps the file name those people already have.
 */
export function esgTemplatePart(id?: string | null): EsgTemplatePart | null {
  if (id == null || id === "" || id === ESG_TEMPLATE_WHOLE) {
    return {
      id: ESG_TEMPLATE_WHOLE,
      title: "The whole workbook",
      sheets: ALL_SHEETS,
      fileName: "esg-bulk-input-template.xlsx",
    };
  }
  const group = ESG_TEMPLATE_GROUPS.find((g) => g.id === id);
  if (group) {
    return { id, title: group.title, sheets: group.sheets, fileName: `esg-template-${id}.xlsx` };
  }
  const sheet = ALL_SHEETS.find((s) => s.id === id);
  if (sheet) {
    return { id, title: sheet.title, sheets: [sheet], fileName: `esg-template-${id}.xlsx` };
  }
  return null;
}

/** The download link for a part; the whole workbook keeps its bare URL. */
export function esgTemplateHref(apiBase: string, partId?: string): string {
  const base = `${apiBase}/api/esg/workbook/template`;
  return partId && partId !== ESG_TEMPLATE_WHOLE ? `${base}?part=${encodeURIComponent(partId)}` : base;
}
