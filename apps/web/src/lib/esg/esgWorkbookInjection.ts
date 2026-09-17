/**
 * Put extracted ESG values INTO ESG workbook cells — the vocabulary layer.
 *
 * This is the ESG analogue of `@/lib/workbookInjection` and it obeys the same
 * single rule, for the same reason:
 *
 *   INJECTION SPEAKS THE WORKBOOK'S OWN VOCABULARY. A value that cannot be made
 *   to satisfy its cell is REJECTED into review, never forced to the nearest
 *   option. Writing "Compliant" into a dropdown that holds
 *   "Fully Compliant | Partially Compliant | Gap | Not Applicable" produces a
 *   cell that looks filled, scores as nothing, and is invisible in review.
 *
 * WHERE THE VOCABULARY COMES FROM. Nothing here restates a dropdown. The
 * permitted options for a cell are read from the workbook's own definitions —
 * `esgSectionConfigs.ts` for the scalar / maturity sheets and
 * `esgGridSections.ts` for the register grids — so a option added to the
 * workbook is injectable with no change in this file. Only the SYNONYMS (the
 * wordings a document uses for an option the workbook already has) live here,
 * and each one is a documented equivalence, never a nearest-match.
 *
 * WHAT "Partial" IS. The ESG allowlist types Yes/No/Partial cells as `string`
 * on purpose: "Partial" is a third answer, not a rounded boolean. Collapsing it
 * would silently upgrade a partially-applied control to applied — the exact
 * overstatement assurance exists to catch — so `Partial` survives every path
 * through this module and a genuine boolean is widened to Yes/No rather than
 * the reverse.
 */
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  EE_MATURITY_ROWS,
  E_DATA_ENERGY_BASELINE_FIELDS,
  E_DATA_GHG_SUMMARY_FIELDS,
  E_DATA_NZ_FIELDS,
  E_DATA_SCOPE_FIELDS,
  E_DATA_WATER_INITIATIVE_FIELDS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HEADCOUNT_FIELDS,
  S_DATA_HS_FIELDS,
  S_DATA_PAYROLL_FIELDS,
  S_DATA_TRAINING_FIELDS,
  WASTE_SCALAR_FIELDS,
} from "@/components/esg-workbook/esgSectionConfigs";
import type { EsgFieldDef } from "@/components/esg-workbook/EsgScalarForm";
import { ESG_GRID_SECTIONS, isEsgGridSection } from "./esgGridSections";

/** The value types an ESG workbook cell can hold. */
export type EsgCellValue = string | number | boolean | null;

/**
 * Why a value did not reach its cell. Typed, not prose, so the UI and the tests
 * can both reason about it — the same list `workbookInjection.ts` uses, plus the
 * two refusals that are specific to this sheet family.
 */
export type EsgRejectionReason =
  | "unknown_field"
  | "not_a_number"
  | "not_a_date"
  | "no_matching_option"
  | "failed_validation"
  | "empty"
  /** The only cell this value belongs in is computed by `esgDeriveSummary`. */
  | "derived_cell"
  /** No cell in the workbook holds this fact. */
  | "no_workbook_home"
  /** A real cell exists but which one depends on context we do not have. */
  | "needs_context";

export type EsgNormaliseResult =
  | { ok: true; value: EsgCellValue }
  | { ok: false; reason: EsgRejectionReason; detail: string };

/** How a target cell wants its value shaped. */
export type EsgCellKind =
  | "text"
  | "number"
  /** A 0–100 percentage the cell stores as a 0–1 fraction. */
  | "percentFraction"
  /** A 0–100 percentage the cell stores as 0–100, exactly as printed. */
  | "percentWhole"
  | "count"
  | "year"
  | "date"
  /** A select cell: the workbook's own option list decides. */
  | "select";

/* ------------------------------------------------------------------ *
 * The workbook's own option lists
 * ------------------------------------------------------------------ */

const SCALAR_FIELD_SOURCES: Record<string, readonly EsgFieldDef[]> = {
  "company-reporting-setup": COVER_FIELDS,
  assumptions: ASSUMPTIONS_FIELDS,
  "e-data": [
    ...E_DATA_SCOPE_FIELDS,
    ...E_DATA_ENERGY_BASELINE_FIELDS,
    ...E_DATA_WATER_INITIATIVE_FIELDS,
    ...E_DATA_GHG_SUMMARY_FIELDS,
    ...E_DATA_NZ_FIELDS,
    ...WASTE_SCALAR_FIELDS,
  ],
  "s-data": [
    ...S_DATA_HS_FIELDS,
    ...S_DATA_TRAINING_FIELDS,
    ...S_DATA_PAYROLL_FIELDS,
    ...S_DATA_HEADCOUNT_FIELDS,
  ],
};

