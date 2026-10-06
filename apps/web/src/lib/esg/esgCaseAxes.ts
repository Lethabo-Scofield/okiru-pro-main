/**
 * The sites and reporting months a company's OWN documents name.
 *
 * A workbook that holds no monthly figures yet takes its axes from the figures
 * about to be placed on it. Acme Group's five depots and Jul-25…Mar-26 were
 * never any other company's: placed on them, a client's figures filed nowhere
 * (an unknown site) or nowhere in time (a bill after March 2026 had no column).
 *
 * A workbook that already holds monthly figures keeps the axes it has — they
 * are what its saved cells mean, because row and column index, not label, is
 * the key of every monthly grid.
 */
import {
  ESG_AXIS_CELLS,
  ESG_MAX_REPORTING_MONTHS,
  buildEsgReportingMonths,
  esgAxisCells,
  esgAxisSettings,
  resolveEsgReportingAxes,
  type EsgAxisSettings,
  type EsgReportingAxes,
} from "@/components/esg-workbook/esgDefaults";
import { ESG_MONTHLY_PREFIXES, esgSiteKey, esgSiteMatch } from "./esgParserFieldBridge";

/** The parts of a parser case this reads; structural so any case shape fits. */
type CaseLike =
  | {
      ai_entities?: {
        extractions?: Array<{ element?: unknown; values?: Array<{ field?: unknown; value?: unknown } | null> | null } | null> | null;
        calculator?: { rows?: Array<{ grid?: unknown; cells?: Record<string, unknown> | null } | null> | null } | null;
      } | null;
    }
  | null
  | undefined;

/** Bills name the site and period they are for under these elements. */
const BILL_ELEMENTS = new Set(["GHG_ENERGY", "WATER"]);

/** A line that is the company, not one of its sites. */
const NOT_A_SITE = /^(grand\s+)?totals?$|^all\s+(sites|depots|branches)$|^company(\s+wide)?$|^(the\s+)?group$|^consolidated$/i;

export type EsgAxisEvidence = {
  /** Every site label a figure was stated for, as the documents wrote it. */
  sites: string[];
  /** Every month a figure was stated for, as "YYYY-MM". */
  months: string[];
};

export function esgCaseAxisEvidence(caseResult: CaseLike): EsgAxisEvidence {
  const sites: string[] = [];
  const months: string[] = [];
  const addSite = (value: unknown): void => {
    const site = String(value ?? "").trim();
    if (site && !NOT_A_SITE.test(site)) sites.push(site);
  };
  const addMonth = (value: unknown): void => {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(value ?? "").trim());
    if (m) months.push(`${m[1]}-${m[2]}`);
  };

  for (const row of caseResult?.ai_entities?.calculator?.rows ?? []) {
    const cells = row?.cells ?? {};
    if (row?.grid === "esg_monthly_rows") {
      addSite(cells["monthly.site"]);
      addMonth(cells["monthly.period_end"]);
    } else if (row?.grid === "energy_site_rows") {
      addSite(cells["energy.site_name"]);
      addMonth(cells["energy.billing_period_end"] ?? cells["energy.billing_period_start"]);
    }
  }
  // A bill's site and period are only on its own extraction: across the case
  // they are resolved into one value per field, which two bills contest.
  for (const extraction of caseResult?.ai_entities?.extractions ?? []) {
    if (!BILL_ELEMENTS.has(String(extraction?.element ?? ""))) continue;
    for (const entry of extraction?.values ?? []) {
      if (entry?.field === "site_name") addSite(entry.value);
      else if (entry?.field === "billing_period_end") addMonth(entry.value);
    }
  }
  return { sites, months };
}

/**
 * Site labels → one name per site. Documents name a site their own ways
 * ("ALDER", "ACME CONSUMER - ALDERWOOD"); each site keeps its shortest name,
 * a lead every name shares ("ACME CONSUMER") is dropped, and the list is
 * alphabetical so the same documents give the same rows in any upload order.
 *
 * A label that could be either of two sites already listed is not a site of
 * its own — and not either of them: its figures stay unplaced, with a note.
 */
export function esgSitesFromLabels(labels: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const label of withoutCompanyLead(labels.map((l) => l.trim()).filter(Boolean))) {
    const key = esgSiteKey(label);
    if (key && !byKey.has(key)) byKey.set(key, label);
  }
  const shortestFirst = Array.from(byKey.values()).sort(
    (a, b) => esgSiteKey(a).length - esgSiteKey(b).length || a.localeCompare(b),
  );
  const sites: string[] = [];
  for (const label of shortestFirst) {
    if (esgSiteMatch(label, sites) === null) sites.push(label);
  }
  return sites.sort((a, b) => a.localeCompare(b));
}

/**
 * Drop the company's own name from the front of its site labels: "ACME CONSUMER
 * - FENWICK" is the site FENWICK. A lead counts as the company's when three
 * different labels carry it, or two do and set it off with a dash, colon or
 * slash — two sites that merely share a first word ("GREEN HARBOUR", "GREEN
 * VALLEY") keep it.
 */
