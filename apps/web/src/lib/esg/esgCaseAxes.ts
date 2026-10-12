/**
 * The sites and reporting months a company's OWN documents name.
 *
 * A workbook that holds no monthly figures yet takes its axes from the figures
 * about to be placed on it. Super Group's five depots and Jul-25…Mar-26 were
 * never any other company's: placed on them, a client's figures filed nowhere
 * (an unknown site) or nowhere in time (a bill after March 2026 had no column).
 *
 * A workbook that already holds monthly figures keeps the axes it has — they
 * are what its saved cells mean, because row and column index, not label, is
 * the key of every monthly grid.
 */
import {
  ESG_AXIS_CELLS,
  buildEsgReportingMonths,
  esgAxisCells,
  esgAxisSettings,
  resolveEsgReportingAxes,
  type EsgAxisSettings,
  type EsgReportingAxes,
} from "@/components/esg-workbook/esgDefaults";
import {
  ESG_MONTHLY_PREFIXES,
  esgCompanyLeads,
  esgIsCompanyLabel,
  esgSiteKey,
  esgSiteMatch,
} from "./esgParserFieldBridge";

/** The parts of a parser case this reads; structural so any case shape fits. */
type CaseLike =
  | {
      ai_entities?: {
        extractions?: Array<{
          element?: unknown;
          sourceFile?: unknown;
          values?: Array<{ field?: unknown; value?: unknown } | null> | null;
        } | null> | null;
        calculator?: {
          rows?: Array<{ grid?: unknown; cells?: Record<string, unknown> | null; sourceFiles?: unknown[] | null } | null> | null;
          entries?: Array<{ key?: unknown; value?: unknown } | null> | null;
        } | null;
      } | null;
    }
  | null
  | undefined;

/** Bills name the site and period they are for under these elements. */
const BILL_ELEMENTS = new Set(["GHG_ENERGY", "WATER"]);

/** A line that is the company, not one of its sites. */
const NOT_A_SITE = /^(grand\s+)?totals?$|^all\s+(sites|depots|branches)$|^company(\s+wide)?$|^(the\s+)?group$|^consolidated$/i;

/**
 * The measures whose grids have a row per site. Only their labels can name a
 * site: an LPG line is a storage point and a business-car line a pool, and
 * both grids are one row whatever the company's sites are.
 */
const PER_SITE_MEASURES = new Set([
  "fleet.diesel_litres",
  "energy.generator_diesel_litres",
  "energy.electricity_kwh",
  "energy.solar_kwh_generated",
  "water.kl",
]);

/**
 * A bill's "site" that is where the meter is, not what the company calls the
 * site: a street address, an erf or stand, a post-box, or an account number.
 * It is a question on the bill's figure, never a row of the workbook.
 */
export function esgLabelIsAddressOrAccount(label: unknown): boolean {
  const text = String(label ?? "").trim();
  if (!text) return false;
  if (/^at\s/i.test(text)) return true;
  // An account, meter, erf or postal number: four or more digits in a row.
  if (/\d{4,}/.test(text)) return true;
  const street = /\b(street|str|st|road|rd|avenue|ave|drive|dr|lane|ln|crescent|cres|boulevard|blvd|highway|hwy|way|close|place|pl)\b/i;
  if (/\d/.test(text) && street.test(text)) return true;
  return /\b(erf|stand|portion|p\.?\s?o\.?\s*box|private\s+bag|postnet)\b/i.test(text);
}

