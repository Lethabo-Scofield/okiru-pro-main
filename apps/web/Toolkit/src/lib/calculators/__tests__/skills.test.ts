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
      const TARGET_OVERALL = leviableAmount * 0.035;
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
          makeTrainingProgram({ id: '1', isAbsorbed: true, isBlack: true }),
          makeTrainingProgram({ id: '2', isAbsorbed: false, isBlack: true }),
          makeTrainingProgram({ id: '3', isAbsorbed: true, isBlack: true }),
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
    it('should set rawStats.targetOverall to 3.5% of leviable amount', () => {
      const leviableAmount = 5_000_000;
      const result = calculateSkillsScore(makeSkillsData({ leviableAmount }));

      expect(result.rawStats.targetOverall).toBeCloseTo(leviableAmount * 0.035, 0);
    });

    it('should set rawStats.targetBursaries to 2.5% of leviable amount', () => {
      const leviableAmount = 5_000_000;
      const result = calculateSkillsScore(makeSkillsData({ leviableAmount }));

      expect(result.rawStats.targetBursaries).toBeCloseTo(leviableAmount * 0.025, 0);
    });
  });

  describe('workbook aggregate inputs', () => {
    it('uses entity headcount for learnership target (not learner row count)', () => {
      const result = calculateSkillsScore(makeSkillsData({
        headcount: 100,
        trainingPrograms: [
          makeTrainingProgram({ category: 'learnership', cost: 10_000 }),
        ],
      }));
      // 1 learner vs 5% of 100 headcount = 5 target → 1/5 × 6 pts ≈ 1.2
      expect(result.learnerships).toBeCloseTo(1.2, 1);
    });

    it('caps training manager salary and overhead at 15% of programme spend each', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 1_000_000,
        trainingManagerSalary: 500_000,
        trainingOverheadCost: 500_000,
        trainingPrograms: [
          makeTrainingProgram({ cost: 100_000 }),
        ],
      }));
      // Programme 100k; each admin component capped at 15k → +30k recognised → 130k total
      expect(result.rawStats.blackSpend).toBeCloseTo(130_000, 0);
    });

    it('prefers group leviable amount for spend targets when set', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 1_000_000,
        groupLeviableAmount: 2_000_000,
        trainingPrograms: [],
      }));
      expect(result.rawStats.targetOverall).toBeCloseTo(2_000_000 * 0.035, 0);
    });
  });
});
