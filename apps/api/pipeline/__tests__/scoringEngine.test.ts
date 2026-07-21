import { describe, it, expect } from 'vitest';
import { buildManifest } from '../extraction/entityManifest.js';
import { calculateScorecard } from '../rules/calculationEngine.js';
import type {
  EmployeeInput,
  ShareholderInput,
  FinancialsInput,
} from '../rules/calculationEngine.js';
import { getSectorConfig } from '../sectorConfig.js';

/**
 * Max points are asserted against the GOVERNED sector config rather than
 * hardcoded numbers. The config is the ledger-checked source of truth
 * (sectorConfig.integrity.test.ts), so duplicating its totals here just creates a
 * second place to go stale — which is exactly what happened previously, when
 * these expectations drifted from the configs by up to 35 points.
 *
 * manifestConfigConsistency.test.ts separately guards that the manifest never
 * awards more points than the config declares.
 */

const FINANCIALS: FinancialsInput = {
  revenue: 52_350_000,
  npat: 4_185_000,
  leviableAmount: 12_564_000,
  tmps: 31_410_000,
  headcount: 4,
};

const SHAREHOLDERS: ShareholderInput[] = [
  { name: 'Black Holder A', blackOwnership: 51, blackWomenOwnership: 30, shares: 51, shareValue: 4_335_000, yearsHeld: 5 },
  { name: 'Other Holder', blackOwnership: 0, blackWomenOwnership: 0, shares: 49, shareValue: 4_165_000, yearsHeld: 5 },
];

const EMPLOYEES: EmployeeInput[] = [
  { name: 'Director A', race: 'African', gender: 'Female', designation: 'Board', isDisabled: false, isForeign: false },
  { name: 'Exec A', race: 'African', gender: 'Male', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { name: 'Snr Mgr', race: 'African', gender: 'Female', designation: 'Senior Management', isDisabled: false, isForeign: false },
  { name: 'Jnr Mgr', race: 'White', gender: 'Male', designation: 'Junior Management', isDisabled: false, isForeign: false },
];

describe('B-BBEE Scoring Engine', () => {
  describe('Manifest Building', () => {
    it('RCOGP Generic manifest builds correctly', async () => {
      const manifest = await buildManifest('RCOGP', 'Generic');
      expect(manifest.sectorCode).toBe('RCOGP');
      expect(manifest.scorecardType).toBe('Generic');
    });

    it('RCOGP Generic max points match the governed config', async () => {
      const manifest = await buildManifest('RCOGP', 'Generic');
      const totalMax = manifest.pillarPacks.reduce((sum, p) => sum + p.maxPoints, 0);
      expect(totalMax).toBe(getSectorConfig('RCOGP', 'Generic')!.totalMaxPoints);
      // Ground truth: Lake Trading scores 63.56 / 120 on this scorecard.
      expect(totalMax).toBe(120);
    });

    it('RCOGP Generic exposes a criterion set for every pillar', async () => {
      const manifest = await buildManifest('RCOGP', 'Generic');
      const criteriaCount = manifest.pillarPacks.reduce((sum, p) => sum + p.criteria.length, 0);
      // Asserted as a floor, not an exact count: splitting a criterion is a
      // legitimate config refinement and should not fail the suite.
      expect(criteriaCount).toBeGreaterThanOrEqual(33);
      // Every pillar carrying points must carry at least one criterion, or those
      // points are unreachable.
      for (const pack of manifest.pillarPacks.filter(p => p.maxPoints > 0)) {
        expect(pack.criteria.length, `${pack.pillarCode} has points but no criteria`).toBeGreaterThan(0);
      }
    });
  });

  describe('Scorecard Calculation', () => {
    it('produces valid results from structured inputs', async () => {
      const result = await calculateScorecard({
        assessmentId: 'test-001',
        sectorCode: 'RCOGP',
        scorecardType: 'Generic',
        // The engine scores from structured collections (see lakeTradingUCS
        // integration test); entityValues is not the scoring input path.
        entityValues: new Map(),
        crossPillarValues: new Map<string, number>([
          ['npat', FINANCIALS.npat],
          ['tmps', FINANCIALS.tmps],
          ['leviableAmount', FINANCIALS.leviableAmount],
          ['totalEmployees', FINANCIALS.headcount],
        ]),
        employees: EMPLOYEES,
        shareholders: SHAREHOLDERS,
        suppliers: [],
        contributions: [],
        financials: FINANCIALS,
        province: 'Gauteng',
      });

      expect(result.totalPoints).toBeGreaterThan(0);
      expect(result.totalPoints).toBeLessThanOrEqual(120);
      expect(result.beeLevel).toBeGreaterThan(0);
    });

    it('awards ownership points for 51% black ownership', async () => {
      const result = await calculateScorecard({
        assessmentId: 'test-002',
        sectorCode: 'RCOGP',
        scorecardType: 'Generic',
        entityValues: new Map(),
        crossPillarValues: new Map<string, number>([['npat', FINANCIALS.npat]]),
        employees: EMPLOYEES,
        shareholders: SHAREHOLDERS,
        suppliers: [],
        contributions: [],
        financials: FINANCIALS,
        province: 'Gauteng',
      });

      // A 51% black-owned entity must score on ownership; zero here would mean
      // the shareholder inputs are not reaching the ownership calculator.
      const ownership = result.pillars.find(p => p.pillarCode === 'ownership');
      expect(ownership, 'ownership pillar missing from result').toBeTruthy();
      expect(ownership!.points).toBeGreaterThan(0);
      expect(ownership!.points).toBeLessThanOrEqual(ownership!.maxPoints);
    });
  });

  describe('All Sector Variants', () => {
    const sectors: Array<[string, string]> = [
      ['RCOGP', 'Generic'],
      ['ICT', 'Generic'],
      ['FSC', 'Generic'],
      ['AGRI', 'Generic'],
      ['RCOGP', 'QSE'],
      ['ICT', 'QSE'],
    ];

    for (const [code, type] of sectors) {
      it(`${code} ${type} manifest max points match its governed config`, async () => {
        const config = getSectorConfig(code, type);
        expect(config, `${code} ${type} has no sector config`).toBeTruthy();

        const manifest = await buildManifest(code, type);
        const totalMax = manifest.pillarPacks.reduce((sum, p) => sum + p.maxPoints, 0);
        expect(totalMax).toBe(config!.totalMaxPoints);
      });
    }
  });
});