export type EsgAxisEvidence = {
  /**
   * The site labels the company's own registers and tables state a per-site
   * figure for (a dashboard's depot rows). An LPG storage point or a
   * business-car pool is not among them: those grids are one row.
   */
  sites: string[];
  /** The site lines bills state: a site's name, or an address or account that names none. */
  billSites: string[];
  /** Every month a figure was stated for, as "YYYY-MM". */
  months: string[];
  /** The entity's own name, as its documents state it. */
  entityNames: string[];
  /**
   * The reporting years the documents state, one vote per document: a
   * register's "1 July 2025 to 30 June 2026", a dashboard titled "2025-2026".
   * Each is the year's first month, "YYYY-MM".
   */
  statedYears: Array<{ start: string; source: string }>;
};

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A stated date → "YYYY-MM": "2026-03-31", "31/03/2026", "1 July 2025",
 * "JUNE 2026", "Mar 2026". Null for anything else — a date is never guessed.
 */
export function esgStatedMonth(value: unknown): string | null {
  const text = String(value ?? "").trim();
  let m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(text);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const month = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : null;
  }
  m = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    return month >= 0 ? `${m[2]}-${String(month + 1).padStart(2, "0")}` : null;
  }
  return null;
}

const monthIndex = (ym: string): number => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const monthOfIndex = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** "File.xlsx › Sheet" → "File.xlsx": a workbook's sheets are one document's vote. */
const documentOf = (source: unknown): string => String(source ?? "").split("›")[0].trim();

export function esgCaseAxisEvidence(caseResult: CaseLike): EsgAxisEvidence {
  const sites: string[] = [];
  const billSites: string[] = [];
  const months: string[] = [];
  const entityNames: string[] = [];
  const addSite = (into: string[], value: unknown): void => {
    const site = String(value ?? "").trim();
    if (site && !NOT_A_SITE.test(site)) into.push(site);
  };
  const addMonth = (value: unknown): void => {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(value ?? "").trim());
    if (m) months.push(`${m[1]}-${m[2]}`);
  };
  /** Per document, the months its own register figures cover. */
  const sourceMonths = new Map<string, number[]>();

  for (const row of caseResult?.ai_entities?.calculator?.rows ?? []) {
    const cells = row?.cells ?? {};
    if (row?.grid === "esg_monthly_rows") {
      // A bill read as a row names the field it was read as; a table's own
      // figures do not — and only a table names the company's sites.
      const fromBill = String(cells["monthly.field"] ?? "").trim() !== "";
      if (PER_SITE_MEASURES.has(String(cells["monthly.measure"] ?? ""))) {
        addSite(fromBill ? billSites : sites, cells["monthly.site"]);
      }
      addMonth(cells["monthly.period_end"]);
      const stated = /^(\d{4})-(\d{2})/.exec(String(cells["monthly.period_end"] ?? ""));
      const source = documentOf(row?.sourceFiles?.[0]);
      if (stated && source && !fromBill) {
        const list = sourceMonths.get(source) ?? [];
        list.push(monthIndex(`${stated[1]}-${stated[2]}`));
        sourceMonths.set(source, list);
      }
    } else if (row?.grid === "energy_site_rows") {
      addSite(billSites, cells["energy.site_name"]);
      addMonth(cells["energy.billing_period_end"] ?? cells["energy.billing_period_start"]);
    }
  }
  for (const entry of caseResult?.ai_entities?.calculator?.entries ?? []) {
    if (entry?.key === "entity.name" && String(entry.value ?? "").trim()) entityNames.push(String(entry.value).trim());
  }

  const statedYears: Array<{ start: string; source: string }> = [];
  const voted = new Set<string>();
  const vote = (start: string, source: string): void => {
    const document = documentOf(source);
    if (voted.has(document)) return;
    voted.add(document);
    statedYears.push({ start, source: document });
  };

  for (const extraction of caseResult?.ai_entities?.extractions ?? []) {
    // A bill's site and period are only on its own extraction: across the case
    // they are resolved into one value per field, which two bills contest.
    if (BILL_ELEMENTS.has(String(extraction?.element ?? ""))) {
      for (const entry of extraction?.values ?? []) {
        if (entry?.field === "site_name") addSite(billSites, entry.value);
        else if (entry?.field === "billing_period_end") addMonth(entry.value);
      }
    }
    // A stated reporting period a year long is the company's reporting year.
    // (An employment-equity return states the EE period, which is its own.)
    const value = (field: string) => extraction?.values?.find((v) => v?.field === field)?.value;
    const start = esgStatedMonth(value("reporting_period_start"));
    const end = esgStatedMonth(value("reporting_period_end"));
    if (start && end && monthIndex(end) - monthIndex(start) === 11) vote(start, String(extraction?.sourceFile ?? ""));
    for (const entry of extraction?.values ?? []) {
      if (entry?.field === "entity_name" && String(entry.value ?? "").trim()) entityNames.push(String(entry.value).trim());
    }
  }
  // A table titled for a financial year ("Dashboard 2025-2026", "FY2025/26")
  // states it too; the year starts in the first month its own figures cover.
  for (const [source, indexes] of Array.from(sourceMonths.entries())) {
    const title = /(?:^|[^\d])(20\d\d)\s*[-–/]\s*(20\d\d|\d\d)(?!\d)/.exec(source);
    if (!title) continue;
    const from = Number(title[1]);
    const to = title[2].length === 2 ? Math.floor(from / 100) * 100 + Number(title[2]) : Number(title[2]);
    if (to !== from + 1) continue;
    const first = Math.min(...indexes);
    // The year runs from a month of the first year named into the second.
    if (Math.floor(first / 12) !== from || first % 12 === 0) continue;
    vote(monthOfIndex(first), source);
  }
  return { sites, billSites, months, entityNames, statedYears };
}

