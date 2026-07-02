/**
 * @domain-rule pillar:skills_development, slides:84-94
 * @see docs/domain/pillars/03_skills_development.md
 */
import type { SkillsData, TrainingProgram, TrainingCategoryCode } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2, requireSectorConfig, resolveSectorContext, normalizeSpendFraction, isBlackRace } from './shared';
import { buildDemographicBreakdown, normalizeProvince, type DemographicBreakdown, type Province } from './eapTargets';

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
  /** Per-management-level EAP demographic breakdown keyed by spend indicator index (0–2). */
  eapBreakdowns: Record<number, Record<'senior' | 'middle' | 'junior', DemographicBreakdown[]>>;
  eapProvince: string;
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
  /** Count of unemployed Black learners — drives the AgriBEE headcount-based 2.1.2.2 indicator. */
  unemployedCount: number;
  /** Spend on Black FEMALE learners (all categories) — drives the QSE "Spend on Black women" 7-pt line. */
  blackFemaleSpend: number;
  /** Count of unemployed Black learners who completed an LAI — denominator for the
   *  ICT-Generic 2.1.3 absorption bonus, gated by absorptionBasisUnemployedLAI. */
  unemployedLAICompletedCount: number;
  byCategory: Record<TrainingCategoryCode, number>;
}

function isUnemployed(prog: TrainingProgram): boolean {
  return prog.employmentStatus === 'Unemployed' || prog.isEmployed === false;
}

function isLAIProgram(prog: TrainingProgram): boolean {
  const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
  return (
    prog.category === 'learnership' ||
    prog.category === 'internship' ||
    catCode === 'B' ||
    catCode === 'C' ||
    catCode === 'D'
  );
}

