/**
 * @domain-rule pillar:skills_development, slides:84-94
 * @see docs/domain/pillars/03_skills_development.md
 */
import type { SkillsData, TrainingProgram, TrainingCategoryCode } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

/**
 * @domain-rule pillar:skills_development, slide:86
 * @see docs/domain/pillars/03_skills_development.md#certification-rules
 * Categories F & G (informal/uncertified) capped at 25% of total SD target each (2019 amendment).
 * SDF/training manager admin costs capped at 15% of total skills spend.
 */
const CATEGORY_FG_CAP = 0.25;
const ADMIN_COST_CAP = 0.15;

export interface SkillsSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  isBonus?: boolean;
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

/**
 * Learning Program Categories per RCOGP slide 87
 * @domain-rule pillar:skills_development, slide:87
 * @see docs/domain/pillars/03_skills_development.md#learning-program-categories
 */
const CATEGORY_LABELS: Record<TrainingCategoryCode, { label: string; examples: string }> = {
  A: { label: "Learning Institution (Degree/Diploma)", examples: "University degree with no workplace involvement" },
  B: { label: "Workplace + Learning Institution", examples: "Internship as part of qualification" },
  C: { label: "Apprenticeship (SAQA aligned)", examples: "Workplace accredited apprenticeship" },
  D: { label: "Learnership (SETA/QCTO)", examples: "Workplace experience assessed by SETA/QCTO" },
  E: { label: "Certified External Training (SETA/QCTO)", examples: "SETA/QCTO registered skills programs" },
  F: { label: "Certified Internal / Uncertified External", examples: "Workplace accredited or external unaccredited" },
  G: { label: "Uncertified Internal Training", examples: "On-the-job training (no points for non-black)" },
};

function mapLegacyCategory(cat: TrainingProgram['category']): TrainingCategoryCode {
  switch (cat) {
    case 'bursary': return 'A';
    case 'internship': return 'B';
    case 'learnership': return 'D';
    case 'short_course': return 'E';
    default: return 'F';
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
    byCategory: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 },
  };

  for (const prog of programs) {
    if (!prog.isBlack) continue;

    const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
    const cost = prog.cost ?? 0;
    acc.byCategory[catCode] += cost;
    acc.blackPeople += cost;
    acc.totalBlackLearners++;

    if (prog.category === 'bursary' || catCode === 'A') acc.bursary += cost;
    if (prog.isDisabled) acc.disabled += cost;
    if (prog.category === 'learnership' || prog.category === 'internship' || catCode === 'B') acc.learnershipCount++;
    // CRITICAL FIX: Use isAbsorbed (not isEmployed) for absorption count
    if (prog.isAbsorbed) acc.absorbedCount++;
  }

  return acc;
}

