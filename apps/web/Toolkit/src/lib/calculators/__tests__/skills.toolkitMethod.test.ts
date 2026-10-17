/**
 * Skills — the Empower toolkit's arithmetic (RCOGP Generic, skills.method =
 * 'toolkit'), one rule per test, plus the fixes that apply to every sector.
 * The full method is checked against the toolkit recalculated in Excel by the
 * parity harness (toolkitParity.harness.test.ts, Summary Scorecard rows 43-48).
 */
import { describe, it, expect } from 'vitest';
import {
  calculateSkillsScore,
  isBursaryProgram,
  isNotEmployed,
  skillsWorkforceFromManagement,
  withSkillsWorkforce,
} from '../skills';
import { getEffectiveEap } from '../eapTargets';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { buildConstructionCalculatorConfig } from '../../sectors/construction';
import type { CalculatorConfig } from '../../../../../shared/schema';
import type { SkillsData, TrainingProgram, Employee } from '../../types';

const CFG = RCOGP_GENERIC_CALCULATOR_CONFIG;
const PROVINCE = 'National';
const YEAR = 2025;
const EAP = getEffectiveEap(PROVINCE, YEAR);

let seq = 0;
const tp = (o: Partial<TrainingProgram> = {}): TrainingProgram => ({
  id: `t${++seq}`,
  programName: 'Programme',
  categoryCode: 'E',
  learnerName: 'Learner',
  gender: 'Male',
  race: 'African',
  isDisabled: false,
  isForeign: false,
  employmentStatus: 'Permanent',
  isYesEmployee: false,
  isCompleted: false,
  isAbsorbed: false,
  transactionDate: '2025-06-01',
  courseCost: 0,
  travelCost: 0,
  accommodationCost: 0,
  cateringCost: 0,
  stationeryCost: 0,
  facilityCost: 0,
  salaryCost: 0,
  otherCosts: 0,
  isAbet: false,
  isMandatory: false,
  isBursary: false,
  ...o,
});

const skills = (programs: TrainingProgram[], o: Partial<SkillsData> = {}): SkillsData => ({
  id: 's',
  clientId: 'c',
  leviableAmount: 100_000_000,
  trainingPrograms: programs,
  yesCandidatesCount: 0,
  yesAbsorbedCount: 0,
  ...o,
});

const score = (d: SkillsData) => calculateSkillsScore(d, CFG, PROVINCE, YEAR);
/** The unrounded line, rebuilt from the toolkit formula: min(x ÷ (base × e) × max × e, max × e). */
const capped = (x: number, target: number, max: number) => (target > 0 ? Math.min((x / target) * max, max) : 0);

describe('Skills, every sector: which rows count', () => {
  it('a Category A row is a bursary only when marked as one', () => {
    expect(isBursaryProgram(tp({ categoryCode: 'A', isBursary: false }))).toBe(false);
    expect(isBursaryProgram(tp({ categoryCode: 'A', isBursary: true }))).toBe(true);
    expect(isBursaryProgram(tp({ categoryCode: 'B', isBursary: true }))).toBe(false);
    expect(isBursaryProgram(tp({ category: 'bursary', categoryCode: undefined as any }))).toBe(true);

    // Original method: an unmarked Category A row no longer feeds the bursary line.
    const unmarked = calculateSkillsScore(skills([tp({ categoryCode: 'A', courseCost: 100_000, totalCost: 100_000 })]));
    expect(unmarked.rawStats.bursarySpend).toBe(0);
    const marked = calculateSkillsScore(skills([tp({ categoryCode: 'A', isBursary: true, courseCost: 100_000, totalCost: 100_000 })]));
    expect(marked.rawStats.bursarySpend).toBe(100_000);
  });

  it('a foreign learner is never black', () => {
    const r = calculateSkillsScore(skills([tp({ isForeign: true, courseCost: 50_000, totalCost: 50_000 })]));
    expect(r.rawStats.blackSpend).toBe(0);
    expect(r.rawStats.totalBlackLearners).toBe(0);
  });

  it('a Fixed-Term learner counts as not employed', () => {
    expect(isNotEmployed(tp({ employmentStatus: 'Fixed-Term' }))).toBe(true);
    expect(isNotEmployed(tp({ employmentStatus: 'Unemployed' }))).toBe(true);
    expect(isNotEmployed(tp({ employmentStatus: 'Permanent', isEmployed: false }))).toBe(false);
    expect(isNotEmployed(tp({ employmentStatus: undefined as any, isEmployed: false }))).toBe(true);

    // ICT-style absorption over unemployed LAI completers now includes fixed-term ones.
    const cfg = {
      sectorCode: 'ICT', scorecardType: 'Generic',
      skills: { generalMax: 6, bursaryMax: 4, overallTarget: 0.035, bursaryTarget: 0.025, subMinThreshold: 0,
        absorptionBasisUnemployedLAI: true, absorptionTargetPercent: 100, absorptionMaxPts: 5 },
    } as unknown as CalculatorConfig;
    const r = calculateSkillsScore(skills([
      tp({ categoryCode: 'D', employmentStatus: 'Fixed-Term', isCompleted: true, isAbsorbed: true, courseCost: 1 }),
      tp({ categoryCode: 'D', employmentStatus: 'Fixed-Term', isCompleted: true, courseCost: 1 }),
    ]), cfg);
    expect(r.rawStats.absorptionRate).toBeCloseTo(0.5, 9);
  });
});