function accumulateSpend(programs: TrainingProgram[]): SpendAccumulator {
  const acc: SpendAccumulator = {
    total: 0, bursary: 0, disabled: 0, blackPeople: 0,
    learnershipCount: 0, absorbedCount: 0, totalBlackLearners: 0,
    unemployedCount: 0, blackFemaleSpend: 0, unemployedLAICompletedCount: 0,
    byCategory: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 },
  };

  for (const prog of programs) {
    // Compute black-status from race when the flag isn't set (input layers don't
    // always write isBlack), and accept totalCost when cost wasn't populated —
    // both previously caused silently-zero Skills scores.
    const isBlack = prog.isBlack ?? isBlackRace(prog.race);
    if (!isBlack) continue;

    const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
    const cost = prog.cost ?? prog.totalCost ?? 0;
    acc.byCategory[catCode] += cost;
    acc.blackPeople += cost;
    acc.totalBlackLearners++;

    if (prog.category === 'bursary' || catCode === 'A') acc.bursary += cost;
    // All programs here are Black (non-black were `continue`d above), so a Female
    // learner's spend is Black-female spend — the QSE "Spend on Black women" line.
    if (prog.gender === 'Female') acc.blackFemaleSpend += cost;
    if (prog.isDisabled) acc.disabled += cost;
    // "Number of ALL Black people participating in learnerships, apprenticeships
    // or internships" — count categories B (internship), C (apprenticeship) and
    // D (learnership). Previously only B/legacy strings counted, so selecting the
    // proper C/D codes scored zero (Polo feedback #9).
    if (isLAIProgram(prog)) {
      acc.learnershipCount++;
    }
    if (isUnemployed(prog)) acc.unemployedCount++;
    // Unemployed Black learner who completed an LAI — denominator for the ICT-Generic
    // 2.1.3 absorption bonus (toolkit basis), used when absorptionBasisUnemployedLAI.
    if (isLAIProgram(prog) && isUnemployed(prog) && prog.isCompleted) {
      acc.unemployedLAICompletedCount++;
    }
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

const SKILLS_EAP_LEVELS = ['senior', 'middle', 'junior'] as const;
type SkillsEAPLevel = (typeof SKILLS_EAP_LEVELS)[number];

const SKILLS_EAP_OCC_LEVEL: Record<SkillsEAPLevel, 'Senior' | 'Middle' | 'Junior'> = {
  senior: 'Senior',
  middle: 'Middle',
  junior: 'Junior',
};

function filterProgramsForSpendIndicator(
  programs: TrainingProgram[],
  indicatorIdx: number,
): TrainingProgram[] {
  const black = programs.filter(p => (p.isBlack ?? isBlackRace(p.race)) && !p.isForeign);
  if (indicatorIdx === 0) return black;
  if (indicatorIdx === 1) {
    return black.filter(p => p.categoryCode === 'A' || p.category === 'bursary' || p.isBursary);
  }
  if (indicatorIdx === 2) return black.filter(p => p.isDisabled);
  return [];
}

function buildSkillsEAPBreakdowns(
  programs: TrainingProgram[],
  province: Province,
  year?: number,
): Record<number, Record<SkillsEAPLevel, DemographicBreakdown[]>> {
  const result: Record<number, Record<SkillsEAPLevel, DemographicBreakdown[]>> = {};
  for (const indicatorIdx of [0, 1, 2]) {
    const filtered = filterProgramsForSpendIndicator(programs, indicatorIdx);
    const byLevel = {} as Record<SkillsEAPLevel, DemographicBreakdown[]>;
    for (const level of SKILLS_EAP_LEVELS) {
      // Province + year effective EAP (was national-only — same bug fixed in MC).
      byLevel[level] = buildDemographicBreakdown(
        filtered.map(p => ({ gender: p.gender, race: p.race })),
        province,
        year,
      );
    }
    result[indicatorIdx] = byLevel;
  }
  return result;
}

/**
 * RCOGP Generic defaults used when no sector CalculatorConfig is supplied.
 */
const SKILLS_DEFAULTS = {
  overallTarget: 0.035,
  bursaryTarget: 0.025,
  subMinThreshold: 40,
  generalMax: 6,
  bursaryMax: 4,
  disabledLearningMaxPts: 4,
  learnershipsMaxPts: 6,
  absorptionMaxPts: 5,
  learnershipTargetPercent: 5.0,
  absorptionTargetPercent: 2.5,
} as const;

/** Resolve spend-target fractions from calculator config (handles percent vs fraction). */
export function resolveSkillsSpendTargets(
  sc?: Partial<NonNullable<CalculatorConfig['skills']>>,
): { overallTargetPct: number; bursaryTargetPct: number; disabledTargetPct: number } {
  return {
    overallTargetPct: normalizeSpendFraction(
      sc?.overallSpendPercent ?? sc?.overallTarget,
      SKILLS_DEFAULTS.overallTarget,
    ),
    bursaryTargetPct: normalizeSpendFraction(
      sc?.bursarySpendPercent ?? sc?.bursaryTarget,
      SKILLS_DEFAULTS.bursaryTarget,
    ),
    disabledTargetPct: normalizeSpendFraction(sc?.disabledSpendPercent, 0.003),
  };
}

/** Apply 15% caps to training-manager salary and overhead (each vs programme spend). */
function applyAdminCosts(
  programmeRecognised: number,
  programmeUncapped: number,
  salary: number,
  overhead: number,
  adminCapPct: number = ADMIN_COST_CAP,
): { adminRecognised: number; totalRecognised: number } {
  const base = programmeUncapped > 0 ? programmeUncapped : programmeRecognised;
  if (base <= 0) return { adminRecognised: 0, totalRecognised: programmeRecognised };
  const capEach = base * adminCapPct;
  const recognisedSalary = salary > 0 ? Math.min(salary, capEach) : 0;
  const recognisedOverhead = overhead > 0 ? Math.min(overhead, capEach) : 0;
  const adminRecognised = recognisedSalary + recognisedOverhead;
  return {
    adminRecognised,
    totalRecognised: programmeRecognised + adminRecognised,
  };
}

export function calculateSkillsScore(
  data: SkillsData,
  config?: CalculatorConfig,
  eapProvince?: string,
  eapYear?: number,
): SkillsResult {
  console.log('[SCORING-TRACE] calculateSkillsScore received:', {
    leviableAmount: data.leviableAmount,
    groupLeviableAmount: data.groupLeviableAmount,
    headcount: data.headcount,
    programCount: data.trainingPrograms?.length ?? 0,
    trainingManagerSalary: data.trainingManagerSalary,
    trainingOverheadCost: data.trainingOverheadCost,
  });
  const leviableAmount =
    (data.groupLeviableAmount != null && data.groupLeviableAmount > 0)
      ? data.groupLeviableAmount
      : data.leviableAmount;
  const trainingPrograms = data.trainingPrograms || [];
  const { sectorCode, scorecardType } = resolveSectorContext(config);
  const sc = requireSectorConfig(
    sectorCode,
    'skills',
    config?.skills as Record<string, unknown> | undefined,
    scorecardType,
  ) as Partial<NonNullable<CalculatorConfig['skills']>>;

  const { overallTargetPct, bursaryTargetPct, disabledTargetPct } = resolveSkillsSpendTargets(sc);
  const fgCap = (sc as any).categoryFGCap ?? sc.categoryECap ?? CATEGORY_FG_CAP;
  const adminCap = (sc as any).adminCostCap ?? sc.categoryFCap ?? ADMIN_COST_CAP;
  const subMinThreshold = config?.pillarConfigs?.skillsDevelopment?.subMinimumPercent ?? SKILLS_DEFAULTS.subMinThreshold;
  const maxPoints = config?.pillarConfigs?.skillsDevelopment?.maxPoints ?? 25;

  const learningMaxPts = sc.learningProgrammesMaxPts ?? sc.generalMax ?? SKILLS_DEFAULTS.generalMax;
  const bursaryMaxPts = sc.bursaryMaxPts ?? sc.bursaryMax ?? SKILLS_DEFAULTS.bursaryMax;
  const disabledMaxPts = sc.disabledLearningMaxPts ?? SKILLS_DEFAULTS.disabledLearningMaxPts;
  const learnershipMaxPts = sc.learnershipsMaxPts ?? SKILLS_DEFAULTS.learnershipsMaxPts;
  const absorptionMaxPts = sc.absorptionMaxPts ?? SKILLS_DEFAULTS.absorptionMaxPts;

  const learnershipTargetPct = sc.learnershipTargetPercent ?? SKILLS_DEFAULTS.learnershipTargetPercent;
  const absorptionTargetPct = sc.absorptionTargetPercent ?? SKILLS_DEFAULTS.absorptionTargetPercent;
  // AgriBEE: the bursary slot models the "unemployed Black people in training"
  // indicator (2.1.2.2), which is scored on a headcount basis, not spend.
  const bursaryIsHeadcount = (sc as any).bursaryIsHeadcount === true;
  // QSE "Spend on Black women" (7 pts @ 1% leviable): the bursary slot measures
  // Black-FEMALE learning spend across ALL categories, not bursary-category spend
  // and not gender-blind. (DISCREPANCY-LEDGER rcogp/qse & ict/qse D-03.)
  const bursaryIsBlackFemale = (sc as any).bursaryIsBlackFemale === true;
  // ICT Generic: absorption denominator = unemployed-LAI completers, not all Black
  // learners (toolkit basis). QSE keeps the all-learners basis (open item Q-E). (ledger D-05)
  const absorptionBasisUnemployedLAI = (sc as any).absorptionBasisUnemployedLAI === true;

  const TARGET_OVERALL = leviableAmount * overallTargetPct;
  const TARGET_BURSARIES = leviableAmount * bursaryTargetPct;
  const TARGET_DISABLED = leviableAmount * disabledTargetPct;

  const spend = accumulateSpend(trainingPrograms);
  const uncappedProgrammeSpend = Object.values(spend.byCategory).reduce((a, b) => a + b, 0);
  const { totalRecognised: programmeRecognised, breakdown } = applyCapToSpend(spend.byCategory, fgCap, adminCap);
  const adminResult = applyAdminCosts(
    programmeRecognised,
    uncappedProgrammeSpend,
    data.trainingManagerSalary ?? 0,
    data.trainingOverheadCost ?? 0,
    adminCap,
  );
  const totalRecognised = adminResult.totalRecognised;

  const entityHeadcount =
    (data.headcount != null && data.headcount > 0)
      ? data.headcount
      : Math.max(spend.totalBlackLearners, 1);

  const learningScore = clampScore(safeRatio(totalRecognised, TARGET_OVERALL, learningMaxPts), learningMaxPts);
  // AgriBEE 2.1.2.2: headcount of unemployed Black learners vs (entity headcount × target%).
  const bursaryHeadcountTarget = Math.max(entityHeadcount * bursaryTargetPct, 1);
  const bursaryScore = bursaryIsHeadcount
    ? clampScore(safeRatio(spend.unemployedCount, bursaryHeadcountTarget, bursaryMaxPts), bursaryMaxPts)
    : bursaryIsBlackFemale
      ? clampScore(safeRatio(spend.blackFemaleSpend, TARGET_BURSARIES, bursaryMaxPts), bursaryMaxPts)
      : clampScore(safeRatio(spend.bursary, TARGET_BURSARIES, bursaryMaxPts), bursaryMaxPts);
  const disabledScore = clampScore(safeRatio(spend.disabled, TARGET_DISABLED, disabledMaxPts), disabledMaxPts);

  const learnershipTarget = Math.max(entityHeadcount * (learnershipTargetPct / 100), 1);
  const learnershipScore = clampScore(safeRatio(spend.learnershipCount, learnershipTarget, learnershipMaxPts), learnershipMaxPts);

  const absorptionDenominator = absorptionBasisUnemployedLAI
    ? spend.unemployedLAICompletedCount
    : spend.totalBlackLearners;
  const absorptionRate = absorptionDenominator > 0
    ? spend.absorbedCount / absorptionDenominator
    : 0;
  const absorptionScore = clampScore(safeRatio(absorptionRate, absorptionTargetPct / 100, absorptionMaxPts), absorptionMaxPts);

  const baseScore = learningScore + bursaryScore + disabledScore + learnershipScore;
  const totalScore = clampScore(baseScore + absorptionScore, maxPoints);

  // Sub-minimum excludes bonus points (absorption is bonus per RCOGP 2019)
  const baseMaxPoints = (learningMaxPts + bursaryMaxPts + disabledMaxPts + learnershipMaxPts);
  const subMinThresholdPoints = (subMinThreshold / 100) * baseMaxPoints;

  const subLines: SkillsSubLine[] = [
    { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(1)}% of payroll`, weighting: learningMaxPts, score: learningScore },
    bursaryIsHeadcount
      ? { name: "Number of unemployed Black people in training", target: `${(bursaryTargetPct * 100).toFixed(1)}% of headcount`, weighting: bursaryMaxPts, score: bursaryScore }
      : bursaryIsBlackFemale
        ? { name: "Expenditure on learning programmes for Black women", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: bursaryScore }
        : { name: "Expenditure on bursaries for Black students", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: bursaryScore },
    { name: "Expenditure on learning programmes for disabled black employees", target: `${(disabledTargetPct * 100).toFixed(1)}% of payroll`, weighting: disabledMaxPts, score: disabledScore },
    { name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: `${learnershipTargetPct.toFixed(1)}% of headcount`, weighting: learnershipMaxPts, score: learnershipScore },
    { name: "Absorption of black people after learnerships, apprenticeships or internships", target: `${absorptionTargetPct.toFixed(1)}% absorption`, weighting: absorptionMaxPts, score: absorptionScore, isBonus: true },
  ];

  const skillsTotal = round2(totalScore);
  console.log(`[SCORING-TRACE] calculateSkillsScore result: ${skillsTotal} / ${maxPoints}`);

  const province = normalizeProvince(eapProvince || 'National') as Province;
  const isQse = String(scorecardType ?? '').toUpperCase() === 'QSE';
  const eapBreakdowns = isQse
    ? {}
    : buildSkillsEAPBreakdowns(trainingPrograms, province, eapYear);

  return {
    learningProgrammes: round2(learningScore),
    bursaries: round2(bursaryScore),
    disabledLearning: round2(disabledScore),
    learnerships: round2(learnershipScore),
    absorption: round2(absorptionScore),
    total: skillsTotal,
    subMinimumMet:
      subMinThreshold > 0 ? baseScore >= subMinThresholdPoints : false,
    categoryBreakdown: breakdown,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    eapBreakdowns,
    eapProvince: province,
    rawStats: {
      blackSpend: round2(totalRecognised),
      bursarySpend: round2(bursaryIsBlackFemale ? spend.blackFemaleSpend : spend.bursary),
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
