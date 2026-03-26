import { describe, it, expect } from 'vitest';
import { calculateSkillsScore } from '../skills';
import type { SkillsResult } from '../skills';
import type { SkillsData, TrainingProgram } from '../../types';

const makeTrainingProgram = (overrides: Partial<TrainingProgram> = {}): TrainingProgram => ({
  id: '1',
  name: 'Test Program',
  category: 'learnership',
  cost: 50_000,
  isEmployed: true,
  isBlack: true,
  gender: 'Male',
  race: 'African',
  isDisabled: false,
  ...overrides,
});

const makeSkillsData = (overrides: Partial<SkillsData> = {}): SkillsData => ({
  id: '1',
  clientId: 'C-1',
  leviableAmount: 10_000_000,
  trainingPrograms: [],
  ...overrides,
});

describe('calculateSkillsScore', () => {
  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateSkillsScore(makeSkillsData());
      const keys: (keyof SkillsResult)[] = [
        'learningProgrammes', 'bursaries', 'disabledLearning',
        'learnerships', 'absorption', 'total', 'subMinimumMet',
        'categoryBreakdown', 'subLines', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });

    it('should return rawStats with all sub-fields', () => {
      const result = calculateSkillsScore(makeSkillsData());
      expect(result.rawStats).toHaveProperty('blackSpend');
      expect(result.rawStats).toHaveProperty('bursarySpend');
      expect(result.rawStats).toHaveProperty('disabledSpend');
      expect(result.rawStats).toHaveProperty('learnershipCount');
      expect(result.rawStats).toHaveProperty('absorbedCount');
      expect(result.rawStats).toHaveProperty('totalBlackLearners');
      expect(result.rawStats).toHaveProperty('absorptionRate');
      expect(result.rawStats).toHaveProperty('targetOverall');
      expect(result.rawStats).toHaveProperty('targetBursaries');
    });
  });

  describe('empty/null programs', () => {
    it('should return zero for no training programs', () => {
      const result = calculateSkillsScore(makeSkillsData());

      expect(result.total).toBe(0);
      expect(result.learningProgrammes).toBe(0);
      expect(result.bursaries).toBe(0);
      expect(result.subMinimumMet).toBe(false);
    });

    it('should handle null training programs gracefully', () => {
      const data = makeSkillsData();
      (data as any).trainingPrograms = null;
      const result = calculateSkillsScore(data);

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should return empty categoryBreakdown when no programs', () => {
      const result = calculateSkillsScore(makeSkillsData());
      expect(Array.isArray(result.categoryBreakdown)).toBe(true);
    });

    it('should return 5 subLines always', () => {
      const result = calculateSkillsScore(makeSkillsData());
      expect(result.subLines).toHaveLength(5);
    });
  });

  describe('score calculations', () => {
    it('should calculate learning programmes score proportionally — 50% spend = ~50% score', () => {
      const leviableAmount = 10_000_000;
      const TARGET_OVERALL = leviableAmount * 0.06;
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount,
        trainingPrograms: [makeTrainingProgram({ category: 'short_course', cost: TARGET_OVERALL * 0.5 })],
      }));

      expect(result.learningProgrammes).toBeCloseTo(3, 0);
    });

    it('should calculate bursary score from bursary category spend', () => {
      const leviableAmount = 10_000_000;
      const TARGET_BURSARIES = leviableAmount * 0.025;
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount,
        trainingPrograms: [makeTrainingProgram({ category: 'bursary', cost: TARGET_BURSARIES })],
      }));

      expect(result.bursaries).toBeCloseTo(4, 0);
    });

    it('should cap bursary score at 4 points', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 1_000_000,
        trainingPrograms: [makeTrainingProgram({ category: 'bursary', cost: 10_000_000 })],
      }));

      expect(result.bursaries).toBeLessThanOrEqual(4);
    });

    it('should only count black training spend in rawStats.blackSpend', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 10_000_000,
        trainingPrograms: [
          makeTrainingProgram({ id: '1', isBlack: false, cost: 1_000_000, category: 'short_course' }),
        ],
      }));

      expect(result.rawStats.blackSpend).toBe(0);
      expect(result.learningProgrammes).toBe(0);
    });

    it('should track rawStats.bursarySpend separately', () => {
      const leviableAmount = 10_000_000;
      const bursaryCost = 250_000;
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount,
        trainingPrograms: [makeTrainingProgram({ category: 'bursary', cost: bursaryCost })],
      }));

      expect(result.rawStats.bursarySpend).toBe(bursaryCost);
    });
  });

  describe('caps and thresholds', () => {
    it('should cap total at 25 points maximum', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 10_000,
        trainingPrograms: Array.from({ length: 20 }, (_, i) =>
          makeTrainingProgram({ id: String(i), cost: 5_000_000 })
        ),
      }));

      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('should return finite results for zero leviable amount', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 0,
        trainingPrograms: [makeTrainingProgram()],
      }));

      expect(Number.isFinite(result.total)).toBe(true);
      expect(result.learningProgrammes).toBe(0);
      expect(result.bursaries).toBe(0);
      expect(result.disabledLearning).toBe(0);
    });

    it('should mark subMinimumMet=true when total >= 10', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 10_000_000,
        trainingPrograms: Array.from({ length: 10 }, (_, i) =>
          makeTrainingProgram({ id: String(i), cost: 600_000 })
        ),
      }));

      if (result.total >= 10) {
        expect(result.subMinimumMet).toBe(true);
      } else {
        expect(result.subMinimumMet).toBe(false);
      }
    });
  });

  describe('absorption rate', () => {
    it('should calculate absorption rate correctly in rawStats', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [
          makeTrainingProgram({ id: '1', isEmployed: true, isBlack: true }),
          makeTrainingProgram({ id: '2', isEmployed: false, isBlack: true }),
          makeTrainingProgram({ id: '3', isEmployed: true, isBlack: true }),
        ],
      }));

      expect(result.rawStats.absorptionRate).toBeCloseTo(2 / 3, 5);
      expect(result.rawStats.absorbedCount).toBe(2);
      expect(result.rawStats.totalBlackLearners).toBe(3);
    });

    it('should return absorption rate of 0 with no black learners', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [makeTrainingProgram({ isBlack: false })],
      }));

      expect(result.rawStats.absorptionRate).toBe(0);
      expect(result.rawStats.totalBlackLearners).toBe(0);
    });
  });

  describe('disabled spend tracking', () => {
    it('should track disabled spend separately in rawStats', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [makeTrainingProgram({ isDisabled: true, isBlack: true, cost: 5000 })],
      }));

      expect(result.rawStats.disabledSpend).toBe(5000);
    });

    it('should not count non-black disabled spend', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [makeTrainingProgram({ isDisabled: true, isBlack: false, cost: 5000 })],
      }));

      expect(result.rawStats.disabledSpend).toBe(0);
    });
  });

  describe('target calculations', () => {
    it('should set rawStats.targetOverall to 6% of leviable amount', () => {
      const leviableAmount = 5_000_000;
      const result = calculateSkillsScore(makeSkillsData({ leviableAmount }));

      expect(result.rawStats.targetOverall).toBeCloseTo(leviableAmount * 0.06, 0);
    });

    it('should set rawStats.targetBursaries to 2.5% of leviable amount', () => {
      const leviableAmount = 5_000_000;
      const result = calculateSkillsScore(makeSkillsData({ leviableAmount }));

      expect(result.rawStats.targetBursaries).toBeCloseTo(leviableAmount * 0.025, 0);
    });
  });

  describe('custom config', () => {
    it('should respect custom overallTarget config', () => {
      const leviableAmount = 10_000_000;
      const config = { skills: { overallTarget: 0.03, bursaryTarget: 0.01, subMinThreshold: 10 } };
      const result = calculateSkillsScore(makeSkillsData({ leviableAmount }), config as any);

      expect(result.rawStats.targetOverall).toBeCloseTo(leviableAmount * 0.03, 0);
    });
  });
});
