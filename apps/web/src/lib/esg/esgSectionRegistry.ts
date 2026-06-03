/**
 * Data-driven ESG section registry — single map from workbook sheets → web sections.
 * Source of truth shapes: docs/esg/extracted/*.json + docs/esg/workbook_inventory.json
 */
import { ESG_INPUT_SECTIONS } from "./esgSections";
import { ESG_GRID_SECTIONS } from "./esgGridSections";

export type EsgRegistryBlock = {
  id: string;
  label: string;
  workbookRange: string;
  editor: "scalar" | "monthly-grid" | "headcount-grid" | "maturity-grid" | "register-grid" | "readonly";
  inputSectionKey?: string;
  subtabId?: string;
};

export type EsgRegistrySheet = {
  sheet: string;
  sheetIndex: number;
  type: "input" | "computed" | "reference";
  inputSectionKey?: string;
  toolkitPage?: string;
  blocks: EsgRegistryBlock[];
  status: "complete" | "partial" | "readonly";
};

/** E_Data sub-tabs — labels match workbook section headers (E_Data.json). */
export const E_DATA_SUBTABS: EsgRegistryBlock[] = [
  { id: "scope-1a", label: "SCOPE 1A — ROAD FREIGHT DIESEL", workbookRange: "A14:N18", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "scope-1a" },
  { id: "scope-1b", label: "SCOPE 1B — GENERATOR DIESEL", workbookRange: "A23:M27", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "scope-1b" },
  { id: "scope-1c", label: "SCOPE 1C — LPG FORKLIFTS", workbookRange: "A32:M32", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "scope-1c" },
  { id: "scope-1d", label: "SCOPE 1D — ROAD BUSINESS", workbookRange: "A37:M37", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "scope-1d" },
  { id: "scope-2", label: "SCOPE 2 — ELECTRICITY", workbookRange: "A41:N45", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "scope-2" },
  { id: "solar", label: "Solar PV (onsite generation)", workbookRange: "A50:M54", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "solar" },
  { id: "waste", label: "Waste to landfill / % recycled", workbookRange: "A67:M71", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "waste" },
  { id: "water", label: "Scope 3 — Water Consumption", workbookRange: "A58:M62", editor: "monthly-grid", inputSectionKey: "e-data", subtabId: "water" },
  { id: "ghg-summary", label: "GHG EMISSIONS SUMMARY", workbookRange: "A73:M86", editor: "readonly", inputSectionKey: "e-data", subtabId: "ghg-summary" },
  { id: "nz-targets", label: "NET-ZERO TARGETS (SBTi CNZS 2.0)", workbookRange: "A90:G90", editor: "scalar", inputSectionKey: "e-data", subtabId: "nz-targets" },
];

/** S_Data sub-tabs — labels from S_Data.json section headers. */
export const S_DATA_SUBTABS: EsgRegistryBlock[] = [
  { id: "headcount", label: "EMPLOYMENT EQUITY — HEADCOUNT (EEA2)", workbookRange: "A5:L11", editor: "headcount-grid", inputSectionKey: "s-data", subtabId: "headcount" },
  { id: "hs", label: "HEALTH & SAFETY", workbookRange: "A28:G35", editor: "scalar", inputSectionKey: "s-data", subtabId: "hs" },
  { id: "training", label: "WSP / ATR — WORKPLACE SKILLS PLAN", workbookRange: "A40:G55", editor: "scalar", inputSectionKey: "s-data", subtabId: "training" },
  { id: "payroll", label: "Leviable payroll & SDL", workbookRange: "B43:B71", editor: "scalar", inputSectionKey: "s-data", subtabId: "payroll" },
];

