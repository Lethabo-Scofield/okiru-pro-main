import { describe, it, expect } from 'vitest';
import { buildManifest } from '../extraction/entityManifest.js';
import { calculateScorecard } from '../rules/calculationEngine.js';
import type { EntityValue } from '../rules/calculationEngine.js';

const TEST_INPUT = {
  total_revenue: 52_350_000,
  npat: 4_185_000,
  leviable_amount: 12_564_000,
  tmps: 31_410_000,
  black_ownership_percent: 0.51,
  black_women_ownership_percent: 0.30,
  shareholding_percent: 1.0,
  share_value: 8_500_000,
};

function buildEntityValues(input: Record<string, number>): Map<string, EntityValue> {
  const values = new Map<string, EntityValue>();
  for (const [key, value] of Object.entries(input)) {
    values.set(key, {
      entityId: key,
      value,
      source: 'manual',
      confidence: 1.0,
    });
  }
  return values;
}

function buildCrossPillarValues(input: Record<string, number>): Map<string, number> {
  const values = new Map<string, number>();
  values.set('npat', input.npat);
  values.set('tmps', input.tmps);
  values.set('leviableAmount', input.leviable_amount);
  return values;
}

describe('B-BBEE Scoring Engine', () => {
  describe('Manifest Building', () => {
    it('RCOGP Generic manifest builds correctly', () => {
      const manifest = buildManifest('RCOGP', 'Generic');
      expect(manifest.sectorCode).toBe('RCOGP');
      expect(manifest.scorecardType).toBe('Generic');
    });

    it('RCOGP Generic has 120 max points', () => {
      const manifest = buildManifest('RCOGP', 'Generic');
      const totalMax = manifest.pillarPacks.reduce((sum, p) => sum + p.maxPoints, 0);
      expect(totalMax).toBe(120);
    });

    it('RCOGP Generic has 33 criteria', () => {
      const manifest = buildManifest('RCOGP', 'Generic');
      const criteriaCount = manifest.pillarPacks.reduce((sum, p) => sum + p.criteria.length, 0);
      expect(criteriaCount).toBe(33);
    });
  });

  describe('Scorecard Calculation', () => {
    it('produces valid results', async () => {
      const entityValues = buildEntityValues(TEST_INPUT);
      const crossPillarValues = buildCrossPillarValues(TEST_INPUT);

      const result = await calculateScorecard({
        assessmentId: 'test-001',
        sectorCode: 'RCOGP',
        scorecardType: 'Generic',
        entityValues,
        crossPillarValues,
      });

      expect(result.totalPoints).toBeGreaterThan(0);
      expect(result.totalPoints).toBeLessThanOrEqual(120);
      expect(result.beeLevel).toBeGreaterThan(0);
    });
  });

  describe('All Sector Variants', () => {
    const sectors = [
      { code: 'RCOGP', type: 'Generic', maxPoints: 120 },
      { code: 'ICT', type: 'Generic', maxPoints: 133 },
      { code: 'FSC', type: 'Generic', maxPoints: 117 },
      { code: 'AGRI', type: 'Generic', maxPoints: 125 },
      { code: 'RCOGP', type: 'QSE', maxPoints: 124 },
      { code: 'ICT', type: 'QSE', maxPoints: 124 },
    ];

    for (const sector of sectors) {
      it(`${sector.code} ${sector.type} has ${sector.maxPoints} max points`, () => {
        const manifest = buildManifest(sector.code, sector.type);
        const totalMax = manifest.pillarPacks.reduce((sum, p) => sum + p.maxPoints, 0);
        expect(totalMax).toBe(sector.maxPoints);
      });
    }
  });
});
