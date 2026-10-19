/**
 * ICT QSE — one test per rule its Empower toolkit (BBBEE Toolkit (ICT QSE)
 * v1.1) scores by and our ICT QSE config opts into, each also checked to be
 * OFF for a sector that has not opted in. The end-to-end proof is the parity
 * gate (toolkitParity.ict_qse.expected.test.ts); these pin each rule alone.
 */
import { describe, it, expect } from 'vitest';
import { ICT_QSE_CALCULATOR_CONFIG as ICT_QSE } from '../../sectors/ict-qse';
import { RCOGP_QSE_CALCULATOR_CONFIG as RCOGP_QSE } from '../../sectors/rcogp-qse';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore, qualifiesForEnhancedRecognition } from '../procurement';
import { calculateSedScore } from '../esd-sed';
import type { Employee, OwnershipData, SEDData, SkillsData, Supplier, TrainingProgram } from '../../types';

const sub = (r: { subLines: Array<{ name: string; score: number }> }, name: string) =>
  r.subLines.find((l) => l.name === name)!.score;

describe('ownership: the combined "new entrants or designated groups" line', () => {
  const data: OwnershipData = {
    id: 'o', clientId: 'c', companyValue: 10_000_000, outstandingDebt: 0, yearsHeld: 0,
    ownershipScorePoints: 0, ownershipScorePercent: 0, netValuePoints: 0, netValuePercent: 0,
    shareholders: [{
      id: 'a', name: 'Holder', ownershipType: 'Strategic Partner', blackOwnership: 1, blackWomenOwnership: 0,
      shares: 100, shareValue: 1_000, votingRightsPercent: 1, economicInterestPercent: 1,
      isDesignatedGroup: true, blackNewEntrant: true,
      designatedGroupOwnership: 0.005, blackNewEntrantOwnership: 0.005,
    }],
  };
  it('adds the two shares against 2% for 3 points (Ownership Scorecard I9 = Y4 + Z4)', () => {
    // 0.5% + 0.5% = 1% of a 2% target → 1.5 of 3.
    const r = calculateOwnershipScore(data, ICT_QSE);
    expect(r.designatedGroups).toBeCloseTo(1.5, 6);
  });
});

describe('management control: the combined executive-and-senior layout', () => {
  const emp = (id: string, designation: Employee['designation'], race: Employee['race'], gender: Employee['gender'] = 'Male'): Employee =>
    ({ id, name: id, designation, race, gender, isDisabled: false, isForeign: false } as Employee);
  const employees = [
    emp('ed', 'Executive Director', 'White'),
    emp('s1', 'Senior', 'African', 'Female'),
    emp('m1', 'Middle', 'African'),
    emp('m2', 'Middle', 'White'),
    emp('j1', 'Junior', 'Coloured'),
  ];
  it('ICT QSE: senior managers join the executive lines; middle and junior make the other two', () => {
    const r = calculateManagementScore({ id: 'm', clientId: 'c', employees, combineExcoSenior: true }, ICT_QSE);
    // Executive: 1 black of 2 (white ED + black senior) = 50% → 5; black female 50% of 25% → 2.
    expect(sub(r, 'Black executive directors')).toBeCloseTo(5, 6);
    expect(sub(r, 'Black female executive directors')).toBeCloseTo(2, 6);
    // Middle + junior: 2 black of 3 = 66.7% ÷ 60% → capped 6; no black women → 0.
    expect(sub(r, 'Black employees in senior management')).toBeCloseTo(6, 6);
    expect(sub(r, 'Black female employees in senior management')).toBe(0);
  });
  it('not combined: executive is executive only, senior/middle/junior together', () => {
    const r = calculateManagementScore({ id: 'm', clientId: 'c', employees, combineExcoSenior: false }, ICT_QSE);
    expect(sub(r, 'Black executive directors')).toBe(0);
    // 3 black of 4 senior/middle/junior = 75% ÷ 60% → 6.
    expect(sub(r, 'Black employees in senior management')).toBeCloseTo(6, 6);
  });
  it('a QSE sector that has not opted in ignores the combination', () => {
    const r = calculateManagementScore({ id: 'm', clientId: 'c', employees, combineExcoSenior: true }, RCOGP_QSE);
    expect(sub(r, 'Black executive directors')).toBe(0);
  });
});