export const ESG_SECTION_REGISTRY: EsgRegistrySheet[] = [
  { sheet: "Cover", sheetIndex: 1, type: "input", inputSectionKey: "company-reporting-setup", toolkitPage: undefined, status: "complete", blocks: [{ id: "entity", label: "Entity & reporting period", workbookRange: "C5:C12", editor: "scalar", inputSectionKey: "company-reporting-setup" }] },
  { sheet: "Assumptions", sheetIndex: 2, type: "input", inputSectionKey: "assumptions", status: "complete", blocks: [{ id: "stance", label: "Stance, sector, thresholds", workbookRange: "B6:B112", editor: "scalar", inputSectionKey: "assumptions" }] },
  { sheet: "Audit_Log", sheetIndex: 3, type: "reference", status: "readonly", blocks: [{ id: "log", label: "Version change log", workbookRange: "A6:F30", editor: "readonly" }] },
  { sheet: "ESG_Dashboard", sheetIndex: 4, type: "computed", toolkitPage: "/", status: "complete", blocks: [{ id: "kpis", label: "Pillar scores & executive KPIs", workbookRange: "A4:M86", editor: "readonly", toolkitPage: "/" }] },
  { sheet: "E_Data", sheetIndex: 5, type: "input", inputSectionKey: "e-data", status: "complete", blocks: E_DATA_SUBTABS },
  { sheet: "Fleet_Register", sheetIndex: 6, type: "input", inputSectionKey: "fleet", status: "complete", blocks: [{ id: "vehicles", label: "Per-vehicle fuel norm", workbookRange: "A4:O33", editor: "register-grid", inputSectionKey: "fleet" }] },
  { sheet: "ISO_14083", sheetIndex: 7, type: "input", toolkitPage: "/iso-14083", status: "complete", blocks: [{ id: "trips", label: "Transport GHG per trip", workbookRange: "A4:O81", editor: "register-grid", toolkitPage: "/iso-14083" }] },
  { sheet: "Waste_Register", sheetIndex: 8, type: "input", inputSectionKey: "waste", status: "complete", blocks: [{ id: "streams", label: "Waste streams & diversion", workbookRange: "A4:J40", editor: "register-grid", inputSectionKey: "waste" }] },
  { sheet: "Driver_Debrief", sheetIndex: 9, type: "input", inputSectionKey: "driver-debrief", status: "complete", blocks: [{ id: "trips", label: "Per-trip driver debrief", workbookRange: "A3:M50", editor: "register-grid", inputSectionKey: "driver-debrief" }] },
  { sheet: "S_Data", sheetIndex: 10, type: "input", inputSectionKey: "s-data", status: "complete", blocks: [
    ...S_DATA_SUBTABS,
    { id: "csi", label: "COMMUNITY & SOCIAL INVESTMENT", workbookRange: "A70:F82", editor: "register-grid", inputSectionKey: "s-data-csi" },
    { id: "ofo", label: "OFO CODES — TRAINING INTERVENTIONS", workbookRange: "A57:F68", editor: "register-grid", inputSectionKey: "s-data-ofo" },
  ] },
  { sheet: "G_Data", sheetIndex: 11, type: "input", inputSectionKey: "g-data", status: "complete", blocks: [{ id: "maturity", label: "Board & governance (B + F cols)", workbookRange: "A5:F26", editor: "maturity-grid", inputSectionKey: "g-data" }] },
  { sheet: "EE_Scorecard", sheetIndex: 12, type: "input", inputSectionKey: "ee", status: "complete", blocks: [{ id: "ee-indicators", label: "EE indicator scorecard", workbookRange: "A5:H25", editor: "maturity-grid", inputSectionKey: "ee" }] },
  { sheet: "E_Scorecard", sheetIndex: 13, type: "computed", toolkitPage: "/environmental", status: "complete", blocks: [{ id: "e-rows", label: "Environmental scoring rows", workbookRange: "A5:I29", editor: "readonly", toolkitPage: "/environmental" }] },
  { sheet: "S_Scorecard", sheetIndex: 14, type: "computed", toolkitPage: "/social", status: "complete", blocks: [{ id: "s-rows", label: "Social scoring rows", workbookRange: "A5:I27", editor: "readonly", toolkitPage: "/social" }] },
  { sheet: "G_Scorecard", sheetIndex: 15, type: "computed", toolkitPage: "/governance", status: "complete", blocks: [{ id: "g-rows", label: "Governance scoring rows", workbookRange: "A5:I25", editor: "readonly", toolkitPage: "/governance" }] },
  { sheet: "King5_Scorecard", sheetIndex: 16, type: "input", inputSectionKey: "king5", status: "complete", blocks: [{ id: "principles", label: "17 King V principles", workbookRange: "B4:I20", editor: "register-grid", inputSectionKey: "king5" }] },
  { sheet: "IFRS_S1_S2", sheetIndex: 17, type: "input", inputSectionKey: "ifrs", status: "complete", blocks: [{ id: "disclosures", label: "IFRS S1/S2 disclosures", workbookRange: "A5:H30", editor: "register-grid", inputSectionKey: "ifrs" }] },
  { sheet: "GARP_GRAP", sheetIndex: 18, type: "input", inputSectionKey: "garp", status: "complete", blocks: [{ id: "risks", label: "ESG risk register", workbookRange: "A5:K30", editor: "register-grid", inputSectionKey: "garp" }] },
  { sheet: "ISO_Tracker", sheetIndex: 19, type: "input", inputSectionKey: "iso-tracker", status: "complete", blocks: [{ id: "clauses", label: "ISO clause tracker (~60 rows)", workbookRange: "B5:I62", editor: "register-grid", inputSectionKey: "iso-tracker" }] },
  { sheet: "SAQ_Supplier", sheetIndex: 20, type: "input", inputSectionKey: "saq", status: "complete", blocks: [{ id: "suppliers", label: "Supplier self-assessment", workbookRange: "A5:K40", editor: "register-grid", inputSectionKey: "saq" }] },
  { sheet: "NetZero_Roadmap", sheetIndex: 21, type: "computed", toolkitPage: "/net-zero", status: "complete", blocks: [{ id: "pathway", label: "Decarbonisation pathway", workbookRange: "A4:M27", editor: "readonly", toolkitPage: "/net-zero" }] },
  { sheet: "B_BBEE_ESG", sheetIndex: 22, type: "computed", toolkitPage: "/bbbee-bridge", status: "complete", blocks: [{ id: "bridge", label: "Generic Code bridge", workbookRange: "A5:F25", editor: "readonly", toolkitPage: "/bbbee-bridge" }] },
  { sheet: "Materiality_Matrix", sheetIndex: 23, type: "computed", status: "readonly", blocks: [{ id: "matrix", label: "Double materiality topics", workbookRange: "A5:G31", editor: "readonly" }] },
  { sheet: "Carbon_Tax", sheetIndex: 24, type: "computed", toolkitPage: "/carbon-tax", status: "complete", blocks: [{ id: "liability", label: "SA Carbon Tax liability", workbookRange: "A5:F19", editor: "readonly", toolkitPage: "/carbon-tax" }] },
  { sheet: "Standards_Map", sheetIndex: 25, type: "reference", status: "readonly", blocks: [{ id: "map", label: "Standards crosswalk", workbookRange: "A3:I37", editor: "readonly" }] },
  { sheet: "Glossary", sheetIndex: 26, type: "reference", status: "readonly", blocks: [{ id: "terms", label: "101 technical definitions", workbookRange: "A3:E101", editor: "readonly" }] },
  { sheet: "Validation", sheetIndex: 27, type: "computed", status: "complete", blocks: [{ id: "checks", label: "Completeness checks", workbookRange: "A4:E32", editor: "readonly" }] },
  { sheet: "Data_Status", sheetIndex: 28, type: "reference", status: "partial", blocks: [{ id: "status", label: "Field completion tracker", workbookRange: "A4:F50", editor: "readonly" }] },
];

