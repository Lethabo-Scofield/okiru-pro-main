/**
 * RCOGP QSE, scored the way its Empower toolkit (v1.1) does — each new rule on
 * its own. The parity gate (toolkitParity.rcogp_qse.expected.test.ts) checks
 * them together, line by line, against the workbook recalculated by Excel.
 *   - ownership: one "new entrants or designated groups" line, its measure the
 *     two shares added;
 *   - procurement: a first-time ≥51% black QSE/EME supplier earns the 1.2
 *     factor (the opt-in rule), and the all-suppliers line ignores the
 *     empowering flag;
 *   - Skills ('toolkit_qse'): F & G and other costs capped at 15% of all
 *     training spend, 15% of training-admin costs by workforce share, absorption
 *     over the learners who completed a learnership while unemployed;
 *   - none of it reaches RCOGP Generic or the default rules.
 */
import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import { calculateProcurementScore, qualifiesForEnhancedRecognition } from '../procurement';
import { calculateSkillsScore } from '../skills';
import { RCOGP_QSE_CALCULATOR_CONFIG as QSE } from '../../sectors/rcogp-qse';
import { RCOGP_GENERIC_CALCULATOR_CONFIG as GENERIC } from '../../sectors/rcogp-generic';
import type { OwnershipData, Shareholder, Supplier, TrainingProgram, SkillsData } from '../../types';

const holder = (o: Partial<Shareholder>): Shareholder => ({
  id: 'h', name: 'Holder', ownershipType: 'shareholder', blackOwnership: 0, blackWomenOwnership: 0,
  votingRightsPercent: 0, economicInterestPercent: 0, isDesignatedGroup: false, shares: 100, shareValue: 1_000_000, ...o,
});
const own = (shareholders: Shareholder[]): OwnershipData => ({
  id: 'own', clientId: 'c', shareholders, companyValue: 2_000_000, outstandingDebt: 0, yearsHeld: 0,
  ownershipScorePoints: 0, ownershipScorePercent: 0, netValuePoints: 0, netValuePercent: 0,
});
const supplier = (o: Partial<Supplier>): Supplier => ({
  id: 's', name: 'Supplier', beeLevel: 1, blackOwnership: 0, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0,
  enterpriseType: 'qse', isEmpoweringSupplier: true, isSupplierDevRecipient: false, hasThreeYearContract: false, spend: 100_000, ...o,
});
const learner = (o: Partial<TrainingProgram>): TrainingProgram => ({
  id: 't', programName: 'P', categoryCode: 'C', learnerName: 'L', gender: 'Male', race: 'African', isDisabled: false,
  isForeign: false, employmentStatus: 'Permanent', isYesEmployee: false, isCompleted: true, isAbsorbed: false,
  transactionDate: '2026-02-28', courseCost: 0, travelCost: 0, accommodationCost: 0, cateringCost: 0, stationeryCost: 0,
  facilityCost: 0, salaryCost: 0, otherCosts: 0, isAbet: false, isMandatory: false, isBursary: false, ...o,
});
const skills = (programs: TrainingProgram[], o: Partial<SkillsData> = {}): SkillsData => ({
  id: 'sk', clientId: 'c', leviableAmount: 1_000_000, trainingPrograms: programs, yesCandidatesCount: 0, yesAbsorbedCount: 0, ...o,
});
const line = (lines: Array<{ name: string; score: number }>, name: string) => {
  const l = lines.find((s) => s.name === name);
  if (!l) throw new Error(`no line ${name}`);
  return l.score;
};

describe('RCOGP QSE ownership: the combined new-entrants-or-designated-groups line', () => {
  it('adds the two shares and scores them against 2% for 3 points', () => {
    // Holder A (half the value): 1% designated groups; holder B: 0.5% new entrants → 0.75% together.
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 0.5, designatedGroupOwnership: 0.02, blackNewEntrantOwnership: 0 }),
      holder({ name: 'B', blackOwnership: 0.5, designatedGroupOwnership: 0, blackNewEntrantOwnership: 0.01 }),
    ]), QSE);
    expect(line(r.subLines, 'Economic interest of black new entrants or designated groups')).toBeCloseTo(0.015 / 0.02 * 3, 2);
    expect(r.subLines.some((l) => l.name === 'Economic interest of black new entrants')).toBe(false);
    expect(r.subLines.reduce((a, l) => a + l.weighting, 0)).toBe(25);
  });
});

