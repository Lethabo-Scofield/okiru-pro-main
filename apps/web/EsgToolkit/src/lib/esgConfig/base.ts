/**
 * Shared ESG base configuration + the `defineEsgSector` factory.
 *
 * WHAT LIVES HERE
 * ---------------
 * Values that are legitimately the same for every South African entity,
 * whatever its sector:
 *
 *  - national / international emission factors (Eskom NERSA grid, DEFRA diesel,
 *    petrol, LPG, GHG Protocol water and landfill);
 *  - SA Carbon Tax Act parameters (tier rates, 60% basic allowance);
 *  - the universal banding rubric (stance floors);
 *  - workbook v1.7 thresholds and pillar maxima.
 *
 * WHAT IS *NOT* SECTOR-NEUTRAL BUT LIVES HERE ANYWAY
 * --------------------------------------------------
 * The thresholds and pillar weights below come from the ONLY calibrated
 * instance we have — the SG Consumer / FMCG-Distribution fork of the workbook
 * (`Assumptions!A3`: "THIS INSTANCE IS CONFIGURED FOR SUPERGROUP — Transport /
 * FMCG Distribution"). `Assumptions!E98` even says the 0.4 environmental weight
 * is "GHG-weighted; FMCG/Distribution is fuel-intensive".
 *
 * They are here rather than invented per sector because inventing them would be
 * worse. Every sector that does not override them records the path on
 * `inheritedPaths`, so the fact that (say) Financial Services is being scored on
 * a fuel-intensive pillar weighting is visible rather than silent.
 *
 * Sources: `docs/esg/extracted/Assumptions.json` (raw truth),
 * `docs/esg/ESG_FORMULA_LEDGER.md` Part 2D (cell provenance map).
 */

import type {
  EsgSectorConfig,
  EsgSectorSpec,
  EsgSectorValues,
  EsgStanceKey,
} from "./types";

/** `Assumptions!B9` = `IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))`. */
export const ESG_STANCE_FLOOR: Record<EsgStanceKey, number> = {
  lean: 0.3,
  standard: 0.5,
  strict: 0.7,
};

/** The same floor keyed by the `Assumptions!B6` dropdown label. */
export const ESG_STANCE_FLOOR_BY_LABEL: Record<string, number> = {
  Lean: 0.3,
  Standard: 0.5,
  Strict: 0.7,
};

/**
 * Resolve the banding floor the way the workbook does: prefer the numeric
 * `Assumptions!B9` if the sheet carries one, else derive it from the
 * `Assumptions!B6` stance label, else Standard.
 */
export function stanceFloorFromWorkbook(
  stanceLabel: string | number | null | undefined,
  numericFloor?: number | null,
): number {
  if (numericFloor != null && Number.isFinite(numericFloor) && numericFloor > 0) {
    return numericFloor;
  }
  const label = String(stanceLabel ?? "Standard");
  return ESG_STANCE_FLOOR_BY_LABEL[label] ?? ESG_STANCE_FLOOR.standard;
}

