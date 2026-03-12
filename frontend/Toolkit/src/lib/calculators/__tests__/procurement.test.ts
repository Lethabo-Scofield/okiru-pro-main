import { describe, it, expect } from 'vitest';
import { calculateProcurementScore } from '../procurement';
import type { ProcurementResult } from '../procurement';
import type { ProcurementData, Supplier } from '../../types';

const makeSupplier = (overrides: Partial<Supplier> = {}): Supplier => ({
  id: '1',
  name: 'Test Supplier',
  beeLevel: 1,
  blackOwnership: 0.75,
  blackWomenOwnership: 0.35,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: 'generic',
  spend: 1_000_000,
  ...overrides,
});

const makeProcurementData = (overrides: Partial<ProcurementData> = {}): ProcurementData => ({
  id: '1',
  clientId: 'C-1',
  tmps: 10_000_000,
  suppliers: [],
  ...overrides,
});

describe('calculateProcurementScore', () => {
  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateProcurementScore(makeProcurementData());
      const keys: (keyof ProcurementResult)[] = [
        'base', 'designatedGroup', 'total', 'subMinimumMet',
        'recognisedSpend', 'target', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('empty/null suppliers', () => {
    it('should return zero for no suppliers', () => {
      const result = calculateProcurementScore(makeProcurementData());

      expect(result.total).toBe(0);
      expect(result.base).toBe(0);
      expect(result.designatedGroup).toBe(0);
    });

    it('should handle null suppliers gracefully', () => {
      const data = makeProcurementData();
      (data as any).suppliers = null;
      const result = calculateProcurementScore(data);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should handle zero TMPS', () => {
      const result = calculateProcurementScore(makeProcurementData({
        tmps: 0,
        suppliers: [makeSupplier()],
      }));

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('recognition table', () => {
    it('should apply Level 1 multiplier (1.35x)', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ beeLevel: 1, spend: 1_000_000 })],
      }));

      expect(result.recognisedSpend).toBe(1_350_000);
    });

    it('should apply Level 8 multiplier (0.10x)', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ beeLevel: 8, spend: 1_000_000 })],
      }));

      expect(result.recognisedSpend).toBe(100_000);
    });

    it('should return higher recognised spend for better BEE levels', () => {
      const level1 = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ beeLevel: 1, spend: 1_000_000 })],
      }));
      const level8 = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ beeLevel: 8, spend: 1_000_000 })],
      }));

      expect(level1.recognisedSpend).toBeGreaterThan(level8.recognisedSpend);
    });

    it('should handle unknown BEE level (0x multiplier)', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ beeLevel: 0, spend: 1_000_000 })],
      }));

      expect(result.recognisedSpend).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('designated group bonus', () => {
    it('should award bonus for 51%+ black-owned suppliers', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ blackOwnership: 0.60, spend: 5_000_000 })],
      }));

      expect(result.designatedGroup).toBeGreaterThan(0);
    });

    it('should not award bonus for < 51% black-owned', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [makeSupplier({ blackOwnership: 0.40, spend: 5_000_000 })],
      }));

      expect(result.designatedGroup).toBe(0);
    });
  });

  describe('caps', () => {
    it('should cap base score at 25', () => {
      const result = calculateProcurementScore(makeProcurementData({
        tmps: 1_000_000,
        suppliers: [makeSupplier({ beeLevel: 1, spend: 10_000_000 })],
      }));

      expect(result.base).toBeLessThanOrEqual(25);
    });
  });

  describe('spend tracking', () => {
    it('should track spend by enterprise type', () => {
      const result = calculateProcurementScore(makeProcurementData({
        suppliers: [
          makeSupplier({ id: '1', enterpriseType: 'eme', spend: 100_000 }),
          makeSupplier({ id: '2', enterpriseType: 'qse', spend: 200_000 }),
          makeSupplier({ id: '3', enterpriseType: 'generic', spend: 300_000 }),
        ],
      }));

      expect(result.rawStats.spendEME).toBe(100_000);
      expect(result.rawStats.spendQSE).toBe(200_000);
    });
  });
});