describe('Skills, toolkit method (RCOGP Generic)', () => {
  it('is switched on for RCOGP Generic only, not for construction', () => {
    expect(CFG.skills.method).toBe('toolkit');
    expect(CFG.skills.absorptionBasis).toBe('headcount');
    expect(buildConstructionCalculatorConfig('construction_contractor').skills.method).toBeUndefined();
  });

  it('keeps bursaries out of the learning line, and an unmarked Category A row in it', () => {
    const lev = 10_000_000;
    const r = score(skills([
      tp({ categoryCode: 'A', isBursary: true, courseCost: 40_000 }),
      tp({ categoryCode: 'A', isBursary: false, courseCost: 30_000 }),
    ], { leviableAmount: lev }));
    expect(r.rawStats.bursarySpend).toBe(40_000);
    expect(r.rawStats.blackSpend).toBe(30_000);
    expect(r.bursaries).toBeCloseTo(capped(40_000, lev * 0.025 * EAP.AM, 4 * EAP.AM), 2);
  });

  it('counts a bursar\'s stipend only when the learner was not employed', () => {
    const permanent = score(skills([tp({ categoryCode: 'A', isBursary: true, courseCost: 10_000, salaryCost: 5_000, travelCost: 1_000 })]));
    expect(permanent.rawStats.bursarySpend).toBe(11_000);
    const fixedTerm = score(skills([tp({ categoryCode: 'A', isBursary: true, employmentStatus: 'Fixed-Term', courseCost: 10_000, salaryCost: 5_000, travelCost: 1_000 })]));
    expect(fixedTerm.rawStats.bursarySpend).toBe(16_000);
  });

  it('counts salary only for categories B, C and D', () => {
    const r = score(skills([
      tp({ categoryCode: 'E', courseCost: 10_000, salaryCost: 50_000 }),
      tp({ categoryCode: 'B', courseCost: 10_000, salaryCost: 20_000 }),
    ]));
    expect(r.rawStats.blackSpend).toBe(40_000);
  });

  it('caps F & G course costs at 25% of ALL training spend × the group\'s EAP share', () => {
    const lev = 100_000_000;
    // White learners' spend is in the cap base; only the black learner scores.
    const r = score(skills([
      tp({ categoryCode: 'F', courseCost: 1_000_000 }),
      tp({ categoryCode: 'E', race: 'White', courseCost: 1_000_000 }),
    ], { leviableAmount: lev }));
    const recognised = Math.min(1_000_000, 2_000_000 * 0.25 * EAP.AM);
    expect(r.rawStats.blackSpend).toBeCloseTo(recognised, 2);
    expect(r.learningProgrammes).toBeCloseTo(capped(recognised, lev * 0.035 * EAP.AM, 6 * EAP.AM), 2);
    const f = r.categoryBreakdown.find((c) => c.code === 'F')!;
    expect(f.spend).toBe(1_000_000);
    expect(f.recognisedSpend).toBeCloseTo(recognised, 2);
    expect(f.capApplied).toBe(true);
  });

  it('caps other legitimate costs at 15% of all training spend × the group\'s EAP share', () => {
    const r = score(skills([
      tp({ categoryCode: 'E', travelCost: 600_000, cateringCost: 400_000 }),
      tp({ categoryCode: 'E', race: 'White', courseCost: 1_000_000 }),
    ]));
    expect(r.rawStats.blackSpend).toBeCloseTo(Math.min(1_000_000, 2_000_000 * 0.15 * EAP.AM), 2);
  });

  it('splits the learning line by effective EAP: one group cannot earn more than its share', () => {
    const r = score(skills([tp({ categoryCode: 'E', courseCost: 50_000_000 })]));
    expect(r.learningProgrammes).toBeCloseTo(6 * EAP.AM, 2);
    expect(r.learningProgrammes).toBeLessThan(6);
  });

  it('shares 15% of training-admin costs out by the black workforce mix', () => {
    const r = score(skills([tp({ categoryCode: 'E', courseCost: 10_000 })], {
      trainingManagerSalary: 100_000,
      trainingOverheadCost: 50_000,
      workforceShares: { AM: 0.5, PWD: 0.1 },
    }));
    expect(r.rawStats.blackSpend).toBeCloseTo(10_000 + 0.15 * 150_000 * 0.5, 2);
  });

  it('scores disabled learners as one pool against 0.3% of leviable, without an EAP split', () => {
    const lev = 10_000_000;
    const r = score(skills([tp({ categoryCode: 'E', gender: 'Female', isDisabled: true, courseCost: 15_000 })], { leviableAmount: lev }));
    expect(r.disabledLearning).toBeCloseTo(15_000 / (lev * 0.003) * 4, 2);
  });

  it('counts learnership heads per group against 5% of headcount × the group\'s EAP share', () => {
    const hc = 100;
    const r = score(skills([
      tp({ categoryCode: 'B' }),
      tp({ categoryCode: 'C', employmentStatus: 'Unemployed' }),
      tp({ categoryCode: 'D', gender: 'Female' }),
      tp({ categoryCode: 'B', isBursary: true }), // marked bursary: not an LAI
      tp({ categoryCode: 'E' }), // not an LAI category
      tp({ categoryCode: 'D', isForeign: true }), // not black
    ], { headcount: hc }));
    const expected =
      capped(2, hc * 0.05 * EAP.AM, 6 * EAP.AM) +
      capped(1, hc * 0.05 * EAP.AF, 6 * EAP.AF);
    expect(r.rawStats.learnershipCount).toBe(3);
    expect(r.learnerships).toBeCloseTo(expected, 2);
  });

  it('measures absorption against 5% of headcount (unemployed or fixed-term, completed, absorbed)', () => {
    const r = score(skills([
      tp({ categoryCode: 'D', employmentStatus: 'Unemployed', isCompleted: true, isAbsorbed: true }),
      tp({ categoryCode: 'C', gender: 'Female', employmentStatus: 'Fixed-Term', isCompleted: true, isAbsorbed: true }),
      tp({ categoryCode: 'D', employmentStatus: 'Permanent', isCompleted: true, isAbsorbed: true }), // was employed
      tp({ categoryCode: 'D', employmentStatus: 'Unemployed', isCompleted: false, isAbsorbed: true }), // not completed
      tp({ categoryCode: 'E', employmentStatus: 'Unemployed', isCompleted: true, isAbsorbed: true }), // not an LAI
    ], { headcount: 100 }));
    expect(r.rawStats.absorbedCount).toBe(2);
    expect(r.rawStats.absorptionRate).toBeCloseTo(0.02, 9);
    expect(r.absorption).toBeCloseTo((0.02 / 0.05) * 5, 2);
  });

  it('has no headcount fallback: without a headcount the headcount lines score 0', () => {
    const r = score(skills([
      tp({ categoryCode: 'D', employmentStatus: 'Unemployed', isCompleted: true, isAbsorbed: true }),
    ]));
    expect(r.learnerships).toBe(0);
    expect(r.absorption).toBe(0);
  });

  it('scores the spend lines 0 when there is no leviable amount', () => {
    const r = score(skills([tp({ categoryCode: 'E', courseCost: 10_000, isDisabled: true })], { leviableAmount: 0 }));
    expect(r.learningProgrammes).toBe(0);
    expect(r.disabledLearning).toBe(0);
    expect(Number.isFinite(r.total)).toBe(true);
  });

  it('reads a lump-sum-only row as its course cost', () => {
    const r = score(skills([tp({ categoryCode: 'E', totalCost: 25_000 })]));
    expect(r.rawStats.blackSpend).toBe(25_000);
  });

  it('keeps the line names and order, and explains each line', () => {
    const r = score(skills([tp({ categoryCode: 'E', courseCost: 10_000 })], { headcount: 50 }));
    expect(r.subLines.map((l) => l.name)).toEqual([
      'Expenditure on learning programmes for Black people',
      'Expenditure on bursaries for Black students',
      'Expenditure on learning programmes for disabled black employees',
      'Number of ALL Black people participating in learnerships, apprenticeships or internships',
      'Absorption of black people after learnerships, apprenticeships or internships',
    ]);
    for (const l of r.subLines) expect(l.note && l.note.length > 20).toBe(true);
    expect(r.subLines[0].note).toContain('African male');
    expect(r.subLines[4].isBonus).toBe(true);
    expect(r.subLines[4].target).toBe('5.0% of headcount');
  });

  it('applies the 40% sub-minimum to the four base lines only', () => {
    const r = score(skills([], { headcount: 10 }));
    expect(r.subMinimumMet).toBe(false);
    // Every group fully covered: learning 6 + learnerships 6 = 12 ≥ 8.
    const groups = (['African', 'Coloured', 'Indian'] as const).flatMap((race) =>
      (['Male', 'Female'] as const).map((gender) => ({ race, gender })));
    const full = score(skills(
      groups.flatMap((g) => [
        tp({ ...g, categoryCode: 'E', courseCost: 100_000_000 }),
        ...Array.from({ length: 10 }, () => tp({ ...g, categoryCode: 'B' })),
      ]),
      { headcount: 10 },
    ));
    expect(full.learningProgrammes + full.learnerships).toBeCloseTo(12, 2);
    expect(full.subMinimumMet).toBe(true);
    // One group alone cannot reach the sub-minimum, however much it spends.
    const oneGroup = score(skills(
      [tp({ categoryCode: 'E', courseCost: 100_000_000 }), ...Array.from({ length: 10 }, () => tp({ categoryCode: 'B' }))],
      { headcount: 10 },
    ));
    expect(oneGroup.subMinimumMet).toBe(false);
  });
});

