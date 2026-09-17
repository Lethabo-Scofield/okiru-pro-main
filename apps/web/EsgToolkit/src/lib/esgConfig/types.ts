/**
 * ESG sector configuration — the shape of everything an ESG assessment may vary
 * by sector.
 *
 * WHY THIS EXISTS
 * ---------------
 * The toolkit shipped with exactly one constants file (`consumer-goods.ts`),
 * holding one client's numbers ("SG Consumer / FMCG assumptions"), while the
 * ESG cover screen offers 14 sectors. Every company in every sector was
 * therefore scored against FMCG-distribution emission factors and thresholds.
 * This type + the registry in `./index.ts` make the sector an explicit input.
 *
 * PROVENANCE RULE
 * ---------------
 * Every numeric field below cites the workbook cell it came from
 * (`docs/esg/extracted/Assumptions.json`, cross-checked against
 * `docs/esg/ESG_FORMULA_LEDGER.md` Part 2D). Nothing here is invented. Where a
 * sector has no defensible sector-specific value it INHERITS the base value and
 * that inheritance is recorded on `inheritedPaths`, so a reader can always tell
 * a researched number from a carried-over default.
 */

export type EsgStanceKey = "lean" | "standard" | "strict";

/**
 * Sector ids — one per option offered by `COVER_FIELDS.sector` in
 * `apps/web/src/components/esg-workbook/esgSectionConfigs.ts`, which mirrors the
 * workbook's own `Assumptions!B8` data-validation list.
 */
export type EsgSectorId =
  | "generic"
  | "consumer-goods"
  | "transport-logistics"
  | "manufacturing"
  | "financial-services"
  | "ict"
  | "agriculture"
  | "mining"
  | "construction"
  | "retail"
  | "hospitality"
  | "healthcare"
  | "education"
  | "public-sector";

/**
 * Emission factors. BLOCK 1 of the Assumptions sheet (`Assumptions!B30:B36`,
 * mirrored into `E_Data!B4:B10`).
 *
 * These are SOUTH AFRICAN NATIONAL / international factors (DEFRA 2024, Eskom
 * NERSA 2024, GHG Protocol) — they are legitimately shared across sectors and
 * live in the base config. A sector only overrides one if it burns a different
 * fuel mix, and then only with a cited source.
 */
export interface EsgEmissionFactors {
  /** `Assumptions!B30` — kgCO₂e/L. DEFRA 2024, mobile combustion, HGV diesel. */
  dieselScope1: number;
  /** `Assumptions!B31` — kgCO₂e/L. DEFRA 2024, passenger car petrol. */
  petrolBusinessCars: number;
  /** `Assumptions!B32` — kgCO₂e/kg. DEFRA 2024, LPG combustion (forklifts). */
  lpg: number;
  /** `Assumptions!B33` — kgCO₂e/kWh. Eskom NERSA 2024 grid factor. */
  electricityScope2: number;
  /**
   * `Assumptions!B34` — kgCO₂e/kWh. IEA / GHG Protocol solar-PV lifecycle.
   * NOT the grid factor: onsite solar is 0.025, not 0.82. The avoided-emissions
   * offset is `electricityScope2 − solarOnsite`.
   */
  solarOnsite: number;
  /**
   * `Assumptions!B35` — **tCO₂e/kL** (tonnes, unlike every other factor here,
   * which is kg). GHG Protocol water supply & treatment.
   */
  waterTco2ePerKl: number;
  /** `Assumptions!B36` — tCO₂e/tonne. DEFRA 2024, landfilled commercial waste. */
  wasteToLandfillTco2ePerTonne: number;
}

/**
 * Scoring thresholds. BLOCK 2 of the Assumptions sheet (`Assumptions!B43:B65`),
 * plus one threshold the workbook hardcodes into a formula rather than a cell.
 */
