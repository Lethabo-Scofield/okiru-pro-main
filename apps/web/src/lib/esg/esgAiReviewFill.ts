/**
 * The ESG workbook's AI review: values it can put into blank cells, each with
 * its reason and its evidence, applied on the user's click and undoable.
 *
 * This is the B-BBEE review's contract (`aiReviewFill.ts`) on the ESG
 * workbook's own shape. ESG sections are a flat cells map, not rows, so a fill
 * is keyed `section!cell` — `e-data!s2_D15`, `fleet!B6`, `g-data!B15` — the
 * same key the provenance record uses.
 *
 * THE RULES IT KEEPS
 *
 *  - Every fill is READ (another cell, the company record or a document states
 *    it) or DERIVED (re-runnable arithmetic on named cells). Derived is never
 *    shown as read, and every fill carries its evidence.
 *  - Only blank cells are filled. A value the user typed is never overwritten,
 *    and neither is a value the user put over an earlier fill. A cell the
 *    formula layer (`esgDeriveSummary`) computes is never written either:
 *    a stored value would freeze a figure the tool keeps current. That is why
 *    the headcount totals, the fleet vehicle and EV counts, the SDL levy and
 *    every GHG and LTIFR figure are left to the calculators.
 *  - Arithmetic stays inside one unit family (kWh/MWh, L/kL, kg/t, tCO₂e,
 *    Rand, hours, counts, whole percentages, fractions, km). A ×1000 between
 *    kWh and MWh, L and kL or kg and t is allowed only when it is stated on the
 *    card; litres or kWh never become tCO₂e here.
 *  - Every applied fill leaves a mark in the `ai-fills` sidecar section. The
 *    mark counts only while the cell still equals the filled value (the same
 *    rule `stillAsPlaced` applies to provenance): once the user edits the cell,
 *    the value is theirs. An undone value goes to `ai-declined` and is never
 *    proposed again.
 *  - Anything the workbook cannot support stays empty and becomes a one-line
 *    question.
 *
 * Pure: workbook in, proposals and section patches out. The browser runs the
 * rules and applies; the server verifies the model's answers with the same
 * checks (`esgAiReviewModel.ts`).
 */
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  E_DATA_ENERGY_BASELINE_FIELDS,
  E_DATA_GHG_SUMMARY_FIELDS,
  E_DATA_NZ_FIELDS,
  E_DATA_SCOPE_FIELDS,
  E_DATA_WATER_INITIATIVE_FIELDS,
  EE_MATURITY_ROWS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HEADCOUNT_FIELDS,
  S_DATA_HS_FIELDS,
  S_DATA_PAYROLL_FIELDS,
  S_DATA_TRAINING_FIELDS,
  WASTE_SCALAR_FIELDS,
} from "@/components/esg-workbook/esgSectionConfigs";
import { esgWorkbookAxes, type EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import { ESG_INPUT_SECTIONS } from "./esgSections";
import {
  ESG_GRID_SECTIONS,
  esgGridColumnsOnAxes,
  isEsgGridSection,
  type EsgGridSectionId,
} from "./esgGridSections";
import { mergeEsgSectionCells, readEsgGridRows, refFor } from "./esgGridRows";
import { hydrateEsgSectionCells } from "./esgSheetStructure";
import { isEsgDerivedCell, esgSiteMatch } from "./esgParserFieldBridge";
import { readProvenance, stillAsPlaced, type EsgPlacementRecord } from "./esgProvenance";
import { deriveEsgSummaryCells } from "./esgDeriveSummary";
import type { EsgWorkbookData } from "./esgWorkbookStorage";

/* ------------------------------------------------------------------ *
 * Sidecar sections
 * ------------------------------------------------------------------ */

/** `section!cell` → the mark of an applied fill (JSON). */
export const ESG_AI_FILLS_SECTION = "ai-fills";
/** `section!cell` → a value the user undid. Never proposed again. */
export const ESG_AI_DECLINED_SECTION = "ai-declined";
/** `section!cell` → the documents' rival values for a cell they disagree on (JSON). */
export const ESG_DISPUTES_SECTION = "disputes";

/**
 * Sections that describe the workbook rather than hold its figures. Never
 * exported, never scored, never shown as a page.
 */
export const ESG_REVIEW_SIDECAR_SECTIONS = [
  ESG_AI_FILLS_SECTION,
  ESG_AI_DECLINED_SECTION,
  ESG_DISPUTES_SECTION,
] as const;

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type EsgCellValue = string | number | boolean | null;
export type EsgCells = Record<string, EsgCellValue>;

/** The workbook as every reader here takes it. */
export interface EsgWorkbookLike {
  sections?: Record<string, { cells?: Record<string, unknown> } | undefined>;
}

export type EsgFillKind = "read" | "derived";
export type EsgFillOrigin = "rules" | "model";

export type EsgFillEvidence =
  | {
      type: "cell";
      section: string;
      cell: string;
      /** "Environmental data · Electricity · CPT · Aug-25". */
      label: string;
      value: string;
      /** Documents that placed the cell, from provenance. */
      files?: string[];
    }
  | {
      type: "document";
      file: string;
      /** What the document says, in a few words: `states "Yes"`. */
      detail?: string;
      /** Verbatim words from the document's stored text. */
      quote?: string;
      page?: number | null;
    }
  /** A fact the company record holds (its name). */
  | { type: "record"; label: string; value: string }
  /** "+12 more rows" — kept short so a mark fits in one cell. */
  | { type: "note"; text: string };

export interface EsgFillProposal {
  /** Stable for the same cell. */
  id: string;
  section: string;
  cell: string;
  /** `section!cell`. */
  key: string;
  sectionLabel: string;
  /** Where the cell is, in words — never a raw cell reference. */
  cellLabel: string;
  /** The value to write, as text. Coerced to the cell's type on apply. */
  value: string;
  kind: EsgFillKind;
  /** "sum", "difference", "percent", "source", "copy", "classify", "site", "policy", "stated", "units". */
  rule?: string;
  /** One or two plain sentences: why this value. */
  reasoning: string;
  evidence: EsgFillEvidence[];
  /** A stated unit conversion, shown on the card ("0.79 kL = 790 L (×1000)"). */
  conversion?: string;
  /** The unit the value is in, for the card. */
  unit?: string;
  origin: EsgFillOrigin;
}

/** A cell nothing backs: left empty, one question. */
export interface EsgFillQuestion {
  id: string;
  section?: string;
  cell?: string;
  key?: string;
  cellLabel: string;
  question: string;
  origin: EsgFillOrigin;
}

/** What an applied fill leaves in `ai-fills`, as JSON. */
export interface EsgAiFillMark {
  v: string;
  kind: EsgFillKind;
  rule?: string;
  reason: string;
  evidence: EsgFillEvidence[];
  conversion?: string;
  /** What the cell held before. Null = blank. */
  replaced: EsgCellValue;
  origin: EsgFillOrigin;
  at: string;
}

/** The rival values documents gave for one cell, as `disputes` stores them. */
export interface EsgCellDispute {
  label?: string;
  candidates: Array<{ value: unknown; sources: string[]; unit?: string }>;
}

/** Whole sections to save, as the ordinary section save takes them. */
export type EsgSectionPatches = Record<string, EsgCells>;

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

export type EsgUnitFamily =
  | "energy"
  | "volume"
  | "mass"
  | "tco2e"
  | "rand"
  | "hours"
  | "count"
  | "percent"
  | "fraction"
  | "km"
  | "other";

export interface EsgUnit {
  family: EsgUnitFamily;
  /** Multiple of the family's base unit: kWh, L, kg. MWh, kL and t are 1000. */
  scale: number;
  symbol: string;
}

const unit = (family: EsgUnitFamily, scale: number, symbol: string): EsgUnit => ({ family, scale, symbol });

export const ESG_UNITS = {
  kWh: unit("energy", 1, "kWh"),
  MWh: unit("energy", 1000, "MWh"),
  L: unit("volume", 1, "L"),
  kL: unit("volume", 1000, "kL"),
  kg: unit("mass", 1, "kg"),
  t: unit("mass", 1000, "t"),
  tCO2e: unit("tco2e", 1, "tCO₂e"),
  R: unit("rand", 1, "R"),
  hours: unit("hours", 1, "hours"),
  count: unit("count", 1, ""),
  percent: unit("percent", 1, "%"),
  fraction: unit("fraction", 1, "fraction"),
  km: unit("km", 1, "km"),
  other: unit("other", 1, ""),
} as const;

/** Families a ×1000 may cross, when the card says so. */
const SCALED_FAMILIES: ReadonlySet<EsgUnitFamily> = new Set<EsgUnitFamily>(["energy", "volume", "mass"]);

/** 12345.6 → "12 345.6": a space between thousands and a decimal point, whatever the locale. */
export function formatEsgNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const [whole, fraction] = String(Math.round(n * 1e6) / 1e6).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits}${fraction ? `.${fraction}` : ""}`;
}

const fmt = formatEsgNumber;

/**
 * `value` in `from`, written in `to`. Null when no honest conversion exists:
 * a different family (litres are never kWh, never tCO₂e), or anything a factor
 * would be needed for. The returned `conversion` is the sentence the card shows.
 */
export function esgConvert(
  value: number,
  from: EsgUnit,
  to: EsgUnit,
): { value: number; conversion?: string } | null {
  if (!Number.isFinite(value)) return null;
  if (from.family === to.family) {
    if (from.scale === to.scale) return { value };
    if (!SCALED_FAMILIES.has(from.family)) return null;
    const out = (value * from.scale) / to.scale;
    const ratio = from.scale > to.scale ? `×${from.scale / to.scale}` : `÷${to.scale / from.scale}`;
    return { value: out, conversion: `${fmt(value)} ${from.symbol} = ${fmt(out)} ${to.symbol} (${ratio})` };
  }
  if (from.family === "percent" && to.family === "fraction") {
    const out = value / 100;
    return { value: out, conversion: `${fmt(value)}% = ${fmt(out)} as a fraction (÷100)` };
  }
  if (from.family === "fraction" && to.family === "percent") {
    const out = value * 100;
    return { value: out, conversion: `${fmt(value)} as a fraction = ${fmt(out)}% (×100)` };
  }
  return null;
}

/** The unit a free-text unit name means: "kilolitres" → kL. Null when unknown. */
export function esgUnitFromName(name: unknown): EsgUnit | null {
  const text = String(name ?? "").trim();
  if (!text) return null;
  const exact: Record<string, EsgUnit> = {
    kwh: ESG_UNITS.kWh,
    mwh: ESG_UNITS.MWh,
    l: ESG_UNITS.L,
    kl: ESG_UNITS.kL,
    kg: ESG_UNITS.kg,
    t: ESG_UNITS.t,
    tco2e: ESG_UNITS.tCO2e,
    "tco₂e": ESG_UNITS.tCO2e,
    r: ESG_UNITS.R,
    zar: ESG_UNITS.R,
    "%": ESG_UNITS.percent,
    km: ESG_UNITS.km,
  };
  const named = exact[text.toLowerCase()];
  if (named) return named;
  const hit = esgUnitTokensIn(text);
  return hit.length > 0 ? hit[0] : null;
}

/**
 * Every unit a piece of text names, strongest first. tCO₂e is tested before
 * tonnes, MWh before kWh, kilolitres before litres.
 */
export function esgUnitTokensIn(text: string): EsgUnit[] {
  const t = ` ${text.replace(/₂/g, "2")} `;
  const found: EsgUnit[] = [];
  const add = (u: EsgUnit) => {
    if (!found.includes(u)) found.push(u);
  };
  if (/\bt\s?co2e?\b|\btonnes?\s+(of\s+)?co2/i.test(t)) add(ESG_UNITS.tCO2e);
  if (/\bmwh\b/i.test(t)) add(ESG_UNITS.MWh);
  if (/\bkwh\b/i.test(t)) add(ESG_UNITS.kWh);
  if (/\bkilo\s?lit(re|er)s?\b|\bkl\b/i.test(t)) add(ESG_UNITS.kL);
  if (/\blit(re|er)s?\b|\bltrs?\b|\d\s?l\b|\(l\)/i.test(t.replace(/\bkilo\s?lit(re|er)s?\b/gi, ""))) add(ESG_UNITS.L);
  if (/\bkg\b|\bkilograms?\b/i.test(t)) add(ESG_UNITS.kg);
  if (/\btonnes?\b|\btons?\b|\d\s?t\b/i.test(t.replace(/\bt\s?co2e?\b|\btonnes?\s+(of\s+)?co2e?/gi, ""))) add(ESG_UNITS.t);
  if (/\bR\s?\d|\bZAR\b|\brands?\b|\(R\)/.test(t)) add(ESG_UNITS.R);
  if (/%|\bper\s?cent\b/i.test(t)) add(ESG_UNITS.percent);
  if (/\bhours?\b|\bhrs\b/i.test(t)) add(ESG_UNITS.hours);
  if (/\bkm\b|\bkilomet(re|er)s?\b/i.test(t) && !/l\/100\s?km/i.test(t)) add(ESG_UNITS.km);
  return found;
}

/** The unit a number column's label names. A rate (L/100km) is "other". */
export function esgUnitFromLabel(label: string, type: string): EsgUnit {
  if (type !== "number") return ESG_UNITS.other;
  if (/l\/100/i.test(label)) return ESG_UNITS.other;
  const tokens = esgUnitTokensIn(label);
  if (tokens.length > 0) return tokens[0];
  if (/\(#\)|count|number of|headcount|employees|members|meetings|learners|beneficiaries|penalties|vehicles|accidents|\bLTI\b|\bMTI\b|first aid|near miss|fatalities|fatigue|suppliers|risks/i.test(label)) {
    return ESG_UNITS.count;
  }
  return ESG_UNITS.other;
}

/* ------------------------------------------------------------------ *
 * What a cell is
 * ------------------------------------------------------------------ */

/** The E_Data monthly grids: what each measures and in what unit it stores. */
export const ESG_MONTHLY_GRIDS: Readonly<Record<string, { measure: string; unit: EsgUnit; perSite: boolean }>> = {
  s1a: { measure: "Fleet diesel", unit: ESG_UNITS.L, perSite: true },
  s1b: { measure: "Generator diesel", unit: ESG_UNITS.L, perSite: true },
  s1c: { measure: "LPG", unit: ESG_UNITS.kg, perSite: false },
  s1d: { measure: "Business car fuel", unit: ESG_UNITS.L, perSite: false },
  s2: { measure: "Electricity", unit: ESG_UNITS.kWh, perSite: true },
  solar: { measure: "Solar generation", unit: ESG_UNITS.kWh, perSite: true },
  water: { measure: "Water", unit: ESG_UNITS.kL, perSite: true },
  waste: { measure: "Waste recycled", unit: ESG_UNITS.percent, perSite: false },
};

type FieldLike = { cell: string; label: string; type?: string; kind?: string; options?: string[] };

/** Scalar inputs per section, from the editor's own field lists. */
const SCALAR_FIELDS: Record<string, FieldLike[]> = {
  "company-reporting-setup": COVER_FIELDS,
  assumptions: ASSUMPTIONS_FIELDS,
  "e-data": [
    ...E_DATA_SCOPE_FIELDS,
    ...E_DATA_GHG_SUMMARY_FIELDS,
    ...E_DATA_NZ_FIELDS,
    ...E_DATA_ENERGY_BASELINE_FIELDS,
    ...E_DATA_WATER_INITIATIVE_FIELDS,
    ...WASTE_SCALAR_FIELDS,
  ],
  "s-data": [...S_DATA_HEADCOUNT_FIELDS, ...S_DATA_HS_FIELDS, ...S_DATA_TRAINING_FIELDS, ...S_DATA_PAYROLL_FIELDS],
  "g-data": G_DATA_MATURITY_ROWS.map((r) => ({
    cell: r.cell,
    label: r.label,
    type: r.kind === "yn" ? "select" : "number",
    options: r.kind === "yn" ? r.options ?? ["Yes", "Partial", "No"] : undefined,
  })),
  ee: EE_MATURITY_ROWS.map((r) => ({
    cell: r.cell,
    label: r.label,
    type: r.kind === "yn" ? "select" : "number",
    options: r.kind === "yn" ? r.options ?? ["Yes", "Partial", "No"] : undefined,
  })),
};

/**
 * Cells whose stored scale is not what the label suggests. The governance
 * board shares are fractions (0.6, not 60); the training shares are whole
 * percentages (45, not 0.45).
 */
const UNIT_OVERRIDES: Record<string, EsgUnit> = {
  "g-data!B8": ESG_UNITS.fraction,
  "g-data!B9": ESG_UNITS.fraction,
  "ee!B5": ESG_UNITS.fraction,
  "ee!B8": ESG_UNITS.fraction,
  "s-data!B51": ESG_UNITS.percent,
  "s-data!B52": ESG_UNITS.percent,
  "s-data!B53": ESG_UNITS.percent,
  "s-data!B54": ESG_UNITS.percent,
  "s-data!B55": ESG_UNITS.percent,
  "g-data!B25": ESG_UNITS.count,
  "g-data!B5": ESG_UNITS.count,
  "g-data!B6": ESG_UNITS.count,
  "g-data!B7": ESG_UNITS.count,
  "g-data!B10": ESG_UNITS.count,
  "g-data!B11": ESG_UNITS.count,
};

/**
 * Cells that are the client's decision, not a fill: the sector, the
 * organisational boundary, the base and target years, the reporting axes, the
 * scoring settings and every emission factor. The review asks; it never writes
 * them.
 */
function isDecisionCell(section: string, cell: string): boolean {
  if (cell.startsWith("_")) return true;
  if (section === "assumptions") return true;
  if (section === "company-reporting-setup") return cell !== "entity";
  if (section === "e-data") {
    if (/^e(Scope|Sites|FirstMonth|MonthCount)$/.test(cell)) return true;
    // B4…B10: the emission factors. A factor is never a fill.
    if (/^B([1-9]|10)$/.test(cell)) return true;
    // The net-zero baseline and the on-track judgement are the company's.
    if (cell === "B90" || cell === "G90") return true;
  }
  return false;
}

export interface EsgCellInfo {
  section: string;
  cell: string;
  key: string;
  sectionLabel: string;
  /** Section · row · column, in words. */
  label: string;
  type: "number" | "text" | "select" | "date";
  options?: string[];
  unit: EsgUnit;
  /** Computed by the formula layer or the sheet — never a fill. */
  derived: boolean;
  /** The client's decision — never a fill. */
  decision: boolean;
  where:
    | { kind: "monthly"; prefix: string; row: number; monthIndex: number; month: string; site: string }
    | { kind: "source"; prefix: string; row: number; site: string }
    | { kind: "register"; rowIndex: number; column: string; handle: string }
    | { kind: "scalar" }
    | { kind: "headcount"; level: number; group: number };
}

export const esgCellKey = (section: string, cell: string): string => `${section}!${cell}`;

export function splitEsgCellKey(key: string): { section: string; cell: string } | null {
  const bang = key.indexOf("!");
  if (bang <= 0 || bang === key.length - 1) return null;
  return { section: key.slice(0, bang), cell: key.slice(bang + 1) };
}

export function esgSectionLabel(section: string): string {
  return ESG_INPUT_SECTIONS.find((s) => s.id === section)?.title ?? section;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

export const isBlankEsgCell = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[\s, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Two cell values that say the same thing: numbers as numbers, text ignoring case. */
export function sameEsgValue(a: unknown, b: unknown): boolean {
  if (isBlankEsgCell(a) && isBlankEsgCell(b)) return true;
  if (isBlankEsgCell(a) || isBlankEsgCell(b)) return false;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) <= Math.max(1e-9, Math.abs(nb) * 1e-9);
  return str(a).toLowerCase() === str(b).toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Reading the workbook
 * ------------------------------------------------------------------ */

/** Caches keyed by the stored objects themselves; nothing here mutates them. */
const hydratedCache = new WeakMap<object, Record<string, unknown>>();
const flatCache = new WeakMap<object, Record<string, unknown>>();
const rowsCache = new WeakMap<object, Array<Record<string, unknown>>>();
const derivedCache = new WeakMap<object, EsgWorkbookLike>();

/** The workbook a patched view was laid over: the formula layer is judged on it. */
const BASE = Symbol("esgReviewBase");
type Overlaid = EsgWorkbookLike & { [BASE]?: EsgWorkbookLike };

const EMPTY_CELLS: Record<string, unknown> = Object.freeze({}) as Record<string, unknown>;

function rawCells(workbook: EsgWorkbookLike, section: string): Record<string, unknown> {
  return (workbook.sections?.[section]?.cells ?? EMPTY_CELLS) as Record<string, unknown>;
}

/** A section's cells as the editors show them (sheet-address imports translated). */
export function esgSectionCells(workbook: EsgWorkbookLike, section: string): Record<string, unknown> {
  const raw = rawCells(workbook, section);
  const hit = hydratedCache.get(raw);
  if (hit) return hit;
  const hydrated = hydrateEsgSectionCells(section, raw as EsgCells) as Record<string, unknown>;
  hydratedCache.set(raw, hydrated);
  return hydrated;
}

/** A register's rows, read once per stored section. */
export function esgRegisterRows(workbook: EsgWorkbookLike, section: EsgGridSectionId): Array<Record<string, unknown>> {
  const raw = rawCells(workbook, section);
  const hit = rowsCache.get(raw);
  if (hit) return hit;
  const rows = readEsgGridRows(raw, section);
  rowsCache.set(raw, rows);
  return rows;
}

/** The value a cell holds now, as the user sees it. */
export function esgCellValue(workbook: EsgWorkbookLike, section: string, cell: string): unknown {
  if (isEsgGridSection(section)) {
    const raw = rawCells(workbook, section);
    if (Array.isArray(raw._rows)) {
      let flat = flatCache.get(raw);
      if (!flat) {
        flat = mergeEsgSectionCells(section, readEsgGridRows(raw, section), raw);
        flatCache.set(raw, flat);
      }
      return flat[cell];
    }
    return raw[cell];
  }
  return esgSectionCells(workbook, section)[cell];
}

/** The workbook as the calculators see it: the formula layer applied. */
function derivedWorkbook(workbook: EsgWorkbookLike): EsgWorkbookLike {
  const base = (workbook as Overlaid)[BASE] ?? workbook;
  const holder = base.sections ?? EMPTY_CELLS;
  const hit = derivedCache.get(holder);
  if (hit) return hit;
  const out = deriveEsgSummaryCells({ companyId: "", updatedAt: "", ...base } as EsgWorkbookData) as EsgWorkbookLike;
  derivedCache.set(holder, out);
  return out;
}

/**
 * Does the formula layer work this cell out when it is blank? Then the
 * calculators already have its value, and writing one would freeze it.
 */
function computedByFormulaLayer(workbook: EsgWorkbookLike, section: string, cell: string): boolean {
  if (isEsgDerivedCell(section, cell)) return true;
  const base = (workbook as Overlaid)[BASE] ?? workbook;
  if (!isBlankEsgCell(esgCellValue(base, section, cell))) return false;
  const derived = derivedWorkbook(base).sections?.[section]?.cells?.[cell];
  return !isBlankEsgCell(derived);
}

function axesOf(workbook: EsgWorkbookLike): EsgReportingAxes {
  return esgWorkbookAxes(esgSectionCells(workbook, "e-data"));
}

function registerRowHandle(section: EsgGridSectionId, row: Record<string, unknown>): string {
  const def = ESG_GRID_SECTIONS[section];
  const primary = def.columns.find((c) => c.required && c.type === "text") ?? def.columns.find((c) => c.type === "text");
  const handle = primary ? str(row[primary.key]) : "";
  if (section === "waste") {
    return [str(row.wasteType), str(row.month), str(row.depot)].filter(Boolean).join(" · ");
  }
  return handle.length > 60 ? `${handle.slice(0, 59)}…` : handle;
}

/** What one cell is, where it sits and what it may hold. Null for a cell the workbook has no place for. */
export function esgCellInfo(workbook: EsgWorkbookLike, section: string, cell: string): EsgCellInfo | null {
  const key = esgCellKey(section, cell);
  const sectionLabel = esgSectionLabel(section);
  const base = { section, cell, key, sectionLabel };

  // E_Data monthly grids: `${prefix}_${month}${14 + row}`.
  const monthly = /^(s1a|s1b|s1c|s1d|s2|solar|water|waste)_([C-Z])(\d+)$/.exec(cell);
  if (section === "e-data" && monthly) {
    const [, prefix, col, rowText] = monthly;
    const grid = ESG_MONTHLY_GRIDS[prefix];
    const axes = axesOf(workbook);
    const row = Number(rowText) - 14;
    const monthIndex = col.charCodeAt(0) - 67;
    const rows = grid.perSite ? (axes.companyWide ? 1 : axes.depots.length) : 1;
    if (row < 0 || row >= rows || monthIndex < 0 || monthIndex >= axes.months.length) return null;
    const site = grid.perSite ? (axes.companyWide ? "Company wide" : axes.depots[row]) : "";
    const month = axes.months[monthIndex];
    return {
      ...base,
      label: [sectionLabel, grid.measure, site, month].filter(Boolean).join(" · "),
      type: "number",
      unit: grid.unit,
      derived: false,
      decision: false,
      where: { kind: "monthly", prefix, row, monthIndex, month, site },
    };
  }
  const source = /^(s1a|s1b|s1c|s1d|s2|solar|water|waste)_src_(\d+)$/.exec(cell);
  if (section === "e-data" && source) {
    const [, prefix, rowText] = source;
    const grid = ESG_MONTHLY_GRIDS[prefix];
    const axes = axesOf(workbook);
    const row = Number(rowText);
    const rows = grid.perSite ? (axes.companyWide ? 1 : axes.depots.length) : 1;
    if (row < 0 || row >= rows) return null;
    const site = grid.perSite ? (axes.companyWide ? "Company wide" : axes.depots[row]) : "";
    return {
      ...base,
      label: [sectionLabel, grid.measure, site, "Source"].filter(Boolean).join(" · "),
      type: "text",
      unit: ESG_UNITS.other,
      derived: false,
      decision: false,
      where: { kind: "source", prefix, row, site },
    };
  }
  if (section === "e-data" && /_(ytd|tco2|depot)_\d+$/.test(cell)) return null;

  const headcount = /^hc_(\d+)_(\d+)$/.exec(cell);
  if (section === "s-data" && headcount) {
    return {
      ...base,
      label: `${sectionLabel} · Workforce profile · level ${Number(headcount[1]) + 1}, group ${Number(headcount[2]) + 1}`,
      type: "number",
      unit: ESG_UNITS.count,
      derived: false,
      decision: false,
      where: { kind: "headcount", level: Number(headcount[1]), group: Number(headcount[2]) },
    };
  }

  if (isEsgGridSection(section)) {
    const m = /^([A-Z]+)(\d+)$/.exec(cell);
    if (!m) return null;
    const def = ESG_GRID_SECTIONS[section];
    const columns = esgGridColumnsOnAxes(section, axesOf(workbook));
    const colIdx = def.columns.findIndex((c, i) => refFor(def, c, i) === m[1]);
    if (colIdx < 0) return null;
    const rowIndex = Number(m[2]) - def.startRow;
    const rows = esgRegisterRows(workbook, section);
    if (rowIndex < 0 || rowIndex >= rows.length) return null;
    const column = columns[colIdx];
    const handle = registerRowHandle(section, rows[rowIndex]);
    const type = column.type === "number" ? "number" : column.type === "select" ? "select" : column.type === "date" ? "date" : "text";
    const unitOf = esgUnitFromLabel(column.label, type);
    return {
      ...base,
      label: [sectionLabel, handle || `row ${rowIndex + 1}`, column.label].join(" · "),
      type,
      options: column.options,
      unit: unitOf,
      // Per-row figures the formula layer fills (L/100km, tCO₂e) are its own.
      derived: unitOf.family === "tco2e" || computedByFormulaLayer(workbook, section, cell),
      decision: false,
      where: { kind: "register", rowIndex, column: column.key, handle },
    };
  }

  const field = SCALAR_FIELDS[section]?.find((f) => f.cell === cell);
  if (!field) return null;
  const type = field.type === "number" ? "number" : field.type === "select" ? "select" : "text";
  const unitOf = UNIT_OVERRIDES[key] ?? esgUnitFromLabel(field.label, type);
  return {
    ...base,
    label: `${sectionLabel} · ${field.label}`,
    type,
    options: field.options,
    unit: unitOf,
    derived: unitOf.family === "tco2e" || computedByFormulaLayer(workbook, section, cell),
    decision: isDecisionCell(section, cell),
    where: { kind: "scalar" },
  };
}

/* ------------------------------------------------------------------ *
 * Marks
 * ------------------------------------------------------------------ */

function sidecar(workbook: EsgWorkbookLike, section: string): Record<string, unknown> {
  return (workbook.sections?.[section]?.cells ?? {}) as Record<string, unknown>;
}

export function parseEsgFillMark(raw: unknown): EsgAiFillMark | null {
  if (typeof raw !== "string") return null;
  try {
    const m = JSON.parse(raw) as Partial<EsgAiFillMark>;
    if (typeof m.v !== "string" || (m.kind !== "read" && m.kind !== "derived")) return null;
    return {
      v: m.v,
      kind: m.kind,
      ...(m.rule ? { rule: String(m.rule) } : {}),
      reason: String(m.reason ?? ""),
      evidence: Array.isArray(m.evidence) ? (m.evidence as EsgFillEvidence[]) : [],
      ...(m.conversion ? { conversion: String(m.conversion) } : {}),
      replaced: (m.replaced ?? null) as EsgCellValue,
      origin: m.origin === "model" ? "model" : "rules",
      at: String(m.at ?? ""),
    };
  } catch {
    return null;
  }
}

/** The longest a stored mark may be: a cell holds at most 4,000 characters. */
const MAX_MARK_LENGTH = 3_900;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A mark as stored: evidence trimmed, oldest detail first, until it fits one cell. */
export function serializeEsgFillMark(mark: EsgAiFillMark): string {
  const trimItem = (e: EsgFillEvidence): EsgFillEvidence => {
    if (e.type === "cell") {
      return { ...e, label: clip(e.label, 120), value: clip(e.value, 120), ...(e.files ? { files: e.files.slice(0, 3).map((f) => clip(f, 80)) } : {}) };
    }
    if (e.type === "document") {
      return { ...e, file: clip(e.file, 120), ...(e.detail ? { detail: clip(e.detail, 160) } : {}), ...(e.quote ? { quote: clip(e.quote, 200) } : {}) };
    }
    if (e.type === "record") return { ...e, value: clip(e.value, 160) };
    return { ...e, text: clip(e.text, 160) };
  };
  const base = { ...mark, reason: clip(mark.reason, 400), ...(mark.conversion ? { conversion: clip(mark.conversion, 160) } : {}) };
  const real = mark.evidence.map(trimItem);
  let out = JSON.stringify({ ...base, evidence: real });
  for (let keep = real.length - 1; out.length > MAX_MARK_LENGTH && keep >= 1; keep--) {
    const evidence: EsgFillEvidence[] = [...real.slice(0, keep), { type: "note", text: `+${real.length - keep} more` }];
    out = JSON.stringify({ ...base, evidence });
  }
  return out;
}

/** The mark on a cell, whatever the cell holds now. */
export function esgFillMarkOf(workbook: EsgWorkbookLike, key: string): EsgAiFillMark | null {
  return parseEsgFillMark(sidecar(workbook, ESG_AI_FILLS_SECTION)[key]);
}

/** The mark, only while the cell still holds the filled value. */
export function activeEsgFillMark(workbook: EsgWorkbookLike, section: string, cell: string): EsgAiFillMark | null {
  const mark = esgFillMarkOf(workbook, esgCellKey(section, cell));
  if (!mark) return null;
  return sameEsgValue(esgCellValue(workbook, section, cell), mark.v) ? mark : null;
}

export function readEsgDisputes(workbook: EsgWorkbookLike): Map<string, EsgCellDispute> {
  const out = new Map<string, EsgCellDispute>();
  for (const [key, raw] of Object.entries(sidecar(workbook, ESG_DISPUTES_SECTION))) {
    if (typeof raw !== "string" || !splitEsgCellKey(key)) continue;
    try {
      const d = JSON.parse(raw) as EsgCellDispute;
      if (Array.isArray(d.candidates) && d.candidates.length > 1) out.set(key, d);
    } catch {
      // A record that does not parse is not a dispute.
    }
  }
  return out;
}

/**
 * The `disputes` cells for the conflicts a document read left blank. Written
 * beside the figures, so the review can show where documents disagree and
 * ask about it.
 */
export function esgDisputeCells(
  conflicts: ReadonlyArray<{ sectionId: string; cellRef: string; label?: string; candidates: Array<{ value: unknown; sources: string[]; unit?: string }> }>,
): EsgCells {
  const out: EsgCells = {};
  for (const c of conflicts) {
    if (!c.sectionId || !c.cellRef || c.candidates.length < 2) continue;
    const record: EsgCellDispute = {
      ...(c.label ? { label: clip(c.label, 120) } : {}),
      candidates: c.candidates.slice(0, 6).map((cand) => ({
        value: typeof cand.value === "number" || typeof cand.value === "string" ? cand.value : str(cand.value),
        sources: (cand.sources ?? []).slice(0, 4).map((f) => clip(String(f), 120)),
        ...(cand.unit ? { unit: clip(cand.unit, 20) } : {}),
      })),
    };
    out[esgCellKey(c.sectionId, c.cellRef)] = clip(JSON.stringify(record), MAX_MARK_LENGTH);
  }
  return out;
}

/**
 * A document read's patches with its disagreements recorded beside them, so
 * the workbook keeps knowing which blank cells the documents disputed.
 */
export function withEsgDisputes<T extends Record<string, { cells: Record<string, EsgCellValue> }>>(
  patches: T,
  conflicts: Parameters<typeof esgDisputeCells>[0] | undefined,
): T {
  const cells = esgDisputeCells(conflicts ?? []);
  if (Object.keys(cells).length === 0) return patches;
  return { ...patches, [ESG_DISPUTES_SECTION]: { cells } };
}

/** What the grid shows on a cell: the review's fill, the document behind it, or a disagreement. */
export type EsgCellMarkState =
  | { kind: "ai"; mark: EsgAiFillMark }
  | { kind: "document"; files: string[] }
  | { kind: "dispute"; dispute: EsgCellDispute };

export interface EsgCellMarkIndex {
  fills: Map<string, EsgAiFillMark>;
  documents: Map<string, EsgPlacementRecord[]>;
  disputes: Map<string, EsgCellDispute>;
}

/** Everything the cell markers need, read once per workbook. */
export function buildEsgCellMarkIndex(workbook: EsgWorkbookLike | null | undefined): EsgCellMarkIndex {
  const fills = new Map<string, EsgAiFillMark>();
  const documents = new Map<string, EsgPlacementRecord[]>();
  if (!workbook) return { fills, documents, disputes: new Map() };
  for (const [key, raw] of Object.entries(sidecar(workbook, ESG_AI_FILLS_SECTION))) {
    const mark = parseEsgFillMark(raw);
    if (mark) fills.set(key, mark);
  }
  for (const record of readProvenance(workbook)) {
    const key = esgCellKey(record.sectionId, record.cellRef);
    documents.set(key, [...(documents.get(key) ?? []), record]);
  }
  return { fills, documents, disputes: readEsgDisputes(workbook) };
}

/**
 * The one mark a cell shows, judged against what it holds NOW (a draft value
 * the user is typing counts): a fill only while it holds the filled value, a
 * document only while it holds what the document placed, a disagreement only
 * while it is still blank.
 */
export function esgCellMarkState(index: EsgCellMarkIndex, key: string, current: unknown): EsgCellMarkState | null {
  const mark = index.fills.get(key);
  if (mark && sameEsgValue(current, mark.v)) return { kind: "ai", mark };
  const records = (index.documents.get(key) ?? []).filter((r) => stillAsPlaced(r, current));
  if (records.length > 0) return { kind: "document", files: Array.from(new Set(records.map((r) => r.sourceFile).filter(Boolean))) };
  const dispute = index.disputes.get(key);
  if (dispute && isBlankEsgCell(current)) return { kind: "dispute", dispute };
  return null;
}

/* ------------------------------------------------------------------ *
 * May the review write this cell?
 * ------------------------------------------------------------------ */

export function canFillEsgCell(
  workbook: EsgWorkbookLike,
  section: string,
  cell: string,
  value?: string,
): { ok: true; info: EsgCellInfo } | { ok: false; reason: string } {
  if ((ESG_REVIEW_SIDECAR_SECTIONS as readonly string[]).includes(section)) return { ok: false, reason: "Not a workbook cell." };
  const info = esgCellInfo(workbook, section, cell);
  if (!info) return { ok: false, reason: "The workbook has no such cell." };
  if (info.decision) return { ok: false, reason: "This is a decision for you, not a fill." };
  if (info.derived) return { ok: false, reason: "The tool works this figure out itself." };
  const current = esgCellValue(workbook, section, cell);
  const mark = esgFillMarkOf(workbook, info.key);
  if (mark && !sameEsgValue(current, mark.v)) {
    return { ok: false, reason: isBlankEsgCell(current) ? "You cleared an earlier fill here." : "You changed this cell after an earlier fill." };
  }
  if (!isBlankEsgCell(current)) return { ok: false, reason: "The cell holds a value now." };
  const declined = sidecar(workbook, ESG_AI_DECLINED_SECTION)[info.key];
  if (value !== undefined && declined !== undefined && sameEsgValue(declined, value)) {
    return { ok: false, reason: "You undid this value before." };
  }
  return { ok: true, info };
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

const proposalId = (key: string) => `esgfill_${key}`.replace(/[^A-Za-z0-9_-]+/g, "-");
const questionId = (key: string, tag = "") => `esgask_${key}${tag ? `_${tag}` : ""}`.replace(/[^A-Za-z0-9_-]+/g, "-");

function cellEvidence(workbook: EsgWorkbookLike, section: string, cell: string, files?: string[]): EsgFillEvidence {
  const info = esgCellInfo(workbook, section, cell);
  return {
    type: "cell",
    section,
    cell,
    label: info?.label ?? esgSectionLabel(section),
    value: str(esgCellValue(workbook, section, cell)),
    ...(files && files.length > 0 ? { files } : {}),
  };
}

/** Collects proposals and questions, refusing any proposal the cell cannot take. */
export class EsgFillCollector {
  readonly proposals: EsgFillProposal[] = [];
  readonly questions: EsgFillQuestion[] = [];
  private readonly taken = new Set<string>();

  constructor(private readonly workbook: EsgWorkbookLike, private readonly origin: EsgFillOrigin) {}

  has(key: string): boolean {
    return this.taken.has(key);
  }

  propose(p: Omit<EsgFillProposal, "id" | "key" | "sectionLabel" | "cellLabel" | "origin" | "unit">): boolean {
    const key = esgCellKey(p.section, p.cell);
    if (this.taken.has(key)) return false;
    const check = canFillEsgCell(this.workbook, p.section, p.cell, p.value);
    if (!check.ok) return false;
    this.taken.add(key);
    this.proposals.push({
      ...p,
      id: proposalId(key),
      key,
      sectionLabel: check.info.sectionLabel,
      cellLabel: check.info.label,
      ...(check.info.unit.symbol ? { unit: check.info.unit.symbol } : {}),
      origin: this.origin,
    });
    return true;
  }

  ask(section: string | undefined, cell: string | undefined, question: string, tag = "", label?: string): void {
    const key = section && cell ? esgCellKey(section, cell) : `note-${tag}`;
    const id = questionId(key, tag);
    if (this.questions.some((q) => q.id === id)) return;
    const info = section && cell ? esgCellInfo(this.workbook, section, cell) : null;
    this.questions.push({
      id,
      ...(section && cell ? { section, cell, key } : {}),
      cellLabel: label ?? info?.label ?? (section ? esgSectionLabel(section) : "Your documents"),
      question,
      origin: this.origin,
    });
  }
}

/** "Jul-25" style labels, case-insensitively. */
const sameMonth = (a: unknown, b: unknown) => str(a).toLowerCase() === str(b).toLowerCase();

/**
 * Rule 1 — the waste contractor total (`E_Data!L68`, kg) as the sum of the
 * waste register's own kilograms, when the register covers the same sites and
 * every month of the reporting year.
 */
function wasteTotalRule(workbook: EsgWorkbookLike, c: EsgFillCollector): void {
  const section = "e-data";
  const cell = "L68";
  if (!isBlankEsgCell(esgCellValue(workbook, section, cell))) return;
  const rows = esgRegisterRows(workbook, "waste");
  if (rows.length === 0) return;
  const def = ESG_GRID_SECTIONS.waste;
  const totalIdx = def.columns.findIndex((col) => col.key === "totalKg");
  const totalLetter = refFor(def, def.columns[totalIdx], totalIdx);
  const axes = axesOf(workbook);

  const noMonth = rows.filter((r) => isBlankEsgCell(r.month)).length;
  const noKg = rows.filter((r) => toNumber(r.totalKg) === null).length;
  const outside = Array.from(new Set(rows.map((r) => str(r.month)).filter((m) => m && !axes.months.some((a) => sameMonth(a, m)))));
  const missing = axes.months.filter((m) => !rows.some((r) => sameMonth(r.month, m)));
  const depots = Array.from(new Set(rows.map((r) => str(r.depot)).filter(Boolean)));
  const mixesAll = depots.some((d) => d.toUpperCase() === "ALL") && depots.some((d) => d.toUpperCase() !== "ALL");
  const offAxis = depots.filter((d) => d.toUpperCase() !== "ALL" && typeof esgSiteMatch(d, axes.depots) !== "number");

  const problems: string[] = [];
  if (noMonth > 0) problems.push(`${noMonth} waste row${noMonth === 1 ? " has" : "s have"} no month`);
  if (noKg > 0) problems.push(`${noKg} waste row${noKg === 1 ? " has" : "s have"} no Total kg`);
  if (outside.length > 0) problems.push(`rows for ${outside.join(", ")} fall outside your reporting months`);
  if (missing.length > 0) problems.push(`the register has no rows for ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}`);
  if (mixesAll) problems.push("some rows are for ALL sites and others for one site, which would count waste twice");
  if (offAxis.length > 0) problems.push(`${offAxis.join(", ")} ${offAxis.length === 1 ? "is not one of" : "are not"} your sites`);
  if (problems.length > 0) {
    c.ask(section, cell, `The total waste can't be worked out from the waste register: ${problems.join("; ")}. What total does the contractor report?`, "waste-total");
    return;
  }

  const total = rows.reduce((sum, r) => sum + (toNumber(r.totalKg) ?? 0), 0);
  if (!(total > 0)) return;
  const evidence = rows.map((r, i) => cellEvidence(workbook, "waste", `${totalLetter}${def.startRow + i}`));
  c.propose({
    section,
    cell,
    value: String(Math.round(total * 1000) / 1000),
    kind: "derived",
    rule: "sum",
    reasoning: `The sum of the waste register's Total kg over its ${rows.length} rows, which cover every reporting month (${axes.months[0]} to ${axes.months[axes.months.length - 1]}).`,
    evidence,
  });
}