function withoutCompanyLead(labels: string[]): string[] {
  const words = labels.map((label) => esgSiteKey(label).split(" ").filter(Boolean));
  // Counted over DIFFERENT labels: twelve bills naming one site are one label.
  const unique = new Map<string, string>();
  labels.forEach((label, i) => {
    const key = words[i].join(" ");
    if (key && !unique.has(key)) unique.set(key, label);
  });
  const counts = new Map<string, { labels: number; setOff: number }>();
  for (const [key, label] of Array.from(unique.entries())) {
    const w = key.split(" ");
    // "ACME CONSUMER - FENWICK" → ["", "ACME", " ", "CONSUMER", " - ", "FENWICK", ""]:
    // the text after the n-th word is element 2n.
    const pieces = label.toUpperCase().split(/([A-Z0-9]+)/);
    for (let n = 1; n < w.length; n += 1) {
      const lead = w.slice(0, n).join(" ");
      const count = counts.get(lead) ?? { labels: 0, setOff: 0 };
      count.labels += 1;
      if (/[-–—:|/]/.test(pieces[2 * n] ?? "")) count.setOff += 1;
      counts.set(lead, count);
    }
  }
  const leads = Array.from(counts.entries())
    .filter(([, count]) => count.labels >= 3 || count.setOff >= 2)
    .map(([lead]) => lead)
    .sort((a, b) => b.length - a.length);
  if (leads.length === 0) return labels;
  return words.map((w, i) => {
    const joined = w.join(" ");
    const lead = leads.find((l) => joined.startsWith(`${l} `));
    return lead ? joined.slice(lead.length + 1) : labels[i];
  });
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The reporting months that cover the documents' figures: from the earliest
 * month, a year long — longer when the figures run longer, up to the grid's
 * limit. Figures spanning more than that keep the latest twelve months.
 */
export function esgMonthsFromEvidence(months: readonly string[]): string[] {
  const indexes = months
    .map((ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (indexes.length === 0) return [];
  const last = indexes[indexes.length - 1];
  let first = indexes[0];
  let span = last - first + 1;
  if (span > ESG_MAX_REPORTING_MONTHS) {
    first = last - 11;
    span = 12;
  }
  const label = `${MONTH_LABELS[first % 12]}-${String(Math.floor(first / 12) % 100).padStart(2, "0")}`;
  return buildEsgReportingMonths(label, Math.max(12, span));
}

/** A workbook's axes, and whether it already holds figures placed on them. */
export type EsgWorkbookAxisState = EsgAxisSettings & {
  /** Monthly figures are saved: the axes are what those cells mean, and stay. */
  filled: boolean;
};

const MONTHLY_CELL = new RegExp(
  `^(?:${[...Object.values(ESG_MONTHLY_PREFIXES), "waste"].join("|")})_[C-Z]\\d+$`,
);

export function esgWorkbookAxisState(eData?: Record<string, unknown> | null): EsgWorkbookAxisState {
  const cells = eData ?? {};
  const filled = Object.entries(cells).some(
    ([ref, value]) => MONTHLY_CELL.test(ref) && value !== "" && value !== null && value !== undefined,
  );
  return { ...esgAxisSettings(cells), filled };
}

/** True for the E_Data cells that record a workbook's axes rather than a figure. */
export function isEsgAxisCell(cellRef: string): boolean {
  return (Object.values(ESG_AXIS_CELLS) as string[]).includes(cellRef);
}

/** Grids with a row per site (one row when the company reports as one). */
const PER_SITE_PREFIXES: readonly string[] = [
  ESG_MONTHLY_PREFIXES.fleetDiesel,
  ESG_MONTHLY_PREFIXES.generatorDiesel,
  ESG_MONTHLY_PREFIXES.electricity,
  ESG_MONTHLY_PREFIXES.solar,
  ESG_MONTHLY_PREFIXES.water,
];
/** Grids that are one row whatever the scope. */
const ONE_ROW_PREFIXES: readonly string[] = [ESG_MONTHLY_PREFIXES.lpg, ESG_MONTHLY_PREFIXES.businessCars, "waste"];

const columnLetter = (index: number): string => String.fromCharCode(67 + index);

/** Old row index → new row index, by what each row MEANS. */
function rowMap(from: EsgReportingAxes, to: EsgReportingAxes): Map<number, number> {
  const map = new Map<number, number>();
  const fromRows = from.companyWide ? ["Company wide"] : from.depots;
  if (to.companyWide) {
    // One row for the company: every site's figures add up into it.
    fromRows.forEach((_, i) => map.set(i, 0));
    return map;
  }
  if (from.companyWide) {
    // A company total cannot be split into sites — unless there is one site.
    if (to.depots.length === 1) map.set(0, 0);
    return map;
  }
  const freeNew = new Set(to.depots.map((_, j) => j));
  const freeOld: number[] = [];
  from.depots.forEach((label, i) => {
    const j = to.depots.findIndex((d, k) => freeNew.has(k) && esgSiteKey(d) === esgSiteKey(label));
    if (j >= 0) {
      map.set(i, j);
      freeNew.delete(j);
    } else freeOld.push(i);
  });
  const stillOld: number[] = [];
  for (const i of freeOld) {
    const open = Array.from(freeNew);
    const match = esgSiteMatch(from.depots[i], open.map((k) => to.depots[k]));
    if (typeof match === "number") {
      map.set(i, open[match]);
      freeNew.delete(open[match]);
    } else stillOld.push(i);
  }
  // As many sites gone as came: renamed where they stood.
  const stillNew = Array.from(freeNew).sort((a, b) => a - b);
  if (stillOld.length === stillNew.length) stillOld.forEach((i, n) => map.set(i, stillNew[n]));
  return map;
}

/**
 * Move a workbook's monthly figures from one set of axes to another, by what
 * each row and column MEANS. A site keeps its figures when the list is
 * reordered, renamed where it stands or added to; a month keeps its figures
 * when the year moves or lengthens; switching to "Company wide" adds the
 * sites up. A figure with nowhere to go is named in `lost`, and the caller
 * refuses the change: a figure is never moved to another site or month, nor
 * dropped.
 *
 * `patch` sets every moved figure and blanks every cell it left.
 */
export function remapEsgMonthlyCells(
  cells: Record<string, unknown>,
  from: EsgReportingAxes,
  to: EsgReportingAxes,
): { patch: Record<string, string | number>; lost: string[] } {
  const rows = rowMap(from, to);
  const months = new Map<string, number>(to.months.map((m, j) => [m.toUpperCase(), j]));
  const next = new Map<string, number>();
  const sources = new Map<string, string>();
  const lost = new Set<string>();
  const left = new Set<string>();

  for (const [ref, raw] of Object.entries(cells)) {
    const m = /^([a-z0-9]+)_([C-Z])(\d+)$/i.exec(ref);
    const src = /^([a-z0-9]+)_src_(\d+)$/i.exec(ref);
    const prefix = (m ?? src)?.[1] ?? "";
    const perSite = PER_SITE_PREFIXES.includes(prefix);
    if (!perSite && !ONE_ROW_PREFIXES.includes(prefix)) continue;
    const oldRow = m ? Number(m[3]) - 14 : Number(src![2]);
    const newRow = perSite ? rows.get(oldRow) : oldRow === 0 ? 0 : undefined;
    const fromRows = from.companyWide ? ["the company"] : from.depots;
    const rowName = perSite ? fromRows[oldRow] ?? `row ${oldRow + 1}` : "the company";

    if (src) {
      // A row's source note follows its row; notes added up stay readable.
      left.add(ref);
      const text = String(raw ?? "").trim();
      if (!text || newRow === undefined) continue;
      const key = `${prefix}_src_${newRow}`;
      const prior = sources.get(key);
      sources.set(key, prior && prior !== text ? `${prior}; ${text}` : text);
      continue;
    }

    const value = Number(raw);
    if (raw === "" || raw === null || raw === undefined || !Number.isFinite(value)) continue;
    left.add(ref);
    const month = from.months[m![2].charCodeAt(0) - 67];
    const column = month === undefined ? undefined : months.get(month.toUpperCase());
    if (newRow === undefined) {
      lost.add(perSite && to.companyWide !== true && from.companyWide ? "the company-wide figures (they cannot be split into sites)" : `${rowName}'s figures`);
      continue;
    }
    if (column === undefined) {
      lost.add(`the figures for ${month ?? `column ${m![2]}`}`);
      continue;
    }
    const target = `${prefix}_${columnLetter(column)}${14 + newRow}`;
    next.set(target, Math.round(((next.get(target) ?? 0) + value) * 1e4) / 1e4);
  }

  const patch: Record<string, string | number> = {};
  for (const ref of Array.from(left)) patch[ref] = "";
  for (const [ref, value] of Array.from(next.entries())) patch[ref] = value;
  for (const [ref, text] of Array.from(sources.entries())) patch[ref] = text;
  return { patch, lost: Array.from(lost) };
}

/**
 * The axes to place a case on, and the E_Data cells that record them when any
 * of them came from the documents.
 *
 * What the workbook states wins; what it leaves open is taken from the case. A
 * case whose figures name months but no site at all is a company reporting as
 * one — unless the workbook says it reports per site.
 */
export function esgPlacementAxes(
  caseResult: CaseLike,
  workbook?: EsgWorkbookAxisState | null,
): { axes: EsgReportingAxes; cells: Record<string, string | number> } {
  if (workbook?.filled) return { axes: resolveEsgReportingAxes(workbook), cells: {} };

  const evidence = esgCaseAxisEvidence(caseResult);
  const sites = workbook?.depots ?? esgSitesFromLabels(evidence.sites);
  const months = workbook?.months ?? esgMonthsFromEvidence(evidence.months);
  const companyWide = workbook?.companyWide ?? (sites.length === 0 && months.length > 0);
  const axes = resolveEsgReportingAxes({ depots: sites, months, companyWide });

  const derived =
    (!workbook?.depots && sites.length > 0) ||
    (!workbook?.months && months.length > 0) ||
    (workbook?.companyWide === undefined && companyWide);
  return { axes, cells: derived ? esgAxisCells(axes) : {} };
}
