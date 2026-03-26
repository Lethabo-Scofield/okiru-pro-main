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

function assertAllFinite(result: ManagementResult) {
  expect(Number.isFinite(result.total)).toBe(true);
  expect(Number.isFinite(result.boardVotingBlack)).toBe(true);
  expect(Number.isFinite(result.boardVotingBWO)).toBe(true);
  expect(Number.isFinite(result.execDirectorsBlack)).toBe(true);
  expect(Number.isFinite(result.execDirectorsBWO)).toBe(true);
  expect(Number.isFinite(result.seniorBlack)).toBe(true);
  expect(Number.isFinite(result.middleBlack)).toBe(true);
  expect(Number.isFinite(result.juniorBlack)).toBe(true);
  expect(Number.isFinite(result.disabled)).toBe(true);
}

describe('calculateManagementScore', () => {
  describe('return type shape', () => {
    it('should return all required fields', () => {
      const result = calculateManagementScore(makeManagementData());
      const keys: (keyof ManagementResult)[] = [
        'boardVotingBlack', 'boardVotingBWO',
        'execDirectorsBlack', 'execDirectorsBWO',
        'otherExecBlack', 'otherExecBWO',
        'seniorBlack', 'seniorBWO',
        'middleBlack', 'middleBWO',
        'juniorBlack', 'juniorBWO',
        'disabled', 'total', 'subMinimumMet', 'subLines', 'rawStats',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });

    it('should return rawStats with all sub-fields', () => {
      const result = calculateManagementScore(makeManagementData());
      expect(result.rawStats).toHaveProperty('boardBlackPct');
      expect(result.rawStats).toHaveProperty('boardBWOPct');
      expect(result.rawStats).toHaveProperty('execBlackPct');
      expect(result.rawStats).toHaveProperty('execBWOPct');
      expect(result.rawStats).toHaveProperty('seniorBlackPct');
      expect(result.rawStats).toHaveProperty('middleBlackPct');
      expect(result.rawStats).toHaveProperty('juniorBlackPct');
      expect(result.rawStats).toHaveProperty('disabledBlackPct');
    });

    it('should always return 13 subLines', () => {
      const result = calculateManagementScore(makeManagementData());
      expect(result.subLines).toHaveLength(13);
    });
  });

  describe('empty/null employees', () => {
    it('should return zero for empty employees', () => {
      const result = calculateManagementScore(makeManagementData());

      expect(result.total).toBe(0);
      expect(result.boardVotingBlack).toBe(0);
      expect(result.boardVotingBWO).toBe(0);
      expect(result.execDirectorsBlack).toBe(0);
      expect(result.execDirectorsBWO).toBe(0);
      expect(result.seniorBlack).toBe(0);
      expect(result.middleBlack).toBe(0);
      expect(result.juniorBlack).toBe(0);
    });

    it('should handle null employees gracefully', () => {
      const data = makeManagementData();
      (data as any).employees = null;
      const result = calculateManagementScore(data);

      expect(result.total).toBe(0);
      assertAllFinite(result);
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

      expect(result.boardVotingBlack).toBeGreaterThan(0);
      expect(result.rawStats.boardBlackPct).toBe(0.5);
    });

    it('should return zero board scores for all-white board', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'White' }),
          makeEmployee({ id: '2', designation: 'Board', race: 'White' }),
        ],
      }));

      expect(result.boardVotingBlack).toBe(0);
      expect(result.rawStats.boardBlackPct).toBe(0);
    });

    it('should award BWO points for black female board members', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'African', gender: 'Female' }),
          makeEmployee({ id: '2', designation: 'Board', race: 'African', gender: 'Female' }),
        ],
      }));

      expect(result.boardVotingBWO).toBeGreaterThan(0);
      expect(result.rawStats.boardBWOPct).toBe(1.0);
    });

    it('should return 0 BWO for all-male board', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'African', gender: 'Male' }),
        ],
      }));

      expect(result.boardVotingBWO).toBe(0);
      expect(result.rawStats.boardBWOPct).toBe(0);
    });
  });

  describe('executive scoring', () => {
    it('should count Executive and Executive Director designations together', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Executive', race: 'African' }),
          makeEmployee({ id: '2', designation: 'Executive Director', race: 'Indian' }),
          makeEmployee({ id: '3', designation: 'Executive', race: 'White' }),
        ],
      }));

      expect(result.execDirectorsBlack).toBeGreaterThan(0);
      expect(result.rawStats.execBlackPct).toBeCloseTo(2 / 3, 5);
    });

    it('should score other executive management separately', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Other Executive Management', race: 'African' }),
          makeEmployee({ id: '2', designation: 'Other Executive Management', race: 'African' }),
        ],
      }));

      expect(result.otherExecBlack).toBeGreaterThan(0);
      expect(result.rawStats.otherExecBlackPct).toBe(1.0);
    });

    it('should return 0 exec score for all-white executives', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Executive', race: 'White' }),
        ],
      }));

      expect(result.execDirectorsBlack).toBe(0);
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

      expect(result.seniorBlack).toBeGreaterThan(0);
      expect(result.middleBlack).toBeGreaterThan(0);
      expect(result.juniorBlack).toBeGreaterThan(0);
    });

    it('should return 0 for designation level with no black employees', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Senior', race: 'White' }),
          makeEmployee({ id: '2', designation: 'Senior', race: 'White' }),
        ],
      }));

      expect(result.seniorBlack).toBe(0);
      expect(result.rawStats.seniorBlackPct).toBe(0);
    });
  });

  describe('disability scoring', () => {
    it('should award disabled employee points', () => {
      const employees = [
        makeEmployee({ id: '1', designation: 'Senior', race: 'African', isDisabled: true }),
        ...Array.from({ length: 32 }, (_, i) =>
          makeEmployee({ id: `e${i}`, designation: 'Senior', race: 'African', isDisabled: false })
        ),
      ];
      const result = calculateManagementScore(makeManagementData({ employees }));

      expect(result.disabled).toBeGreaterThan(0);
    });

    it('should return 0 disabled points when no disabled employees', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [makeEmployee({ isDisabled: false })],
      }));

      expect(result.disabled).toBe(0);
    });
  });

  describe('total cap', () => {
    it('should cap at 27 points maximum', () => {
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

    it('should never return negative total', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [makeEmployee({ race: 'White' })],
      }));

      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('all results are finite', () => {
    it('should return finite values for mixed workforce', () => {
      const result = calculateManagementScore(makeManagementData({
        employees: [
          makeEmployee({ id: '1', designation: 'Board', race: 'African', gender: 'Female' }),
          makeEmployee({ id: '2', designation: 'Executive', race: 'Indian', gender: 'Male' }),
          makeEmployee({ id: '3', designation: 'Senior', race: 'Coloured', gender: 'Female' }),
          makeEmployee({ id: '4', designation: 'Middle', race: 'White', gender: 'Male' }),
          makeEmployee({ id: '5', designation: 'Junior', race: 'African', isDisabled: true }),
        ],
      }));

      assertAllFinite(result);
    });
  });
});