/**
 * Rule 5 — a monthly row's Source column: the documents that placed that row's
 * figures, read from the provenance record (only figures still as placed).
 */
function sourceColumnRule(workbook: EsgWorkbookLike, c: EsgFillCollector): void {
  const records = readProvenance(workbook).filter((r) => r.sectionId === "e-data");
  if (records.length === 0) return;
  const axes = axesOf(workbook);
  for (const [prefix, grid] of Object.entries(ESG_MONTHLY_GRIDS)) {
    const rows = grid.perSite ? (axes.companyWide ? 1 : axes.depots.length) : 1;
    for (let row = 0; row < rows; row++) {
      const cell = `${prefix}_src_${row}`;
      if (!isBlankEsgCell(esgCellValue(workbook, "e-data", cell))) continue;
      const pattern = new RegExp(`^${prefix}_[C-Z]${14 + row}$`);
      const behind = records.filter(
        (r) => pattern.test(r.cellRef) && stillAsPlaced(r, esgCellValue(workbook, "e-data", r.cellRef)),
      );
      const files = Array.from(new Set(behind.map((r) => r.sourceFile).filter(Boolean))).sort();
      if (files.length === 0) continue;
      c.propose({
        section: "e-data",
        cell,
        value: clip(files.join(", "), 3_900),
        kind: "read",
        rule: "source",
        reasoning: `The documents that placed this row's ${behind.length} figure${behind.length === 1 ? "" : "s"}, from the record of where each value came from.`,
        evidence: behind.slice(0, 12).map((r) => cellEvidence(workbook, "e-data", r.cellRef, [r.sourceFile])),
      });
    }
  }
}

