import type { SkillsData, TrainingProgram, TrainingCategoryCode } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore } from './shared';

const CATEGORY_E_CAP = 0.25;
const CATEGORY_F_CAP = 0.15;

export interface SkillsSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
}

export interface CategoryBreakdown {
  code: TrainingCategoryCode;
  label: string;
  examples: string;
  spend: number;
  recognisedSpend: number;
  cap?: number;
  capApplied: boolean;
}

export interface SkillsResult {
  learningProgrammes: number;
  bursaries: number;
  disabledLearning: number;
  learnerships: number;
  absorption: number;
  total: number;
  subMinimumMet: boolean;
  categoryBreakdown: CategoryBreakdown[];
  subLines: SkillsSubLine[];
  rawStats: {
    blackSpend: number;
    bursarySpend: number;
    disabledSpend: number;
    learnershipCount: number;
    absorbedCount: number;
    totalBlackLearners: number;
    absorptionRate: number;
    totalRecognisedSpend: number;
    targetOverall: number;
    targetBursaries: number;
    targetDisabled: number;
  };
}

const CATEGORY_LABELS: Record<TrainingCategoryCode, { label: string; examples: string }> = {
  A: { label: "Bursaries", examples: "Bursaries" },
  B: { label: "Internships & Learnerships", examples: "Internships, Learnerships" },
  C: { label: "Short Courses & Workshops", examples: "Short courses, workshops" },
  D: { label: "Other Accredited Training", examples: "Other accredited training" },
  E: { label: "Non-accredited / Informal", examples: "Non-accredited, informal" },
  F: { label: "Other (Travel, Venue, etc.)", examples: "Travel, venue, catering" },
};

function mapLegacyCategory(cat: TrainingProgram['category']): TrainingCategoryCode {
  switch (cat) {
    case 'bursary': return 'A';
    case 'learnership':
    case 'internship': return 'B';
    case 'short_course': return 'C';
    default: return 'D';
  }
}

interface SpendAccumulator {
  total: number;
  bursary: number;
  disabled: number;
  blackPeople: number;
  learnershipCount: number;
  absorbedCount: number;
  totalBlackLearners: number;
  byCategory: Record<TrainingCategoryCode, number>;
}

function accumulateSpend(programs: TrainingProgram[]): SpendAccumulator {
  const acc: SpendAccumulator = {
    total: 0, bursary: 0, disabled: 0, blackPeople: 0,
    learnershipCount: 0, absorbedCount: 0, totalBlackLearners: 0,
    byCategory: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
  };

  for (const prog of programs) {
    if (!prog.isBlack) continue;

    const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
    acc.byCategory[catCode] += prog.cost;
    acc.blackPeople += prog.cost;
    acc.totalBlackLearners++;

    if (prog.category === 'bursary' || catCode === 'A') acc.bursary += prog.cost;
    if (prog.isDisabled) acc.disabled += prog.cost;
    if (prog.category === 'learnership' || prog.category === 'internship' || catCode === 'B') acc.learnershipCount++;
    if (prog.isEmployed) acc.absorbedCount++;
  }

  return acc;
}

function applyCapToSpend(spendByCategory: Record<TrainingCategoryCode, number>): {
  totalRecognised: number;
  breakdown: CategoryBreakdown[];
} {
  const uncappedTotal = Object.values(spendByCategory).reduce((a, b) => a + b, 0);
  const breakdown: CategoryBreakdown[] = [];
  let totalRecognised = 0;

  for (const code of ['A', 'B', 'C', 'D', 'E', 'F'] as TrainingCategoryCode[]) {
    const spend = spendByCategory[code];
    const meta = CATEGORY_LABELS[code];
    let recognisedSpend = spend;
    let capApplied = false;
    let cap: number | undefined;

    if (code === 'E' && uncappedTotal > 0) {
      cap = CATEGORY_E_CAP;
      const maxAllowed = uncappedTotal * CATEGORY_E_CAP;
      if (spend > maxAllowed) {
        recognisedSpend = maxAllowed;
        capApplied = true;
      }
    } else if (code === 'F' && uncappedTotal > 0) {
      cap = CATEGORY_F_CAP;
      const maxAllowed = uncappedTotal * CATEGORY_F_CAP;
      if (spend > maxAllowed) {
        recognisedSpend = maxAllowed;
        capApplied = true;
      }
    }

    totalRecognised += recognisedSpend;
    breakdown.push({ code, label: meta.label, examples: meta.examples, spend, recognisedSpend, cap, capApplied });
  }

  return { totalRecognised, breakdown };
}