describe("skills: the ICT QSE toolkit's method", () => {
  const prog = (o: Partial<TrainingProgram>): TrainingProgram => ({
    id: 'p', programName: 'P', learnerName: 'L', categoryCode: 'E', race: 'African', gender: 'Male',
    isDisabled: false, isForeign: false, employmentStatus: 'Permanent', isEmployed: true,
    isCompleted: true, isAbsorbed: false, courseCost: 0, ...o,
  } as TrainingProgram);
  const skills = (programs: TrainingProgram[], o: Partial<SkillsData> = {}): SkillsData => ({
    id: 's', clientId: 'c', leviableAmount: 1_000_000, trainingPrograms: programs,
    yesCandidatesCount: 0, yesAbsorbedCount: 0, ...o,
  });
  it('caps F & G and other costs together at 15% of all training spend', () => {
    // A–E R10,000 + F course R5,000 + travel R5,000: all spend R20,000, cap R3,000.
    // Black recognised = 10,000 + 3,000 = 13,000 ÷ (3% × R1m = 30,000) × 15 = 6.5.
    const r = calculateSkillsScore(skills([
      prog({ categoryCode: 'E', courseCost: 10_000 }),
      prog({ categoryCode: 'F', courseCost: 5_000, travelCost: 5_000 }),
    ]), ICT_QSE);
    expect(r.learningProgrammes).toBeCloseTo(6.5, 6);
  });
  it('adds 15% of training-admin costs by the workforce share', () => {
    // 15% × R100,000 × 50% black workforce = R7,500 → 7,500 ÷ 30,000 × 15 = 3.75.
    const r = calculateSkillsScore(skills([], {
      trainingManagerSalary: 80_000, trainingOverheadCost: 20_000,
      workforceShares: { AM: 0.5, CM: 0, IM: 0, AF: 0, CF: 0, IF: 0, PWD: 0 },
    }), ICT_QSE);
    expect(r.learningProgrammes).toBeCloseTo(3.75, 6);
  });
  it('scores black women on 1% for 7 points and disabled black learners on 0.15% for 3', () => {
    const r = calculateSkillsScore(skills([
      prog({ courseCost: 5_000, gender: 'Female' }),
      prog({ courseCost: 750, isDisabled: true }),
    ]), ICT_QSE);
    expect(sub(r, 'Expenditure on learning programmes for Black women')).toBeCloseTo(3.5, 6);
    expect(sub(r, 'Expenditure on learning programmes for disabled black employees')).toBeCloseTo(1.5, 6);
  });
});

describe('procurement: the first-time supplier earns the 1.2 factor', () => {
  const s: Supplier = {
    id: 's', name: 'Supplier', beeLevel: 1, blackOwnership: 0.6, blackWomenOwnership: 0, youthOwnership: 0,
    disabledOwnership: 0, enterpriseType: 'qse', isEmpoweringSupplier: true, isSupplierDevRecipient: false,
    hasThreeYearContract: false, isFirstTimeSupplier: true, spend: 1_000_000,
  };
  it('where the sector reads the answer (ICT QSE)', () => {
    expect(qualifiesForEnhancedRecognition(s, 'black_owned_small_supplier', true)).toBe(true);
    const r = calculateProcurementScore({ id: 'p', clientId: 'c', tmps: 10_000_000, suppliers: [s] }, ICT_QSE);
    expect(r.recognisedSpend).toBeCloseTo(1_000_000 * 1.35 * 1.2, 2);
  });
  it('and not where it does not', () => {
    expect(qualifiesForEnhancedRecognition(s)).toBe(false);
    const r = calculateProcurementScore({ id: 'p', clientId: 'c', tmps: 10_000_000, suppliers: [s] }, RCOGP_QSE);
    expect(r.recognisedSpend).toBeCloseTo(1_000_000 * 1.35, 2);
  });
});

describe('SED: ICT-specific initiatives only', () => {
  const sed: SEDData = {
    id: 'sed', clientId: 'c', contributions: [
      { id: 'a', beneficiary: 'A', type: 'grant', amount: 5_000, category: 'socio_economic', ictSpecificInitiative: true },
      { id: 'b', beneficiary: 'B', type: 'grant', amount: 5_000, category: 'socio_economic', ictSpecificInitiative: false },
    ],
  } as SEDData;
  it('a contribution that is not ICT-specific counts 0 (SED Data[Recognised Amount])', () => {
    // R5,000 ÷ (1% × R1m) × 12 = 6.
    expect(calculateSedScore(sed, 1_000_000, ICT_QSE).total).toBeCloseTo(6, 6);
  });
  it('a sector without the rule counts both', () => {
    const cfg = { ...ICT_QSE, sed: { ...ICT_QSE.sed, requireIctSpecificInitiative: undefined } };
    expect(calculateSedScore(sed, 1_000_000, cfg).total).toBeCloseTo(12, 6);
  });
});

describe('the ICT QSE config', () => {
  it('opts into each toolkit rule', () => {
    expect(ICT_QSE.ownership.ownershipMethod).toBe('toolkit');
    expect(ICT_QSE.skills.method).toBe('toolkit_qse');
    expect(ICT_QSE.discounting.qseRequiresAllPriorityElements).toBe(true);
    expect(ICT_QSE.pillarConfigs?.enterpriseDevelopment?.subMinimumPercent).toBe(40);
    expect(ICT_QSE.procurement.allSuppliersIgnoreEmpoweringFlag).toBe(true);
  });
  it('leaves RCOGP QSE on its own rules', () => {
    expect(RCOGP_QSE.skills.method).toBeUndefined();
    expect(RCOGP_QSE.discounting.qseRequiresAllPriorityElements).toBeUndefined();
    expect(RCOGP_QSE.managementControl?.qseCombineExcoSenior).toBeUndefined();
    expect(RCOGP_QSE.sed.requireIctSpecificInitiative).toBeUndefined();
  });
});
