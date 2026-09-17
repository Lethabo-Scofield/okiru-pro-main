/**
 * SG Consumer / FMCG assumptions — **back-compatibility surface only.**
 *
 * This file used to BE the config: one client's constants, applied to every
 * company in every sector. The real configs now live in `./sectors/*` behind the
 * registry in `./index.ts` (`getEsgSectorConfig`, `listEsgSectorConfigs`).
 *
 * Everything below is a thin projection of `ESG_SECTOR_CONSUMER_GOODS` so that
 * existing calculator imports keep compiling unchanged:
 *
 *     import { PILLAR_MAX_ENVIRONMENTAL, THR_WASTE, … } from "../esgConfig/consumer-goods";
 *
 * NEW CODE SHOULD NOT IMPORT FROM HERE. Take the sector from the workbook cover
 * and call `getEsgSectorConfig(sector)` instead — these constants are FMCG's,
 * and using them elsewhere is the bug this refactor exists to remove.
 *
 * Values are sourced from `docs/esg/extracted/Assumptions.json` (workbook v1.7)
 * and cross-checked against `docs/esg/ESG_FORMULA_LEDGER.md` Part 2D. Each
 * constant cites its Assumptions cell.
 *
 * REMOVED in this refactor (verified dead by repo-wide grep — the only hits were
 * the declarations themselves):
 *   GWP_R404A, GWP_R134A   — no workbook source; refrigerants are not modelled
 *   EF_SOLAR_OFFSET        — was 0.82 (the GRID factor); Assumptions!B34 is 0.025
 *   EF_WATER               — was 0.001; Assumptions!B35 is 0.000344 tCO₂e/kL
 *   THR_RENEWABLE          — now `thresholds.renewableElectricityMin` (B44)
 *   THR_WAGE_PREMIUM       — no workbook source at all
 *   BASELINE_YEAR_DEFAULT  — now `reporting.baselineYear` (B106)
 *   REPORTING_PERIOD_DEFAULT — now `reporting.reportingPeriodLabel` (B105)
 *   SECTOR_VARIANT         — now `reporting.sectorVariant` (B10)
 *   GHG_DEPOT_BENCHMARKS   — the 45/38/42/55/40 kWh/m² figures have no source in
 *                            docs/esg; not carried over rather than fabricated
 */

import { ESG_SECTOR_CONSUMER_GOODS } from "./sectors/consumer-goods";

export type { EsgStanceKey } from "./types";
export { stanceFloorFromWorkbook } from "./base";

/** The registry entry these constants project. Prefer this over the flat exports. */
export const ESG_CONSUMER_GOODS_CONFIG = ESG_SECTOR_CONSUMER_GOODS;

const cfg = ESG_SECTOR_CONSUMER_GOODS;

/** `Assumptions!B6` dropdown label → banding floor. */
export const STANCE_FLOOR_BY_LABEL: Record<string, number> = {
  Lean: cfg.stanceFloor.lean,
  Standard: cfg.stanceFloor.standard,
  Strict: cfg.stanceFloor.strict,
};

/** `Assumptions!B9` = `IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))`. */
export const STANCE_FLOOR = cfg.stanceFloor;

/** Emission factors — `Assumptions!B30:B33`, mirrored in `E_Data!B4:B7`. */
export const EF_DIESEL_SCOPE1 = cfg.emissionFactors.dieselScope1; // Assumptions!B30
export const EF_BUSINESS_CARS = cfg.emissionFactors.petrolBusinessCars; // Assumptions!B31
export const EF_LPG = cfg.emissionFactors.lpg; // Assumptions!B32
export const EF_ELECTRICITY_SCOPE2 = cfg.emissionFactors.electricityScope2; // Assumptions!B33

/** Waste diversion thresholds — `Assumptions!B48` / `B49`. */
export const THR_WASTE = cfg.thresholds.wasteDiversion;
export const THR_WASTE_X = cfg.thresholds.wasteDiversionExcellence;

/** Environmental / social thresholds. */
export const THR_GHG_YOY = cfg.thresholds.ghgYoyReduction; // Assumptions!B43
export const THR_BLACK_EE = cfg.thresholds.blackEmployees; // Assumptions!B50
export const THR_PWD = cfg.thresholds.personsWithDisabilities; // Assumptions!B52
export const THR_TRAINING_HOURS = cfg.thresholds.trainingHoursPerEmployee; // Assumptions!B53
export const THR_LEVY_SPEND = cfg.thresholds.mandatoryGrantRecovery; // Assumptions!B54
export const THR_LTIFR = cfg.thresholds.ltifrMax; // Assumptions!B55
/** `S_Scorecard!D23` literal — the workbook hardcodes 6, there is no Assumptions cell. */
export const THR_CSI_INITIATIVES = cfg.thresholds.csiInitiativesPerYear;

/** Carbon tax — `Assumptions!B37`, `B38`, `B39`, `B112`. */
export const CARBON_TAX_RATE_TIER1 = cfg.carbonTax.tier1RateZar;
export const CARBON_TAX_RATE_TIER2 = cfg.carbonTax.tier2RateZar;
export const CARBON_TAX_ALLOWANCE = cfg.carbonTax.basicAllowance;
export const CARBON_ANNUALISE_FACTOR = cfg.carbonTax.annualiseFactor;

/** SBTi net-zero target year — `Assumptions!B107`. */
export const SBTI_TARGET_YEAR = cfg.reporting.sbtiTargetYear;

/** Pillar max points — `Assumptions!C98:C100`. */
export const PILLAR_MAX_ENVIRONMENTAL = cfg.pillarMax.environmental;
export const PILLAR_MAX_SOCIAL = cfg.pillarMax.social;
export const PILLAR_MAX_GOVERNANCE = cfg.pillarMax.governance;

/** `E_Data` rows 14–18 — SG Consumer's five depots. */
export const ESG_DEFAULT_DEPOTS = cfg.defaultSites;

/** `E_Data` columns C–K — nine months (`Assumptions!B111` = 9). */
export const ESG_DEFAULT_MONTHS = cfg.defaultMonths;