/** Rule 5 — the entity name, from the company record, when the setup leaves it blank. */
function entityNameRule(workbook: EsgWorkbookLike, c: EsgFillCollector, companyName?: string): void {
  const name = str(companyName);
  if (!name) return;
  c.propose({
    section: "company-reporting-setup",
    cell: "entity",
    value: name,
    kind: "read",
    rule: "copy",
    reasoning: "The company this workbook belongs to is recorded under this name.",
    evidence: [{ type: "record", label: "Company record · Name", value: name }],
  });
}

/** A vehicle registration, exactly: case and spacing are not part of a plate. */
const plate = (v: unknown) => str(v).toUpperCase().replace(/\s+/g, " ");

/**
 * Rule 5 — one vehicle, two registers. A depot the fleet register states fills
 * the vehicle's blank depot on the driver debrief, and the other way round.
 * Exact registration match only; a value an earlier derived fill wrote is not
 * a statement.
 */
function registerCopyRule(workbook: EsgWorkbookLike, c: EsgFillCollector): void {
  const fleetDef = ESG_GRID_SECTIONS.fleet;
  const debriefDef = ESG_GRID_SECTIONS["driver-debrief"];
  const fleetRows = esgRegisterRows(workbook, "fleet");
  const debriefRows = esgRegisterRows(workbook, "driver-debrief");
  if (fleetRows.length === 0 || debriefRows.length === 0) return;
  const letter = (def: typeof fleetDef, key: string) => {
    const idx = def.columns.findIndex((col) => col.key === key);
    return refFor(def, def.columns[idx], idx);
  };
  const fleetDepot = letter(fleetDef, "depot");
  const debriefDepot = letter(debriefDef, "depot");
  const stated = (section: string, cell: string, value: unknown) =>
    !isBlankEsgCell(value) && activeEsgFillMark(workbook, section, cell)?.kind !== "derived";

  const copy = (
    toSection: "fleet" | "driver-debrief",
    toRows: Record<string, unknown>[],
    toKey: string,
    toLetter: string,
    toStart: number,
    fromSection: "fleet" | "driver-debrief",
    fromRows: Record<string, unknown>[],
    fromKey: string,
    fromLetter: string,
    fromStart: number,
  ) => {
    toRows.forEach((target, i) => {
      const reg = plate(target[toKey]);
      if (!reg || !isBlankEsgCell(target.depot)) return;
      const cell = `${toLetter}${toStart + i}`;
      const sources = fromRows
        .map((r, j) => ({ r, cell: `${fromLetter}${fromStart + j}` }))
        .filter(({ r, cell: from }) => plate(r[fromKey]) === reg && stated(fromSection, from, r.depot));
      if (sources.length === 0) return;
      const values = Array.from(new Set(sources.map(({ r }) => str(r.depot).toUpperCase())));
      if (values.length > 1) {
        c.ask(toSection, cell, `Vehicle ${reg} is at ${values.join(" and ")} on the ${esgSectionLabel(fromSection).toLowerCase()}. Which depot is it based at?`, "depot");
        return;
      }
      c.propose({
        section: toSection,
        cell,
        value: str(sources[0].r.depot),
        kind: "read",
        rule: "copy",
        reasoning: `Vehicle ${reg} is the same vehicle on the ${esgSectionLabel(fromSection).toLowerCase()}, which states its depot.`,
        evidence: sources.slice(0, 6).map(({ cell: from }) => cellEvidence(workbook, fromSection, from)),
      });
    });
  };
  copy("fleet", fleetRows, "reg", fleetDepot, fleetDef.startRow, "driver-debrief", debriefRows, "vehicleReg", debriefDepot, debriefDef.startRow);
  copy("driver-debrief", debriefRows, "vehicleReg", debriefDepot, debriefDef.startRow, "fleet", fleetRows, "reg", fleetDepot, fleetDef.startRow);
}

