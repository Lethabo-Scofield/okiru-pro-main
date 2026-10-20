/**
 * @domain-rule pillar:skills_development, slides:84-94
 * @see docs/domain/pillars/03_skills_development.md
 */
import type { SkillsData, TrainingProgram, TrainingCategoryCode, Employee, ManagementData } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import {
  safeRatio, clampScore, round2, requireSectorConfig, resolveSectorContext, normalizeSpendFraction,
  isBlackRace, normalizeRace, normalizeDesignationForScoring,
} from './shared';
import { buildDemographicBreakdown, getEffectiveEap, normalizeProvince, type DemographicBreakdown, type Province } from './eapTargets';
import { parseCalcDate } from './toolkitDates';

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
  /** The score before rounding to the cent (toolkit method). */
  exactScore?: number;
  isBonus?: boolean;
  /** The line's arithmetic in plain words, for the reviewer. */
  note?: string;
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
  /** The total before rounding: the scorecard adds these, as the toolkit adds full precision. */
  exactTotal?: number;
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
export const CATEGORY_LABELS: Record<TrainingCategoryCode, { label: string; examples: string }> = {
  A: { label: "Learning Institution (Degree/Diploma)", examples: "University degree with no workplace involvement" },
  B: { label: "Workplace + Learning Institution", examples: "Internship as part of qualification" },
  C: { label: "Apprenticeship (SAQA aligned)", examples: "Workplace accredited apprenticeship" },
  D: { label: "Learnership (SETA/QCTO)", examples: "Workplace experience assessed by SETA/QCTO" },
  E: { label: "Certified External Training (SETA/QCTO)", examples: "SETA/QCTO registered skills programs" },
  F: { label: "Certified Internal / Uncertified External", examples: "Workplace accredited or external unaccredited" },
  G: { label: "Uncertified Internal Training", examples: "On-the-job training (no points for non-black)" },
};

