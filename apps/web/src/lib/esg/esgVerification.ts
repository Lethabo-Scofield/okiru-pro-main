/**
 * ESG verification: every total checked against the documents it comes from.
 *
 * The B-BBEE side has a claim-vs-evidence layer (`apps/api/pipeline/
 * verification`); ESG had only completeness checks, so the known traps passed
 * silently — a dashboard's printed total that is not the sum of its own site
 * rows, water in litres beside water in kilolitres, a bill booked a month
 * later than it was consumed, a fleet register that accounts for three
 * quarters of the depots' diesel, a contractor's stated diversion rate the
 * workbook shows as 0 %.
 *
 * Every check here is FLAG-ONLY: it reports pass / flag / needs-you /
 * out-of-period with the document and field it read, and never changes a
 * figure or a point. Each one is a rule from the standard the toolkit
 * implements, never a value from one pack:
 *
 *   V1  a document's printed totals = the sum of its own site rows
 *   V2  a bill or meter reading = the grid figure for its site and month
 *       (one month either way is a booking offset: needs-you)
 *   V3  fuel records agree across documents; diesel issued to external
 *       vehicles is not also recorded as the company's own use
 *   V4  the fleet register's litres ≈ the depots' Scope 1A litres (0.9–1.1)
 *   V5  the waste contractor's total / diverted / landfill against the
 *       register and the diversion rate (B16); unitless rows held
 *   V6  EE: a document outside the reporting year is out of period; the
 *       level matrix adds up to the stated total
 *   V7  incident-register counts = S_Data's quarterly cells; LTIFR only
 *       with hours worked (per 1 000 000 hours, the expert ruling)
 *   V8  the GHG factor basis is stated and signed off; activity against a
 *       client emissions-system export, with boundary items listed
 *   V9  coverage: sites × months filled per grid; months of actuals (B111)
 *   V10 register sanity: duplicates, undated rows, actual > planned
 *
 * Tolerance: two figures agree within 0.1 % (or half a unit, for small
 * figures) — rounding, not a judgement about materiality.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { readEsgCell } from "@/lib/esgWorkbookStorage";
import type { EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import { ESG_ONE_ROW_BLOCKS, esgGridCoverage, esgGridAddress } from "../../../EsgToolkit/src/lib/calculators/esgCoverage";
import { computeFleetEmissions } from "../../../EsgToolkit/src/lib/calculators/fleetEmissions";
import { computeGhgInventory } from "../../../EsgToolkit/src/lib/calculators/ghgInventory";
import { deriveEsgSummaryCells } from "./esgDeriveSummary";
import { esgReportingYear, type EsgReportingYear } from "./esgFactPeriod";
import { readEsgGridRows } from "./esgGridRows";
import { esgIncidentCounts, ESG_INJURY_ROWS, INCIDENT_ROWS_FIELD } from "./esgIncidentCounts";
import { ESG_MONTHLY_PREFIXES, esgMonthColumnFor, esgSiteMatch } from "./esgParserFieldBridge";
import type { EsgCalculatorEntryLike, EsgCalculatorRowLike } from "./esgParserToWorkbook";
import { esgWasteDiversionUnknownReason, readEsgWasteSummary } from "./esgWasteSummary";

export type EsgCheckStatus = "pass" | "flag" | "needs-you" | "out-of-period";
export type EsgCheckCode = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10";

export interface EsgCheckEvidence {
  /** The file (and sheet) the figure was read from, or "Workbook". */
  document: string;
  /** What the figure is: the measure and month, the cell. */
  field: string;
  value: unknown;
}

export interface EsgVerificationCheck {
  /** Stable within a report. */
  id: string;
  code: EsgCheckCode;
  /** What the check is about, in words. */
  subject: string;
  status: EsgCheckStatus;
  /** Always flag-only: no ESG check moves a figure or a point. */
  rule: "flag-only";
  /** One plain paragraph. */
  statement: string;
  evidence: EsgCheckEvidence[];
  tolerance?: string;
}

export interface EsgVerificationReport {
  version: 1;
  period: EsgReportingYear | null;
  checks: EsgVerificationCheck[];
  counts: Record<EsgCheckStatus, number>;
}

/** A figure held out of the workbook by the placement, and why. */
export interface EsgHeldFact {
  field: string;
  value?: unknown;
  sourceFile: string;
  reason: string;
  rejection?: string;
}

export interface EsgVerificationInput {
  calculator: { entries?: EsgCalculatorEntryLike[]; rows?: EsgCalculatorRowLike[] } | null | undefined;
  /** Each document read, by the reader that read it: tells a bill or an emissions export from a dashboard. */
  extractions?: ReadonlyArray<{ documentId?: unknown; documentName?: unknown; sourceFile?: unknown } | null> | null;
  axes: EsgReportingAxes;
  /** The workbook the figures were placed in. Derived cells are derived here. */
  workbook: EsgWorkbookData;
  /** Figures the placement held (out of period, unit unresolved). */
  held?: readonly EsgHeldFact[];
}

const TOLERANCE = "within 0.1 % (or half a unit)";

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Two figures that are the same figure, up to rounding. */
export function esgFiguresAgree(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.5, 0.001 * Math.max(Math.abs(a), Math.abs(b)));
}

/** a ÷ b is a factor of 1 000 either way: one of them is in another unit. */
function thousandFold(a: number, b: number): boolean {
  if (a === 0 || b === 0) return false;
  const r = Math.abs(a / b);
  return Math.abs(r - 1000) / 1000 < 0.01 || Math.abs(r - 0.001) / 0.001 < 0.01;
}