/**
 * Rule 6 — documents that disagree. The same quantity in two units (0.79 kL
 * and 790 L) is one value, written in the cell's unit with the conversion
 * stated. Anything else is a question naming each value and its documents.
 */
function disputeRule(workbook: EsgWorkbookLike, c: EsgFillCollector): void {
  for (const [key, dispute] of Array.from(readEsgDisputes(workbook).entries())) {
    const at = splitEsgCellKey(key);
    if (!at) continue;
    const check = canFillEsgCell(workbook, at.section, at.cell);
    if (!check.ok) continue;
    const target = check.info.unit;
    const converted = dispute.candidates.map((cand) => {
      const n = toNumber(cand.value);
      const from = cand.unit ? esgUnitFromName(cand.unit) : null;
      if (n === null || !from) return null;
      const out = esgConvert(n, from, target);
      return out ? { ...out, cand } : null;
    });
    const all = converted.every((x): x is NonNullable<typeof x> => x !== null);
    if (all && converted.length > 1) {
      const first = converted[0]!.value;
      const agree = converted.every((x) => Math.abs(x!.value - first) <= Math.max(1e-9, Math.abs(first) * 1e-6));
      if (agree) {
        const conversion = converted.map((x) => x!.conversion).filter(Boolean).join("; ");
        c.propose({
          section: at.section,
          cell: at.cell,
          value: String(Math.round(first * 1e6) / 1e6),
          kind: "read",
          rule: "units",
          reasoning: "Your documents state the same quantity in different units. Written once, in this cell's unit.",
          evidence: dispute.candidates.flatMap((cand) =>
            cand.sources.map((file): EsgFillEvidence => ({ type: "document", file, detail: `states ${str(cand.value)}${cand.unit ? ` ${cand.unit}` : ""}` })),
          ),
          ...(conversion ? { conversion } : {}),
        });
        continue;
      }
    }
    const said = dispute.candidates
      .map((cand) => `${str(cand.value)}${cand.unit ? ` ${cand.unit}` : ""} (${cand.sources.join(", ") || "source unknown"})`)
      .join(" or ");
    c.ask(at.section, at.cell, `Your documents disagree: ${said}. Which is right?`, "dispute");
  }
}

