import { describe, it, expect } from 'vitest';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import type { EsdResult, SedResult } from '../esd-sed';
import type { ESDData, SEDData, Contribution } from '../../types';

const makeContribution = (overrides: Partial<Contribution> = {}): Contribution => ({
  id: '1',
  beneficiary: 'Test Beneficiary',
  type: 'grant',
  amount: 100_000,
  category: 'supplier_development',
  ...overrides,
});

const makeEsdData = (overrides: Partial<ESDData> = {}): ESDData => ({
  id: '1',
  clientId: 'C-1',
  contributions: [],
  ...overrides,
});

const makeSedData = (overrides: Partial<SEDData> = {}): SEDData => ({
  id: '1',
  clientId: 'C-1',
  contributions: [],
  ...overrides,
});

describe('calculateEsdScore', () => {
  const NPAT = 10_000_000;

  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateEsdScore(makeEsdData(), NPAT);
      const keys: (keyof EsdResult)[] = [
        'supplierDev', 'enterpriseDev', 'total', 'subMinimumMet',
        'sdSpend', 'edSpend', 'sdTarget', 'edTarget',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('empty/null contributions', () => {
    it('should return zero for no contributions', () => {
      const result = calculateEsdScore(makeEsdData(), NPAT);

      expect(result.total).toBe(0);
      expect(result.supplierDev).toBe(0);
      expect(result.enterpriseDev).toBe(0);
    });

    it('should handle null contributions gracefully', () => {
      const data = makeEsdData();
      (data as any).contributions = null;
      const result = calculateEsdScore(data, NPAT);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should handle zero NPAT without crashing', () => {
      const result = calculateEsdScore(makeEsdData({
        contributions: [makeContribution()],
      }), 0);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('category separation', () => {
    it('should separate supplier dev and enterprise dev scores', () => {
      const result = calculateEsdScore(makeEsdData({
        contributions: [
          makeContribution({ id: '1', category: 'supplier_development', amount: 200_000 }),
          makeContribution({ id: '2', category: 'enterprise_development', amount: 100_000 }),
        ],
      }), NPAT);

      expect(result.supplierDev).toBeGreaterThan(0);
      expect(result.enterpriseDev).toBeGreaterThan(0);
      expect(result.sdSpend).toBe(200_000);
      expect(result.edSpend).toBe(100_000);
    });
  });

  describe('benefit factors', () => {
    it('should apply higher factor for grants than interest-free loans', () => {
      const grantResult = calculateEsdScore(makeEsdData({
        contributions: [makeContribution({ type: 'grant', amount: 100_000 })],
      }), NPAT);

      const loanResult = calculateEsdScore(makeEsdData({
        contributions: [makeContribution({ type: 'interest_free_loan', amount: 100_000 })],
      }), NPAT);

      expect(grantResult.sdSpend).toBeGreaterThan(loanResult.sdSpend);
    });

    it('should handle config with missing benefitFactors gracefully', () => {
      const config = { esd: { supplierDevMax: 10, enterpriseDevMax: 5 } };
      const result = calculateEsdScore(makeEsdData({
        contributions: [makeContribution()],
      }), NPAT, config as any);

      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should handle config with empty benefitFactors array', () => {
      const config = { benefitFactors: [] };
      const result = calculateEsdScore(makeEsdData({
        contributions: [makeContribution()],
      }), NPAT, config as any);

      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('caps', () => {
    it('should cap supplier dev at 10 and enterprise dev at 5', () => {
      const result = calculateEsdScore(makeEsdData({
        contributions: [
          makeContribution({ amount: 50_000_000, category: 'supplier_development' }),
          makeContribution({ id: '2', amount: 50_000_000, category: 'enterprise_development' }),
        ],
      }), NPAT);

      expect(result.supplierDev).toBeLessThanOrEqual(10);
      expect(result.enterpriseDev).toBeLessThanOrEqual(5);
      expect(result.total).toBeLessThanOrEqual(15);
    });
  });
});

describe('calculateSedScore', () => {
  const NPAT = 10_000_000;

  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateSedScore(makeSedData(), NPAT);
      const keys: (keyof SedResult)[] = [
        'total', 'subMinimumMet', 'actualSpend', 'target', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('empty/null contributions', () => {
    it('should return zero for no contributions', () => {
      const result = calculateSedScore(makeSedData(), NPAT);

      expect(result.total).toBe(0);
      expect(result.actualSpend).toBe(0);
    });

    it('should handle null contributions gracefully', () => {
      const data = makeSedData();
      (data as any).contributions = null;
      const result = calculateSedScore(data, NPAT);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should handle zero NPAT', () => {
      const result = calculateSedScore(makeSedData({
        contributions: [makeContribution({ category: 'socio_economic' })],
      }), 0);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('score calculations', () => {
    it('should score 5 points at 1% NPAT target', () => {
      const target = NPAT * 0.01;
      const result = calculateSedScore(makeSedData({
        contributions: [makeContribution({ amount: target, category: 'socio_economic' })],
      }), NPAT);

      expect(result.total).toBeCloseTo(5, 0);
      expect(result.target).toBe(target);
    });

    it('should cap at 5 points maximum', () => {
      const result = calculateSedScore(makeSedData({
        contributions: [makeContribution({ amount: 5_000_000, category: 'socio_economic' })],
      }), NPAT);

      expect(result.total).toBeLessThanOrEqual(5);
    });

    it('should sum multiple contributions', () => {
      const result = calculateSedScore(makeSedData({
        contributions: [
          makeContribution({ id: '1', amount: 50_000 }),
          makeContribution({ id: '2', amount: 30_000 }),
        ],
      }), NPAT);

      expect(result.actualSpend).toBe(80_000);
    });
  });
});