/** 12345.678 → "12 345.68"; whole figures without decimals. */
export function esgFigure(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [whole, frac] = Math.abs(rounded).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${rounded < 0 ? "-" : ""}${grouped}${frac === "00" ? "" : `.${frac}`}`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-07" → "Jul-25". */
const monthLabel = (ym: string): string => `${MONTH_ABBR[Number(ym.slice(5, 7)) - 1] ?? "?"}-${ym.slice(2, 4)}`;
const ymOf = (raw: unknown): string | null => {
  const m = /^(\d{4})-(\d{2})/.exec(String(raw ?? ""));
  return m ? `${m[1]}-${m[2]}` : null;
};
const shiftYm = (ym: string, by: number): string => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 15));
  return d.toISOString().slice(0, 7);
};

/** The file a source names, without the sheet (`Book.xlsx › Sheet1` → `Book.xlsx`). */
const fileOf = (source: string): string => source.split(" › ")[0].trim();
const sourceOf = (row: { sourceFiles?: string[] }): string => (row.sourceFiles ?? []).filter(Boolean).join("; ") || "an unnamed document";

/** The monthly measures, in words and with the grid each is kept in. */
const MEASURES: Record<string, { label: string; unit: string; prefix?: string; fuel?: boolean }> = {
  "energy.electricity_kwh": { label: "Electricity", unit: "kWh", prefix: ESG_MONTHLY_PREFIXES.electricity },
  "energy.solar_kwh_generated": { label: "Solar generated", unit: "kWh", prefix: ESG_MONTHLY_PREFIXES.solar },
  "water.kl": { label: "Water", unit: "kL", prefix: ESG_MONTHLY_PREFIXES.water },
  "fleet.diesel_litres": { label: "Fleet diesel", unit: "L", prefix: ESG_MONTHLY_PREFIXES.fleetDiesel, fuel: true },
  "energy.generator_diesel_litres": { label: "Generator diesel", unit: "L", prefix: ESG_MONTHLY_PREFIXES.generatorDiesel, fuel: true },
  "energy.lpg_kg": { label: "LPG", unit: "kg", prefix: ESG_MONTHLY_PREFIXES.lpg, fuel: true },
  "fleet.business_car_petrol_litres": { label: "Business car fuel", unit: "L", prefix: ESG_MONTHLY_PREFIXES.businessCars, fuel: true },
  "fleet.distance_km": { label: "Fleet distance", unit: "km" },
  "fleet.external_diesel_issued_litres": { label: "Diesel issued to external vehicles", unit: "L", fuel: true },
};
const measureLabel = (measure: string) => MEASURES[measure]?.label ?? measure;
const measureUnit = (measure: string) => MEASURES[measure]?.unit ?? "";

interface MonthlyRead {
  source: string;
  file: string;
  measure: string;
  site: string | null;
  ym: string | null;
  value: number;
  /** A single figure read from a bill or account (the row names the field it was read as). */
  single: boolean;
}

function monthlyReads(rows: readonly EsgCalculatorRowLike[]): MonthlyRead[] {
  const out: MonthlyRead[] = [];
  for (const row of rows) {
    if (row.grid !== "esg_monthly_rows") continue;
    const value = num(row.cells["monthly.value"]);
    const measure = String(row.cells["monthly.measure"] ?? "").trim();
    if (value === null || !measure) continue;
    const site = String(row.cells["monthly.site"] ?? "").trim();
    const source = sourceOf(row);
    out.push({
      source,
      file: fileOf(source),
      measure,
      site: site || null,
      ym: ymOf(row.cells["monthly.period_end"]),
      value,
      single: String(row.cells["monthly.field"] ?? "").trim() !== "",
    });
  }
  return out;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/* ------------------------------------------------------------------ *
 * V1 — printed totals against the document's own site rows
 * ------------------------------------------------------------------ */

function checkPrintedTotals(reads: readonly MonthlyRead[]): EsgVerificationCheck[] {
  const byDoc = new Map<string, MonthlyRead[]>();
  for (const r of reads) if (r.ym) push(byDoc, `${r.file}\u0000${r.measure}`, r);
  const checks: EsgVerificationCheck[] = [];
  for (const [key, list] of Array.from(byDoc)) {
    const [file, measure] = key.split("\u0000");
    const months = new Map<string, { totals: Set<number>; parts: Map<string, Set<number>> }>();
    for (const r of list) {
      const m = months.get(r.ym!) ?? { totals: new Set<number>(), parts: new Map<string, Set<number>>() };
      months.set(r.ym!, m);
      if (r.site === null) m.totals.add(r.value);
      else {
        const site = r.site.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
        const values = m.parts.get(site) ?? new Set<number>();
        values.add(r.value);
        m.parts.set(site, values);
      }
    }
    const compared: Array<{ ym: string; printed: number; sum: number; ok: boolean }> = [];
    for (const [ym, m] of Array.from(months).sort(([a], [b]) => a.localeCompare(b))) {
      // One printed figure for the month: a document printing several
      // company-wide lines for one measure has no single total to check.
      if (m.totals.size !== 1 || m.parts.size === 0) continue;
      const printed = Array.from(m.totals)[0];
      // The same figure repeated for a site (two sheets of one book) counts once.
      const sum = Array.from(m.parts.values()).reduce((a, values) => a + Array.from(values).reduce((x, y) => x + y, 0), 0);
      compared.push({ ym, printed, sum, ok: esgFiguresAgree(printed, sum) });
    }
    if (compared.length === 0) continue;
    const bad = compared.filter((c) => !c.ok);
    const unit = measureUnit(measure);
    const thousand = bad.filter((c) => thousandFold(c.printed, c.sum));
    const statement = bad.length === 0
      ? `${file} prints ${measureLabel(measure)} totals that agree with the sum of its own site rows in all ${compared.length} month${compared.length === 1 ? "" : "s"}.`
      : `${bad.length} of ${compared.length} printed ${measureLabel(measure)} totals in ${file} are not the sum of its own site rows: ` +
        bad.slice(0, 3).map((c) => `${monthLabel(c.ym)} prints ${esgFigure(c.printed)} ${unit} against ${esgFigure(c.sum)}`).join("; ") +
        (bad.length > 3 ? `; and ${bad.length - 3} more` : "") + "." +
        (thousand.length > 0
          ? ` In ${thousand.length} month${thousand.length === 1 ? "" : "s"} they differ by a factor of 1 000: one of the two is in another unit (litres against kilolitres, Wh against kWh).`
          : " A total that includes a line the site rows leave out (or the reverse) differs this way; which one the workbook should hold is your call.");
    checks.push({
      id: `V1:${file}:${measure}`,
      code: "V1",
      subject: `${measureLabel(measure)} totals in ${file}`,
      status: bad.length ? "flag" : "pass",
      rule: "flag-only",
      statement,
      tolerance: TOLERANCE,
      evidence: (bad.length ? bad : compared.slice(0, 1)).map((c) => ({
        document: file,
        field: `${measureLabel(measure)} ${monthLabel(c.ym)}`,
        value: `printed ${esgFigure(c.printed)}, site rows ${esgFigure(c.sum)}`,
      })),
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V2 / V3 — the same site and month, stated by two documents
 * ------------------------------------------------------------------ */

function checkAcrossDocuments(reads: readonly MonthlyRead[], axes: EsgReportingAxes): EsgVerificationCheck[] {
  const sites = axes.depots;
  const sited = reads.filter((r) => r.site !== null && r.ym !== null && MEASURES[r.measure]?.prefix);
  /** (measure, site index, month) → source → values */
  const cells = new Map<string, Map<string, number[]>>();
  const siteOf = new Map<MonthlyRead, number | null | "ambiguous">();
  for (const r of sited) {
    const match = esgSiteMatch(r.site, sites);
    siteOf.set(r, match);
    if (typeof match !== "number") continue;
    const key = `${r.measure}|${match}|${r.ym}`;
    const bySource = cells.get(key) ?? new Map<string, number[]>();
    cells.set(key, bySource);
    const values = bySource.get(r.source) ?? [];
    if (!values.some((v) => v === r.value)) values.push(r.value);
    bySource.set(r.source, values);
  }
  const single = (bySource: Map<string, number[]> | undefined, source: string): number | null => {
    const values = bySource?.get(source);
    return values && values.length === 1 ? values[0] : null;
  };

  /** One check per measure and pair of documents. */
  type Finding = { ym: string; site: string; a: number; b: number; offset: boolean };
  const pairs = new Map<string, { measure: string; a: string; b: string; agree: number; findings: Finding[] }>();
  for (const [key, bySource] of Array.from(cells)) {
    const [measure, siteIdx, ym] = key.split("|");
    const sources = Array.from(bySource.keys()).sort();
    for (let i = 0; i < sources.length; i += 1) {
      for (let j = i + 1; j < sources.length; j += 1) {
        const a = single(bySource, sources[i]);
        const b = single(bySource, sources[j]);
        if (a === null || b === null) continue;
        const pairKey = `${measure}|${sources[i]}|${sources[j]}`;
        const pair = pairs.get(pairKey) ?? { measure, a: sources[i], b: sources[j], agree: 0, findings: [] as Finding[] };
        pairs.set(pairKey, pair);
        if (esgFiguresAgree(a, b)) {
          pair.agree += 1;
          continue;
        }
        // Booked a month apart: one document's month is the other's next or last.
        const offset = [-1, 1].some((by) => {
          const near = cells.get(`${measure}|${siteIdx}|${shiftYm(ym, by)}`);
          const bNear = single(near, sources[j]);
          const aNear = single(near, sources[i]);
          return (bNear !== null && esgFiguresAgree(a, bNear)) || (aNear !== null && esgFiguresAgree(b, aNear));
        });
        pair.findings.push({ ym, site: sites[Number(siteIdx)], a, b, offset });
      }
    }
  }

  const checks: EsgVerificationCheck[] = [];
  for (const [pairKey, pair] of Array.from(pairs)) {
    const { measure, a, b } = pair;
    const unit = measureUnit(measure);
    const code: EsgCheckCode = MEASURES[measure]?.fuel ? "V3" : "V2";
    const wrong = pair.findings.filter((f) => !f.offset);
    const offsets = pair.findings.filter((f) => f.offset);
    const total = pair.agree + pair.findings.length;
    const describe = (f: Finding) => `${f.site} ${monthLabel(f.ym)}: ${esgFigure(f.a)} against ${esgFigure(f.b)} ${unit}`;
    let status: EsgCheckStatus = "pass";
    let statement = `${a} and ${b} state the same ${measureLabel(measure)} figure for all ${total} site-month${total === 1 ? "" : "s"} they share.`;
    if (wrong.length > 0) {
      status = "flag";
      statement = `${a} and ${b} disagree on ${measureLabel(measure)} for ${wrong.length} of ${total} site-months they share (${wrong.slice(0, 3).map(describe).join("; ")}${wrong.length > 3 ? "; …" : ""}).` +
        (wrong.some((f) => thousandFold(f.a, f.b)) ? " Some differ by a factor of 1 000: one is in another unit." : "");
    } else if (offsets.length > 0) {
      status = "needs-you";
      statement = `${a} and ${b} state the same ${measureLabel(measure)} figures a month apart (${offsets.slice(0, 3).map(describe).join("; ")}): ` +
        "one books consumption in the month it was billed, the other in the month it was used. Which month does the workbook report it in?";
    }
    checks.push({
      id: `${code}:${pairKey}`,
      code,
      subject: `${measureLabel(measure)}: ${a} against ${b}`,
      status,
      rule: "flag-only",
      statement,
      tolerance: TOLERANCE,
      evidence: pair.findings.slice(0, 6).flatMap((f) => [
        { document: a, field: `${measureLabel(measure)} ${f.site} ${monthLabel(f.ym)}`, value: f.a },
        { document: b, field: `${measureLabel(measure)} ${f.site} ${monthLabel(f.ym)}`, value: f.b },
      ]),
    });
  }

  // A bill whose site names none of the workbook's sites: say where its exact figure appears.
  for (const r of sited) {
    if (!r.single || typeof siteOf.get(r) === "number") continue;
    const twins = reads.filter(
      (o) => o.source !== r.source && o.measure === r.measure && o.site !== null && o.ym !== null &&
        esgFiguresAgree(o.value, r.value) && (r.ym === null || Math.abs(monthsBetween(o.ym, r.ym)) <= 1),
    );
    if (twins.length === 0) continue;
    const code: EsgCheckCode = MEASURES[r.measure]?.fuel ? "V3" : "V2";
    checks.push({
      id: `${code}:site:${r.source}:${r.measure}:${r.ym}`,
      code,
      subject: `${measureLabel(r.measure)} on ${r.file}`,
      status: "needs-you",
      rule: "flag-only",
      statement:
        `${r.file} states ${esgFigure(r.value)} ${measureUnit(r.measure)}${r.ym ? ` for ${monthLabel(r.ym)}` : ""} at "${r.site}", which names none of the workbook's sites. ` +
        `The same figure is ${twins.slice(0, 2).map((t) => `${t.site} ${monthLabel(t.ym!)} in ${t.file}`).join(" and ")}. Is this that site${twins.some((t) => t.ym !== r.ym) ? ", booked a month apart" : ""}?`,
      tolerance: TOLERANCE,
      evidence: [r, ...twins.slice(0, 3)].map((x) => ({
        document: x.source,
        field: `${measureLabel(x.measure)} ${x.site ?? ""} ${x.ym ? monthLabel(x.ym) : ""}`.trim(),
        value: x.value,
      })),
    });
  }
  return checks;
}

