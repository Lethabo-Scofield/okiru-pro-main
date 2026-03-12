import { describe, it, expect } from 'vitest';
import { calculateManagementScore } from '../management';
import type { ManagementResult } from '../management';
import type { ManagementData, Employee } from '../../types';

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: '1',
  name: 'Test Employee',
  gender: 'Male',
  race: 'African',
  designation: 'Senior',
  isDisabled: false,
  ...overrides,
});

const makeManagementData = (overrides: Partial<ManagementData> = {}): ManagementData => ({
  id: '1',
  clientId: 'C-1',
  employees: [],
  ...overrides,
});

function assertFiniteResult(result: ManagementResult) {
  expect(Number.isFinite(result.total)).toBe(true);
  expect(Number.isFinite(result.boardTotal)).toBe(true);
  expect(Number.isFinite(result.execTotal)).toBe(true);
  expect(Number.isFinite(result.senior)).toBe(true);
  expect(Number.isFinite(result.middle)).toBe(true);
  expect(Number.isFinite(result.junior)).toBe(true);
}

describe('calculateManagementScore', () => {
  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateManagementScore(makeManagementData());
      const keys: (keyof ManagementResult)[] = [
        'boardExecBlack', 'boardNonExec', 'boardBWO', 'boardTotal',
        'otherExecBlack', 'otherExecBWO', 'execTotal',
        'senior', 'middle', 'junior', 'disabled', 'adjustedRecognition',
        'total', 'subMinimumMet', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('empty/null employees', () => {
    it('should return zero for empty employees', () => {
      const result = calculateManagementScore(makeManagementData());

      expect(result.total).toBe(0);
      expect(result.boardTotal).toBe(0);
      expect(result.execTotal).toBe(0);
      expect(result.senior).toBe(0);
      expect(result.middle).toBe(0);
      expect(result.junior).toBe(0);
    });

    it('should handle null employees gracefully', () => {
      const data = makeManagementData();
      (data as any).employees = null;
      const result = calculateManagementScore(data);

      expect(result.total).toBe(0);
      assertFiniteResult(result);
    });
  });

  describe('board scoring', () => {
    it('should calculate board scores with 50% black representation', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'African', gender: 'Female' }),
          makeEmployee({ id: '2', designation: 'Board', race: 'White', gender: 'Male' }),
        ],
      }));

      expect(result.boardTotal).toBeGreaterThan(0);
      expect(result.rawStats.boardBlackVotingPercentage).toBe(0.5);
    });

    it('should return zero board scores for all-white board', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'White' }),
          makeEmployee({ id: '2', designation: 'Board', race: 'White' }),
        ],
      }));

      expect(result.boardTotal).toBe(0);
      expect(result.rawStats.boardBlackVotingPercentage).toBe(0);
    });
  });

  describe('executive scoring', () => {
    it('should combine all executive designations', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Executive', race: 'African' }),
          makeEmployee({ id: '2', designation: 'Executive Director', race: 'Indian' }),
          makeEmployee({ id: '3', designation: 'Other Executive Management', race: 'White' }),
        ],
      }));

      expect(result.execTotal).toBeGreaterThan(0);
      expect(result.rawStats.execBlackVotingPercentage).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('designation level scoring', () => {
    it('should score senior/middle/junior independently', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Senior', race: 'African' }),
          makeEmployee({ id: '2', designation: 'Senior', race: 'White' }),
          makeEmployee({ id: '3', designation: 'Middle', race: 'Coloured' }),
          makeEmployee({ id: '4', designation: 'Junior', race: 'Indian' }),
        ],
      }));

      expect(result.senior).toBeGreaterThan(0);
      expect(result.middle).toBeGreaterThan(0);
      expect(result.junior).toBeGreaterThan(0);
    });
  });

  describe('disability and gender', () => {
    it('should award disabled employee points', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Senior', race: 'African', isDisabled: true }),
          makeEmployee({ id: '2', designation: 'Senior', race: 'White', isDisabled: false }),
        ],
      }));

      expect(result.disabled).toBeGreaterThan(0);
    });

    it('should award adjusted recognition when female employees exist', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [makeEmployee({ id: '1', gender: 'Female' })],
      }));

      expect(result.adjustedRecognition).toBe(2);
    });

    it('should not award adjusted recognition for all-male workforce', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [makeEmployee({ id: '1', gender: 'Male' })],
      }));

      expect(result.adjustedRecognition).toBe(0);
    });
  });

  describe('total cap', () => {
    it('should cap at 27 points', () => {
      const employees: Employee[] = Array.from({ length: 50 }, (_, i) =>
        makeEmployee({
          id: `emp-${i}`,
          designation: i < 10 ? 'Board' : i < 20 ? 'Executive' : i < 30 ? 'Senior' : i < 40 ? 'Middle' : 'Junior',
          race: 'African',
          gender: 'Female',
          isDisabled: i < 5,
        })
      );

      const result = calculateManagementScore(makeManagementData({ employees }));
      expect(result.total).toBeLessThanOrEqual(27);
    });
  });
});
