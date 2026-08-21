import { describe, expect, it } from "vitest";
import * as cfg from "../consumer-goods";
import { ESG_SECTOR_CONSUMER_GOODS } from "../sectors/consumer-goods";

/**
 * The back-compat surface. Calculators import these flat names directly:
 *   environmental.ts, social.ts, governance.ts, carbonTax.ts, netZero.ts, shared.ts
 * Breaking a name here breaks scoring, so the list is asserted explicitly.
 */
const REQUIRED_LEGACY_EXPORTS = [
  "STANCE_FLOOR",
  "STANCE_FLOOR_BY_LABEL",
  "stanceFloorFromWorkbook",
  "EF_DIESEL_SCOPE1",
  "EF_BUSINESS_CARS",
  "EF_LPG",
  "EF_ELECTRICITY_SCOPE2",
  "THR_WASTE",
  "THR_WASTE_X",
  "THR_GHG_YOY",
  "THR_BLACK_EE",
  "THR_PWD",
  "THR_TRAINING_HOURS",
  "THR_LEVY_SPEND",
  "THR_LTIFR",
  "THR_CSI_INITIATIVES",
  "CARBON_TAX_RATE_TIER1",
  "CARBON_TAX_RATE_TIER2",
  "CARBON_TAX_ALLOWANCE",
  "CARBON_ANNUALISE_FACTOR",
  "SBTI_TARGET_YEAR",
  "PILLAR_MAX_ENVIRONMENTAL",
  "PILLAR_MAX_SOCIAL",
  "PILLAR_MAX_GOVERNANCE",
  "ESG_DEFAULT_DEPOTS",
  "ESG_DEFAULT_MONTHS",
] as const;

/** Verified dead by repo-wide grep; removed by the sector-registry refactor. */
const REMOVED_DEAD_EXPORTS = [
  "GWP_R404A",
  "GWP_R134A",
  "EF_SOLAR_OFFSET",
  "EF_WATER",
  "THR_RENEWABLE",
  "THR_WAGE_PREMIUM",
  "BASELINE_YEAR_DEFAULT",
  "REPORTING_PERIOD_DEFAULT",
  "SECTOR_VARIANT",
  "GHG_DEPOT_BENCHMARKS",
] as const;

