/**
 * SG Consumer / FMCG assumptions — sourced from docs/esg/extracted/Assumptions.json (v1.7).
 */

export type EsgStanceKey = "lean" | "standard" | "strict";

export const STANCE_FLOOR_BY_LABEL: Record<string, number> = {
  Lean: 0.3,
  Standard: 0.5,
  Strict: 0.7,
};

export const STANCE_FLOOR: Record<EsgStanceKey, number> = {
  lean: 0.3,
  standard: 0.5,
  strict: 0.7,
};

/** Emission factors (E_Data rows 4–10 / Assumptions mirrors). */
export const EF_DIESEL_SCOPE1 = 2.68;
export const EF_BUSINESS_CARS = 2.31;
export const EF_LPG = 1.51;
export const EF_ELECTRICITY_SCOPE2 = 0.82;
export const EF_SOLAR_OFFSET = 0.82;
export const EF_WATER = 0.001;

/** Refrigerant GWP (kg CO2e per kg refrigerant). */
export const GWP_R404A = 3922;
export const GWP_R134A = 1430;

/** Waste diversion thresholds (Assumptions B48 / B49). */
export const THR_WASTE = 0.75;
export const THR_WASTE_X = 0.9;

/** Social / EE thresholds. */
export const THR_GHG_YOY = 0.1;
export const THR_RENEWABLE = 0.2;
export const THR_BLACK_EE = 0.6;
export const THR_PWD = 0.02;
export const THR_TRAINING_HOURS = 40;
export const THR_LEVY_SPEND = 0.8;
export const THR_LTIFR = 2;
export const THR_CSI_INITIATIVES = 6;
export const THR_WAGE_PREMIUM = 0.05;

/** Carbon tax (Assumptions). */
export const CARBON_TAX_RATE_TIER1 = 236;
export const CARBON_TAX_RATE_TIER2 = 640;
export const CARBON_TAX_ALLOWANCE = 0.6;
export const CARBON_ANNUALISE_FACTOR = 1.3333333333;

/** SBTi / reporting. */
export const SBTI_TARGET_YEAR = 2050;
export const BASELINE_YEAR_DEFAULT = 2025;
export const REPORTING_PERIOD_DEFAULT = "FY 2025/26";
export const SECTOR_VARIANT = "FMCG / Distribution";

/** Pillar max points (scorecards). */
export const PILLAR_MAX_ENVIRONMENTAL = 108;
export const PILLAR_MAX_SOCIAL = 100;
export const PILLAR_MAX_GOVERNANCE = 100;

/** Energy intensity benchmarks per depot (Validation rows 19–32, kWh/m²). */
export const GHG_DEPOT_BENCHMARKS: Record<string, number> = {
  BLOEM: 45,
  CPT: 38,
  DBN: 42,
  ISANDO: 55,
  PE: 40,
};

export const ESG_DEFAULT_DEPOTS = ["BLOEM", "CPT", "DBN", "ISANDO", "PE"] as const;

export const ESG_DEFAULT_MONTHS = [
  "Jul-25",
  "Aug-25",
  "Sep-25",
  "Oct-25",
  "Nov-25",
  "Dec-25",
  "Jan-26",
  "Feb-26",
  "Mar-26",
] as const;

export function stanceFloorFromWorkbook(
  stanceLabel: string | number | null | undefined,
  numericFloor?: number | null,
): number {
  if (numericFloor != null && Number.isFinite(numericFloor) && numericFloor > 0) {
    return numericFloor;
  }
  const label = String(stanceLabel ?? "Standard");
  return STANCE_FLOOR_BY_LABEL[label] ?? STANCE_FLOOR.standard;
}