const MATURITY_ROW_SOURCES: Record<string, ReadonlyArray<{ cell: string; options?: string[] }>> = {
  "g-data": G_DATA_MATURITY_ROWS,
  ee: EE_MATURITY_ROWS,
};

/**
 * The options the WORKBOOK permits for a cell, or null when the cell is free.
 *
 * Read from the section configs rather than restated, so this cannot drift from
 * what the editor renders or what the `.xlsx` import accepts.
 */
export function esgCellOptions(sectionId: string, cell: string): readonly string[] | null {
  const scalars = SCALAR_FIELD_SOURCES[sectionId];
  if (scalars) {
    const field = scalars.find((f) => f.cell === cell);
    if (field?.options?.length) return field.options;
  }
  const maturity = MATURITY_ROW_SOURCES[sectionId];
  if (maturity) {
    const row = maturity.find((r) => r.cell === cell);
    if (row?.options?.length) return row.options;
  }
  return null;
}

/** The options a register-grid COLUMN permits, or null when the column is free. */
export function esgGridColumnOptions(sectionId: string, columnKey: string): readonly string[] | null {
  if (!isEsgGridSection(sectionId)) return null;
  const column = ESG_GRID_SECTIONS[sectionId].columns.find((c) => c.key === columnKey);
  return column?.options?.length ? column.options : null;
}

/* ------------------------------------------------------------------ *
 * Synonyms — equivalences, never nearest matches
 * ------------------------------------------------------------------ */

/** Lower-case and strip non-alphanumerics — the same key shape B-BBEE uses. */
function synonymKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Wordings that mean an option the workbook already holds.
 *
 * Each entry is an EQUIVALENCE a practitioner would accept without argument
 * ("compliant" is "Fully Compliant"; "in progress" is not, and is absent). A
 * wording that is not here falls through to a rejection — that is the point.
 */
const ESG_OPTION_SYNONYMS: Record<string, string> = {
  // Yes / Partial / No — the tri-state every maturity sheet speaks.
  y: "Yes",
  true: "Yes",
  n: "No",
  false: "No",
  none: "No",
  notinplace: "No",
  partial: "Partial",
  partially: "Partial",
  partialy: "Partial",
  inpart: "Partial",

  // King V application register (`King5_Scorecard` status column).
  applied: "Applied",
  apply: "Applied",
  explained: "Explained",
  explain: "Explained",
  partiallyapplied: "Partially Applied",
  partlyapplied: "Partially Applied",
  notapplied: "Not Applied",

  // IFRS S1/S2 readiness (`IFRS_S1_S2` status column).
  disclosed: "Disclosed",
  fullydisclosed: "Disclosed",
  partiallydisclosed: "Partially Disclosed",
  partlydisclosed: "Partially Disclosed",
  notdisclosed: "Not Disclosed",
  undisclosed: "Not Disclosed",

  // ISO clause tracker (`ISO_Tracker` status column).
  compliant: "Fully Compliant",
  fullycompliant: "Fully Compliant",
  conforming: "Fully Compliant",
  partiallycompliant: "Partially Compliant",
  partlycompliant: "Partially Compliant",
  gap: "Gap",
  noncompliant: "Gap",
  notcompliant: "Gap",
  notapplicable: "Not Applicable",

  // GARP / GRAP control status.
  effective: "Effective",
  partiallyeffective: "Partially Effective",
  ineffective: "Ineffective",
  noteffective: "Ineffective",
  notassessed: "Not Assessed",
  unassessed: "Not Assessed",

  // Supplier self-assessment scores are stored as the strings "5".."1"/"N/A".
  na: "N/A",
  nas: "N/A",
};

/**
 * Match a value to one of the cell's own options — or return null.
 *
 * NEVER picks the closest option. Exact match wins, then a case-insensitive
 * match, then a declared synonym that itself resolves to a permitted option.
 * Anything else is a rejection the user is told about.
 */
export function matchEsgOption(options: readonly string[], raw: unknown): string | null {
  if (typeof raw === "boolean") {
    // A genuine boolean widened to the sheet's vocabulary — the one direction
    // that is safe. (The reverse, "Partial" → false, is what we refuse to do.)
    const asWord = raw ? "Yes" : "No";
    return options.includes(asWord) ? asWord : null;
  }
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const exact = options.find((option) => option === text);
  if (exact) return exact;

  const key = synonymKey(text);
  const insensitive = options.find((option) => synonymKey(option) === key);
  if (insensitive) return insensitive;

  const synonym = ESG_OPTION_SYNONYMS[key];
  if (synonym && options.includes(synonym)) return synonym;

  // A bare 1–5 rating for a supplier score column ("4/5", "4 out of 5").
  const rating = text.match(/^([1-5])\s*(?:\/\s*5|out of 5)?$/i);
  if (rating && options.includes(rating[1])) return rating[1];

  return null;
}