/**
 * Everything the review can fill without a model, and the questions it asks
 * where the workbook does not support a value. Deterministic and free.
 *
 * Not here, on purpose: the headcount row and column totals, the fleet vehicle
 * and EV counts, the SDL levy and every GHG and LTIFR figure. The formula layer
 * computes them on every read; storing one would stop it following the inputs.
 */
export function buildEsgRuleFills(
  workbook: EsgWorkbookLike,
  options: { companyName?: string } = {},
): { proposals: EsgFillProposal[]; questions: EsgFillQuestion[] } {
  const c = new EsgFillCollector(workbook, "rules");
  disputeRule(workbook, c);
  wasteTotalRule(workbook, c);
  sourceColumnRule(workbook, c);
  entityNameRule(workbook, c, options.companyName);
  registerCopyRule(workbook, c);
  // A question about a cell a rule also filled is moot.
  const filled = new Set(c.proposals.map((p) => p.key));
  return { proposals: c.proposals, questions: c.questions.filter((q) => !q.key || !filled.has(q.key)) };
}

/* ------------------------------------------------------------------ *
 * Apply and undo
 * ------------------------------------------------------------------ */

/** The proposal's text as the cell stores it. */
export function coerceEsgFillValue(info: EsgCellInfo, value: string): EsgCellValue {
  if (info.type === "number") {
    const n = toNumber(value);
    return n === null ? value : n;
  }
  if (info.type === "select" && info.options) {
    return info.options.find((o) => o.toLowerCase() === value.trim().toLowerCase()) ?? value;
  }
  return value;
}

