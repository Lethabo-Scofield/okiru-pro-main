import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import type { OwnershipResult } from '../ownership';
import type { OwnershipData, Shareholder } from '../../types';

const makeShareholder = (overrides: Partial<Shareholder> = {}): Shareholder => ({
  id: '1',
  name: 'Test Shareholder',
  ownershipType: 'shareholder',
  blackOwnership: 0.5,
  blackWomenOwnership: 0.25,
  shares: 100,
  shareValue: 1_000_000,
  ...overrides,
});

const makeOwnershipData = (overrides: Partial<OwnershipData> = {}): OwnershipData => ({
  id: '1',
  clientId: 'C-1',
  shareholders: [makeShareholder()],
  companyValue: 10_000_000,
  outstandingDebt: 1_000_000,
  yearsHeld: 5,
  ...overrides,
});

function assertAllFinite(result: OwnershipResult) {
  expect(Number.isFinite(result.total)).toBe(true);
  expect(Number.isFinite(result.votingRightsBlack)).toBe(true);
  expect(Number.isFinite(result.economicInterestBlack)).toBe(true);
  expect(Number.isFinite(result.netValue)).toBe(true);
  expect(Number.isFinite(result.newEntrants)).toBe(true);
}

describe('calculateOwnershipScore', () => {
  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateOwnershipScore(makeOwnershipData());

      expect(result).toHaveProperty('votingRightsBlack');
      expect(result).toHaveProperty('votingRightsBWO');
      expect(result).toHaveProperty('economicInterestBlack');
      expect(result).toHaveProperty('economicInterestBWO');
      expect(result).toHaveProperty('designatedGroups');
      expect(result).toHaveProperty('newEntrants');
      expect(result).toHaveProperty('netValue');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('subMinimumMet');
      expect(result).toHaveProperty('fullOwnershipAwarded');
      expect(result).toHaveProperty('subLines');
      expect(result).toHaveProperty('rawStats');
    });

    it('should return rawStats with all sub-fields', () => {
      const result = calculateOwnershipScore(makeOwnershipData());
      expect(result.rawStats).toHaveProperty('blackVotingPercentage');
      expect(result.rawStats).toHaveProperty('blackWomenVotingPercentage');
      expect(result.rawStats).toHaveProperty('economicInterestPercentage');
      expect(result.rawStats).toHaveProperty('economicInterestBWOPercentage');
      expect(result.rawStats).toHaveProperty('designatedGroupPercentage');
      expect(result.rawStats).toHaveProperty('netValuePercentage');
    });

    it('should always return 7 subLines', () => {
      const result = calculateOwnershipScore(makeOwnershipData());
      expect(result.subLines).toHaveLength(7);
    });
  });

  describe('standard scoring', () => {
    it('should return valid finite scores for a standard case', () => {
      const result = calculateOwnershipScore(makeOwnershipData());

      assertAllFinite(result);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('should award full ownership when black voting >= 25%', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [
          makeShareholder({ blackOwnership: 1.0, blackWomenOwnership: 0.5, shares: 100, shareValue: 5_000_000 }),
        ],
      }));

      expect(result.fullOwnershipAwarded).toBe(true);
      expect(result.votingRightsBlack).toBe(4);
      expect(result.economicInterestBlack).toBe(4);
      expect(result.netValue).toBe(8);
    });

    it('should calculate proportional voting rights for 10% black ownership', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder({ blackOwnership: 0.1, blackWomenOwnership: 0, shares: 100 })],
      }));

      expect(result.fullOwnershipAwarded).toBe(false);
      expect(result.votingRightsBlack).toBeCloseTo(1.6, 1);
    });

    it('should cap total at 25 points maximum', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [
          makeShareholder({
            blackOwnership: 1.0, blackWomenOwnership: 1.0,
            shares: 100, shareValue: 10_000_000,
            blackNewEntrant: true,
          }),
        ],
      }));

      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('should set fullOwnershipAwarded=false when black voting < 25%', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder({ blackOwnership: 0.2, shares: 100 })],
      }));

      expect(result.fullOwnershipAwarded).toBe(false);
    });
  });

  describe('new entrants', () => {
    it('should award 2 points when new entrant flag is true', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [
          makeShareholder({ blackOwnership: 1.0, blackNewEntrant: true }),
        ],
      }));

      expect(result.newEntrants).toBe(2);
    });

    it('should award 0 points when new entrant flag is false', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder({ blackNewEntrant: false })],
      }));

      expect(result.newEntrants).toBe(0);
    });

    it('should award 0 points when new entrant flag is undefined', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder()],
      }));

      expect(result.newEntrants).toBe(0);
    });
  });

  describe('graduation factor', () => {
    it('should produce finite scores with yearsHeld = 0', () => {
      const result = calculateOwnershipScore(makeOwnershipData({ yearsHeld: 0 }));
      assertAllFinite(result);
    });

    it('should produce finite scores with yearsHeld = 10', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder({ blackOwnership: 0.15 })],
        yearsHeld: 10,
      }));

      assertAllFinite(result);
      expect(result.netValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty shareholders array', () => {
      const result = calculateOwnershipScore(makeOwnershipData({ shareholders: [] }));

      expect(result.total).toBe(0);
      expect(result.votingRightsBlack).toBe(0);
      expect(result.economicInterestBlack).toBe(0);
      expect(result.netValue).toBe(0);
      expect(result.subMinimumMet).toBe(false);
      assertAllFinite(result);
    });

    it('should handle null shareholders gracefully', () => {
      const data = makeOwnershipData();
      (data as any).shareholders = null;
      const result = calculateOwnershipScore(data);

      expect(result.total).toBe(0);
      assertAllFinite(result);
    });

    it('should handle zero company value', () => {
      const result = calculateOwnershipScore(makeOwnershipData({ companyValue: 0 }));
      assertAllFinite(result);
    });

    it('should handle zero shares across all shareholders', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [
          makeShareholder({ shares: 0 }),
          makeShareholder({ id: '2', shares: 0 }),
        ],
      }));

      assertAllFinite(result);
    });

    it('should return zero votingRightsBWO when no women shareholders', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [makeShareholder({ blackOwnership: 0.5, blackWomenOwnership: 0 })],
      }));

      expect(result.votingRightsBWO).toBe(0);
    });
  });

  describe('women ownership', () => {
    it('should award BWO points proportional to black women ownership', () => {
      const result = calculateOwnershipScore(makeOwnershipData({
        shareholders: [
          makeShareholder({ blackOwnership: 1.0, blackWomenOwnership: 1.0, shares: 100 }),
        ],
      }));

      expect(result.votingRightsBWO).toBeGreaterThan(0);
    });
  });

  describe('custom config', () => {
    it('should respect custom config overrides', () => {
      const config = {
        ownership: {
          votingRightsMax: 10,
          economicInterestMax: 10,
          netValueMax: 10,
          womenBonusMax: 5,
          targetEconomicInterest: 0.30,
          subMinNetValue: 5.0,
        },
      };

      const result = calculateOwnershipScore(makeOwnershipData(), config as any);
      assertAllFinite(result);
    });
  });
});
