/**
 * Emissions intensity — tonnes of CO₂e per unit of business activity.
 *
 * THE RULING THIS IMPLEMENTS
 *
 * "Revenue intensity (tCO₂e per R million revenue or turnover) is the ratio
 * that shows up almost everywhere: CDP questionnaires, sustainability-linked
 * loan KPI menus, tender ESG scorecards, GRI-aligned reports. It's the default
 * because it lets a reviewer compare a company against its own prior years and
 * against peers of different sizes on one number, and because it's the most
 * direct signal of whether emissions are actually decoupling from growth —
 * falling absolute tonnes could just mean a bad year; falling intensity means
 * the business is genuinely getting cleaner per rand earned.
 *
 * Employee/FTE intensity is the sensible second ratio, particularly for a law
 * firm, a consultancy, a school, or any people-heavy service business where
 * revenue is a weak proxy for operational footprint. For an industrial or
 * manufacturing client the second ratio would more usefully be tCO₂e per unit
 * of production."
 * — Z. Mnanzana, Q12, 14 September 2026.
 *
 * The toolkit reported absolute tonnes only. No denominator existed anywhere,
 * so a company could not show a reviewer that it was decoupling, and could not
 * answer the ratio a lender asks for by name.
 *
 * Nothing here is estimated. A missing denominator yields `null`, and the
 * report says the ratio cannot be computed rather than dividing by a guess.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeGhgInventory } from "./ghgInventory";

export type EsgIntensityRatio = {
  /** e.g. "tCO₂e per R million revenue". */
  label: string;
  value: number | null;
  unit: string;
  /** The denominator actually used, so a reader can check the arithmetic. */
  basis: string;
  /** Why it could not be computed. Empty when it could. */
  unavailableReason: string;
};

export type EsgIntensityResult = {
  /** The ratio lenders and tender evaluators ask for first. */
  revenue: EsgIntensityRatio;
  /** The natural second for people-heavy businesses. */
  perEmployee: EsgIntensityRatio;
  /** Scope 1 + 2, the numerator both ratios divide. */
  scope1And2Tco2e: number;
  hasAny: boolean;
};

const MILLION = 1_000_000;

export function computeEsgIntensity(workbook: EsgWorkbookData): EsgIntensityResult {
  const ghg = computeGhgInventory(workbook);
  const tonnes = ghg.scope1And2;

  const revenueZar = readEsgCell(workbook, "assumptions", "_revenueZar");
  const headcount = readEsgCell(workbook, "s-data", "L12");

  const revenue: EsgIntensityRatio = {
    label: "Emissions intensity — revenue",
    unit: "tCO₂e per R million",
    basis: revenueZar ? `Revenue of R${revenueZar.toLocaleString("en-ZA")} for the period` : "",
    value:
      ghg.hasData && revenueZar && revenueZar > 0 ? tonnes / (revenueZar / MILLION) : null,
    unavailableReason: !ghg.hasData
      ? "No emissions have been captured for the period, so there is no numerator."
      : !revenueZar || revenueZar <= 0
        ? "Revenue for the period has not been captured, so the ratio lenders and tender evaluators ask for first cannot be computed."
        : "",
  };

  const perEmployee: EsgIntensityRatio = {
    label: "Emissions intensity — per employee",
    unit: "tCO₂e per employee",
    basis: headcount ? `${headcount.toLocaleString("en-ZA")} employees on the EEA2 basis` : "",
    value: ghg.hasData && headcount && headcount > 0 ? tonnes / headcount : null,
    unavailableReason: !ghg.hasData
      ? "No emissions have been captured for the period, so there is no numerator."
      : !headcount || headcount <= 0
        ? "Headcount has not been captured, so emissions per employee cannot be computed."
        : "",
  };

  return {
    revenue,
    perEmployee,
    scope1And2Tco2e: tonnes,
    hasAny: revenue.value != null || perEmployee.value != null,
  };
}