/** A section's cells, cloned once per apply; a register stored as `_rows` is flattened first. */
function cloneForWrite(workbook: EsgWorkbookLike, section: string, out: EsgSectionPatches): EsgCells {
  if (!out[section]) {
    const raw = (workbook.sections?.[section]?.cells ?? {}) as Record<string, unknown>;
    out[section] =
      isEsgGridSection(section) && Array.isArray(raw._rows)
        ? mergeEsgSectionCells(section, readEsgGridRows(raw, section), raw)
        : ({ ...raw } as EsgCells);
  }
  return out[section];
}

/**
 * The workbook with patches laid over it — what the next check must see. The
 * formula layer is still judged on the workbook the proposals were made from.
 */
function overlay(workbook: EsgWorkbookLike, patches: EsgSectionPatches): EsgWorkbookLike {
  const sections = { ...(workbook.sections ?? {}) };
  for (const [id, cells] of Object.entries(patches)) sections[id] = { cells };
  const out: Overlaid = { sections };
  out[BASE] = (workbook as Overlaid)[BASE] ?? workbook;
  return out;
}

/**
 * Write proposals into the workbook, each with its mark. Every proposal is
 * re-checked against the cell as it is NOW: a cell the user filled since the
 * proposal was made is skipped, never overwritten.
 */
