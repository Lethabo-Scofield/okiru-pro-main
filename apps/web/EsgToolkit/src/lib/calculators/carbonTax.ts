/**
 * `Carbon_Tax` — SA Carbon Tax Act liability.
 *
 * Verbatim from `docs/esg/extracted/Carbon_Tax.json`:
 *
 *   C6:C10 = E_Data!L75 / L76 / L77 / L78 / L82   (Scope 1A–1D + Scope 2 net)
 *   C11    = SUM(C6:C10)                           → 3,184,558.93
 *   D6:D10 = Cn * Assumptions!B112                 (YTD → full year)
 *   E6:E10 = Dn * (1 - Assumptions!B39)            (60 % basic allowance, s7)
 *   E11    = SUM(E6:E10)                           → 1,698,431.42933333
 *   B15/C15 = Assumptions!B37 / B38                (R236 / R640 per tCO₂e)
 *   B16/C16 = E11 * rate                           → 400,829,817.32 / 1,086,996,114.77
 *
 * All five `L` cells are now produced by `esgDeriveSummary.deriveEData` from the
 * monthly input grids, so a manually-entered workbook computes a real liability
 * instead of R0. (Nothing double-counts: `L82` is Scope 2 net, and `L79` — the
 * Scope 1 total — is deliberately NOT in the list; the four `L75:L78` rows are.)
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeGhgInventory } from "./ghgInventory";
import { scoringMode, type EsgScoringOptions } from "./shared";
import {
  CARBON_TAX_ALLOWANCE,
  CARBON_TAX_RATE_TIER1,
  CARBON_TAX_RATE_TIER2,
} from "../esgConfig/consumer-goods";

export type CarbonTaxResult = {
  /** `Carbon_Tax!C11` — YTD activity across the taxable scopes. */
  ytdTco2e: number;
  /** `Carbon_Tax!D11` — annualised. */
  annualisedTco2e: number;
  /** `Carbon_Tax!E11` — after the basic allowance. */
  taxableTco2e: number;
  /** `Carbon_Tax!B16`. */
  tier1Liability: number;
  /** `Carbon_Tax!C16`. */
  tier2Liability: number;
  tier1Rate: number;
  tier2Rate: number;
  /** The `Assumptions!B112` factor actually applied. */
  annualiseFactor: number;
};

/** `Carbon_Tax!C6:C10` — the taxable emission rows on `E_Data`. */
const TAXABLE_SCOPE_ROWS = ["L75", "L76", "L77", "L78", "L82"] as const;

export function computeCarbonTax(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): CarbonTaxResult {
  const mode = scoringMode(options);
  /*
   * `Assumptions!B112 = =12/B111` — the YTD→full-year annualiser, where `B111`
   * is the number of months of data captured.
   *
   * The old fallback was the config constant 1.3333… — SG Consumer's NINE-month
   * factor — silently applied to every other company, inflating their liability
   * by a third whenever `B112` was absent. Recomputed from `B111` when that is
   * present; otherwise 1 (treat the captured figures as a full year), which is
   * the neutral identity rather than another company's reporting period.
   */
  const dataMonths = readEsgCell(workbook, "assumptions", "B111");
  const annualise =
    readEsgCell(workbook, "assumptions", "B112") ??
    (dataMonths != null && dataMonths > 0 ? 12 / dataMonths : 1);

  // Statutory parameters — SA Carbon Tax Act. Falling back to the Act's own
  // rates cannot create emissions; it only prices the ones that were entered.
  const allowance = readEsgCell(workbook, "assumptions", "B39") ?? CARBON_TAX_ALLOWANCE;
  const rate1 = readEsgCell(workbook, "assumptions", "B37") ?? CARBON_TAX_RATE_TIER1;
  const rate2 = readEsgCell(workbook, "assumptions", "B38") ?? CARBON_TAX_RATE_TIER2;

  /*
   * THE TAXED QUANTITY IS TONNES.
   *
   * This used to sum `E_Data!L75:L78` and `L82` — the workbook's "GHG
   * Inventory Summary" block, which is LABELLED tCO₂e and holds raw ACTIVITY:
   * litres, kWh and kilolitres, added together. For SG Consumer that is
   * 3,184,558.93 against a real 3,714.94, so the liability came out roughly a
   * thousand times too large. A client quoting it in a submission would have
   * been catastrophically wrong, and nothing on the page said so.
   *
   * Corrected mode therefore takes the same scopes from the GHG inventory,
   * where they are computed as activity x emission factor. Parity mode keeps
   * reading the block verbatim, because reproducing the client's own
   * spreadsheet — defects included — is exactly what that mode is for.
   */
  const ytd =
    mode === "workbook-parity"
      ? TAXABLE_SCOPE_ROWS.reduce((a, ref) => a + (readEsgCell(workbook, "e-data", ref) ?? 0), 0)
      : computeGhgInventory(workbook).scope1And2;
  const annualised = ytd * annualise;
  const taxable = annualised * (1 - allowance);

  return {
    ytdTco2e: ytd,
    annualisedTco2e: annualised,
    taxableTco2e: taxable,
    tier1Liability: taxable * rate1,
    tier2Liability: taxable * rate2,
    tier1Rate: rate1,
    tier2Rate: rate2,
    annualiseFactor: annualise,
  };
}