function applyCapToSpend(
  spendByCategory: Record<TrainingCategoryCode, number>,
  fgCap: number = CATEGORY_FG_CAP,
  adminCap: number = ADMIN_COST_CAP
): {
  totalRecognised: number;
  breakdown: CategoryBreakdown[];
} {
  const uncappedTotal = Object.values(spendByCategory).reduce((a, b) => a + b, 0);
  const breakdown: CategoryBreakdown[] = [];
  let totalRecognised = 0;

  for (const code of ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as TrainingCategoryCode[]) {
    const spend = spendByCategory[code];
    const meta = CATEGORY_LABELS[code];
    let recognisedSpend = spend;
    let capApplied = false;
    let cap: number | undefined;

    if ((code === 'F' || code === 'G') && uncappedTotal > 0) {
      cap = fgCap;
      const maxAllowed = uncappedTotal * fgCap;
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

export function calculateSkillsScore(data: SkillsData, config: CalculatorConfig): SkillsResult {
  if (!config) throw new Error('CalculatorConfig is required for skills score calculation');
  const { leviableAmount } = data;
  const trainingPrograms = data.trainingPrograms || [];
  const sc = config.skills;

  const overallTargetPct = sc.overallSpendPercent ?? sc.overallTarget;
  const bursaryTargetPct = sc.bursarySpendPercent ?? sc.bursaryTarget;
  const disabledTargetPct = sc.disabledSpendPercent ?? 0.003;
  const fgCap = sc.categoryFGCap ?? sc.categoryECap ?? CATEGORY_FG_CAP;
  const adminCap = sc.adminCostCap ?? sc.categoryFCap ?? ADMIN_COST_CAP;
  const subMinThreshold = config.pillarConfigs?.skillsDevelopment?.subMinimumPercent ?? 40;
  const maxPoints = config.pillarConfigs?.skillsDevelopment?.maxPoints ?? 25;

  const learningMaxPts = sc.learningProgrammesMaxPts ?? sc.generalMax;
  const bursaryMaxPts = sc.bursaryMaxPts ?? sc.bursaryMax;
  const disabledMaxPts = sc.disabledLearningMaxPts ?? 4;
  const learnershipMaxPts = sc.learnershipsMaxPts ?? 6;
  const absorptionMaxPts = sc.absorptionMaxPts ?? 5;

  const learnershipTargetPct = sc.learnershipTargetPercent ?? 5.0;
  const absorptionTargetPct = sc.absorptionTargetPercent ?? 2.5;

  const TARGET_OVERALL = leviableAmount * overallTargetPct;
  const TARGET_BURSARIES = leviableAmount * bursaryTargetPct;
  const TARGET_DISABLED = leviableAmount * disabledTargetPct;

  const spend = accumulateSpend(trainingPrograms);
  const { totalRecognised, breakdown } = applyCapToSpend(spend.byCategory, fgCap, adminCap);

  const learningScore = clampScore(safeRatio(totalRecognised, TARGET_OVERALL, learningMaxPts), learningMaxPts);
  const bursaryScore = clampScore(safeRatio(spend.bursary, TARGET_BURSARIES, bursaryMaxPts), bursaryMaxPts);
  const disabledScore = clampScore(safeRatio(spend.disabled, TARGET_DISABLED, disabledMaxPts), disabledMaxPts);

  const totalEmployees = trainingPrograms.filter(p => p.isBlack).length;
  const learnershipTarget = Math.max(totalEmployees * (learnershipTargetPct / 100), 1);
  const learnershipScore = clampScore(safeRatio(spend.learnershipCount, learnershipTarget, learnershipMaxPts), learnershipMaxPts);

  const absorptionRate = spend.totalBlackLearners > 0
    ? spend.absorbedCount / spend.totalBlackLearners
    : 0;
  const absorptionScore = clampScore(safeRatio(absorptionRate, absorptionTargetPct / 100, absorptionMaxPts), absorptionMaxPts);

  const baseScore = learningScore + bursaryScore + disabledScore + learnershipScore;
  const totalScore = clampScore(baseScore + absorptionScore, maxPoints);

  // Sub-minimum excludes bonus points (absorption is bonus per RCOGP 2019)
  const baseMaxPoints = (learningMaxPts + bursaryMaxPts + disabledMaxPts + learnershipMaxPts);
  const subMinThresholdPoints = (subMinThreshold / 100) * baseMaxPoints;

  const subLines: SkillsSubLine[] = [
    { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(1)}% of payroll`, weighting: learningMaxPts, score: learningScore },
    { name: "Expenditure on bursaries for Black students", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: bursaryScore },
    { name: "Expenditure on learning programmes for disabled black employees", target: `${(disabledTargetPct * 100).toFixed(1)}% of payroll`, weighting: disabledMaxPts, score: disabledScore },
    { name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: `${learnershipTargetPct.toFixed(1)}% of headcount`, weighting: learnershipMaxPts, score: learnershipScore },
    { name: "Absorption of black people after learnerships, apprenticeships or internships", target: `${absorptionTargetPct.toFixed(1)}% absorption`, weighting: absorptionMaxPts, score: absorptionScore, isBonus: true },
  ];

  return {
    learningProgrammes: round2(learningScore),
    bursaries: round2(bursaryScore),
    disabledLearning: round2(disabledScore),
    learnerships: round2(learnershipScore),
    absorption: round2(absorptionScore),
    total: round2(totalScore),
    subMinimumMet: baseScore >= subMinThresholdPoints,
    categoryBreakdown: breakdown,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    rawStats: {
      blackSpend: round2(totalRecognised),
      bursarySpend: round2(spend.bursary),
      disabledSpend: round2(spend.disabled),
      learnershipCount: spend.learnershipCount,
      absorbedCount: spend.absorbedCount,
      totalBlackLearners: spend.totalBlackLearners,
      absorptionRate: absorptionRate,
      totalRecognisedSpend: round2(totalRecognised),
      targetOverall: round2(TARGET_OVERALL),
      targetBursaries: round2(TARGET_BURSARIES),
      targetDisabled: round2(TARGET_DISABLED),
    },
  };
}