export interface EsgThresholds {
  /** `Assumptions!B43` — `THR_GHG_YOY`. Scope 1+2 YoY reduction target. E_Scorecard row 6. */
  ghgYoyReduction: number;
  /** `Assumptions!B44` — `THR_RE`. Renewable electricity minimum. E_Scorecard rows 7, 13. */
  renewableElectricityMin: number;
  /** `Assumptions!B45` — `THR_FUEL_TOL`. Fleet L/100km tolerance over OEM norm. E_Scorecard row 15. */
  fuelToleranceMultiplier: number;
  /** `Assumptions!B46` — `THR_EV_MIN`. EV fleet % minimum (current). E_Scorecard row 17. */
  evFleetMin: number;
  /** `Assumptions!B47` — `THR_EV_2030`. EV fleet % target 2030. NetZero_Roadmap. */
  evFleet2030: number;
  /** `Assumptions!B48` — `THR_WASTE`. Waste diversion target. E_Scorecard row 19. */
  wasteDiversion: number;
  /** `Assumptions!B49` — `THR_WASTE_X`. Waste diversion excellence. E_Scorecard row 19. */
  wasteDiversionExcellence: number;
  /** `Assumptions!B50` — `THR_BLACK`. % Black employees target. S_Scorecard row 5, G_Data F8. */
  blackEmployees: number;
  /** `Assumptions!B51` — `THR_BFM`. % Black female management target. S_Scorecard row 6. */
  blackFemaleManagement: number;
  /** `Assumptions!B52` — `THR_PWD`. Persons-with-disabilities target. S_Scorecard row 8. */
  personsWithDisabilities: number;
  /** `Assumptions!B53` — `THR_TRAIN_HR`. Training hours per employee. S_Scorecard row 14. */
  trainingHoursPerEmployee: number;
  /** `Assumptions!B54` — `THR_GRANT`. Mandatory grant recovery target. S_Scorecard row 15. */
  mandatoryGrantRecovery: number;
  /** `Assumptions!B55` — `THR_LTIFR`. LTIFR maximum (target ≤). S_Scorecard row 17. */
  ltifrMax: number;
  /** `Assumptions!B56` — `THR_CSI`. CSI/SED spend as % of NPAT. B_BBEE_ESG E10. */
  csiSpendOfNpat: number;
  /**
   * `S_Scorecard!D23` — literal `6` inside the formula
   * `COUNTA(S_Data!A72:A79) >= 6`. There is **no Assumptions cell** for this
   * one; the workbook hardcodes it. (ESG_FORMULA_LEDGER Part 1B, row d23.)
   */
  csiInitiativesPerYear: number;
  /** `Assumptions!B57` — `THR_LOCAL`. Local labour procurement target. S_Scorecard row 24. */
  localLabourProcurement: number;
  /** `Assumptions!B58` — `THR_SUP_HS`. Supplier H&S compliance minimum. S_Scorecard row 26. */
  supplierHsCompliance: number;
  /** `Assumptions!B59` — `THR_KING`. King V Apply & Explain minimum. G_Scorecard row 5. */
  kingVApplyExplain: number;
  /** `Assumptions!B60` — `THR_PI`. Public Interest score threshold. Companies Act s93. */
  publicInterestScore: number;
  /** `Assumptions!B61` — `THR_RISKS`. Material risks identified minimum. G_Data F22. */
  materialRisksMin: number;
}

/** Carbon tax. `Assumptions!B37:B39` + `B111`/`B112`. */
export interface EsgCarbonTaxParams {
  /** `Assumptions!B37` — `TAX_T1`. ZAR/tCO₂e, SA Carbon Tax Act tier 1 (2025). */
  tier1RateZar: number;
  /** `Assumptions!B38` — `TAX_T2`. ZAR/tCO₂e, projected 2026 escalation. */
  tier2RateZar: number;
  /** `Assumptions!B39` — `TAX_ALLOW`. Basic 60% tax-free allowance, s7. */
  basicAllowance: number;
  /** `Assumptions!B111` — `ENT_MOS`. Months of data captured. */
  dataMonths: number;
  /** `Assumptions!B112` — `ENT_ANN` = `12 / B111`. YTD → full-year annualiser. */
  annualiseFactor: number;
}

/** Pillar point maxima. `Assumptions!C98:C100`. */
export interface EsgPillarMaxima {
  /** `Assumptions!C98` — 108. */
  environmental: number;
  /** `Assumptions!C99` — 100. */
  social: number;
  /** `Assumptions!C100` — 100. */
  governance: number;
}

/**
 * Pillar weights for the overall ESG score. `Assumptions!B98:B100`.
 * Must sum to 1 (`Assumptions!B101`).
 */
export interface EsgPillarWeights {
  environmental: number;
  social: number;
  governance: number;
}

/** ESG_Dashboard rating bands. `Assumptions!B62:B65`. */
export interface EsgRatingBands {
  /** `Assumptions!B62` — `RTG_EXC`, ★★★. */
  excellent: number;
  /** `Assumptions!B63` — `RTG_GOOD`, ★★. */
  good: number;
  /** `Assumptions!B64` — `RTG_ADEQ`, ★. */
  adequate: number;
  /** `Assumptions!B65` — `TGT_PILLAR`. Internal stretch target per pillar. */
  pillarTarget: number;
}