export function mapLegacyCategory(cat: TrainingProgram['category']): TrainingCategoryCode {
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

/**
 * Toolkit "Employed?" = No: the learner was Unemployed or on a Fixed-Term
 * contract when training started. Drives bursary stipends and absorption. The
 * stated status wins; the legacy isEmployed flag is read only when no status is.
 */
export function isNotEmployed(prog: TrainingProgram): boolean {
  const status = String(prog.employmentStatus ?? '').trim();
  if (status) return status === 'Unemployed' || status === 'Fixed-Term';
  return prog.isEmployed === false;
}

/**
 * Toolkit "Bursary?": a Category A row marked as a higher-education bursary.
 * Category A alone is a learning programme, not a bursary. A legacy 'bursary'
 * row is a bursary by definition.
 */
export function isBursaryProgram(prog: TrainingProgram): boolean {
  if (prog.category === 'bursary') return true;
  const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
  return catCode === 'A' && prog.isBursary === true;
}

/** Black for B-BBEE purposes: a black race and not a foreign national. */
function isBlackLearner(prog: TrainingProgram): boolean {
  return Boolean(prog.isBlack ?? isBlackRace(prog.race)) && !prog.isForeign;
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
    // both previously caused silently-zero Skills scores. A foreign national is
    // never black for B-BBEE purposes.
    if (!isBlackLearner(prog)) continue;

    const catCode = prog.categoryCode || mapLegacyCategory(prog.category);
    // Itemized components must count when no explicit total exists — direct
    // callers (workbook injection, tests) don't pass through
    // hydrateTrainingProgramFromApi, which was the only place this sum lived.
    const componentSum =
      (prog.courseCost || 0) + (prog.travelCost || 0) + (prog.accommodationCost || 0) +
      (prog.cateringCost || 0) + (prog.stationeryCost || 0) + (prog.facilityCost || 0) +
      (prog.salaryCost || 0) + (prog.otherCosts || 0);
    const explicit = prog.totalCost ?? prog.cost;
    const cost = explicit != null && explicit > 0 ? explicit : componentSum;
    acc.byCategory[catCode] += cost;
    acc.blackPeople += cost;
    acc.totalBlackLearners++;

    if (isBursaryProgram(prog)) acc.bursary += cost;
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
    // Unemployed (or fixed-term) Black learner who completed an LAI — denominator for
    // the ICT-Generic 2.1.3 absorption bonus (toolkit basis), used when
    // absorptionBasisUnemployedLAI. The toolkit counts Fixed-Term as not employed.
    if (isLAIProgram(prog) && isNotEmployed(prog) && prog.isCompleted) {
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
  const black = programs.filter(isBlackLearner);
  if (indicatorIdx === 0) return black;
  if (indicatorIdx === 1) return black.filter(isBursaryProgram);
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

// ---------------------------------------------------------------------------
// Toolkit method (skills.method = 'toolkit') — the Empower toolkit's arithmetic
// (RCOGP Generic template: tblSkillsData computed columns → 'Skills Calcs' →
// 'Skills Toolkit'), verified line by line against the toolkit recalculated in
// Excel. The original method below stays the default for every other sector.
// ---------------------------------------------------------------------------

const BLACK_DEMOS = ['AM', 'CM', 'IM', 'AF', 'CF', 'IF'] as const;
type BlackDemo = (typeof BLACK_DEMOS)[number];

const DEMO_LABEL: Record<BlackDemo, string> = {
  AM: 'African male', CM: 'Coloured male', IM: 'Indian male',
  AF: 'African female', CF: 'Coloured female', IF: 'Indian female',
};

/** Toolkit Race.calcs + Gender.calcs → one of the six black groups (null if either is unknown). */
function blackDemographic(race: string | null | undefined, gender: string | null | undefined): BlackDemo | null {
  const r = normalizeRace(race);
  const prefix = r === 'African' ? 'A' : r === 'Coloured' ? 'C' : r === 'Indian' ? 'I' : '';
  const g = String(gender ?? '').trim().toLowerCase();
  const suffix = g === 'male' || g === 'm' ? 'M' : g === 'female' || g === 'f' ? 'F' : '';
  return prefix && suffix ? (`${prefix}${suffix}` as BlackDemo) : null;
}

/**
 * The toolkit's workforce figures for Skills, from the Management Control
 * register: the headcount is every employee except non-executive directors;
 * each black group's share is its black South African employees over that
 * headcount (toolkit 'Employee Demographics' row 2), and PWD is the share of
 * black employees with disabilities. Training-admin costs are shared out by these.
 */
export function skillsWorkforceFromManagement(
  employees: ReadonlyArray<Employee> | undefined,
): { headcount: number; shares: Record<string, number> } {
  const staff = (employees ?? []).filter(e => normalizeDesignationForScoring(e.designation) !== 'Board');
  const counts: Record<string, number> = { AM: 0, CM: 0, IM: 0, AF: 0, CF: 0, IF: 0, PWD: 0 };
  for (const e of staff) {
    if (e.isForeign || !isBlackRace(e.race)) continue;
    const d = blackDemographic(e.race, e.gender);
    if (d) counts[d]++;
    if (e.isDisabled) counts.PWD++;
  }
  const n = staff.length;
  const shares: Record<string, number> = {};
  for (const k of Object.keys(counts)) shares[k] = n > 0 ? counts[k] / n : 0;
  return { headcount: n, shares };
}

/**
 * Skills input with the workforce filled in from Management Control: the
 * headcount when none was entered, and the workforce shares when none were
 * supplied. Whatever the client entered wins.
 */
export function withSkillsWorkforce(skills: SkillsData, management?: Pick<ManagementData, 'employees'> | null): SkillsData {
  const wf = skillsWorkforceFromManagement(management?.employees);
  return {
    ...skills,
    headcount: skills.headcount != null && skills.headcount > 0 ? skills.headcount : wf.headcount,
    workforceShares: skills.workforceShares ?? wf.shares,
  };
}

interface ToolkitRow {
  /** '' when the row has no recognised category (it then counts in no category bucket). */
  catCode: TrainingCategoryCode | '';
  black: boolean;
  demo: BlackDemo | null;
  disabled: boolean;
  bursary: boolean;
  lai: boolean;
  /** Toolkit "Employed?" = No (unemployed or on a fixed-term contract). */
  notEmployed: boolean;
  completed: boolean;
  /** Learnership/apprenticeship/internship completed by an unemployed or fixed-term learner who was absorbed. */
  absorbedLai: boolean;
  /** Course cost, categories A–E (bursaries excluded). */
  ae: number;
  /** Course cost, categories F & G (bursaries excluded). */
  fg: number;
  /** Salary / stipend, categories B, C, D only (bursaries excluded). */
  bcd: number;
  /** Travel, accommodation, catering, stationery, facility and other costs (bursaries excluded). */
  oth: number;
  /** Bursary spend: course cost, the stipend of a learner who was not employed, and other costs. */
  bursarySpend: number;
}

const ALL_CATEGORIES: TrainingCategoryCode[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function toolkitRow(prog: TrainingProgram): ToolkitRow {
  const raw = String(prog.categoryCode || mapLegacyCategory(prog.category)).trim().toUpperCase();
  const catCode: TrainingCategoryCode | '' = (ALL_CATEGORIES as string[]).includes(raw) ? (raw as TrainingCategoryCode) : '';
  const other =
    (prog.travelCost || 0) + (prog.accommodationCost || 0) + (prog.cateringCost || 0) +
    (prog.stationeryCost || 0) + (prog.facilityCost || 0) + (prog.otherCosts || 0);
  let course = prog.courseCost || 0;
  const salary = prog.salaryCost || 0;
  // A row that carries only a lump-sum cost (older records, summary imports) is
  // read as its course cost — the toolkit has no column for an unsplit total.
  if (course === 0 && salary === 0 && other === 0) {
    const lump = prog.totalCost ?? prog.cost ?? 0;
    if (lump > 0) course = lump;
  }
  const bursary = isBursaryProgram(prog);
  const notEmployed = isNotEmployed(prog);
  const black = isBlackLearner(prog);
  const isBCD = catCode === 'B' || catCode === 'C' || catCode === 'D';
  // Toolkit LAI: category B/C/D and not marked as a higher-education bursary.
  const lai = isBCD && !prog.isBursary && prog.category !== 'bursary';
  return {
    catCode,
    black,
    demo: black ? blackDemographic(prog.race, prog.gender) : null,
    disabled: Boolean(prog.isDisabled),
    bursary,
    lai,
    notEmployed,
    completed: Boolean(prog.isCompleted),
    absorbedLai: lai && notEmployed && Boolean(prog.isCompleted) && Boolean(prog.isAbsorbed),
    ae: !bursary && catCode !== '' && catCode !== 'F' && catCode !== 'G' ? course : 0,
    fg: !bursary && (catCode === 'F' || catCode === 'G') ? course : 0,
    bcd: !bursary && isBCD ? salary : 0,
    oth: !bursary ? other : 0,
    bursarySpend: bursary ? course + (notEmployed ? salary : 0) + other : 0,
  };
}

const fmtRand = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  return `R${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtPct = (f: number): string => `${(f * 100).toFixed(1)}%`;

/** min(actual ÷ target × max, max); 0 when the target is zero (the toolkit's IFERROR). */
function cappedRatio(actual: number, target: number, max: number): number {
  if (!(target > 0) || !(max > 0)) return 0;
  return Math.min((actual / target) * max, max);
}

interface ToolkitParams {
  leviable: number;
  headcount: number;
  province: Province;
  eapYear?: number;
  overallTargetPct: number;
  bursaryTargetPct: number;
  disabledTargetPct: number;
  learningMaxPts: number;
  bursaryMaxPts: number;
  disabledMaxPts: number;
  learnershipMaxPts: number;
  absorptionMaxPts: number;
  learnershipTargetPct: number;
  absorptionTargetPct: number;
  fgCap: number;
  adminCap: number;
  /** Share of training-admin costs recognised (RCOGP: the other-cost cap). */
  adminShare: number;
  /** AgriBEE: one cap over F & G course costs and other costs together. */
  combinedOtherCap?: number;
  /** AgriBEE: the bursary slot counts unemployed black learners in learnerships. */
  unemployedLearnersLine: boolean;
  /** AgriBEE: absorption over black learners who completed a learnership. */
  absorptionLaiCompleters: boolean;
  /** Only training ending after this date counts ('Skills Data'[Within FY?]). */
  periodStart: Date | null;
  /** A scarce-and-critical declaration answered "No" (AgriBEE 'Skills Toolkit'!D10 / D11). */
  spendGated: boolean;
  headcountGated: boolean;
}

const DAY_MS = 86_400_000;

/**
 * 'Skills Data'[Within FY?]: the toolkit's End Date is the end entered less a
 * day (a year after the start when none is entered; the start defaults to the
 * period start), and the row counts when that is after the period start.
 */
function endsAfterPeriodStart(prog: TrainingProgram, periodStart: Date): boolean {
  const start = parseCalcDate(prog.startDate) ?? periodStart;
  const endInput = parseCalcDate(prog.endDate);
  const end = endInput
    ? new Date(endInput.getTime() - DAY_MS)
    : new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()) - DAY_MS);
  return end.getTime() > periodStart.getTime();
}

interface ToolkitOutcome {
  learning: number;
  bursary: number;
  disabled: number;
  learnerships: number;
  absorption: number;
  notes: [string, string, string, string, string];
  categoryBreakdown: CategoryBreakdown[];
  rawStats: Omit<SkillsResult['rawStats'], 'targetOverall' | 'targetBursaries' | 'targetDisabled'>;
}

function scoreToolkitMethod(data: SkillsData, p: ToolkitParams): ToolkitOutcome {
  const allPrograms = data.trainingPrograms || [];
  const periodStart = p.periodStart;
  const programs = periodStart ? allPrograms.filter(prog => endsAfterPeriodStart(prog, periodStart)) : allPrograms;
  const rows = programs.map(toolkitRow);
  const eap = getEffectiveEap(p.province, p.eapYear);
  const shares = data.workforceShares ?? {};
  const adminCosts = (data.trainingManagerSalary ?? 0) + (data.trainingOverheadCost ?? 0);

  // All training spend, every learner of every race (bursaries excluded) —
  // the base the F & G and other-cost caps are measured against.
  const allSpend = rows.reduce((a, r) => a + r.ae + r.fg + r.bcd + r.oth, 0);
  const sum = (rs: ToolkitRow[], f: (r: ToolkitRow) => number) => rs.reduce((a, r) => a + f(r), 0);
  const byDemo = (d: BlackDemo) => rows.filter(r => r.demo === d);

  // Recognised share of each row's F&G and other costs once its group's caps
  // apply — used to show the per-category view on the same footing as the score.
  const fgFactor: Record<string, number> = {};
  const othFactor: Record<string, number> = {};

  // 2.1.1.1 Learning programmes — per black group, against its EAP share.
  let learning = 0;
  let learningRecognised = 0;
  const learningParts: string[] = [];
  for (const d of BLACK_DEMOS) {
    const e = eap[d] ?? 0;
    const g = byDemo(d);
    const fg = sum(g, r => r.fg);
    const oth = sum(g, r => r.oth);
    let fgRecognised: number;
    let othRecognised: number;
    if (p.combinedOtherCap != null) {
      // AgriBEE: F & G course costs and other costs share one cap.
      const capped = Math.min(fg + oth, allSpend * p.combinedOtherCap * e);
      const kept = fg + oth > 0 ? capped / (fg + oth) : 1;
      fgRecognised = fg * kept;
      othRecognised = oth * kept;
    } else {
      fgRecognised = Math.min(fg, allSpend * p.fgCap * e);
      othRecognised = Math.min(oth, allSpend * p.adminCap * e);
    }
    fgFactor[d] = fg > 0 ? fgRecognised / fg : 1;
    othFactor[d] = oth > 0 ? othRecognised / oth : 1;
    const admin = p.adminShare * adminCosts * (shares[d] ?? 0);
    const recognised = sum(g, r => r.ae + r.bcd) + fgRecognised + admin + othRecognised;
    const target = p.leviable * p.overallTargetPct * e;
    const max = p.learningMaxPts * e;
    const pts = cappedRatio(recognised, target, max);
    learning += pts;
    learningRecognised += recognised;
    if (recognised > 0) {
      learningParts.push(`${DEMO_LABEL[d]} ${fmtRand(recognised)} ÷ ${fmtRand(target)} → ${pts.toFixed(2)} of ${max.toFixed(2)}`);
    }
  }
  const capText = p.combinedOtherCap != null
    ? `F & G course costs and other costs together are capped at ${fmtPct(p.combinedOtherCap)} `
    : `Bursaries are scored on their own line. F & G course costs are capped at ${fmtPct(p.fgCap)} and other costs at ${fmtPct(p.adminCap)} `;
  const learningNote =
    `Each black group is measured against its effective-EAP share of ${fmtPct(p.overallTargetPct)} × ${fmtRand(p.leviable)} leviable ` +
    `and can earn up to its share of ${fmtNum(p.learningMaxPts)} points. ` +
    (learningParts.length ? `${learningParts.join('; ')}. ` : 'No recognised spend on black learners. ') +
    capText +
    `of all training spend (${fmtRand(allSpend)}), per group share` +
    (adminCosts > 0 ? `; ${fmtPct(p.adminShare)} of training-admin costs (${fmtRand(adminCosts)}) is shared by the black workforce mix.` : '.');

  // 2.1.1.2 Bursaries — black Category A bursary rows, per group; no caps.
  // (AgriBEE: unemployed black learners in learnerships, per group, by headcount.)
  let bursary = 0;
  let bursaryRecognised = 0;
  const bursaryParts: string[] = [];
  for (const d of BLACK_DEMOS) {
    const e = eap[d] ?? 0;
    const amount = p.unemployedLearnersLine
      ? byDemo(d).filter(r => r.lai && r.notEmployed).length
      : sum(byDemo(d), r => r.bursarySpend);
    const target = p.unemployedLearnersLine ? p.headcount * p.bursaryTargetPct * e : p.leviable * p.bursaryTargetPct * e;
    const max = p.bursaryMaxPts * e;
    const pts = cappedRatio(amount, target, max);
    bursary += pts;
    bursaryRecognised += amount;
    if (amount > 0) {
      bursaryParts.push(p.unemployedLearnersLine
        ? `${DEMO_LABEL[d]} ${amount} ÷ ${target.toFixed(2)} → ${pts.toFixed(2)} of ${max.toFixed(2)}`
        : `${DEMO_LABEL[d]} ${fmtRand(amount)} ÷ ${fmtRand(target)} → ${pts.toFixed(2)} of ${max.toFixed(2)}`);
    }
  }
  const bursaryNote = p.unemployedLearnersLine
    ? (p.headcount > 0
      ? `Unemployed black learners in categories B, C and D, each group against its EAP share of ` +
        `${fmtPct(p.bursaryTargetPct)} × ${fmtNum(p.headcount)} headcount: ` +
        (bursaryParts.length ? `${bursaryParts.join('; ')}.` : 'none recorded.')
      : 'No headcount, so this line cannot score.')
    : `Category A rows marked as higher-education bursaries for black students, each group against its EAP share of ` +
      `${fmtPct(p.bursaryTargetPct)} × ${fmtRand(p.leviable)}: ` +
      (bursaryParts.length ? `${bursaryParts.join('; ')}.` : 'none recorded.') +
      ` A stipend counts only for a learner who was unemployed or on a fixed-term contract.`;

  // 2.1.1.3 Disabled learners — one pool of black learners with disabilities, no EAP split.
  const dis = rows.filter(r => r.black && r.disabled);
  const disFg = p.combinedOtherCap != null
    ? Math.min(sum(dis, r => r.fg + r.oth), allSpend * p.combinedOtherCap)
    : Math.min(sum(dis, r => r.fg), allSpend * p.fgCap);
  const disOth = p.combinedOtherCap != null ? 0 : Math.min(sum(dis, r => r.oth), allSpend * p.adminCap);
  const disAdmin = p.adminShare * adminCosts * (shares.PWD ?? 0);
  const disabledRecognised = sum(dis, r => r.ae + r.bcd) + disFg + disAdmin + disOth;
  const disabledTarget = p.leviable * p.disabledTargetPct;
  let disabled = cappedRatio(disabledRecognised, disabledTarget, p.disabledMaxPts);
  const disabledNote =
    `Black learners with disabilities: ${fmtRand(disabledRecognised)} recognised ÷ ${fmtRand(disabledTarget)} ` +
    `(${fmtPct(p.disabledTargetPct)} × ${fmtRand(p.leviable)}) × ${fmtNum(p.disabledMaxPts)} = ${disabled.toFixed(2)} (max ${fmtNum(p.disabledMaxPts)}).`;

  // 2.1.2.1 Learnerships, apprenticeships, internships — headcount per black group.
  let learnerships = 0;
  let learnershipCount = 0;
  const laiParts: string[] = [];
  for (const d of BLACK_DEMOS) {
    const e = eap[d] ?? 0;
    const k = byDemo(d).filter(r => r.lai).length;
    const target = p.headcount * (p.learnershipTargetPct / 100) * e;
    const max = p.learnershipMaxPts * e;
    const pts = cappedRatio(k, target, max);
    learnerships += pts;
    learnershipCount += k;
    if (k > 0) laiParts.push(`${DEMO_LABEL[d]} ${k} ÷ ${target.toFixed(2)} → ${pts.toFixed(2)} of ${max.toFixed(2)}`);
  }
  const learnershipNote = p.headcount > 0
    ? `Black learners in categories B, C and D (employed or not), each group against its EAP share of ` +
      `${fmtNum(p.learnershipTargetPct)}% × ${fmtNum(p.headcount)} headcount: ` +
      (laiParts.length ? `${laiParts.join('; ')}.` : 'none recorded.')
    : 'No headcount, so this line cannot score.';

  // Absorption bonus — total level, no EAP split.
  let absorbedCount: number;
  let absorptionRate: number;
  let absorption: number;
  let absorptionNote: string;
  if (p.absorptionLaiCompleters) {
    // AgriBEE ('Skills Calcs'!J53): over every black learner who completed one.
    absorbedCount = rows.filter(r => r.black && r.absorbedLai).length;
    const completers = rows.filter(r => r.black && r.lai && r.completed).length;
    absorptionRate = completers > 0 ? absorbedCount / completers : 0;
    absorption = cappedRatio(absorptionRate, p.absorptionTargetPct / 100, p.absorptionMaxPts);
    absorptionNote = completers > 0
      ? `${absorbedCount} unemployed black learner(s) completed a learnership, apprenticeship or internship and were absorbed, ` +
        `of ${completers} black learner(s) who completed one: ${fmtPct(absorptionRate)} vs ${fmtNum(p.absorptionTargetPct)}% target ` +
        `→ ${absorption.toFixed(2)} (max ${fmtNum(p.absorptionMaxPts)}).`
      : 'No black learner completed a learnership, apprenticeship or internship, so this line cannot score.';
  } else {
    absorbedCount = rows.filter(r => r.demo !== null && r.absorbedLai).length;
    absorptionRate = p.headcount > 0 ? absorbedCount / p.headcount : 0;
    absorption = cappedRatio(absorptionRate, p.absorptionTargetPct / 100, p.absorptionMaxPts);
    absorptionNote = p.headcount > 0
      ? `${absorbedCount} unemployed or fixed-term black learner(s) completed a learnership, apprenticeship or internship and were absorbed: ` +
        `${absorbedCount} ÷ ${fmtNum(p.headcount)} headcount = ${fmtPct(absorptionRate)} vs ${fmtNum(p.absorptionTargetPct)}% target ` +
        `→ ${absorption.toFixed(2)} (max ${fmtNum(p.absorptionMaxPts)}).`
      : 'No headcount, so this line cannot score.';
  }

  // AgriBEE scarce-and-critical-skills declarations: a "No" scores the lines it governs 0.
  const notes: [string, string, string, string, string] = [learningNote, bursaryNote, disabledNote, learnershipNote, absorptionNote];
  const gateNote = (what: string) => ` Scored 0: the declaration that at least 85% of black learners' ${what} is in scarce and critical skills was answered "No".`;
  if (p.spendGated) {
    learning = 0;
    disabled = 0;
    notes[0] += gateNote('training spend');
    notes[2] += gateNote('training spend');
    if (!p.unemployedLearnersLine) { bursary = 0; notes[1] += gateNote('training spend'); }
  }
  if (p.headcountGated) {
    learnerships = 0;
    absorption = 0;
    notes[3] += gateNote('headcount');
    notes[4] += gateNote('headcount');
    if (p.unemployedLearnersLine) { bursary = 0; notes[1] += gateNote('headcount'); }
  }

  // Per-category view of black learners' spend, on the same footing as the score.
  const spendByCat: Record<string, number> = {};
  const recognisedByCat: Record<string, number> = {};
  for (const r of rows) {
    if (!r.black || !r.catCode) continue;
    const spend = r.ae + r.fg + r.bcd + r.oth + r.bursarySpend;
    const recognised = r.demo
      ? r.ae + r.bcd + r.fg * fgFactor[r.demo] + r.oth * othFactor[r.demo] + r.bursarySpend
      : 0;
    spendByCat[r.catCode] = (spendByCat[r.catCode] ?? 0) + spend;
    recognisedByCat[r.catCode] = (recognisedByCat[r.catCode] ?? 0) + recognised;
  }
  const categoryBreakdown: CategoryBreakdown[] = ALL_CATEGORIES.map(code => {
    const spend = spendByCat[code] ?? 0;
    const recognisedSpend = recognisedByCat[code] ?? 0;
    const isFG = code === 'F' || code === 'G';
    return {
      code,
      label: CATEGORY_LABELS[code].label,
      examples: CATEGORY_LABELS[code].examples,
      spend,
      recognisedSpend,
      cap: isFG ? p.fgCap : undefined,
      capApplied: recognisedSpend < spend - 0.005,
    };
  });

  return {
    learning,
    bursary,
    disabled,
    learnerships,
    absorption,
    notes,
    categoryBreakdown,
    rawStats: {
      blackSpend: round2(learningRecognised),
      // A rand figure; the AgriBEE unemployed-learners line counts heads, not rand.
      bursarySpend: p.unemployedLearnersLine ? 0 : round2(bursaryRecognised),
      disabledSpend: round2(disabledRecognised),
      learnershipCount,
      absorbedCount,
      totalBlackLearners: rows.filter(r => r.black).length,
      absorptionRate,
      totalRecognisedSpend: round2(learningRecognised),
    },
  };
}

// ---------------------------------------------------------------------------
// QSE toolkit method (skills.method = 'toolkit_qse') — the Empower RCOGP QSE
// v1.1 and ICT QSE v1.1 templates, whose Skills arithmetic is the same
// (tblSkillsData computed columns → 'Skills Calcs' rows 7, 14, 21 and 28),
// checked line by line against each workbook recalculated in Excel. No EAP
// split. Each spend line takes, for its learners:
//   course costs of categories A–E + stipends of categories B, C, D
//   + F & G course costs and every row's other costs, capped together at 15%
//     of ALL training spend (every learner, every race)
//   + 15% of the training manager's salary and training overheads, shared by
//     the line's group's share of the workforce,
// against target × leviable amount. The absorption bonus counts the black
// learners absorbed after a learnership, apprenticeship or internship they
// completed while not employed ("Employed?" = No: unemployed or on a
// fixed-term contract), over the sector's chosen denominator
// (skills.absorptionBasis):
//   'unemployedLaiCompleters' (RCOGP QSE, and the default): every learner who
//     completed one while not employed — the template's own headcount cell
//     (D28); its formula divides by all absorbed learners instead
//     (docs/toolkits/parity/findings/rcogp_qse.md);
//   'absorbedLearners' (ICT QSE): every absorbed learner, i.e. the black share
//     of those absorbed — the formula as written, pending the expert's ruling
//     (docs/toolkits/parity/findings/ict_qse.md).
// ---------------------------------------------------------------------------

/** 'Skills Calcs'!O7: F & G course costs and other costs together, capped at 15% of all training spend; the same 15% of training-admin costs is shared out. */
const QSE_TOOLKIT_CAP = 0.15;

interface QseRow {
  black: boolean;
  female: boolean;
  disabled: boolean;
  /** Category B, C or D (the toolkit's LAI). */
  lai: boolean;
  notEmployed: boolean;
  completed: boolean;
  absorbed: boolean;
  /** 'Cat A - E Course Cost' + 'Cat BCD Stipends/Salaries'. */
  direct: number;
  /** 'Cat F & G and Other Costs'. */
  fgOther: number;
  catCode: TrainingCategoryCode | '';
}

function qseRow(prog: TrainingProgram): QseRow {
  const raw = String(prog.categoryCode || mapLegacyCategory(prog.category)).trim().toUpperCase();
  const catCode: TrainingCategoryCode | '' = (ALL_CATEGORIES as string[]).includes(raw) ? (raw as TrainingCategoryCode) : '';
  const other =
    (prog.travelCost || 0) + (prog.accommodationCost || 0) + (prog.cateringCost || 0) +
    (prog.stationeryCost || 0) + (prog.facilityCost || 0) + (prog.otherCosts || 0);
  let course = prog.courseCost || 0;
  const salary = prog.salaryCost || 0;
  // A row that carries only a lump-sum cost is read as its course cost.
  if (course === 0 && salary === 0 && other === 0) {
    const lump = prog.totalCost ?? prog.cost ?? 0;
    if (lump > 0) course = lump;
  }
  const isFG = catCode === 'F' || catCode === 'G';
  const isBCD = catCode === 'B' || catCode === 'C' || catCode === 'D';
  return {
    black: isBlackLearner(prog),
    female: String(prog.gender ?? '').trim() === 'Female',
    disabled: Boolean(prog.isDisabled),
    lai: isBCD,
    notEmployed: isNotEmployed(prog),
    completed: Boolean(prog.isCompleted),
    absorbed: Boolean(prog.isAbsorbed),
    direct: (catCode !== '' && !isFG ? course : 0) + (isBCD ? salary : 0),
    fgOther: (isFG ? course : 0) + other,
    catCode,
  };
}

type QseAbsorptionBasis = 'unemployedLaiCompleters' | 'absorbedLearners';

interface QseOutcome {
  learning: number;
  female: number;
  disabled: number;
  absorption: number;
  notes: [string, string, string, string];
  recognised: [number, number, number];
  absorbed: number;
  absorptionDenominator: number;
  learnershipCount: number;
  totalBlackLearners: number;
  categoryBreakdown: CategoryBreakdown[];
}

function scoreToolkitQseMethod(
  data: SkillsData,
  p: {
    leviable: number;
    targets: [number, number, number];
    maxPts: [number, number, number];
    absorptionMaxPts: number;
    absorptionTargetPct: number;
    absorptionBasis: QseAbsorptionBasis;
  },
): QseOutcome {
  const rows = (data.trainingPrograms || []).map(qseRow);
  const shares = data.workforceShares ?? {};
  const share = (keys: string[]) => keys.reduce((a, k) => a + (shares[k] ?? 0), 0);
  const adminCosts = (data.trainingManagerSalary ?? 0) + (data.trainingOverheadCost ?? 0);
  const allSpend = rows.reduce((a, r) => a + r.direct + r.fgOther, 0);
  const capAmount = allSpend * QSE_TOOLKIT_CAP;

  const groups: Array<{ label: string; pick: (r: QseRow) => boolean; workforce: number }> = [
    { label: 'black learners', pick: (r) => r.black, workforce: share(['AM', 'CM', 'IM', 'AF', 'CF', 'IF']) },
    { label: 'black women', pick: (r) => r.black && r.female, workforce: share(['AF', 'CF', 'IF']) },
    { label: 'black learners with disabilities', pick: (r) => r.black && r.disabled, workforce: shares.PWD ?? 0 },
  ];
  const points: number[] = [];
  const recognised: number[] = [];
  const notes: string[] = [];
  groups.forEach((g, i) => {
    const sel = rows.filter(g.pick);
    const direct = sel.reduce((a, r) => a + r.direct, 0);
    const fgOther = sel.reduce((a, r) => a + r.fgOther, 0);
    const fgRecognised = Math.min(fgOther, capAmount);
    const admin = QSE_TOOLKIT_CAP * adminCosts * g.workforce;
    const total = direct + fgRecognised + admin;
    const target = p.leviable * p.targets[i];
    const pts = cappedRatio(total, target, p.maxPts[i]);
    points.push(pts);
    recognised.push(total);
    notes.push(
      `Spend on ${g.label}: course costs (A–E) and B/C/D stipends ${fmtRand(direct)}` +
      ` + F & G and other costs ${fmtRand(fgRecognised)}${fgRecognised < fgOther - 0.005 ? ` (of ${fmtRand(fgOther)}, capped at ${fmtPct(QSE_TOOLKIT_CAP)} of all training spend ${fmtRand(allSpend)})` : ''}` +
      (admin > 0 ? ` + ${fmtPct(QSE_TOOLKIT_CAP)} of training-admin costs × ${fmtPct(g.workforce)} workforce share ${fmtRand(admin)}` : '') +
      ` = ${fmtRand(total)} ÷ ${fmtRand(target)} (${fmtPct(p.targets[i])} × ${fmtRand(p.leviable)}) × ${fmtNum(p.maxPts[i])} = ${pts.toFixed(2)} (max ${fmtNum(p.maxPts[i])}).`,
    );
  });

  // Learners who completed a learnership, apprenticeship or internship while not employed.
  const completers = rows.filter((r) => r.lai && r.completed && r.notEmployed);
  const absorbedAll = completers.filter((r) => r.absorbed);
  const absorbed = absorbedAll.filter((r) => r.black).length;
  const denominator = p.absorptionBasis === 'absorbedLearners' ? absorbedAll.length : completers.length;
  const absorptionRate = denominator > 0 ? absorbed / denominator : 0;
  const absorption = cappedRatio(absorptionRate, p.absorptionTargetPct / 100, p.absorptionMaxPts);
  const working = `= ${fmtPct(absorptionRate)} vs ${fmtNum(p.absorptionTargetPct)}% → ${absorption.toFixed(2)} (max ${fmtNum(p.absorptionMaxPts)}).`;
  notes.push(p.absorptionBasis === 'absorbedLearners'
    ? (denominator > 0
      ? `${absorbed} of the ${denominator} learner(s) absorbed after completing a learnership, apprenticeship or internship while not employed are black ${working}`
      : 'No learner who completed a learnership, apprenticeship or internship while not employed was absorbed.')
    : (denominator > 0
      ? `${absorbed} black learner(s) absorbed of ${denominator} who completed a learnership, apprenticeship or internship while not employed ${working}`
      : 'No learner completed a learnership, apprenticeship or internship while not employed, so nothing could be absorbed.'));

  // Per-category view of black learners' spend; F & G and other costs scaled by the cap.
  const black = rows.filter((r) => r.black);
  const blackFgOther = black.reduce((a, r) => a + r.fgOther, 0);
  const fgFactor = blackFgOther > 0 ? Math.min(blackFgOther, capAmount) / blackFgOther : 1;
  const categoryBreakdown: CategoryBreakdown[] = ALL_CATEGORIES.map((code) => {
    const rs = black.filter((r) => r.catCode === code);
    const spend = rs.reduce((a, r) => a + r.direct + r.fgOther, 0);
    const recognisedSpend = rs.reduce((a, r) => a + r.direct + r.fgOther * fgFactor, 0);
    return {
      code,
      label: CATEGORY_LABELS[code].label,
      examples: CATEGORY_LABELS[code].examples,
      spend,
      recognisedSpend,
      cap: code === 'F' || code === 'G' ? QSE_TOOLKIT_CAP : undefined,
      capApplied: recognisedSpend < spend - 0.005,
    };
  });

  return {
    learning: points[0], female: points[1], disabled: points[2], absorption,
    notes: notes as [string, string, string, string],
    recognised: recognised as [number, number, number],
    absorbed,
    absorptionDenominator: denominator,
    learnershipCount: black.filter((r) => r.lai).length,
    totalBlackLearners: black.length,
    categoryBreakdown,
  };
}

export function calculateSkillsScore(
  data: SkillsData,
  config?: CalculatorConfig,
  eapProvince?: string,
  eapYear?: number,
): SkillsResult {
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
  // No configured sub-minimum means NO sub-minimum — not the generic 40%.
  // Legacy-code sectors (Transport) set 0 or omit it; defaulting to 40 made
  // them dischargeable against a rule their code does not contain.
  // (Audit 2026-07-26 item 15.)
  const subMinThreshold = config?.pillarConfigs?.skillsDevelopment?.subMinimumPercent ?? 0;
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
  // Absorbed learners against the entity headcount (the Empower toolkit's basis).
  const absorptionBasisHeadcount = sc.absorptionBasis === 'headcount';

  const TARGET_OVERALL = leviableAmount * overallTargetPct;
  const TARGET_BURSARIES = leviableAmount * bursaryTargetPct;
  const TARGET_DISABLED = leviableAmount * disabledTargetPct;

  const subMinimumMetFor = (base: number) =>
    subMinThreshold > 0 ? base >= (subMinThreshold / 100) * (learningMaxPts + bursaryMaxPts + disabledMaxPts + learnershipMaxPts) : true;
  const province = normalizeProvince(eapProvince || 'National') as Province;
  const isQse = String(scorecardType ?? '').toUpperCase() === 'QSE';

  if (sc.method === 'toolkit_qse') {
    const absorptionBasis: QseAbsorptionBasis =
      sc.absorptionBasis === 'absorbedLearners' ? 'absorbedLearners' : 'unemployedLaiCompleters';
    const q = scoreToolkitQseMethod(data, {
      leviable: leviableAmount > 0 ? leviableAmount : 0,
      targets: [overallTargetPct, bursaryTargetPct, disabledTargetPct],
      maxPts: [learningMaxPts, bursaryMaxPts, disabledMaxPts],
      absorptionMaxPts,
      absorptionTargetPct,
      absorptionBasis,
    });
    const base = q.learning + q.female + q.disabled;
    const lines: SkillsSubLine[] = [
      { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(2)}% of payroll`, weighting: learningMaxPts, score: q.learning, note: q.notes[0] },
      { name: "Expenditure on learning programmes for Black women", target: `${(bursaryTargetPct * 100).toFixed(2)}% of payroll`, weighting: bursaryMaxPts, score: q.female, note: q.notes[1] },
      { name: "Expenditure on learning programmes for disabled black employees", target: `${(disabledTargetPct * 100).toFixed(2)}% of payroll`, weighting: disabledMaxPts, score: q.disabled, note: q.notes[2] },
      ...(learnershipMaxPts > 0
        ? [{ name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: `${learnershipTargetPct.toFixed(1)}% of headcount`, weighting: learnershipMaxPts, score: 0 }]
        : []),
      {
        name: "Absorption of black people after learnerships, apprenticeships or internships",
        target: `${absorptionTargetPct.toFixed(0)}% ${absorptionBasis === 'absorbedLearners' ? 'of absorbed learners' : 'of unemployed completers'}`,
        weighting: absorptionMaxPts, score: q.absorption, isBonus: true, note: q.notes[3],
      },
    ];
    return {
      learningProgrammes: round2(q.learning),
      bursaries: round2(q.female),
      disabledLearning: round2(q.disabled),
      learnerships: 0,
      absorption: round2(q.absorption),
      total: round2(clampScore(base + q.absorption, maxPoints)),
      exactTotal: clampScore(base + q.absorption, maxPoints),
      subMinimumMet: subMinimumMetFor(base),
      categoryBreakdown: q.categoryBreakdown,
      subLines: lines.map(l => ({ ...l, score: round2(l.score) })),
      eapBreakdowns: {},
      eapProvince: province,
      rawStats: {
        blackSpend: round2(q.recognised[0]),
        bursarySpend: round2(q.recognised[1]),
        disabledSpend: round2(q.recognised[2]),
        learnershipCount: q.learnershipCount,
        absorbedCount: q.absorbed,
        totalBlackLearners: q.totalBlackLearners,
        absorptionRate: q.absorptionDenominator > 0 ? q.absorbed / q.absorptionDenominator : 0,
        totalRecognisedSpend: round2(q.recognised[0]),
        targetOverall: round2(TARGET_OVERALL),
        targetBursaries: round2(TARGET_BURSARIES),
        targetDisabled: round2(TARGET_DISABLED),
      },
    };
  }

  if (sc.method === 'toolkit') {
    // No fallbacks: a missing headcount or leviable amount scores the lines
    // that depend on it 0, as the toolkit's IFERROR does.
    const headcount = data.headcount != null && data.headcount > 0 ? data.headcount : 0;
    const t = scoreToolkitMethod(data, {
      leviable: leviableAmount > 0 ? leviableAmount : 0,
      headcount,
      province,
      eapYear,
      overallTargetPct, bursaryTargetPct, disabledTargetPct,
      learningMaxPts, bursaryMaxPts, disabledMaxPts, learnershipMaxPts, absorptionMaxPts,
      learnershipTargetPct, absorptionTargetPct,
      fgCap, adminCap,
      adminShare: typeof sc.adminCostShare === 'number' ? sc.adminCostShare : adminCap,
      combinedOtherCap: typeof sc.combinedOtherCostCap === 'number' ? sc.combinedOtherCostCap : undefined,
      unemployedLearnersLine: sc.unemployedLearnersLine === true,
      absorptionLaiCompleters: sc.absorptionBasis === 'laiCompleters',
      periodStart: sc.onlyTrainingWithinPeriod === true ? parseCalcDate(data.measurementPeriodStart) : null,
      spendGated: sc.scarceCriticalDeclarationsGate === true && data.scarceCriticalSpendDeclared === false,
      headcountGated: sc.scarceCriticalDeclarationsGate === true && data.scarceCriticalHeadcountDeclared === false,
    });
    const base = t.learning + t.bursary + t.disabled + t.learnerships;
    const lines: SkillsSubLine[] = [
      { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(1)}% of payroll`, weighting: learningMaxPts, score: t.learning, note: t.notes[0] },
      sc.unemployedLearnersLine === true
        ? { name: "Number of unemployed Black people in training", target: `${(bursaryTargetPct * 100).toFixed(1)}% of headcount`, weighting: bursaryMaxPts, score: t.bursary, note: t.notes[1] }
        : { name: "Expenditure on bursaries for Black students", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: t.bursary, note: t.notes[1] },
      { name: "Expenditure on learning programmes for disabled black employees", target: `${(disabledTargetPct * 100).toFixed(1)}% of payroll`, weighting: disabledMaxPts, score: t.disabled, note: t.notes[2] },
      { name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: `${learnershipTargetPct.toFixed(1)}% of headcount`, weighting: learnershipMaxPts, score: t.learnerships, note: t.notes[3] },
      { name: "Absorption of black people after learnerships, apprenticeships or internships", target: `${absorptionTargetPct.toFixed(1)}% ${sc.absorptionBasis === 'laiCompleters' ? 'of black learners who completed one' : 'of headcount'}`, weighting: absorptionMaxPts, score: t.absorption, isBonus: true, note: t.notes[4] },
    ];
    return {
      learningProgrammes: round2(t.learning),
      bursaries: round2(t.bursary),
      disabledLearning: round2(t.disabled),
      learnerships: round2(t.learnerships),
      absorption: round2(t.absorption),
      total: round2(clampScore(base + t.absorption, maxPoints)),
      exactTotal: clampScore(base + t.absorption, maxPoints),
      subMinimumMet: subMinimumMetFor(base),
      categoryBreakdown: t.categoryBreakdown,
      subLines: lines.map(l => ({ ...l, score: round2(l.score), exactScore: l.score })),
      eapBreakdowns: isQse ? {} : buildSkillsEAPBreakdowns(trainingPrograms, province, eapYear),
      eapProvince: province,
      rawStats: {
        ...t.rawStats,
        targetOverall: round2(TARGET_OVERALL),
        targetBursaries: round2(TARGET_BURSARIES),
        targetDisabled: round2(TARGET_DISABLED),
      },
    };
  }

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

  const absorptionDenominator = absorptionBasisHeadcount
    ? (data.headcount != null && data.headcount > 0 ? data.headcount : 0)
    : absorptionBasisUnemployedLAI
      ? spend.unemployedLAICompletedCount
      : spend.totalBlackLearners;
  const absorptionRate = absorptionDenominator > 0
    ? spend.absorbedCount / absorptionDenominator
    : 0;
  const absorptionScore = clampScore(safeRatio(absorptionRate, absorptionTargetPct / 100, absorptionMaxPts), absorptionMaxPts);

  const baseScore = learningScore + bursaryScore + disabledScore + learnershipScore;
  const totalScore = clampScore(baseScore + absorptionScore, maxPoints);

  const subLines: SkillsSubLine[] = [
    { name: "Expenditure on learning programmes for Black people", target: `${(overallTargetPct * 100).toFixed(1)}% of payroll`, weighting: learningMaxPts, score: learningScore },
    bursaryIsHeadcount
      ? { name: "Number of unemployed Black people in training", target: `${(bursaryTargetPct * 100).toFixed(1)}% of headcount`, weighting: bursaryMaxPts, score: bursaryScore }
      : bursaryIsBlackFemale
        ? { name: "Expenditure on learning programmes for Black women", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: bursaryScore }
        : { name: "Expenditure on bursaries for Black students", target: `${(bursaryTargetPct * 100).toFixed(1)}% of payroll`, weighting: bursaryMaxPts, score: bursaryScore },
    { name: "Expenditure on learning programmes for disabled black employees", target: `${(disabledTargetPct * 100).toFixed(1)}% of payroll`, weighting: disabledMaxPts, score: disabledScore },
    { name: "Number of ALL Black people participating in learnerships, apprenticeships or internships", target: `${learnershipTargetPct.toFixed(1)}% of headcount`, weighting: learnershipMaxPts, score: learnershipScore },
    { name: "Absorption of black people after learnerships, apprenticeships or internships", target: `${absorptionTargetPct.toFixed(1)}% ${absorptionBasisHeadcount ? 'of headcount' : 'absorption'}`, weighting: absorptionMaxPts, score: absorptionScore, isBonus: true },
  ];

  const skillsTotal = round2(totalScore);

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
    exactTotal: totalScore,
    // Sub-minimum excludes the absorption bonus (RCOGP 2019). A sector with no
    // sub-minimum has nothing to fail: `true`, never `false` (the old `false`
    // marked every no-sub-minimum sector as failing, which the store then discounted).
    subMinimumMet: subMinimumMetFor(baseScore),
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