export function applyEsgFillProposals(
  workbook: EsgWorkbookLike,
  proposals: EsgFillProposal[],
  at: string = new Date().toISOString(),
): { patches: EsgSectionPatches; applied: string[]; skipped: Array<{ id: string; reason: string }> } {
  const patches: EsgSectionPatches = {};
  const applied: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const p of proposals) {
    const now = overlay(workbook, patches);
    const check = canFillEsgCell(now, p.section, p.cell, p.value);
    if (!check.ok) {
      skipped.push({ id: p.id, reason: check.reason });
      continue;
    }
    const cells = cloneForWrite(workbook, p.section, patches);
    const previous = esgCellValue(now, p.section, p.cell);
    cells[p.cell] = coerceEsgFillValue(check.info, p.value);
    const fills = cloneForWrite(workbook, ESG_AI_FILLS_SECTION, patches);
    const mark: EsgAiFillMark = {
      v: p.value,
      kind: p.kind,
      ...(p.rule ? { rule: p.rule } : {}),
      reason: p.reasoning,
      evidence: p.evidence,
      ...(p.conversion ? { conversion: p.conversion } : {}),
      replaced: isBlankEsgCell(previous) ? null : (previous as EsgCellValue),
      origin: p.origin,
      at,
    };
    fills[check.info.key] = serializeEsgFillMark(mark);
    applied.push(p.id);
  }
  return { patches, applied, skipped };
}