/**
 * Site labels → one name per site. Documents name a site their own ways
 * ("NTH", "ACME RETAIL - NORTHFIELD"); each site keeps its shortest name,
 * a lead every name shares ("ACME RETAIL") is dropped, and the list is
 * alphabetical so the same documents give the same rows in any upload order.
 *
 * A label that is only that lead, or the entity's own name, is the company
 * — its figures are a company total, never a site's. An address or an
 * account number is where a meter is, not a site.
 *
 * A label that could be either of two sites already listed is not a site of
 * its own — and not either of them: its figures stay unplaced, with a note.
 */
export function esgSitesFromLabels(labels: readonly string[], entityNames: readonly string[] = []): string[] {
  const named = labels.map((l) => l.trim()).filter(Boolean);
  const leads = esgCompanyLeads(named);
  const byKey = new Map<string, string>();
  for (const label of named) {
    if (esgIsCompanyLabel(label, leads, entityNames) || esgLabelIsAddressOrAccount(label)) continue;
    const site = withoutCompanyLead(label, leads);
    const key = esgSiteKey(site);
    if (key && !byKey.has(key)) byKey.set(key, site);
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

/** "ACME RETAIL - RIVERSIDE" with the lead "ACME RETAIL" is the site RIVERSIDE. */
function withoutCompanyLead(label: string, leads: readonly string[]): string {
  const joined = esgSiteKey(label);
  const lead = leads.find((l) => joined.startsWith(`${l} `));
  return lead ? joined.slice(lead.length + 1) : label;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const axisLabel = (index: number): string =>
  `${MONTH_LABELS[index % 12]}-${String(Math.floor(index / 12) % 100).padStart(2, "0")}`;

/**
 * The reporting months that cover the documents' figures, when no document
 * states the reporting year: from the earliest month, a year long.
 *
 * Figures that run past one year are not one year. The company's year starts
 * in the month its earliest figures do, and the reporting year is the latest
 * such year — the one the newest figures fall in. The year before it is the
 * prior year (a baseline), never merged into this one.
 */
export function esgMonthsFromEvidence(months: readonly string[]): string[] {
  const indexes = months
    .map((ym) => monthIndex(ym))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (indexes.length === 0) return [];
  const last = indexes[indexes.length - 1];
  let first = indexes[0];
  if (last - first + 1 > 12) first += Math.floor((last - first) / 12) * 12;
  return buildEsgReportingMonths(axisLabel(first), 12);
}

/** What the reporting year is, and what said so. */
export type EsgReportingYear = {
  /** The year's twelve months, as axis labels ("Jul-25" …). */
  months: string[];
  /** "stated": documents state it; "figures": the figures' own months suggest it. */
  basis: "stated" | "figures";
  /** The documents that state it (stated only). */
  statedBy: string[];
  /** Other years documents state, with what states them — a disagreement to show. */
  otherYears: Array<{ months: string[]; statedBy: string[] }>;
};

/**
 * The company's reporting year, proposed from its documents. A year the
 * documents STATE wins — the year most of them state, the latest on a tie —
 * because the figures alone mix years: last year's dashboard beside this
 * year's is twenty-four months of figures, not a reporting year of twenty-four
 * months. With no stated year, the figures' own months suggest one.
 */
export function esgReportingYear(evidence: EsgAxisEvidence): EsgReportingYear | null {
  const votes = new Map<string, string[]>();
  for (const { start, source } of evidence.statedYears) votes.set(start, [...(votes.get(start) ?? []), source]);
  const ranked = Array.from(votes.entries()).sort((a, b) => b[1].length - a[1].length || b[0].localeCompare(a[0]));
  const yearOf = (start: string) => buildEsgReportingMonths(axisLabel(monthIndex(start)), 12);
  if (ranked.length > 0) {
    return {
      months: yearOf(ranked[0][0]),
      basis: "stated",
      statedBy: ranked[0][1],
      otherYears: ranked.slice(1).map(([start, sources]) => ({ months: yearOf(start), statedBy: sources })),
    };
  }
  const months = esgMonthsFromEvidence(evidence.months);
  return months.length ? { months, basis: "figures", statedBy: [], otherYears: [] } : null;
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
 * The company's sites, from its documents: the sites its registers and tables
 * name, and the site NAMES its bills give. A bill's street address or account
 * number is where a meter is, not a site — a question on that bill's figure.
 */
export function esgCaseSites(evidence: EsgAxisEvidence): string[] {
  return esgSitesFromLabels([...evidence.sites, ...evidence.billSites], evidence.entityNames);
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
  /**
   * What the person confirmed on the create form, over what the documents
   * proposed: their reporting year, their list of sites. Recorded with the
   * figures exactly as a proposal from the documents would be.
   */
  confirmed?: { months?: string[]; depots?: string[] } | null,
): { axes: EsgReportingAxes; cells: Record<string, string | number> } {
  if (workbook?.filled) return { axes: resolveEsgReportingAxes(workbook), cells: {} };

  const evidence = esgCaseAxisEvidence(caseResult);
  // A confirmed empty list is a company reporting as one.
  const sites = workbook?.depots ?? confirmed?.depots ?? esgCaseSites(evidence);
  const months =
    workbook?.months ?? (confirmed?.months?.length ? confirmed.months : esgReportingYear(evidence)?.months ?? []);
  const companyWide = workbook?.companyWide ?? (sites.length === 0 && months.length > 0);
  const axes = resolveEsgReportingAxes({ depots: sites, months, companyWide });

  const derived =
    (!workbook?.depots && sites.length > 0) ||
    (!workbook?.months && months.length > 0) ||
    (workbook?.companyWide === undefined && companyWide);
  return { axes, cells: derived ? esgAxisCells(axes) : {} };
}

/**
 * Months of the reporting year that hold a placed monthly figure — the
 * "months of actual data" (`Assumptions!B111`) the carbon-tax and intensity
 * figures annualise by. A month every grid leaves blank or zero is not one.
 */
export function esgMonthsWithFigures(eData?: Record<string, unknown> | null): number {
  const columns = new Set<string>();
  for (const [ref, value] of Object.entries(eData ?? {})) {
    if (!MONTHLY_CELL.test(ref)) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n !== 0) columns.add(/_([C-Z])\d+$/.exec(ref)![1]);
  }
  return columns.size;
}