export function calculateSkillsScore(data: SkillsData, config?: CalculatorConfig): SkillsResult {
  const { leviableAmount } = data;
  const trainingPrograms = data.trainingPrograms || [];
  const sc = config?.skills;

  const overallTargetPct = sc?.overallTarget ?? 0.06;
  const bursaryTargetPct = sc?.bursaryTarget ?? 0.025;
  const disabledTargetPct = 0.003;
  const subMinThreshold = sc?.subMinThreshold ?? 10;

  const TARGET_OVERALL = leviableAmount * overallTargetPct;
  const TARGET_BURSARIES = leviableAmount * bursaryTargetPct;
  const TARGET_DISABLED = leviableAmount * disabledTargetPct;

  const spend = accumulateSpend(trainingPrograms);
  const { totalRecognised, breakdown } = applyCapToSpend(spend.byCategory);

  const learningScore = clampScore(safeRatio(totalRecognised, TARGET_OVERALL, 6), 6);
  const bursaryScore = clampScore(safeRatio(spend.bursary, TARGET_BURSARIES, 4), 4);
  const disabledScore = clampScore(safeRatio(spend.disabled, TARGET_DISABLED, 4), 4);

  const totalEmployees = trainingPrograms.filter(p => p.isBlack).length;
  const learnershipTarget = Math.max(totalEmployees * 0.05, 1);
  const learnershipScore = clampScore(safeRatio(spend.learnershipCount, learnershipTarget, 6), 6);

  const absorptionRate = spend.totalBlackLearners > 0
    ? spend.absorbedCount / spend.totalBlackLearners
    : 0;
  const absorptionScore = clampScore(safeRatio(absorptionRate, 0.025, 5), 5);

  const totalScore = clampScore(
    learningScore + bursaryScore + disabledScore + learnershipScore + absorptionScore,
    25
  );

  const subLines: SkillsSubLine[] = [
    { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(1)}% of payroll`, weighting: 6, score: learningScore },
    { name: "Expenditure on bursaries for Black students", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: 4, score: bursaryScore },
    { name: "Expenditure on learning programmes for disabled black employees", target: "0.3% of payroll", weighting: 4, score: disabledScore },
    { name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: "5% of headcount", weighting: 6, score: learnershipScore },
    { name: "Absorption of black people after learnerships, apprenticeships or internships", target: "2.5% absorption", weighting: 5, score: absorptionScore },
  ];

  return {
    learningProgrammes: learningScore,
    bursaries: bursaryScore,
    disabledLearning: disabledScore,
    learnerships: learnershipScore,
    absorption: absorptionScore,
    total: totalScore,
    subMinimumMet: totalScore >= subMinThreshold,
    categoryBreakdown: breakdown,
    subLines,
    rawStats: {
      blackSpend: totalRecognised,
      bursarySpend: spend.bursary,
      disabledSpend: spend.disabled,
      learnershipCount: spend.learnershipCount,
      absorbedCount: spend.absorbedCount,
      totalBlackLearners: spend.totalBlackLearners,
      absorptionRate,
      totalRecognisedSpend: totalRecognised,
      targetOverall: TARGET_OVERALL,
      targetBursaries: TARGET_BURSARIES,
      targetDisabled: TARGET_DISABLED,
    },
  };
}