/* ------------------------------------------------------------------ *
 * Scalar coercions
 * ------------------------------------------------------------------ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Shape one value for one cell.
 *
 * `options` is the workbook's own option list for that cell when it has one;
 * pass null for a free cell. The `kind` decides everything else.
 */
export function normaliseEsgValue(
  kind: EsgCellKind,
  raw: unknown,
  options: readonly string[] | null = null,
): EsgNormaliseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "empty", detail: "the parser returned no value" };
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return { ok: false, reason: "empty", detail: "the parser returned an empty value" };
  }

  // A cell with a dropdown is governed by the dropdown, whatever the kind says.
  if (options && options.length > 0) {
    const matched = matchEsgOption(options, raw);
    if (matched === null) {
      return {
        ok: false,
        reason: "no_matching_option",
        detail: `"${String(raw)}" is not one of the workbook's options (${options.join(" / ")}), and we do not pick the nearest`,
      };
    }
    return { ok: true, value: matched };
  }

  switch (kind) {
    case "text":
      return { ok: true, value: String(raw).trim() };

    case "date": {
      const text = String(raw).trim();
      if (!ISO_DATE_RE.test(text) || Number.isNaN(new Date(text).getTime())) {
        return { ok: false, reason: "not_a_date", detail: `"${text}" is not a yyyy-mm-dd date` };
      }
      return { ok: true, value: text };
    }

    case "year": {
      const year = asFiniteNumber(raw);
      if (year === null || !Number.isInteger(year)) {
        return { ok: false, reason: "not_a_number", detail: `"${String(raw)}" is not a year` };
      }
      if (year < 1900 || year > 2200) {
        return {
          ok: false,
          reason: "failed_validation",
          detail: `${year} is outside the range a reporting year can take`,
        };
      }
      return { ok: true, value: year };
    }

    case "count": {
      const count = asFiniteNumber(raw);
      if (count === null) {
        return { ok: false, reason: "not_a_number", detail: `"${String(raw)}" is not a number` };
      }
      if (count < 0 || !Number.isInteger(count)) {
        return {
          ok: false,
          reason: "failed_validation",
          detail: `${count} is not a whole count`,
        };
      }
      return { ok: true, value: count };
    }

    case "percentFraction": {
      const percent = asFiniteNumber(raw);
      if (percent === null) {
        return { ok: false, reason: "not_a_number", detail: `"${String(raw)}" is not a number` };
      }
      if (percent < 0 || percent > 100) {
        return {
          ok: false,
          reason: "failed_validation",
          detail: `${percent} is not a percentage between 0 and 100`,
        };
      }
      /*
       * UNIT CONVERSION — percentage → fraction.
       *
       * The parser emits percentages as printed (0–100; its `percentage`
       * coercion deliberately does NOT rescale a sub-1 figure). Several
       * workbook cells store the same fact as a 0–1 fraction because the
       * threshold they are banded against is a fraction — `G_Data!B8` is
       * scored `band(B8, Assumptions!B50 ?? 0.6)`. Writing 45 into a cell
       * compared against 0.6 would score full marks for 45%.
       */
      return { ok: true, value: Number((percent / 100).toFixed(6)) };
    }

    case "percentWhole": {
      const percent = asFiniteNumber(raw);
      if (percent === null) {
        return { ok: false, reason: "not_a_number", detail: `"${String(raw)}" is not a number` };
      }
      if (percent < 0 || percent > 100) {
        return {
          ok: false,
          reason: "failed_validation",
          detail: `${percent} is not a percentage between 0 and 100`,
        };
      }
      return { ok: true, value: percent };
    }

    case "number": {
      const value = asFiniteNumber(raw);
      if (value === null) {
        return { ok: false, reason: "not_a_number", detail: `"${String(raw)}" is not a number` };
      }
      return { ok: true, value };
    }

    case "select":
      // A select target whose section config carries no options is a config
      // error, not a value error — refuse rather than write free text into a
      // dropdown.
      return {
        ok: false,
        reason: "unknown_field",
        detail: "this cell is a dropdown but the workbook declares no options for it",
      };

    default:
      return { ok: false, reason: "unknown_field", detail: "unrecognised cell kind" };
  }
}