describe('Skills workforce from Management Control', () => {
  const emp = (o: Partial<Employee>): Employee => ({
    id: 'e', name: 'E', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false, ...o,
  });

  it('counts every employee except non-executive directors; shares are black South Africans by group', () => {
    const wf = skillsWorkforceFromManagement([
      emp({ designation: 'Board' }),
      emp({}),
      emp({ gender: 'Female', isDisabled: true }),
      emp({ race: 'White' }),
      emp({ isForeign: true }),
    ]);
    expect(wf.headcount).toBe(4);
    expect(wf.shares.AM).toBeCloseTo(0.25, 9);
    expect(wf.shares.AF).toBeCloseTo(0.25, 9);
    expect(wf.shares.PWD).toBeCloseTo(0.25, 9);
  });

  it('fills headcount and shares only when the client entered none', () => {
    const management = { employees: [emp({}), emp({})] };
    const filled = withSkillsWorkforce(skills([]), management);
    expect(filled.headcount).toBe(2);
    expect(filled.workforceShares?.AM).toBe(1);
    const entered = withSkillsWorkforce(skills([], { headcount: 80, workforceShares: { AM: 0.3 } }), management);
    expect(entered.headcount).toBe(80);
    expect(entered.workforceShares).toEqual({ AM: 0.3 });
  });
});
