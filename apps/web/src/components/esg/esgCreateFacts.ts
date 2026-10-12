/**
 * The facts a new ESG workbook is created ON, proposed from the documents and
 * confirmed by the person: the reporting year, the company's sites, its
 * organisational boundary, and — when the documents hold last year's figures —
 * whether those become the baseline.
 *
 * The rule is the B-BBEE year-end gate's: what the documents state is
 * proposed, and wins unless the person changes it on the form. Nothing here is
 * guessed into the workbook: a stated year is shown with what stated it; a year
 * only the figures suggest says so; last year's figures are written only when
 * the person takes them as the baseline.
 */
import {
  esgCaseAxisEvidence,
  esgCaseSites,
  esgReportingYear,
  type EsgReportingYear,
} from "@/lib/esg/esgCaseAxes";
import type { EsgPriorYear } from "@/lib/esg/esgParserToWorkbook";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeGhgInventory } from "../../../EsgToolkit/src/lib/calculators/ghgInventory";
import type { EsgParserCaseLike, EsgSectionPatches } from "./esgParserInjection";

/** The organisational boundaries the cover sheet offers (GHG Protocol). */
export const ESG_BOUNDARY_OPTIONS = ["Operational control", "Financial control", "Equity share"] as const;

export interface EsgCreateProposal {
  /** The reporting year the documents state (or their figures suggest); null with nothing dated. */
  year: EsgReportingYear | null;
  /** The company's sites as its own registers name them. */
  sites: string[];
}

export function esgCreateProposal(parserCase: EsgParserCaseLike | null): EsgCreateProposal {
  const evidence = esgCaseAxisEvidence(parserCase);
  return { year: esgReportingYear(evidence), sites: esgCaseSites(evidence) };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jul-25" → "July 2025". */
function longMonth(label: string): string {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label.trim());
  if (!m) return label;
  const index = SHORT.indexOf(m[1].toLowerCase());
  return index < 0 ? label : `${MONTH_NAMES[index]} 20${m[2]}`;
}

/** A reporting year as the cover sheet states it: "July 2025 to June 2026". */
export function esgPeriodLabel(months: readonly string[]): string {
  if (months.length === 0) return "";
  return `${longMonth(months[0])} to ${longMonth(months[months.length - 1])}`;
}

/**
 * What last year's figures would put in the baseline cells: last year's
 * electricity (`E_Data!B92`) and last year's Scope 1 + 2 (`E_Data!B90`),
 * worked out by the same inventory the emissions page shows, with the
 * company's sector factors.
 */
export function esgPriorYearBaseline(
  priorYear: EsgPriorYear | null | undefined,
  patches: EsgSectionPatches,
): { B90?: number; B92?: number } {
  if (!priorYear || priorYear.measures.length === 0) return {};
  const sector =
    patches["company-reporting-setup"]?.cells?.sector ?? patches.assumptions?.cells?.B10 ?? undefined;
  const workbook: EsgWorkbookData = {
    companyId: "",
    updatedAt: "",
    sections: {
      "e-data": { cells: priorYear.cells },
      ...(sector ? { assumptions: { cells: { B10: sector } } } : {}),
    },
  };
  const inventory = computeGhgInventory(workbook);
  const electricity = priorYear.measures.find((m) => m.prefix === "s2")?.total;
  const out: { B90?: number; B92?: number } = {};
  if (electricity && electricity > 0) out.B92 = Math.round(electricity * 100) / 100;
  if (inventory.scope1And2 > 0) out.B90 = Math.round(inventory.scope1And2 * 100) / 100;
  return out;
}

export interface EsgCreateFacts {
  /** The reporting year's months, as confirmed. */
  months: string[];
  /** Organisational boundary, when the person declared one. */
  boundary?: string;
  /** Take last year's figures as the baseline. */
  useBaseline?: boolean;
}

/**
 * The cover and baseline cells the confirmed facts write, merged over what
 * the documents placed: the reporting period, the boundary, and — only when
 * the person took it — the baseline from last year's figures.
 */
export function esgCreateFactCells(
  facts: EsgCreateFacts,
  patches: EsgSectionPatches,
  priorYear?: EsgPriorYear | null,
): EsgSectionPatches {
  const next: EsgSectionPatches = { ...patches };
  const cover = { ...(next["company-reporting-setup"]?.cells ?? {}) };
  const period = esgPeriodLabel(facts.months);
  if (period) cover.period = period;
  if (facts.boundary && (ESG_BOUNDARY_OPTIONS as readonly string[]).includes(facts.boundary)) cover.boundary = facts.boundary;
  next["company-reporting-setup"] = { cells: cover };
  if (facts.useBaseline) {
    const baseline = esgPriorYearBaseline(priorYear, patches);
    if (Object.keys(baseline).length > 0) {
      next["e-data"] = { cells: { ...(next["e-data"]?.cells ?? {}), ...baseline } };
    }
  }
  return next;
}