/** Entity / reporting defaults. `Assumptions!B10:B15` + BLOCK 7 (`B104:B112`). */
export interface EsgReportingDefaults {
  /** `Assumptions!B107` — `ENT_NZ`. SBTi CNZS 2.0 net-zero target year. E_Scorecard C9. */
  sbtiTargetYear: number;
  /** Numeric baseline year implied by `Assumptions!B106`. */
  baselineYear: number;
  /** `Assumptions!B106` — `ENT_BASE`. Verbatim baseline-year label. */
  baselineYearLabel: string;
  /** `Assumptions!B105` — `ENT_FY`. Verbatim reporting-period label. */
  reportingPeriodLabel: string;
  /** `Assumptions!B10` — `SECTOR`. Verbatim sector string written into the workbook. */
  sectorVariant: string;
  /** `Assumptions!B11` — `STD_PRIMARY`. */
  primaryStandard: string;
  /** `Assumptions!B12` — `MAT_BASIS`. */
  materialityBasis: string;
  /** `Assumptions!B13` — `CCY`. */
  currency: string;
  /** `Assumptions!B15` — `TAX_MODE`. */
  carbonTaxDisplay: string;
  /** `Assumptions!B108` — `ENT_BBEE`. Which B-BBEE code the bridge scores against. */
  bbbeeSectorCode: string;
}

/**
 * B-BBEE element weights used by the `B_BBEE_ESG` bridge sheet.
 * `Assumptions!B68:B72` (BLOCK 3 — Generic Codes, Statement 000).
 *
 * These are the one block that genuinely differs between B-BBEE sector codes
 * (Transport, AgriBEE, ICT, FSC …). The authoritative per-sector B-BBEE
 * scorecards live in `apps/web/Toolkit/src/lib/sectors/`; the values here are
 * only what the ESG bridge sheet uses.
 */
export interface EsgBbbeeElementWeights {
  /** `Assumptions!B68` — `BB_OWN`, Statement 100. */
  ownership: number;
  /** `Assumptions!B69` — `BB_MC`, Statement 200. */
  managementControl: number;
  /** `Assumptions!B70` — `BB_SD`, Statement 300. */
  skillsDevelopment: number;
  /** `Assumptions!B71` — `BB_ESD`, Statement 400. */
  enterpriseAndSupplierDevelopment: number;
  /** `Assumptions!B72` — `BB_SED`, Statement 500. */
  socioEconomicDevelopment: number;
}

/** The variable payload of a sector config — everything a sector can retune. */
export interface EsgSectorValues {
  /** `Assumptions!B9` = `IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))`. Banding floor by stance. */
  stanceFloor: Record<EsgStanceKey, number>;
  emissionFactors: EsgEmissionFactors;
  thresholds: EsgThresholds;
  carbonTax: EsgCarbonTaxParams;
  pillarMax: EsgPillarMaxima;
  pillarWeights: EsgPillarWeights;
  ratingBands: EsgRatingBands;
  reporting: EsgReportingDefaults;
  bbbeeElementWeights: EsgBbbeeElementWeights;
  /**
   * Sector benchmarks — free-form, because each sector benchmarks different
   * things (kWh/m² for warehousing, L/100km for freight, tCO₂e/TB for ICT).
   * Empty unless a sourced benchmark exists. Never populate with a guess.
   */
  benchmarks: Record<string, number>;
  /** Default site/depot row labels seeded into the monthly grids. Client data, not sector data. */
  defaultSites: readonly string[];
  /** Default month column headers seeded into the monthly grids. */
  defaultMonths: readonly string[];
}

/**
 * How much of this config is actually calibrated for the sector.
 *
 * - `workbook-verified` — at least some values are traced to a real, filled
 *   workbook for this sector.
 * - `inherited` — the config is the shared base end to end. Scores computed
 *   with it are *generic-SA* scores, not sector scores. Every such sector needs
 *   a subject-matter review before it can be called sector-specific.
 */
export type EsgSectorCalibration = "workbook-verified" | "inherited";

export interface EsgSectorConfig extends EsgSectorValues {
  id: EsgSectorId;
  /** Human label for UI. */
  label: string;
  /**
   * The EXACT string the ESG cover screen stores for this sector
   * (`COVER_FIELDS.sector` option / `Assumptions!B8` DV list entry). Lookup must
   * accept it, because that is what is persisted in the workbook.
   */
  coverLabel: string;
  calibration: EsgSectorCalibration;
  /**
   * Dotted leaf paths taken verbatim from the shared base — i.e. NOT
   * sector-specific. `"thresholds.wasteDiversion"`, `"emissionFactors.lpg"`, …
   */
  inheritedPaths: readonly string[];
  /** Dotted leaf paths this sector overrides with its own sourced value. */
  sectorSpecificPaths: readonly string[];
  /** Why this sector looks the way it does, and what is still outstanding. */
  notes: string;
}

/** Recursive partial that stops at arrays (an array override replaces wholesale). */
export type EsgDeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: EsgDeepPartial<T[K]> }
    : T;

export type EsgSectorOverrides = EsgDeepPartial<EsgSectorValues>;

export interface EsgSectorSpec {
  id: EsgSectorId;
  label: string;
  coverLabel: string;
  calibration: EsgSectorCalibration;
  notes: string;
  overrides?: EsgSectorOverrides;
}
