/**
 * South African Carbon Tax Act liability.
 *
 * WHAT WAS WRONG, AND WHY IT MATTERED
 *
 * This module used to produce a rand liability for every company that opened
 * the toolkit. Three things were wrong with it at once, and an expert review
 * (Z. Mnanzana, 14 September 2026) settled all three:
 *
 *   1. It taxed Scope 1 AND Scope 2. Purchased electricity is Eskom's Scope 1
 *      liability at the generation end; it never becomes the buyer's Schedule 2
 *      activity. Only Scope 1 is taxable — and then only the part of Scope 1
 *      that is a listed activity.
 *   2. It applied a "tier 2" rate of R640/t that does not exist. The published
 *      trajectory is R159 (2023), R190 (2024), R236 (2025), then Phase 2 opens
 *      at R308 (2026) and runs R347, R385, R424, R462 to 2030.
 *   3. It never asked whether the company was a carbon taxpayer AT ALL. Road
 *      transport is listed at a threshold of "N/A" — it can never on its own
 *      create liability, because the fuel levy already prices it. A road-freight
 *      distributor, a retailer, a law firm or a school with no listed activity
 *      owes nothing, and the toolkit was quoting them hundreds of thousands of
 *      rand.
 *
 * So liability is now SCREENED before it is priced, and a company that fails
 * the screen gets R0 with the reason stated — not a number nobody can defend.
 *
 * The screen, in the expert's words: if the answer to the first three questions
 * is no, the entity has no Schedule 2 activity and is simply not a carbon
 * taxpayer — there is nothing to register or file, regardless of how large the
 * business is or how much fuel or electricity it consumes.
 */
import { readEsgCell, readEsgText, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeGhgInventory, type CarbonTaxTreatment, type GhgLine } from "./ghgInventory";
import { scoringMode, type EsgScoringOptions } from "./shared";
import { CARBON_TAX_ALLOWANCE } from "../esgConfig/consumer-goods";

/**
 * The published rand-per-tonne trajectory, by TAX PERIOD — which runs on the
 * calendar year, not the company's financial year. Phase 2 opens on
 * 1 January 2026 with the steepest single jump since the tax began.
 */
export const CARBON_TAX_RATE_BY_YEAR: Readonly<Record<number, number>> = Object.freeze({
  2019: 120,
  2020: 127,
  2021: 134,
  2022: 144,
  2023: 159,
  2024: 190,
  2025: 236,
  2026: 308,
  2027: 347,
  2028: 385,
  2029: 424,
  2030: 462,
});

const RATE_YEARS = Object.keys(CARBON_TAX_RATE_BY_YEAR).map(Number).sort((a, b) => a - b);

/** The rate for a tax period, clamped to the published range at either end. */
export function carbonTaxRateForYear(year: number): { rate: number; year: number; extrapolated: boolean } {
  const first = RATE_YEARS[0];
  const last = RATE_YEARS[RATE_YEARS.length - 1];
  if (year <= first) return { rate: CARBON_TAX_RATE_BY_YEAR[first], year: first, extrapolated: year < first };
  if (year >= last) return { rate: CARBON_TAX_RATE_BY_YEAR[last], year: last, extrapolated: year > last };
  return { rate: CARBON_TAX_RATE_BY_YEAR[year], year, extrapolated: false };
}

/** The Schedule 2 screen. Each answer is the client's, not ours to assume. */
export type CarbonTaxScreen = {
  /** A boiler, furnace, generator or turbine rated at or above 10 MW(th). */
  stationaryCombustionAbove10MW: boolean | null;
  /** Cement, lime, glass, ammonia, nitric acid, iron and steel, aluminium — any output at all. */
  listedIndustrialProcess: boolean | null;
  /** Coal mining, oil and gas extraction, venting or flaring. */
  fugitiveEmissions: boolean | null;
};