export function registryBySheet(sheet: string): EsgRegistrySheet | undefined {
  return ESG_SECTION_REGISTRY.find((s) => s.sheet === sheet);
}

export function registryByInputSection(sectionId: string): EsgRegistryBlock[] {
  const sheet = ESG_SECTION_REGISTRY.find((s) => s.inputSectionKey === sectionId);
  if (sheet) return sheet.blocks;
  if (sectionId === "e-data") return E_DATA_SUBTABS;
  if (sectionId === "s-data") return S_DATA_SUBTABS;
  const grid = ESG_GRID_SECTIONS[sectionId as keyof typeof ESG_GRID_SECTIONS];
  if (grid) {
    return [{ id: sectionId, label: grid.description, workbookRange: `row ${grid.startRow}+`, editor: "register-grid", inputSectionKey: sectionId }];
  }
  const input = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId);
  if (input) {
    return [{ id: sectionId, label: input.title, workbookRange: input.sheet, editor: (input.editorType ?? "scalar") as EsgRegistryBlock["editor"], inputSectionKey: sectionId }];
  }
  return [];
}

export function parityStats(): { total: number; complete: number; partial: number; readonly: number; pct: number } {
  const total = ESG_SECTION_REGISTRY.length;
  const complete = ESG_SECTION_REGISTRY.filter((s) => s.status === "complete").length;
  const partial = ESG_SECTION_REGISTRY.filter((s) => s.status === "partial").length;
  const readonly = ESG_SECTION_REGISTRY.filter((s) => s.status === "readonly").length;
  return { total, complete, partial, readonly, pct: Math.round((complete / total) * 100) };
}