describe('RCOGP QSE procurement', () => {
  it('a first-time ≥51% black QSE/EME supplier earns the 1.2 factor under the QSE rule only', () => {
    const s = supplier({ blackOwnership: 0.51, isFirstTimeSupplier: true });
    expect(qualifiesForEnhancedRecognition(s, 'black_owned_small_supplier_or_first_time')).toBe(true);
    expect(qualifiesForEnhancedRecognition(s, 'black_owned_small_supplier')).toBe(false);
    expect(qualifiesForEnhancedRecognition({ ...s, enterpriseType: 'generic' }, 'black_owned_small_supplier_or_first_time')).toBe(false);
    expect(qualifiesForEnhancedRecognition({ ...s, blackOwnership: 0.5 }, 'black_owned_small_supplier_or_first_time')).toBe(false);
  });

  it('counts every supplier on the all-suppliers line, empowering or not', () => {
    const data = { id: 'pp', clientId: 'c', tmps: 1_000_000, suppliers: [supplier({ isEmpoweringSupplier: false, spend: 600_000, beeLevel: 4 })] };
    const r = calculateProcurementScore(data as never, QSE);
    // R600 000 × 1.00 ÷ R1m = 60% of the 60% target → 15.
    expect(line(r.subLines, 'B-BBEE Procurement Spend from Empowering Suppliers')).toBeCloseTo(15, 6);
  });
});

describe("RCOGP QSE Skills ('toolkit_qse')", () => {
  it('caps F & G and other costs at 15% of ALL training spend, and adds 15% of admin costs by workforce share', () => {
    const programs = [
      learner({ categoryCode: 'C', courseCost: 10_000, salaryCost: 5_000 }),          // black: 15 000 direct
      learner({ categoryCode: 'F', courseCost: 20_000, otherCosts: 2_000 }),          // black: 22 000 F&G + other
      learner({ categoryCode: 'A', race: 'White', courseCost: 50_000 }),              // all spend only
    ];
    const r = calculateSkillsScore(skills(programs, {
      leviableAmount: 2_000_000, trainingManagerSalary: 100_000, trainingOverheadCost: 0, workforceShares: { AM: 0.5, PWD: 0 },
    }), QSE);
    // All spend 87 000 → cap 13 050; admin 15% × 100 000 × 50% = 7 500;
    // 35 550 ÷ (3% × 2 000 000) × 15 = 8.8875.
    const recognised = 15_000 + 13_050 + 7_500;
    expect(r.rawStats.blackSpend).toBeCloseTo(recognised, 2);
    expect(line(r.subLines, 'Expenditure on learning programmes for Black people')).toBeCloseTo(8.89, 2);
  });

  it('scores absorption over learners who completed a learnership while unemployed, not over those absorbed', () => {
    const programs = [
      learner({ categoryCode: 'B', employmentStatus: 'Unemployed', isAbsorbed: true }),
      learner({ categoryCode: 'D', employmentStatus: 'Unemployed', isAbsorbed: false }),
      learner({ categoryCode: 'C', employmentStatus: 'Unemployed', isAbsorbed: false }),
      learner({ categoryCode: 'D', employmentStatus: 'Unemployed', isCompleted: false, isAbsorbed: false }),
      learner({ categoryCode: 'B', employmentStatus: 'Permanent', isAbsorbed: true }),
    ];
    const r = calculateSkillsScore(skills(programs), QSE);
    // 1 absorbed of 3 completed while unemployed → 33% of the 100% target × 5.
    expect(r.absorption).toBeCloseTo(5 / 3, 2);
  });

  it('leaves RCOGP Generic on its own methods', () => {
    expect(GENERIC.skills.method).toBe('toolkit');
    expect(GENERIC.procurement.enhancedRecognitionRule).toBe('flow_through');
    expect(QSE.skills.method).toBe('toolkit_qse');
    expect(QSE.procurement.enhancedRecognitionRule).toBe('black_owned_small_supplier_or_first_time');
  });
});