describe("consumer-goods config", () => {
  it("keeps the legacy export surface the calculators import", () => {
    for (const name of REQUIRED_LEGACY_EXPORTS) {
      expect(cfg, `missing legacy export ${name}`).toHaveProperty(name);
      expect((cfg as Record<string, unknown>)[name]).toBeDefined();
    }
    const constants = Object.keys(cfg).filter((k) => k === k.toUpperCase());
    expect(constants.length).toBeGreaterThanOrEqual(20);
  });

  it("no longer exports the dead constants", () => {
    for (const name of REMOVED_DEAD_EXPORTS) {
      expect(cfg, `${name} should have been removed`).not.toHaveProperty(name);
    }
  });

  /**
   * Every value below is asserted against `docs/esg/extracted/Assumptions.json`
   * (workbook v1.7), cross-checked with ESG_FORMULA_LEDGER Part 2D. If the
   * workbook changes, this test is where it must be re-pinned.
   */
  it("matches the workbook Assumptions sheet exactly", () => {
    // BLOCK 0 — stance floor. Assumptions!B9 = IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))
    expect(cfg.STANCE_FLOOR.lean).toBe(0.3);
    expect(cfg.STANCE_FLOOR.standard).toBe(0.5);
    expect(cfg.STANCE_FLOOR.strict).toBe(0.7);
    expect(cfg.STANCE_FLOOR_BY_LABEL.Standard).toBe(0.5);
    expect(cfg.stanceFloorFromWorkbook("Strict")).toBe(0.7);
    expect(cfg.stanceFloorFromWorkbook("Standard", 0.3)).toBe(0.3);

    // BLOCK 1 — emission factors. Assumptions!B30:B33
    expect(cfg.EF_DIESEL_SCOPE1).toBe(2.68); // B30
    expect(cfg.EF_BUSINESS_CARS).toBe(2.31); // B31
    expect(cfg.EF_LPG).toBe(1.51); // B32
    expect(cfg.EF_ELECTRICITY_SCOPE2).toBe(0.82); // B33

    // BLOCK 1 — carbon tax. Assumptions!B37:B39, B112
    expect(cfg.CARBON_TAX_RATE_TIER1).toBe(236); // B37
    expect(cfg.CARBON_TAX_RATE_TIER2).toBe(640); // B38
    expect(cfg.CARBON_TAX_ALLOWANCE).toBe(0.6); // B39
    expect(cfg.CARBON_ANNUALISE_FACTOR).toBe(1.3333333333); // B112 = 12 / B111

    // BLOCK 2 — thresholds. Assumptions!B43:B56 (+ S_Scorecard!D23 literal)
    expect(cfg.THR_GHG_YOY).toBe(0.1); // B43
    expect(cfg.THR_WASTE).toBe(0.75); // B48
    expect(cfg.THR_WASTE_X).toBe(0.9); // B49
    expect(cfg.THR_BLACK_EE).toBe(0.6); // B50
    expect(cfg.THR_PWD).toBe(0.02); // B52
    expect(cfg.THR_TRAINING_HOURS).toBe(40); // B53
    expect(cfg.THR_LEVY_SPEND).toBe(0.8); // B54
    expect(cfg.THR_LTIFR).toBe(2); // B55
    expect(cfg.THR_CSI_INITIATIVES).toBe(6); // S_Scorecard!D23 literal

    // BLOCK 6 — pillar maxima. Assumptions!C98:C100
    expect(cfg.PILLAR_MAX_ENVIRONMENTAL).toBe(108);
    expect(cfg.PILLAR_MAX_SOCIAL).toBe(100);
    expect(cfg.PILLAR_MAX_GOVERNANCE).toBe(100);

    // BLOCK 7 — Assumptions!B107
    expect(cfg.SBTI_TARGET_YEAR).toBe(2050);

    // E_Data rows 14–18 / columns C–K
    expect(Array.from(cfg.ESG_DEFAULT_DEPOTS)).toEqual(["BLOEM", "CPT", "DBN", "ISANDO", "PE"]);
    expect(cfg.ESG_DEFAULT_MONTHS).toHaveLength(9); // Assumptions!B111 ENT_MOS = 9
    expect(cfg.ESG_DEFAULT_MONTHS[0]).toBe("Jul-25");
    expect(cfg.ESG_DEFAULT_MONTHS[8]).toBe("Mar-26");
  });

  it("carries the workbook values the flat surface no longer exposes", () => {
    const c = ESG_SECTOR_CONSUMER_GOODS;
    // The two factors the old flat constants got WRONG (EF_SOLAR_OFFSET 0.82,
    // EF_WATER 0.001). These are the workbook's actual values.
    expect(c.emissionFactors.solarOnsite).toBe(0.025); // Assumptions!B34
    expect(c.emissionFactors.waterTco2ePerKl).toBe(0.000344); // Assumptions!B35
    expect(c.emissionFactors.wasteToLandfillTco2ePerTonne).toBe(0.58); // B36

    expect(c.thresholds.renewableElectricityMin).toBe(0.2); // B44
    expect(c.thresholds.fuelToleranceMultiplier).toBe(1.05); // B45
    expect(c.thresholds.evFleetMin).toBe(0.05); // B46
    expect(c.thresholds.evFleet2030).toBe(0.2); // B47
    expect(c.thresholds.blackFemaleManagement).toBe(0.3); // B51
    expect(c.thresholds.csiSpendOfNpat).toBe(0.01); // B56
    expect(c.thresholds.localLabourProcurement).toBe(0.4); // B57
    expect(c.thresholds.supplierHsCompliance).toBe(0.8); // B58
    expect(c.thresholds.kingVApplyExplain).toBe(0.7); // B59
    expect(c.thresholds.publicInterestScore).toBe(500); // B60
    expect(c.thresholds.materialRisksMin).toBe(10); // B61

    expect(c.ratingBands.excellent).toBe(0.85); // B62
    expect(c.ratingBands.good).toBe(0.7); // B63
    expect(c.ratingBands.adequate).toBe(0.5); // B64
    expect(c.ratingBands.pillarTarget).toBe(0.75); // B65

    expect(c.pillarWeights.environmental).toBe(0.4); // B98
    expect(c.pillarWeights.social).toBe(0.3); // B99
    expect(c.pillarWeights.governance).toBe(0.3); // B100
    expect(
      c.pillarWeights.environmental + c.pillarWeights.social + c.pillarWeights.governance,
    ).toBeCloseTo(1, 10); // B101

    expect(c.bbbeeElementWeights.ownership).toBe(25); // B68
    expect(c.bbbeeElementWeights.managementControl).toBe(19); // B69
    expect(c.bbbeeElementWeights.skillsDevelopment).toBe(25); // B70
    expect(c.bbbeeElementWeights.enterpriseAndSupplierDevelopment).toBe(40); // B71
    expect(c.bbbeeElementWeights.socioEconomicDevelopment).toBe(5); // B72

    expect(c.carbonTax.dataMonths).toBe(9); // B111
    expect(c.reporting.sectorVariant).toBe("Transport / FMCG Distribution"); // B10
    expect(c.reporting.primaryStandard).toBe("King V + IFRS S1/S2"); // B11
    expect(c.reporting.materialityBasis).toBe("Single (financial — IFRS)"); // B12
    expect(c.reporting.currency).toBe("ZAR"); // B13
    expect(c.reporting.carbonTaxDisplay).toBe("Both (current + escalated)"); // B15
    expect(c.reporting.reportingPeriodLabel).toBe("FY 2025/2026  |  Jul 2025 – Jun 2026"); // B105
    expect(c.reporting.baselineYearLabel).toBe("FY 2025/26"); // B106
    expect(c.reporting.bbbeeSectorCode).toBe("Generic Code (Statement 000)"); // B108
  });

  it("projects the registry entry rather than holding its own copy", () => {
    expect(cfg.ESG_CONSUMER_GOODS_CONFIG).toBe(ESG_SECTOR_CONSUMER_GOODS);
    expect(cfg.THR_WASTE).toBe(ESG_SECTOR_CONSUMER_GOODS.thresholds.wasteDiversion);
    expect(cfg.PILLAR_MAX_ENVIRONMENTAL).toBe(ESG_SECTOR_CONSUMER_GOODS.pillarMax.environmental);
  });
});
