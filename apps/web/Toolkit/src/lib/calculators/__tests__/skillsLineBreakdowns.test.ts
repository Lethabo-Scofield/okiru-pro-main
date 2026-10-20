/**
 * The per-group detail the Skills page shows under a line must be that line's
 * learners. The Codes method's breakdowns are keyed 0 = black learners,
 * 1 = bursary learners, 2 = disabled learners — its first three lines. The ICT
 * Generic toolkit method orders its lines [learning, disabled, learners in
 * learnerships, the unemployed ones among them, absorption], and AgriBEE's
 * variant of the Generic toolkit method counts unemployed learners on line 1;
 * with the Codes breakdowns, the disabled line showed the bursary learners and
 * the learnership line the disabled ones. Synthetic learners only.
 */
import { describe, it, expect } from 'vitest';
import { calculateSkillsScore } from '../skills';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/ict-generic';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../../sectors/agri-generic';
import type { SkillsData, TrainingProgram } from '../../types';

let n = 0;
function learner(o: Partial<TrainingProgram>): TrainingProgram {
  n += 1;
  return {
    id: `t${n}`, name: `Learner ${n}`, category: 'learnership', categoryCode: 'A', courseCost: 10_000,
    race: 'African', gender: 'Male', isDisabled: false, isForeign: false, employmentStatus: 'Permanent',
    isYesEmployee: false, isCompleted: false, isAbsorbed: false,
    ...o,
  } as TrainingProgram;
}

const programs: TrainingProgram[] = [
  // Learning spend only.
  learner({}),
  // A higher-education bursary (Category A, marked): the Codes method's line 1.
  learner({ race: 'Coloured', isBursary: true, courseCost: 8_000 }),
  // Disabled, in a learnership, unemployed, completed and absorbed.
  learner({ gender: 'Female', categoryCode: 'B', courseCost: 5_000, salaryCost: 2_000, isDisabled: true, employmentStatus: 'Unemployed', isCompleted: true, isAbsorbed: true }),
  // In a learnership while employed, with F & G-style other costs over the cap.
  learner({ race: 'Indian', categoryCode: 'C', courseCost: 3_000, travelCost: 40_000 }),
  // Not black: counted in nobody's breakdown.
  learner({ race: 'White', categoryCode: 'C', courseCost: 4_000 }),
];

const data = (o: Partial<SkillsData> = {}): SkillsData => ({
  id: 'sk', clientId: 'c', leviableAmount: 2_000_000, headcount: 100, trainingPrograms: programs,
  yesCandidatesCount: 0, yesAbsorbedCount: 0, ...o,
} as SkillsData);

/** How many learners a line's breakdown describes (the same pool at every level). */
const pool = (r: ReturnType<typeof calculateSkillsScore>, idx: number) => r.eapBreakdowns[idx]?.senior?.[0]?.totalInLevel;

describe('ICT Generic: each Skills line carries its own learners and measure', () => {
  const r = calculateSkillsScore(data(), ICT_GENERIC_CALCULATOR_CONFIG, 'National');

  it('lines are learning, disabled, learnerships, unemployed learnerships, absorption', () => {
    expect(r.subLines.map((l) => l.measure)).toEqual(['spend', 'spend', 'headcount', 'headcount', 'headcount']);
    expect(r.subLines[1].name).toMatch(/disabled/);
    expect(r.subLines[2].name).toMatch(/^Number of ALL Black people/);
  });

  it('the breakdown under each line is that line\'s black learners', () => {
    expect(pool(r, 0)).toBe(4); // every black learner
    expect(pool(r, 1)).toBe(1); // the disabled one — not the bursary learner
    expect(pool(r, 2)).toBe(2); // categories B, C, D
    expect(pool(r, 3)).toBe(1); // of them, not employed
    expect(pool(r, 4)).toBe(1); // absorbed after completing while not employed
    // The disabled line's group is the African woman, not the Coloured bursary learner.
    const groups = r.eapBreakdowns[1].senior.filter((g) => g.count > 0).map((g) => g.group);
    expect(groups).toEqual(['AF']);
  });

  it('the category view adds up to the spend the learning line recognises', () => {
    const recognised = r.categoryBreakdown.reduce((a, c) => a + c.recognisedSpend, 0);
    expect(recognised).toBeCloseTo(r.rawStats.blackSpend, 2); // no training-admin costs here
    // The Indian learner's travel is over the cap, so category C is capped.
    expect(r.categoryBreakdown.find((c) => c.code === 'C')?.capApplied).toBe(true);
  });
});

describe('AgriBEE Generic: line 1 counts unemployed learners, and its breakdown says so', () => {
  const r = calculateSkillsScore(data(), AGRI_GENERIC_CALCULATOR_CONFIG, 'National');

  it('line 1 is a headcount line', () => {
    expect(r.subLines[1].name).toBe('Number of unemployed Black people in training');
    expect(r.subLines.map((l) => l.measure)).toEqual(['spend', 'headcount', 'spend', 'headcount', 'headcount']);
  });

  it('its breakdown is the unemployed black learners in learnerships, not the bursary learners', () => {
    expect(pool(r, 0)).toBe(4);
    expect(pool(r, 1)).toBe(1);
    expect(r.eapBreakdowns[1].senior.filter((g) => g.count > 0).map((g) => g.group)).toEqual(['AF']);
    expect(pool(r, 2)).toBe(1); // disabled
  });
});