function undoInto(workbook: EsgWorkbookLike, key: string, patches: EsgSectionPatches): boolean {
  const at = splitEsgCellKey(key);
  const mark = esgFillMarkOf(overlay(workbook, patches), key);
  if (!at || !mark) return false;
  const now = overlay(workbook, patches);
  if (sameEsgValue(esgCellValue(now, at.section, at.cell), mark.v)) {
    const cells = cloneForWrite(workbook, at.section, patches);
    if (mark.replaced === null || mark.replaced === undefined) delete cells[at.cell];
    else cells[at.cell] = mark.replaced;
    // Remembered, so the same value is never offered straight back.
    cloneForWrite(workbook, ESG_AI_DECLINED_SECTION, patches)[key] = mark.v;
  }
  // A cell the user changed keeps their value; only the stale mark goes.
  delete cloneForWrite(workbook, ESG_AI_FILLS_SECTION, patches)[key];
  return true;
}

/**
 * The order to save a set of patches in. A fill saves its marks before the
 * figures they explain (a failed figure save leaves an inert mark, never an
 * unexplained figure); an undo restores the figure before dropping its mark.
 */
export function esgReviewSaveOrder(sectionIds: string[], marksFirst: boolean): string[] {
  const isSidecar = (id: string) => (ESG_REVIEW_SIDECAR_SECTIONS as readonly string[]).includes(id);
  const sidecars = sectionIds.filter(isSidecar);
  const figures = sectionIds.filter((id) => !isSidecar(id));
  return marksFirst ? [...sidecars, ...figures] : [...figures, ...sidecars];
}

/**
 * Save review patches through the ordinary section save, one section at a
 * time, in `esgReviewSaveOrder`. Stops at the first failed save.
 */
export async function saveEsgReviewPatches(
  patches: EsgSectionPatches,
  marksFirst: boolean,
  saveSection: (sectionId: string, cells: EsgCells) => Promise<void>,
): Promise<void> {
  for (const id of esgReviewSaveOrder(Object.keys(patches), marksFirst)) await saveSection(id, patches[id]);
}

/** Undo one fill: the cell goes back to what it held before. */
export function undoEsgFill(workbook: EsgWorkbookLike, key: string): EsgSectionPatches {
  const patches: EsgSectionPatches = {};
  undoInto(workbook, key, patches);
  return patches;
}

/** Undo every fill still standing. */
export function undoAllEsgFills(workbook: EsgWorkbookLike): EsgSectionPatches {
  const patches: EsgSectionPatches = {};
  for (const fill of activeEsgFills(workbook)) undoInto(workbook, fill.key, patches);
  return patches;
}

/** Every fill whose cell still holds the filled value. */
export function activeEsgFills(
  workbook: EsgWorkbookLike,
): Array<{ key: string; section: string; cell: string; label: string; unit?: string; mark: EsgAiFillMark }> {
  const out: Array<{ key: string; section: string; cell: string; label: string; unit?: string; mark: EsgAiFillMark }> = [];
  for (const key of Object.keys(sidecar(workbook, ESG_AI_FILLS_SECTION))) {
    const at = splitEsgCellKey(key);
    if (!at) continue;
    const mark = activeEsgFillMark(workbook, at.section, at.cell);
    if (!mark) continue;
    const info = esgCellInfo(workbook, at.section, at.cell);
    out.push({
      key,
      ...at,
      label: info?.label ?? esgSectionLabel(at.section),
      ...(info?.unit.symbol ? { unit: info.unit.symbol } : {}),
      mark,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** One line per evidence item. Labels, never raw cell references. */
export function describeEsgEvidence(e: EsgFillEvidence): string {
  if (e.type === "note") return e.text;
  if (e.type === "record") return `${e.label}: ${e.value}`;
  if (e.type === "document") {
    const where = e.page != null ? `, page ${e.page}` : "";
    const said = e.quote ? ` — “${e.quote}”` : e.detail ? ` — ${e.detail}` : "";
    return `${e.file}${where}${said}`;
  }
  return `${e.label} = ${e.value}${e.files && e.files.length > 0 ? ` (from ${e.files.join(", ")})` : ""}`;
}

/** A fill's value as the card shows it: "4 820 000" → "R 4 820 000", "6150" → "6 150 kWh". */
export function esgDisplayValue(value: string, unitSymbol?: string): string {
  const text = value.trim();
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  const shown = numeric ? formatEsgNumber(Number(text)) : value;
  if (!numeric || !unitSymbol || unitSymbol === "fraction") return shown;
  return unitSymbol === "R" ? `R ${shown}` : unitSymbol === "%" ? `${shown}%` : `${shown} ${unitSymbol}`;
}

/** The badge text: "Read", "Read · site", "Derived · sum". */
export function esgFillBadge(kind: EsgFillKind, rule?: string): string {
  const head = kind === "derived" ? "Derived" : "Read";
  return rule ? `${head} · ${rule}` : head;
}