/** The shared base every sector config is built from. */
export const ESG_BASE_VALUES: EsgSectorValues = {
  stanceFloor: { ...ESG_STANCE_FLOOR },

  // BLOCK 1 — `Assumptions!B30:B36`. National / international factors.
  emissionFactors: {
    dieselScope1: 2.68, // Assumptions!B30 — DEFRA 2024 HGV diesel, kgCO₂e/L
    petrolBusinessCars: 2.31, // Assumptions!B31 — DEFRA 2024 passenger petrol, kgCO₂e/L
    lpg: 1.51, // Assumptions!B32 — DEFRA 2024 LPG, kgCO₂e/kg
    electricityScope2: 0.82, // Assumptions!B33 — Eskom NERSA 2024, kgCO₂e/kWh
    solarOnsite: 0.025, // Assumptions!B34 — IEA / GHG Protocol solar PV, kgCO₂e/kWh
    waterTco2ePerKl: 0.000344, // Assumptions!B35 — GHG Protocol, tCO₂e/kL (tonnes)
    wasteToLandfillTco2ePerTonne: 0.58, // Assumptions!B36 — DEFRA 2024, tCO₂e/tonne
  },

  // BLOCK 2 — `Assumptions!B43:B65`, plus the one literal the workbook hardcodes.
  thresholds: {
    ghgYoyReduction: 0.1, // Assumptions!B43 — THR_GHG_YOY
    renewableElectricityMin: 0.2, // Assumptions!B44 — THR_RE
    fuelToleranceMultiplier: 1.05, // Assumptions!B45 — THR_FUEL_TOL
    evFleetMin: 0.05, // Assumptions!B46 — THR_EV_MIN
    evFleet2030: 0.2, // Assumptions!B47 — THR_EV_2030
    wasteDiversion: 0.75, // Assumptions!B48 — THR_WASTE
    wasteDiversionExcellence: 0.9, // Assumptions!B49 — THR_WASTE_X
    blackEmployees: 0.6, // Assumptions!B50 — THR_BLACK
    blackFemaleManagement: 0.3, // Assumptions!B51 — THR_BFM
    personsWithDisabilities: 0.02, // Assumptions!B52 — THR_PWD
    trainingHoursPerEmployee: 40, // Assumptions!B53 — THR_TRAIN_HR
    mandatoryGrantRecovery: 0.8, // Assumptions!B54 — THR_GRANT
    ltifrMax: 2, // Assumptions!B55 — THR_LTIFR
    csiSpendOfNpat: 0.01, // Assumptions!B56 — THR_CSI
    csiInitiativesPerYear: 6, // S_Scorecard!D23 literal — no Assumptions cell exists
    localLabourProcurement: 0.4, // Assumptions!B57 — THR_LOCAL
    supplierHsCompliance: 0.8, // Assumptions!B58 — THR_SUP_HS
    kingVApplyExplain: 0.7, // Assumptions!B59 — THR_KING
    publicInterestScore: 500, // Assumptions!B60 — THR_PI
    materialRisksMin: 10, // Assumptions!B61 — THR_RISKS
  },

  // BLOCK 1 tail — `Assumptions!B37:B39` + BLOCK 7 `B111`/`B112`.
  carbonTax: {
    tier1RateZar: 236, // Assumptions!B37 — TAX_T1
    tier2RateZar: 640, // Assumptions!B38 — TAX_T2
    basicAllowance: 0.6, // Assumptions!B39 — TAX_ALLOW
    dataMonths: 9, // Assumptions!B111 — ENT_MOS
    annualiseFactor: 1.3333333333, // Assumptions!B112 — ENT_ANN = 12 / B111
  },

  // BLOCK 6 — `Assumptions!C98:C100`.
  pillarMax: {
    environmental: 108,
    social: 100,
    governance: 100,
  },

  // BLOCK 6 — `Assumptions!B98:B100`. Sums to 1 (`B101`).
  // NOTE: `Assumptions!E98` justifies E = 0.4 as "GHG-weighted; FMCG/Distribution
  // is fuel-intensive". Carrying it to a bank or a school is a placeholder, not
  // a finding — which is exactly why non-FMCG sectors list it on `inheritedPaths`.
  pillarWeights: {
    environmental: 0.4,
    social: 0.3,
    governance: 0.3,
  },

  // BLOCK 2 tail — `Assumptions!B62:B65`.
  ratingBands: {
    excellent: 0.85, // Assumptions!B62 — RTG_EXC
    good: 0.7, // Assumptions!B63 — RTG_GOOD
    adequate: 0.5, // Assumptions!B64 — RTG_ADEQ
    pillarTarget: 0.75, // Assumptions!B65 — TGT_PILLAR
  },

  // BLOCK 0 + BLOCK 7 — `Assumptions!B10:B15`, `B105:B108`.
  reporting: {
    sbtiTargetYear: 2050, // Assumptions!B107 — ENT_NZ
    baselineYear: 2025, // implied by Assumptions!B106 "FY 2025/26"
    baselineYearLabel: "FY 2025/26", // Assumptions!B106 — ENT_BASE
    reportingPeriodLabel: "FY 2025/26", // generic default; B105 carries the entity's own string
    sectorVariant: "Generic", // Assumptions!B10 — SECTOR (base = the DV list's first option)
    primaryStandard: "King V + IFRS S1/S2", // Assumptions!B11 — STD_PRIMARY
    materialityBasis: "Single (financial — IFRS)", // Assumptions!B12 — MAT_BASIS
    currency: "ZAR", // Assumptions!B13 — CCY
    carbonTaxDisplay: "Both (current + escalated)", // Assumptions!B15 — TAX_MODE
    bbbeeSectorCode: "Generic Code (Statement 000)", // Assumptions!B108 — ENT_BBEE
  },

  // BLOCK 3 — `Assumptions!B68:B72`.
  bbbeeElementWeights: {
    ownership: 25, // Assumptions!B68 — BB_OWN
    managementControl: 19, // Assumptions!B69 — BB_MC
    skillsDevelopment: 25, // Assumptions!B70 — BB_SD
    enterpriseAndSupplierDevelopment: 40, // Assumptions!B71 — BB_ESD
    socioEconomicDevelopment: 5, // Assumptions!B72 — BB_SED
  },

  // No sourced cross-sector benchmark exists. Left empty on purpose — a guessed
  // benchmark scores real companies against a number nobody can defend.
  benchmarks: {},

  // Site/month seeds are client data, not sector data. Empty unless a sector
  // config is a real client fork (see `sectors/consumer-goods.ts`).
  defaultSites: [],
  defaultMonths: [],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge overrides onto the base, recording which leaf paths were overridden and
 * which were inherited. Arrays and non-objects are leaves — overriding one
 * replaces it wholesale.
 */
function mergeRecordingPaths(
  base: Record<string, unknown>,
  over: Record<string, unknown> | undefined,
  prefix: string,
  overridden: string[],
  inherited: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(base)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const baseValue = base[key];
    const overValue = over ? over[key] : undefined;

    if (isPlainObject(baseValue) && (overValue === undefined || isPlainObject(overValue))) {
      out[key] = mergeRecordingPaths(baseValue, overValue, path, overridden, inherited);
    } else if (overValue !== undefined) {
      out[key] = overValue;
      overridden.push(path);
    } else {
      out[key] = baseValue;
      inherited.push(path);
    }
  }

  // Keys the override introduces that the base does not have (e.g. new
  // `benchmarks` entries) are sector-specific by definition.
  if (over) {
    for (const key of Object.keys(over)) {
      if (Object.prototype.hasOwnProperty.call(base, key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      out[key] = over[key];
      overridden.push(path);
    }
  }

  return out;
}

/**
 * Build a sector config from the shared base plus whatever this sector can
 * actually defend. Mirrors `apps/web/Toolkit/src/lib/sectors/` — one file per
 * sector, one registry, no `??` fallbacks scattered through calculators.
 */
export function defineEsgSector(spec: EsgSectorSpec): EsgSectorConfig {
  const overridden: string[] = [];
  const inherited: string[] = [];

  const values = mergeRecordingPaths(
    ESG_BASE_VALUES as unknown as Record<string, unknown>,
    spec.overrides as Record<string, unknown> | undefined,
    "",
    overridden,
    inherited,
  ) as unknown as EsgSectorValues;

  return {
    ...values,
    id: spec.id,
    label: spec.label,
    coverLabel: spec.coverLabel,
    calibration: spec.calibration,
    inheritedPaths: Object.freeze(inherited.slice().sort()),
    sectorSpecificPaths: Object.freeze(overridden.slice().sort()),
    notes: spec.notes,
  };
}

/** True when `path` (e.g. `"thresholds.wasteDiversion"`) is a carried-over default. */
export function isInheritedEsgValue(config: EsgSectorConfig, path: string): boolean {
  return config.inheritedPaths.includes(path);
}