export type CarbonTaxResult = {
  /** False when the screen finds no Schedule 2 activity. Then everything below is zero. */
  liable: boolean;
  /** Why — stated in the report, so a reader never has to infer it. */
  liabilityBasis: string;
  /** True when the client has not answered the screen, so liability is unknown. */
  screenIncomplete: boolean;
  /** The lines that would be taxable, and the ones excluded with the reason. */
  taxableLines: GhgLine[];
  excludedLines: { line: GhgLine; reason: string }[];
  /** Taxable Scope 1 tonnes for the period, before annualising. */
  ytdTco2e: number;
  annualisedTco2e: number;
  /** After the basic 60% allowance. */
  taxableTco2e: number;
  liabilityZar: number;
  rateZar: number;
  taxPeriodYear: number;
  /** True when the reporting year sits outside the published trajectory. */
  rateExtrapolated: boolean;
  /** True when no tax period was stated, so no rate could be chosen. */
  taxPeriodUnknown: boolean;
  allowance: number;
  annualiseFactor: number;
  /** True when part-year data was scaled up — a stated estimate, not a return. */
  annualised: boolean;
};

/** `Carbon_Tax!C6:C10` — the rows the client's own spreadsheet totals. */
const TAXABLE_SCOPE_ROWS = ["L75", "L76", "L77", "L78", "L82"] as const;

const EXCLUSION_REASON: Record<CarbonTaxTreatment, string> = {
  "road-transport":
    "Road transportation is listed at a threshold of N/A and can never on its own create liability — the fuel levy already prices it.",
  "out-of-scope":
    "Not the reporter's own Schedule 2 activity. Purchased electricity is the generator's Scope 1 liability, not the buyer's.",
  unclassified:
    "Off-road mobile plant — neither road transportation nor a stationary source at or above 10 MW(th). Excluded pending a ruling rather than taxed on an assumption.",
  "stationary-combustion": "",
  "industrial-process": "",
  fugitive: "",
};

function readTriState(workbook: EsgWorkbookData, cell: string): boolean | null {
  const raw = readEsgText(workbook, "assumptions", cell).trim().toLowerCase();
  if (!raw) return null;
  if (["yes", "y", "true", "1"].includes(raw)) return true;
  if (["no", "n", "false", "0"].includes(raw)) return false;
  return null;
}

export function readCarbonTaxScreen(workbook: EsgWorkbookData): CarbonTaxScreen {
  return {
    stationaryCombustionAbove10MW: readTriState(workbook, "_ctCombustion10MW"),
    listedIndustrialProcess: readTriState(workbook, "_ctListedProcess"),
    fugitiveEmissions: readTriState(workbook, "_ctFugitive"),
  };
}

