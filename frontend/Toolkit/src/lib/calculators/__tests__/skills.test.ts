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
        'general', 'bursaries', 'total', 'subMinimumMet',
        'targetOverall', 'targetBursaries', 'actualSpend',
        'actualBursarySpend', 'eapIndicators', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('empty/null programs', () => {
    it('should return zero for no training programs', () => {
      const result = calculateSkillsScore(makeSkillsData());

      expect(result.total).toBe(0);
      expect(result.general).toBe(0);
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
  });

  describe('score calculations', () => {
    it('should calculate general score proportionally — 50% spend = 50% score', () => {
      const leviableAmount = 10_000_000;
      const target = leviableAmount * 0.035;
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount,
        trainingPrograms: [makeTrainingProgram({ cost: target * 0.5 })],
      }));

      expect(result.general).toBeCloseTo(10, 0);
    });

    it('should calculate bursary score separately', () => {
      const leviableAmount = 10_000_000;
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount,
        trainingPrograms: [makeTrainingProgram({ category: 'bursary', cost: leviableAmount * 0.025 })],
      }));

      expect(result.bursaries).toBeCloseTo(5, 0);
    });

    it('should only count black training spend', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [makeTrainingProgram({ isBlack: false, cost: 1_000_000 })],
      }));

      expect(result.total).toBe(0);
      expect(result.actualSpend).toBe(0);
    });
  });

  describe('caps and thresholds', () => {
    it('should cap at maximum points (20 general + 5 bursary = 25)', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 100_000,
        trainingPrograms: [makeTrainingProgram({ cost: 100_000, category: 'bursary' })],
      }));

      expect(result.general).toBeLessThanOrEqual(20);
      expect(result.bursaries).toBeLessThanOrEqual(5);
      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('should handle zero leviable amount', () => {
      const result = calculateSkillsScore(makeSkillsData({
        leviableAmount: 0,
        trainingPrograms: [makeTrainingProgram()],
      }));

      expect(result.total).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });

  describe('EAP indicators', () => {
    it('should calculate absorption rate correctly', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [
          makeTrainingProgram({ id: '1', isEmployed: true, isBlack: true }),
          makeTrainingProgram({ id: '2', isEmployed: false, isBlack: true }),
          makeTrainingProgram({ id: '3', isEmployed: true, isBlack: true }),
        ],
      }));

      expect(result.eapIndicators.absorption.rate).toBeCloseTo(2 / 3, 5);
      expect(result.eapIndicators.absorption.count).toBe(2);
      expect(result.eapIndicators.absorption.total).toBe(3);
    });

    it('should track disabled spend separately', () => {
      const result = calculateSkillsScore(makeSkillsData({
        trainingPrograms: [makeTrainingProgram({ isDisabled: true, isBlack: true, cost: 5000 })],
      }));

      expect(result.rawStats.disabledSpend).toBe(5000);
    });
  });
});
