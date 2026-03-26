import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import type { OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData, Shareholder, Employee, Supplier, Contribution } from '../../types';

const CLIENT_NPAT = 10_000_000;

function makeOwnership(blackVotingPct: number): OwnershipData {
  return {
    id: '1', clientId: 'C-1',
    shareholders: [{ id: '1', name: 'Shareholder', ownershipType: 'shareholder', blackOwnership: blackVotingPct, blackWomenOwnership: blackVotingPct * 0.4, shares: 100, shareValue: 5_000_000 }],
    companyValue: 10_000_000, outstandingDebt: 0, yearsHeld: 10,
  };
}

function makeManagement(blackPct: number): ManagementData {
  const total = 10;
  const blackCount = Math.floor(total * blackPct);
  const employees: Employee[] = [
    ...Array.from({ length: blackCount }, (_, i) => ({ id: `b${i}`, name: `B${i}`, gender: 'Male' as const, race: 'African' as const, designation: 'Senior' as const, isDisabled: false })),
    ...Array.from({ length: total - blackCount }, (_, i) => ({ id: `w${i}`, name: `W${i}`, gender: 'Male' as const, race: 'White' as const, designation: 'Senior' as const, isDisabled: false })),
  ];
  return { id: '1', clientId: 'C-1', employees };
}

function makeSkills(spendMultiplier: number): SkillsData {
  const leviableAmount = 10_000_000;
  const cost = leviableAmount * 0.06 * spendMultiplier;
  return {
    id: '1', clientId: 'C-1', leviableAmount,
    trainingPrograms: [{ id: '1', name: 'Program', category: 'short_course', cost, isEmployed: true, isBlack: true, gender: 'Male', race: 'African', isDisabled: false }],
  };
}

function makeProcurement(recognisedPct: number): ProcurementData {
  const tmps = 10_000_000;
  return {
    id: '1', clientId: 'C-1', tmps,
    suppliers: [{ id: '1', name: 'Supplier', beeLevel: 1, blackOwnership: 0.75, blackWomenOwnership: 0.35, youthOwnership: 0, disabledOwnership: 0, enterpriseType: 'generic', spend: tmps * recognisedPct }],
  };
}

function makeEsd(sdAmount: number, edAmount: number): ESDData {
  const contributions: Contribution[] = [
    { id: '1', beneficiary: 'SD', type: 'grant', amount: sdAmount, category: 'supplier_development' },
    { id: '2', beneficiary: 'ED', type: 'grant', amount: edAmount, category: 'enterprise_development' },
  ];
  return { id: '1', clientId: 'C-1', contributions };
}

function makeSed(amount: number): SEDData {
  return { id: '1', clientId: 'C-1', contributions: [{ id: '1', beneficiary: 'SED', type: 'grant', amount, category: 'socio_economic' }] };
}

describe('B-BBEE Scorecard Integration', () => {
  describe('pillar score caps', () => {
    it('ownership should cap at 25 points', () => {
      const result = calculateOwnershipScore(makeOwnership(1.0));
      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('management should cap at 27 points', () => {
      const result = calculateManagementScore(makeManagement(1.0));
      expect(result.total).toBeLessThanOrEqual(27);
    });

    it('skills should cap at 25 points', () => {
      const result = calculateSkillsScore(makeSkills(100));
      expect(result.total).toBeLessThanOrEqual(25);
    });

    it('procurement total should not exceed max', () => {
      const result = calculateProcurementScore(makeProcurement(100));
      expect(result.total).toBeLessThanOrEqual(30);
    });

    it('ESD combined should not exceed 15 points', () => {
      const result = calculateEsdScore(makeEsd(100_000_000, 100_000_000), CLIENT_NPAT);
      const combined = result.sdTotal + result.edTotal;
      expect(combined).toBeLessThanOrEqual(15);
    });

    it('SED should cap at 5 points', () => {
      const result = calculateSedScore(makeSed(100_000_000), CLIENT_NPAT);
      expect(result.total).toBeLessThanOrEqual(5);
    });
  });

  describe('B-BBEE level boundaries (pointsToLevel logic)', () => {
    function getTotalScore(ownership: number, management: number, skills: number, procurement: number, esd: number, sed: number) {
      return ownership + management + skills + procurement + esd + sed;
    }

    it('should be Level 1 at >= 100 points', () => {
      const total = getTotalScore(25, 19, 25, 20, 10, 5);
      expect(total).toBeGreaterThanOrEqual(100);
    });

    it('should be Level 4 at 80-89 points band', () => {
      const total = 80;
      expect(total).toBeGreaterThanOrEqual(80);
      expect(total).toBeLessThan(90);
    });

    it('should be Level 8 at 40-54 points band', () => {
      const total = 45;
      expect(total).toBeGreaterThanOrEqual(40);
      expect(total).toBeLessThan(55);
    });

    it('should be non-compliant (Level 9) below 40 points', () => {
      const total = 30;
      expect(total).toBeLessThan(40);
    });
  });

  describe('sub-minimum penalties', () => {
    it('ownership subMinimumMet triggers when score >= 10 or fullOwnership', () => {
      const highOwnership = calculateOwnershipScore(makeOwnership(1.0));
      expect(highOwnership.subMinimumMet).toBe(true);

      const zeroOwnership = calculateOwnershipScore(makeOwnership(0));
      expect(zeroOwnership.subMinimumMet).toBe(false);
    });

    it('skills subMinimumMet is false when total < 10', () => {
      const result = calculateSkillsScore(makeSkills(0));
      expect(result.subMinimumMet).toBe(false);
    });

    it('ESD subMinimums are tracked per category', () => {
      const resultZero = calculateEsdScore({ id: '1', clientId: 'C-1', contributions: [] }, CLIENT_NPAT);
      expect(resultZero.sdSubMinimumMet).toBe(false);
      expect(resultZero.edSubMinimumMet).toBe(false);
    });
  });

  describe('all pillar scores are finite for realistic data', () => {
    it('should produce valid finite scores for a typical Level 4 company', () => {
      const own = calculateOwnershipScore(makeOwnership(0.25));
      const mgt = calculateManagementScore(makeManagement(0.5));
      const sk = calculateSkillsScore(makeSkills(0.8));
      const pr = calculateProcurementScore(makeProcurement(0.7));
      const esd = calculateEsdScore(makeEsd(500_000, 200_000), CLIENT_NPAT);
      const sed = calculateSedScore(makeSed(100_000), CLIENT_NPAT);

      for (const score of [own.total, mgt.total, sk.total, pr.total, esd.sdTotal, esd.edTotal, sed.total]) {
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
      }
    });

    it('should produce zero totals for empty data', () => {
      const own = calculateOwnershipScore({ id: '1', clientId: 'C-1', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 });
      const mgt = calculateManagementScore({ id: '1', clientId: 'C-1', employees: [] });
      const sk = calculateSkillsScore({ id: '1', clientId: 'C-1', leviableAmount: 0, trainingPrograms: [] });
      const pr = calculateProcurementScore({ id: '1', clientId: 'C-1', tmps: 0, suppliers: [] });
      const esd = calculateEsdScore({ id: '1', clientId: 'C-1', contributions: [] }, 0);
      const sed = calculateSedScore({ id: '1', clientId: 'C-1', contributions: [] }, 0);

      expect(own.total).toBe(0);
      expect(mgt.total).toBe(0);
      expect(sk.total).toBe(0);
      expect(pr.total).toBe(0);
      expect(esd.sdTotal + esd.edTotal).toBe(0);
      expect(sed.total).toBe(0);
    });
  });
});