function monthsBetween(a: string, b: string): number {
  return (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(b.slice(5, 7));
}

/** V3 — diesel issued to vehicles outside the fleet is not also the company's own use. */
function checkExternalIssues(reads: readonly MonthlyRead[]): EsgVerificationCheck[] {
  const issued = reads.filter((r) => r.measure === "fleet.external_diesel_issued_litres" && r.ym !== null && r.value > 0);
  const checks: EsgVerificationCheck[] = [];
  for (const r of issued) {
    const twins = reads.filter(
      (o) => o !== r && o.ym === r.ym && MEASURES[o.measure]?.prefix && MEASURES[o.measure]?.fuel && esgFiguresAgree(o.value, r.value),
    );
    checks.push({
      id: `V3:external:${r.source}:${r.ym}:${r.site ?? ""}`,
      code: "V3",
      subject: `Diesel issued to external vehicles, ${monthLabel(r.ym!)}`,
      status: twins.length ? "flag" : "pass",
      rule: "flag-only",
      statement: twins.length
        ? `${r.file} records ${esgFigure(r.value)} L issued to vehicles outside the fleet in ${monthLabel(r.ym!)}; the same figure is recorded as ` +
          `${twins.slice(0, 2).map((t) => `${measureLabel(t.measure)}${t.site ? ` at ${t.site}` : ""} in ${t.file}`).join(" and ")}. ` +
          "Fuel issued to another party's vehicles is not the company's own combustion: it cannot be both."
        : `${r.file} records ${esgFigure(r.value)} L issued to vehicles outside the fleet in ${monthLabel(r.ym!)}; it is reported, kept out of the Scope 1 grids, and no grid holds it as the company's own fuel.`,
      evidence: [r, ...twins.slice(0, 3)].map((x) => ({
        document: x.source,
        field: `${measureLabel(x.measure)} ${x.site ?? ""} ${monthLabel(x.ym!)}`.trim(),
        value: x.value,
      })),
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V4 — the fleet register against the depots' diesel
 * ------------------------------------------------------------------ */

function checkFleetAgainstDepots(workbook: EsgWorkbookData): EsgVerificationCheck[] {
  const fleet = computeFleetEmissions(workbook);
  const rec = fleet.reconciliation;
  if (!fleet.hasData || !rec) return [];
  const within = rec.ratio >= 0.9 && rec.ratio <= 1.1;
  const why = rec.ratio < 0.9
    ? "The register accounts for less diesel than the depots record: vehicles missing from it, or depot fuel used by something it does not list."
    : "The register accounts for more diesel than the depots record: it holds something that is not one month's driving, or the depots' fuel records are incomplete.";
  return [{
    id: "V4:fleet",
    code: "V4",
    subject: "Fleet register against the depots' diesel",
    status: within ? "pass" : "flag",
    rule: "flag-only",
    statement:
      `The fleet register accounts for ${esgFigure(rec.fleetLitresPerMonth)} L a month; the depots' Scope 1A records show ${esgFigure(rec.depotLitresPerMonth)} L a month ` +
      `over ${rec.depotMonths} month${rec.depotMonths === 1 ? "" : "s"} (ratio ${rec.ratio.toFixed(2)}). ` + (within ? "They agree within 10 %." : why),
    tolerance: "ratio 0.9 to 1.1",
    evidence: [
      { document: "Workbook", field: "Fleet register, litres a month", value: Math.round(rec.fleetLitresPerMonth * 100) / 100 },
      { document: "Workbook", field: "Depots' Scope 1A diesel, litres a month", value: Math.round(rec.depotLitresPerMonth * 100) / 100 },
    ],
  }];
}

/* ------------------------------------------------------------------ *
 * V5 — the waste contractor's figures
 * ------------------------------------------------------------------ */

function firstEntry(entries: readonly EsgCalculatorEntryLike[], key: string): { value: number; source: string } | null {
  for (const e of entries) {
    if (e.key !== key) continue;
    const n = num(e.value);
    if (n !== null) return { value: n, source: (e.sourceFiles ?? []).join("; ") || "a document" };
  }
  return null;
}

function checkWaste(entries: readonly EsgCalculatorEntryLike[], derived: EsgWorkbookData, held: readonly EsgHeldFact[]): EsgVerificationCheck[] {
  const checks: EsgVerificationCheck[] = [];
  const total = firstEntry(entries, "waste.total_kg");
  const recycled = firstEntry(entries, "waste.recycled_kg");
  const landfill = firstEntry(entries, "waste.landfill_kg");
  const statedPct = firstEntry(entries, "waste.diversion_percent") ?? firstEntry(entries, "waste.recycled_percent");
  const evidence: EsgCheckEvidence[] = [];
  for (const [label, f] of [["Total kg", total], ["Diverted kg", recycled], ["Landfill kg", landfill], ["Diversion %", statedPct]] as const) {
    if (f) evidence.push({ document: f.source, field: label, value: f.value });
  }

  if (total && recycled && landfill) {
    const adds = esgFiguresAgree(recycled.value + landfill.value, total.value);
    checks.push({
      id: "V5:contractor-sum",
      code: "V5",
      subject: "The waste contractor's own figures",
      status: adds ? "pass" : "flag",
      rule: "flag-only",
      statement: adds
        ? `The contractor's diverted ${esgFigure(recycled.value)} kg and landfill ${esgFigure(landfill.value)} kg add up to its total ${esgFigure(total.value)} kg.`
        : `The contractor's diverted ${esgFigure(recycled.value)} kg and landfill ${esgFigure(landfill.value)} kg add up to ${esgFigure(recycled.value + landfill.value)} kg, not its stated total ${esgFigure(total.value)} kg.`,
      tolerance: TOLERANCE,
      evidence,
    });
  }

  const stated = statedPct?.value ?? (total && recycled && total.value > 0 ? (recycled.value / total.value) * 100 : null);
  if (stated !== null) {
    const ours = readEsgWasteSummary(derived, "diversion");
    let status: EsgCheckStatus;
    let statement: string;
    if (ours === null) {
      status = "needs-you";
      statement = `The contractor's figures give ${stated.toFixed(1)} % diverted from landfill; the workbook holds no diversion rate` +
        `${esgWasteDiversionUnknownReason(derived) ? ` (${esgWasteDiversionUnknownReason(derived)})` : ""}. Enter the contractor's recycled and landfill kilograms, or its rate.`;
    } else if (Math.abs(ours * 100 - stated) <= 0.5) {
      status = "pass";
      statement = `The workbook's diversion rate ${(ours * 100).toFixed(1)} % agrees with the contractor's ${stated.toFixed(1)} %.`;
    } else {
      status = "flag";
      statement = `The workbook's diversion rate is ${(ours * 100).toFixed(1)} %; the contractor's figures give ${stated.toFixed(1)} %.`;
    }
    checks.push({
      id: "V5:diversion",
      code: "V5",
      subject: "Waste diversion rate",
      status,
      rule: "flag-only",
      statement,
      tolerance: "within 0.5 percentage points",
      evidence: [...evidence, ...(ours !== null ? [{ document: "Workbook", field: "Waste_Register B16", value: Math.round(ours * 10000) / 100 }] : [])],
    });
  }

  if (total) {
    const register = readEsgGridRows(derived.sections?.waste?.cells as Record<string, unknown> | undefined, "waste")
      .filter((r) => !/\btotals?\b/i.test(String(r.wasteType ?? "")));
    const registerKg = register.reduce((a, r) => a + (num(r.totalKg) ?? 0), 0);
    if (registerKg > 0) {
      const agree = esgFiguresAgree(registerKg, total.value);
      checks.push({
        id: "V5:register",
        code: "V5",
        subject: "Waste register against the contractor's total",
        status: agree ? "pass" : "flag",
        rule: "flag-only",
        statement: agree
          ? `The waste register's ${register.length} rows add up to the contractor's total ${esgFigure(total.value)} kg.`
          : `The waste register's ${register.length} rows add up to ${esgFigure(registerKg)} kg; the contractor states ${esgFigure(total.value)} kg. ` +
            "Rows from another period, another site, or in another unit make this difference.",
        tolerance: TOLERANCE,
        evidence: [{ document: total.source, field: "Total kg", value: total.value }, { document: "Workbook", field: "Waste register, Σ total kg", value: Math.round(registerKg * 100) / 100 }],
      });
    }
  }

  const unitless = held.filter((h) => h.rejection === "unit_unresolved" && /waste/i.test(h.field));
  if (unitless.length > 0) {
    checks.push({
      id: "V5:units",
      code: "V5",
      subject: "Waste rows without a unit",
      status: "flag",
      rule: "flag-only",
      statement: `${unitless.length} waste figure${unitless.length === 1 ? " is" : "s are"} held out of the register: no unit is stated, so kilograms cannot be assumed.`,
      evidence: unitless.slice(0, 6).map((h) => ({ document: h.sourceFile, field: h.field, value: h.value })),
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V6 — Employment Equity: period, and the matrix against its total
 * ------------------------------------------------------------------ */

const EE_DEMOGRAPHIC_KEYS = [
  "ee.headcount_african_male", "ee.headcount_coloured_male", "ee.headcount_indian_male", "ee.headcount_white_male",
  "ee.headcount_african_female", "ee.headcount_coloured_female", "ee.headcount_indian_female", "ee.headcount_white_female",
  "ee.headcount_foreign_male", "ee.headcount_foreign_female",
];

function checkEmploymentEquity(entries: readonly EsgCalculatorEntryLike[], rows: readonly EsgCalculatorRowLike[]): EsgVerificationCheck[] {
  const levels = rows.filter((r) => r.grid === "ee_level_rows");
  const stated = firstEntry(entries, "ee.headcount_total");
  if (levels.length === 0 || !stated) return [];
  const matrix = levels.reduce((a, r) => {
    const own = num(r.cells["ee.headcount_level_total"]);
    if (own !== null) return a + own;
    return a + EE_DEMOGRAPHIC_KEYS.reduce((s, k) => s + (num(r.cells[k]) ?? 0), 0);
  }, 0);
  const agree = esgFiguresAgree(matrix, stated.value);
  return [{
    id: "V6:matrix",
    code: "V6",
    subject: "Employment Equity matrix against its total",
    status: agree ? "pass" : "flag",
    rule: "flag-only",
    statement: agree
      ? `The occupational-level matrix (${levels.length} levels) adds up to the stated total of ${esgFigure(stated.value)} employees.`
      : `The occupational-level matrix (${levels.length} levels) adds up to ${esgFigure(matrix)} employees; the document states ${esgFigure(stated.value)}.`,
    tolerance: "exact",
    evidence: [{ document: stated.source, field: "Total headcount, all levels", value: stated.value }, { document: sourceOf(levels[0]), field: "Σ occupational levels", value: matrix }],
  }];
}

/** V6 — every document held as outside the reporting year, one check each. */
function checkHeldOutOfPeriod(held: readonly EsgHeldFact[]): EsgVerificationCheck[] {
  const byFile = new Map<string, EsgHeldFact[]>();
  for (const h of held) if (h.rejection === "out_of_period" || h.rejection === "other_entity") push(byFile, `${h.rejection}\u0000${h.sourceFile}`, h);
  return Array.from(byFile).map(([key, facts]) => {
    const [rejection, file] = key.split("\u0000");
    return {
      id: `V6:${rejection}:${file}`,
      code: "V6" as const,
      subject: file,
      status: "out-of-period" as const,
      rule: "flag-only" as const,
      statement: `${facts.length} figure${facts.length === 1 ? "" : "s"} from ${file} ${facts.length === 1 ? "is" : "are"} held out of the score. ${facts[0].reason}`,
      evidence: facts.slice(0, 6).map((h) => ({ document: file, field: h.field, value: h.value })),
    };
  });
}

/* ------------------------------------------------------------------ *
 * V7 — incident counts and LTIFR
 * ------------------------------------------------------------------ */

function checkIncidents(
  entries: readonly EsgCalculatorEntryLike[],
  rows: readonly EsgCalculatorRowLike[],
  axes: EsgReportingAxes,
  derived: EsgWorkbookData,
): EsgVerificationCheck[] {
  const register = rows.filter((r) => r.grid === INCIDENT_ROWS_FIELD);
  const checks: EsgVerificationCheck[] = [];
  const sCells = (derived.sections?.["s-data"]?.cells ?? {}) as Record<string, unknown>;
  if (register.length > 0) {
    const periods = new Map<string, { start: string | null; end: string | null }>();
    for (const e of entries) {
      if (e.key !== "hs.period_start" && e.key !== "hs.period_end") continue;
      for (const file of e.sourceFiles ?? []) {
        const p = periods.get(file) ?? { start: null, end: null };
        if (e.key === "hs.period_start") p.start = String(e.value ?? "");
        else p.end = String(e.value ?? "");
        periods.set(file, p);
      }
    }
    const counts = esgIncidentCounts(register, axes, periods);
    if (counts && Object.keys(counts.cells).length > 0) {
      const differ: EsgCheckEvidence[] = [];
      const missing: string[] = [];
      for (const [ref, count] of Object.entries(counts.cells)) {
        const cell = num(sCells[ref]);
        if (cell === null) missing.push(ref);
        else if (cell !== count) differ.push({ document: "Workbook", field: `S_Data ${ref}`, value: `${cell} in the workbook, ${count} on the register` });
      }
      const status: EsgCheckStatus = differ.length ? "flag" : missing.length ? "needs-you" : "pass";
      checks.push({
        id: "V7:counts",
        code: "V7",
        subject: "Incident register against the quarterly injury counts",
        status,
        rule: "flag-only",
        statement:
          `The incident register lists ${counts.totals.lti} lost-time injur${counts.totals.lti === 1 ? "y" : "ies"}, ${counts.totals.mti} medical-treatment case${counts.totals.mti === 1 ? "" : "s"} and ${counts.totals.fatality} fatalit${counts.totals.fatality === 1 ? "y" : "ies"}. ` +
          (differ.length
            ? `${differ.length} quarterly cell${differ.length === 1 ? " holds" : "s hold"} another count.`
            : missing.length
              ? `${missing.length} quarterly cell${missing.length === 1 ? " is" : "s are"} blank (${missing.slice(0, 4).join(", ")}): confirm the register's count or enter the right one.`
              : "S_Data's quarterly cells hold the same counts."),
        evidence: [
          { document: sourceOf(register[0]), field: "Incident rows read", value: register.length },
          ...differ.slice(0, 6),
        ],
      });
    }
  }

  const ltis = ["C", "D", "E", "F"].reduce((a, c) => a + (num(sCells[`${c}${ESG_INJURY_ROWS.lti}`]) ?? 0), 0);
  const hours = ["C", "D", "E", "F"].reduce((a, c) => a + (num(sCells[`${c}27`]) ?? 0), 0);
  const ltifr = num(sCells.G35);
  if (ltis > 0 || ltifr !== null) {
    const ok = hours > 0 ? ltifr !== null && Math.abs(ltifr - (ltis * 1_000_000) / hours) < 0.01 : ltifr === null;
    checks.push({
      id: "V7:ltifr",
      code: "V7",
      subject: "Lost-time injury frequency rate",
      status: hours > 0 ? (ok ? "pass" : "flag") : ok ? "needs-you" : "flag",
      rule: "flag-only",
      statement: hours > 0
        ? `LTIFR = ${ltis} lost-time injuries × 1 000 000 ÷ ${esgFigure(hours)} hours worked${ltifr !== null ? ` = ${ltifr.toFixed(2)}` : ""}.`
        : ltifr === null
          ? `${ltis} lost-time injur${ltis === 1 ? "y is" : "ies are"} recorded but no hours worked, so the LTIFR (per 1 000 000 hours) is not computed. Add the hours worked per quarter.`
          : `An LTIFR of ${ltifr} is recorded with no hours worked behind it: a rate needs hours worked (per 1 000 000 hours).`,
      evidence: [
        { document: "Workbook", field: "S_Data lost-time injuries, C29:F29", value: ltis },
        { document: "Workbook", field: "S_Data hours worked, C27:F27", value: hours || null },
      ],
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V8 — the GHG factor basis, and a client emissions-system export
 * ------------------------------------------------------------------ */

const isExport = (e: { documentId?: unknown; documentName?: unknown }): boolean => {
  const text = `${String(e.documentId ?? "")} ${String(e.documentName ?? "")}`.toLowerCase();
  return /emission|carbon|ghg/.test(text) && /export|system|inventory/.test(text);
};

function gridSum(workbook: EsgWorkbookData, axes: EsgReportingAxes, prefix: string, months: readonly string[]): { sum: number; cells: number } {
  const cells = (workbook.sections?.["e-data"]?.cells ?? {}) as Record<string, unknown>;
  const sites = Math.max(1, axes.companyWide || ESG_ONE_ROW_BLOCKS.has(prefix) ? 1 : axes.depots.length);
  const ref = esgGridAddress(cells, prefix, sites);
  let sum = 0;
  let filled = 0;
  for (const ym of months) {
    const column = esgMonthColumnFor(`${ym}-15`, axes);
    if (!column) continue;
    const month = column.charCodeAt(0) - 67;
    for (let row = 0; row < sites; row += 1) {
      const n = num(cells[ref(row, month)]);
      if (n === null) continue;
      sum += n;
      filled += 1;
    }
  }
  return { sum, cells: filled };
}

/** Which inventory line (`computeGhgInventory`'s labels) each monthly measure is the activity of. */
const INVENTORY_LINE: Record<string, RegExp> = {
  "fleet.diesel_litres": /^Scope 1A/,
  "energy.generator_diesel_litres": /^Scope 1B/,
  "energy.lpg_kg": /^Scope 1C/,
  "fleet.business_car_petrol_litres": /^Scope 1D/,
  "energy.electricity_kwh": /^Scope 2 — Purchased/,
  "energy.solar_kwh_generated": /^Scope 2 — On-site solar/,
  "water.kl": /^Scope 3 — Municipal water/,
};

function checkGhg(input: EsgVerificationInput, reads: readonly MonthlyRead[], workbook: EsgWorkbookData): EsgVerificationCheck[] {
  const checks: EsgVerificationCheck[] = [];
  const ghg = computeGhgInventory(workbook);
  if (ghg.hasData) {
    checks.push({
      id: "V8:factors",
      code: "V8",
      subject: "Emission factors behind Scope 1 + 2",
      status: ghg.factorBasis.signedOff ? "pass" : "needs-you",
      rule: "flag-only",
      statement: `${ghg.factorBasis.statement} Scope 1 + 2 on this basis: ${esgFigure(ghg.scope1And2)} tCO₂e.`,
      evidence: ghg.factorBasis.sources.map((s) => ({ document: s.source, field: `${s.factor} (${s.unit})`, value: s.value })),
    });
  }

  const exportFiles = new Set(
    (input.extractions ?? []).filter((e): e is NonNullable<typeof e> => Boolean(e) && isExport(e!)).map((e) => fileOf(String(e.sourceFile ?? ""))),
  );
  for (const file of Array.from(exportFiles)) {
    const own = reads.filter((r) => r.file === file && r.ym && MEASURES[r.measure]?.prefix);
    if (own.length === 0) continue;
    const byMeasure = new Map<string, MonthlyRead[]>();
    for (const r of own) push(byMeasure, r.measure, r);
    const evidence: EsgCheckEvidence[] = [];
    const differ: string[] = [];
    for (const [measure, list] of Array.from(byMeasure)) {
      const months = Array.from(new Set(list.map((r) => r.ym!))).sort();
      const theirs = list.reduce((a, r) => a + r.value, 0);
      const ours = gridSum(workbook, input.axes, MEASURES[measure].prefix!, months);
      if (ours.cells === 0) continue;
      evidence.push({ document: file, field: `${measureLabel(measure)}, ${months.length} months`, value: Math.round(theirs * 100) / 100 });
      evidence.push({ document: "Workbook", field: `${measureLabel(measure)}, same months`, value: Math.round(ours.sum * 100) / 100 });
      if (!esgFiguresAgree(theirs, ours.sum)) {
        differ.push(`${measureLabel(measure)} ${esgFigure(theirs)} ${measureUnit(measure)} against our ${esgFigure(ours.sum)}`);
      }
    }
    if (evidence.length === 0) continue;
    const covered = new Set(byMeasure.keys());
    const outside = ghg.lines
      .filter((l) => l.activity > 0)
      .map((l) => l.label)
      .filter((label) => !Array.from(covered).some((m) => INVENTORY_LINE[m]?.test(label)));
    checks.push({
      id: `V8:export:${file}`,
      code: "V8",
      subject: `Activity against ${file}`,
      status: differ.length ? "flag" : "pass",
      rule: "flag-only",
      statement:
        (differ.length
          ? `The client's emissions system and the workbook disagree on activity over the same months: ${differ.join("; ")}.`
          : "The client's emissions system and the workbook hold the same activity over the months it covers.") +
        " A total it states on the same activity differs by the factors each applies; ours are stated beside Scope 1 + 2." +
        (outside.length ? ` In our inventory, outside the export's boundary: ${outside.join(", ")}.` : ""),
      tolerance: TOLERANCE,
      evidence,
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V9 — coverage
 * ------------------------------------------------------------------ */

function checkCoverage(workbook: EsgWorkbookData): EsgVerificationCheck[] {
  const checks: EsgVerificationCheck[] = [];
  let months = 0;
  for (const [measure, spec] of Object.entries(MEASURES)) {
    if (!spec.prefix) continue;
    const coverage = esgGridCoverage(workbook, spec.prefix);
    if (!coverage) continue;
    months = Math.max(months, coverage.months);
    const full = coverage.filled === coverage.sites * coverage.months;
    checks.push({
      id: `V9:${spec.prefix}`,
      code: "V9",
      subject: `${spec.label} coverage`,
      status: full ? "pass" : "flag",
      rule: "flag-only",
      statement: full
        ? `${spec.label} holds a figure for every site in each of its ${coverage.months} reported month${coverage.months === 1 ? "" : "s"}.`
        : `${spec.label} holds ${coverage.filled} of ${coverage.sites * coverage.months} site-months (${Math.round(coverage.share * 100)} %)` +
          (coverage.missingSites.length ? `; no figure at all for ${coverage.missingSites.join(", ")}` : "") +
          ". A gap is not a zero: ask for the missing records, or state that a site did not use it.",
      evidence: [{ document: "Workbook", field: `${measure} site-months filled`, value: `${coverage.filled} of ${coverage.sites * coverage.months}` }],
    });
  }
  const dataMonths = readEsgCell(workbook, "assumptions", "B111");
  if (months > 0 && dataMonths !== null && dataMonths !== months) {
    checks.push({
      id: "V9:months",
      code: "V9",
      subject: "Months of actual data",
      status: "flag",
      rule: "flag-only",
      statement: `The assumptions state ${dataMonths} month${dataMonths === 1 ? "" : "s"} of actual data (B111); the monthly grids hold figures up to month ${months}. Year-to-date figures and annualised ones depend on this count.`,
      evidence: [{ document: "Workbook", field: "Assumptions B111", value: dataMonths }, { document: "Workbook", field: "Last month with a figure", value: months }],
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * V10 — register sanity
 * ------------------------------------------------------------------ */

/** Registers whose rows are events and need their date to be placed or counted. */
const DATED_REGISTERS: Record<string, string> = {
  fleet_fuel_transaction_rows: "fleet.transaction_date",
  incident_rows: "hs.incident_date",
  fleet_debrief_rows: "",
};

function checkRegisters(entries: readonly EsgCalculatorEntryLike[], rows: readonly EsgCalculatorRowLike[]): EsgVerificationCheck[] {
  const byGrid = new Map<string, EsgCalculatorRowLike[]>();
  for (const r of rows) if (r.grid !== "esg_monthly_rows") push(byGrid, r.grid, r);
  const checks: EsgVerificationCheck[] = [];
  for (const [grid, list] of Array.from(byGrid)) {
    const problems: string[] = [];
    const seen = new Set<string>();
    let duplicates = 0;
    for (const r of list) {
      const key = `${sourceOf(r)}|${JSON.stringify(Object.entries(r.cells).sort(([a], [b]) => a.localeCompare(b)))}`;
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    }
    if (duplicates > 0) problems.push(`${duplicates} of ${list.length} rows are identical to another row in every column read: duplicates, or rows told apart only by a column that was not read`);
    if (grid in DATED_REGISTERS) {
      const dateKey = DATED_REGISTERS[grid];
      const undated = list.filter((r) => {
        const keys = dateKey ? [dateKey] : Object.keys(r.cells).filter((k) => /date|period/.test(k));
        return !keys.some((k) => String(r.cells[k] ?? "").trim() !== "");
      }).length;
      if (undated > 0) problems.push(`${undated} of ${list.length} rows carry no date, so they cannot be placed in a month or a quarter`);
    }
    const overPlanned = list.filter((r) => {
      const planned = num(r.cells["fleet.planned_stops"]);
      const actual = num(r.cells["fleet.actual_stops"]);
      return planned !== null && actual !== null && actual > planned;
    }).length;
    if (overPlanned > 0) problems.push(`${overPlanned} rows complete more stops than were planned`);
    checks.push({
      id: `V10:${grid}`,
      code: "V10",
      subject: `${grid.replace(/_rows$/, "").replace(/_/g, " ")} register`,
      status: problems.length ? "flag" : "pass",
      rule: "flag-only",
      statement: problems.length
        ? `The ${grid.replace(/_rows$/, "").replace(/_/g, " ")} register (${list.length} rows read): ${problems.join("; ")}.`
        : `The ${grid.replace(/_rows$/, "").replace(/_/g, " ")} register (${list.length} rows read) has no repeated rows${grid in DATED_REGISTERS ? " or undated rows" : ""}.`,
      evidence: [{ document: sourceOf(list[0]), field: grid, value: list.length }],
    });
  }
  const planned = firstEntry(entries, "fleet.planned_stops");
  const actual = firstEntry(entries, "fleet.actual_stops");
  if (planned && actual) {
    const ok = actual.value <= planned.value;
    checks.push({
      id: "V10:stops",
      code: "V10",
      subject: "Route stops: actual against planned",
      status: ok ? "pass" : "flag",
      rule: "flag-only",
      statement: ok
        ? `${esgFigure(actual.value)} stops completed of ${esgFigure(planned.value)} planned.`
        : `${esgFigure(actual.value)} stops are stated as completed against ${esgFigure(planned.value)} planned: more than planned is not a completion rate. ` +
          "A summary that takes the largest value per route instead of the sum states this.",
      evidence: [{ document: planned.source, field: "Planned stops", value: planned.value }, { document: actual.source, field: "Actual stops", value: actual.value }],
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

export function verifyEsg(input: EsgVerificationInput): EsgVerificationReport {
  const entries = input.calculator?.entries ?? [];
  const rows = input.calculator?.rows ?? [];
  const held = input.held ?? [];
  const derived = deriveEsgSummaryCells(input.workbook);
  const reads = monthlyReads(rows);
  const checks = [
    ...checkPrintedTotals(reads),
    ...checkAcrossDocuments(reads, input.axes),
    ...checkExternalIssues(reads),
    ...checkFleetAgainstDepots(derived),
    ...checkWaste(entries, derived, held),
    ...checkHeldOutOfPeriod(held),
    ...checkEmploymentEquity(entries, rows),
    ...checkIncidents(entries, rows, input.axes, derived),
    ...checkGhg(input, reads, derived),
    ...checkCoverage(derived),
    ...checkRegisters(entries, rows),
  ];
  const counts: Record<EsgCheckStatus, number> = { pass: 0, flag: 0, "needs-you": 0, "out-of-period": 0 };
  for (const c of checks) counts[c.status] += 1;
  return { version: 1, period: esgReportingYear(input.axes), checks, counts };
}