export function computeCarbonTax(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): CarbonTaxResult {
  const mode = scoringMode(options);

  /*
   * `Assumptions!B112 = 12/B111` — the YTD→full-year annualiser. The old
   * fallback was SG Consumer's NINE-month factor applied to every other
   * company, inflating their liability by a third. Recomputed from B111 when
   * present; otherwise 1, the neutral identity.
   */
  const dataMonths = readEsgCell(workbook, "assumptions", "B111");
  const annualise =
    readEsgCell(workbook, "assumptions", "B112") ??
    (dataMonths != null && dataMonths > 0 ? 12 / dataMonths : 1);

  const allowance = readEsgCell(workbook, "assumptions", "B39") ?? CARBON_TAX_ALLOWANCE;

  /*
   * The tax period runs on the CALENDAR year, not the financial year, and the
   * rate changes with it — R236 in 2025, R308 when Phase 2 opens in 2026.
   *
   * There is no safe default here. Falling back to the last published year
   * silently prices every unstated period at R462, the highest rate on the
   * trajectory; falling back to the first understates it just as quietly. So an
   * unstated period is not priced at all, exactly like an unanswered screen.
   */
  const statedYear = readEsgCell(workbook, "assumptions", "_ctTaxPeriodYear");
  const baselineYear = readEsgCell(workbook, "company-reporting-setup", "baselineYear");
  const periodYear = statedYear ?? baselineYear;
  const periodUnknown = periodYear == null;
  const { rate: trajectoryRate, year: rateYear, extrapolated } = carbonTaxRateForYear(
    periodYear ?? RATE_YEARS[RATE_YEARS.length - 1],
  );
  // Parity mode prices at the client's own `Assumptions!B37`, because
  // reproducing their spreadsheet is the whole purpose of that mode.
  const rate =
    mode === "workbook-parity"
      ? (readEsgCell(workbook, "assumptions", "B37") ?? trajectoryRate)
      : trajectoryRate;

  const inventory = computeGhgInventory(workbook);

  /* ── the screen ──────────────────────────────────────────────────────── */
  const screen = readCarbonTaxScreen(workbook);
  const answers = [
    screen.stationaryCombustionAbove10MW,
    screen.listedIndustrialProcess,
    screen.fugitiveEmissions,
  ];
  /*
   * Order matters here. "No listed activity" is a DEFINITIVE answer — the
   * company is not a carbon taxpayer whatever the tax period is, and saying
   * "not assessed" because a year is missing would hide a settled fact behind
   * a missing one. The period only blocks the arithmetic, and only for a
   * company that is otherwise liable.
   */
  const screenUnanswered = answers.some((a) => a == null);
  const cannotPrice = mode !== "workbook-parity" && periodUnknown;
  const anyListedActivity = answers.some((a) => a === true);

  /* ── which lines the Act actually reaches ────────────────────────────── */
  const taxableTreatments = new Set<CarbonTaxTreatment>();
  if (screen.stationaryCombustionAbove10MW) taxableTreatments.add("stationary-combustion");
  if (screen.listedIndustrialProcess) taxableTreatments.add("industrial-process");
  if (screen.fugitiveEmissions) taxableTreatments.add("fugitive");

  const scope1Lines = inventory.lines.filter((l) => l.scope === 1);
  const taxableLines = scope1Lines.filter((l) => taxableTreatments.has(l.carbonTax));
  const excludedLines = inventory.lines
    .filter((l) => !taxableLines.includes(l) && l.activity > 0)
    .map((l) => ({
      line: l,
      reason:
        EXCLUSION_REASON[l.carbonTax] ||
        `Not taxable for this entity: the screen records no ${l.carbonTax.replace(/-/g, " ")} activity.`,
    }));

  const liable = anyListedActivity && taxableLines.length > 0 && !screenUnanswered && !cannotPrice;
  // "Not assessed" covers only the cases where the answer is genuinely unknown.
  const screenIncomplete = screenUnanswered || (anyListedActivity && cannotPrice);

  let liabilityBasis: string;
  if (screenUnanswered) {
    liabilityBasis =
      "Not assessed. The Schedule 2 screen is unanswered, so no carbon tax liability can be stated — an estimate would be a guess, and a stated liability must be defensible.";
  } else if (!anyListedActivity) {
    liabilityBasis =
      "Not a carbon taxpayer. The entity operates no stationary combustion at or above 10 MW(th), carries out no listed industrial process and has no fugitive emissions, so it has no Schedule 2 activity. Road transport and purchased electricity cannot create liability on their own. There is nothing to register or file.";
  } else if (cannotPrice) {
    liabilityBasis =
      "Liable, but not priced. The tax period is not stated and the rate moves with it — R236 for 2025, R308 when Phase 2 opens in 2026 — so pricing it would mean choosing a rate on the company's behalf.";
  } else if (!liable) {
    liabilityBasis =
      "A Schedule 2 activity is recorded, but no emissions have been captured against it for the period, so the liability is nil on the data supplied.";
  } else {
    const names = taxableLines.map((l) => l.label).join("; ");
    liabilityBasis = `Liable on ${taxableLines.length === 1 ? "one listed activity" : `${taxableLines.length} listed activities`}: ${names}. Road transport and purchased electricity are excluded by the Act.`;
  }

  /* ── the priced quantity ─────────────────────────────────────────────── */
  const ytd =
    mode === "workbook-parity"
      ? // Parity mode reproduces the client's own spreadsheet, defects included —
        // including its mixed-unit block and its Scope 1 + 2 base. That is what
        // the mode is for; it is never the figure we publish.
        TAXABLE_SCOPE_ROWS.reduce((a, ref) => a + (readEsgCell(workbook, "e-data", ref) ?? 0), 0)
      : liable
        ? taxableLines.reduce((a, l) => a + l.tco2e, 0)
        : 0;

  const annualised = ytd * annualise;
  const taxable = annualised * (1 - allowance);

  return {
    liable: mode === "workbook-parity" ? true : liable,
    liabilityBasis,
    screenIncomplete,
    taxableLines,
    excludedLines,
    ytdTco2e: ytd,
    annualisedTco2e: annualised,
    taxableTco2e: taxable,
    liabilityZar: taxable * rate,
    rateZar: rate,
    taxPeriodYear: rateYear,
    rateExtrapolated: extrapolated,
    taxPeriodUnknown: periodUnknown,
    allowance,
    annualiseFactor: annualise,
    annualised: annualise !== 1,
  };
}
