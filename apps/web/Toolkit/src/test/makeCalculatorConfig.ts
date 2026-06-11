import type { CalculatorConfig } from '../../../shared/schema';

/**
 * Builds a complete, valid RCOGP Generic CalculatorConfig for tests.
 *
 * Several pillar calculators (procurement, management) THROW when handed a
 * null/undefined config — they have no internal defaults. Others (skills, esd,
 * sed) carry RCOGP Generic defaults and treat config as optional. This factory
 * mirrors the RCOGP Generic Codes so a single source drives end-to-end
 * scorecard calculation in tests, and documents the "valid baseline" shape.
 *
 * Pass `overrides` to tweak individual fields for a specific assertion.
 */
export function makeCalculatorConfig(
  overrides: Partial<CalculatorConfig> = {},
): CalculatorConfig {
  const base: CalculatorConfig = {
    totalMaxPoints: 120,
    ownership: {
      votingRightsMax: 6,
      womenBonusMax: 0,
      economicInterestMax: 9,
      netValueMax: 8,
      targetEconomicInterest: 0.25,
      subMinNetValue: 0.4,
    },
    management: {
      boardBlackTarget: 0.5,
      boardBlackPoints: 4,
      boardWomenTarget: 0.25,
      boardWomenPoints: 2,
      execBlackTarget: 0.5,
      execBlackPoints: 4,
      execWomenTarget: 0.25,
      execWomenPoints: 2,
    },
    skills: {
      generalMax: 6,
      bursaryMax: 4,
      overallTarget: 0.035,
      bursaryTarget: 0.025,
      subMinThreshold: 40,
    },
    procurement: {
      baseMax: 27,
      bonusMax: 2,
      tmpsTarget: 0.8,
      subMinThreshold: 40,
      blackOwnedThreshold: 0.51,
      blackWomenThreshold: 0.3,
      allSuppliersTarget: 0.8,
      allSuppliersMaxPts: 5,
      qseTarget: 0.15,
      qseMaxPts: 3,
      emeTarget: 0.15,
      emeMaxPts: 4,
      bo51Target: 0.5,
      bo51MaxPts: 11,
      bwo30Target: 0.12,
      bwo30MaxPts: 4,
      dgTarget: 0.02,
      dgMaxPts: 2,
    },
    esd: {
      supplierDevMax: 10,
      enterpriseDevMax: 5,
      supplierDevTarget: 0.02,
      enterpriseDevTarget: 0.01,
    },
    sed: {
      maxPoints: 5,
      npatTarget: 0.01,
    },
    discounting: {
      dropLevels: 1,
      maxDropLevel: 8,
    },
    recognitionTable: [
      { level: 1, multiplier: 1.35 },
      { level: 2, multiplier: 1.25 },
      { level: 3, multiplier: 1.1 },
      { level: 4, multiplier: 1.0 },
      { level: 5, multiplier: 0.8 },
      { level: 6, multiplier: 0.6 },
      { level: 7, multiplier: 0.5 },
      { level: 8, multiplier: 0.1 },
      { level: 0, multiplier: 0 },
    ],
    pillarConfigs: {
      ownership: { maxPoints: 25, subMinimumPercent: 40 },
      managementControl: { maxPoints: 19, subMinimumPercent: 0 },
      employmentEquity: { maxPoints: 0 },
      skillsDevelopment: { maxPoints: 25, subMinimumPercent: 40 },
      preferentialProcurement: { maxPoints: 29, subMinimumPercent: 40 },
      supplierDevelopment: { maxPoints: 10, subMinimumPercent: 40 },
      enterpriseDevelopment: { maxPoints: 7, subMinimumPercent: 40 },
      socioEconomicDevelopment: { maxPoints: 5 },
      yesInitiative: { maxPoints: 0 },
    },
    benefitFactors: [],
    industryNorms: [],
  };

  return { ...base, ...overrides };
}
