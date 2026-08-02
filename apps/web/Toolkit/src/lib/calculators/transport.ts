/**
 * Transport pillar calculators — aligned with
 * apps/api/pipeline/rules/pillarCalculators.ts (calcTransportQse* and
 * calcTransportLarge*). Targets per docs/Transport Codes.xlsx
 * ("Road Freight QSE" / "Road Freight Large" sheets).
 */
import type { ManagementData, Employee, SkillsData, TrainingCategoryCode } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore, round2 } from './shared';
import { getEAPTargets, normalizeProvince } from './eapTargets';
import type { Province } from './eapTargets';
import { CATEGORY_LABELS, mapLegacyCategory, type SkillsResult, type SkillsSubLine, type CategoryBreakdown } from './skills';

export interface TransportPillarResult {
  score: number;
  maxPoints: number;
  /**
   * Per-indicator rows in the SAME shape the RCOGP breakdown renders — so the
   * pillar page can show Transport clients the exact lines their score is made
   * of. Before this, the breakdown page ran the RCOGP calculator and displayed
   * sub-lines the Transport score never evaluates ("breakdowns don't link").
   */
  subLines?: Array<{ name: string; target: string; weighting: number; score: number }>;
}

const countBlack = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race)).length;

const countBlackWomen = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race) && e.gender === 'Female').length;

function pctOf(emps: Employee[], countFn: (e: Employee[]) => number): number {
  return emps.length > 0 ? countFn(emps) / emps.length : 0;
}

function groupByDesignation(employees: Employee[]): Record<string, Employee[]> {
  const groups: Record<string, Employee[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (groups[emp.designation] ??= []).push(emp);
  }
  return groups;
}

export function isTransportQseSector(sectorCode?: string, scorecardType?: string): boolean {
  const sector = (sectorCode ?? '').toUpperCase();
  const type = (scorecardType ?? '').toUpperCase();
  return (sector === 'TRANSPORT' || sector.includes('TRANSPORT')) && type === 'QSE';
}

/** Top management black 50.1% = 25 pts + bonus black women 25% = 2 pts (max 27). */
export function calculateTransportQseManagement(
  data: ManagementData,
  config: CalculatorConfig,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.managementControl?.maxPoints ?? 27;
  const employees = data.employees || [];
  const grouped = groupByDesignation(employees);

  const topMgmt = [
    ...(grouped['Board'] || []),
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
    ...(grouped['Other Executive Management'] || []),
    ...(grouped['Senior'] || []),
  ];

  const blackPct = pctOf(topMgmt, countBlack);
  const bwPct = pctOf(topMgmt, countBlackWomen);
  const subLines = [
    { name: 'Black people in top management', target: '50.1%', weighting: 25, score: round2(clampScore(safeRatio(blackPct, 0.501, 25), 25)) },
    { name: 'Black women in top management (bonus)', target: '25%', weighting: 2, score: round2(clampScore(safeRatio(bwPct, 0.25, 2), 2)) },
  ];
  const score = subLines.reduce((s, l) => s + l.score, 0);

  const result = { score: round2(clampScore(score, maxTotal)), maxPoints: maxTotal, subLines };
  return result;
}

/** EE pillar: black mgmt 7.5 + black women mgmt 7.5 + black employees 5 + black women employees 5 + EAP bonus 2 (max 27). */
export function calculateTransportQseEmploymentEquity(
  data: ManagementData,
  config: CalculatorConfig,
  eapProvince?: string,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.employmentEquity?.maxPoints ?? 27;
  const employees = (data.employees || []).filter(e => !e.isForeign);
  const grouped = groupByDesignation(data.employees || []);

  const mgmtDesignations = new Set([
    'Board', 'Executive', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior',
  ]);
  const mgmt = employees.filter(e => mgmtDesignations.has(e.designation));
  const juniorAll = [
    ...(grouped['Junior'] || []),
    ...(grouped['Semi-skilled'] || []),
    ...(grouped['Unskilled'] || []),
  ].filter(e => !e.isForeign);

  const senior = (grouped['Senior'] || []).filter(e => !e.isForeign);
  const middle = (grouped['Middle'] || []).filter(e => !e.isForeign);

  const province = normalizeProvince(eapProvince || 'National') as Province;
  const seniorEAP = getEAPTargets(province, 'Senior');
  const middleEAP = getEAPTargets(province, 'Middle');
  const juniorEAP = getEAPTargets(province, 'Junior');

  let score = 0;
  score += clampScore(safeRatio(pctOf(mgmt, countBlack), 0.4, 7.5), 7.5);
  score += clampScore(safeRatio(pctOf(mgmt, countBlackWomen), 0.2, 7.5), 7.5);
  score += clampScore(safeRatio(pctOf(employees, countBlack), 0.6, 5), 5);
  score += clampScore(safeRatio(pctOf(employees, countBlackWomen), 0.3, 5), 5);

  const bonus =
    pctOf(senior, countBlack) >= seniorEAP.blackTarget &&
    pctOf(senior, countBlackWomen) >= seniorEAP.blackWomenTarget &&
    pctOf(middle, countBlack) >= middleEAP.blackTarget &&
    pctOf(middle, countBlackWomen) >= middleEAP.blackWomenTarget &&
    (juniorAll.length === 0 ||
      (pctOf(juniorAll, countBlack) >= juniorEAP.blackTarget &&
        pctOf(juniorAll, countBlackWomen) >= juniorEAP.blackWomenTarget))
      ? 2
      : 0;
  score += bonus;

  const result = { score: round2(clampScore(score, maxTotal)), maxPoints: maxTotal };
  return result;
}

// ---------------------------------------------------------------------------
// Transport LARGE (Generic) — mirrors calcTransportLargeManagementControl /
// calcTransportLargeEmploymentEquity / calcTransportLargeSkills in
// apps/api/pipeline/rules/pillarCalculators.ts (the Zoleka-era engine encoding
// of docs/Transport Codes.xlsx "Road Freight Large": MC rows 23-31 = 11 pts,
// EE rows 33-43 = 18 pts, Skills = 15 pts). Do not change ratios/points here
// without changing the pipeline engine in the same commit.
// ---------------------------------------------------------------------------

export function isTransportLargeSector(sectorCode?: string, scorecardType?: string): boolean {
  const sector = (sectorCode ?? '').toUpperCase();
  const type = (scorecardType ?? '').toUpperCase();
  return (sector === 'TRANSPORT' || sector.includes('TRANSPORT')) && type !== 'QSE';
}

/**
 * MC 11: Board B/BW 1.5+1.5 @50%/25%, Exec Dir B/BW 1+1 @50%/25%,
 * Senior Top B/BW 1.5+1.5 @40%/20%, Other Top (Middle) B/BW 1+1 @40%/20%,
 * Bonus Independent NEDs 1 @40% board-black.
 */
export function calculateTransportLargeManagementControl(
  data: ManagementData,
  config: CalculatorConfig,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.managementControl?.maxPoints ?? 11;
  const grouped = groupByDesignation(data.employees || []);

  const board = grouped['Board'] || [];
  const exec = [...(grouped['Executive'] || []), ...(grouped['Executive Director'] || [])];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];

  const subLines = [
    { name: 'Black board members (voting)', target: '50%', weighting: 1.5, score: round2(clampScore(safeRatio(pctOf(board, countBlack), 0.5, 1.5), 1.5)) },
    { name: 'Black women board members', target: '25%', weighting: 1.5, score: round2(clampScore(safeRatio(pctOf(board, countBlackWomen), 0.25, 1.5), 1.5)) },
    { name: 'Black executive directors', target: '50%', weighting: 1, score: round2(clampScore(safeRatio(pctOf(exec, countBlack), 0.5, 1), 1)) },
    { name: 'Black women executive directors', target: '25%', weighting: 1, score: round2(clampScore(safeRatio(pctOf(exec, countBlackWomen), 0.25, 1), 1)) },
    { name: 'Black senior top management', target: '40%', weighting: 1.5, score: round2(clampScore(safeRatio(pctOf(senior, countBlack), 0.4, 1.5), 1.5)) },
    { name: 'Black women senior top management', target: '20%', weighting: 1.5, score: round2(clampScore(safeRatio(pctOf(senior, countBlackWomen), 0.2, 1.5), 1.5)) },
    { name: 'Black other top management', target: '40%', weighting: 1, score: round2(clampScore(safeRatio(pctOf(middle, countBlack), 0.4, 1), 1)) },
    { name: 'Black women other top management', target: '20%', weighting: 1, score: round2(clampScore(safeRatio(pctOf(middle, countBlackWomen), 0.2, 1), 1)) },
    { name: 'Independent non-executive directors (bonus)', target: '40%', weighting: 1, score: round2(clampScore(safeRatio(pctOf(board, countBlack), 0.4, 1), 1)) },
  ];
  const mc = subLines.reduce((s, l) => s + l.score, 0);

  const result = { score: round2(clampScore(mc, maxTotal)), maxPoints: maxTotal, subLines };
  return result;
}

/**
 * EE 18: Senior B/BW 2.5+2.5 @43%/22%, Middle B/BW 1.5+1.5 @63%/32%,
 * Junior B/BW 1.5+1.5 @68%/34%, Semi+Unskilled BW (of total workforce) 2 @15%,
 * Black disabled 1 @2%, Black women disabled 1 @1%, Bonus 3 when every band
 * target is met.
 */
export function calculateTransportLargeEmploymentEquity(
  data: ManagementData,
  config: CalculatorConfig,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.employmentEquity?.maxPoints ?? 18;
  const eeCfg = config.employmentEquity ?? { maxPoints: maxTotal };
  const grouped = groupByDesignation(data.employees || []);
  const allNonForeign = (data.employees || []).filter(e => !e.isForeign);

  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];
  const semiPool = [...(grouped['Semi-skilled'] || []), ...(grouped['Unskilled'] || [])];

  let ee = 0;
  ee += clampScore(safeRatio(pctOf(senior, countBlack), 0.43, 2.5), 2.5);
  ee += clampScore(safeRatio(pctOf(senior, countBlackWomen), 0.22, 2.5), 2.5);
  ee += clampScore(safeRatio(pctOf(middle, countBlack), 0.63, 1.5), 1.5);
  ee += clampScore(safeRatio(pctOf(middle, countBlackWomen), 0.32, 1.5), 1.5);
  ee += clampScore(safeRatio(pctOf(junior, countBlack), 0.68, 1.5), 1.5);
  ee += clampScore(safeRatio(pctOf(junior, countBlackWomen), 0.34, 1.5), 1.5);

  const semiBw = semiPool.filter(e => isBlackRace(e.race) && e.gender === 'Female').length;
  const semiBwPctTotal = allNonForeign.length > 0 ? semiBw / allNonForeign.length : 0;
  const semiMax = eeCfg.semiUnskilledWomenMaxPts ?? 2;
  ee += clampScore(safeRatio(semiBwPctTotal, 0.15, semiMax), semiMax);

  const disabledTarget = eeCfg.disabledTarget ?? 0.02;
  const disabledMax = eeCfg.disabledMaxPts ?? 1;
  const blackDisabledPct = allNonForeign.length > 0
    ? allNonForeign.filter(e => e.isDisabled && isBlackRace(e.race)).length / allNonForeign.length
    : 0;
  ee += clampScore(safeRatio(blackDisabledPct, disabledTarget, disabledMax), disabledMax);

  const dwMax = eeCfg.disabledWomenMaxPts ?? 1;
  const dwTarget = eeCfg.disabledWomenTarget ?? 0.01;
  if (dwMax > 0) {
    const bwDisabledPct = allNonForeign.length > 0
      ? allNonForeign.filter(e => e.isDisabled && isBlackRace(e.race) && e.gender === 'Female').length / allNonForeign.length
      : 0;
    ee += clampScore(safeRatio(bwDisabledPct, dwTarget, dwMax), dwMax);
  }

  const bonusMax = eeCfg.eapBonusMaxPts ?? 3;
  const bonusEE =
    pctOf(senior, countBlack) >= 0.43 && pctOf(senior, countBlackWomen) >= 0.22 &&
    pctOf(middle, countBlack) >= 0.63 && pctOf(middle, countBlackWomen) >= 0.32 &&
    pctOf(junior, countBlack) >= 0.68 && pctOf(junior, countBlackWomen) >= 0.34
      ? bonusMax
      : 0;
  ee += bonusEE;

  const result = { score: round2(clampScore(ee, maxTotal)), maxPoints: maxTotal };
  return result;
}

/**
 * Skills 15 (5 × 3 pts): recognised black learning spend @3% leviable
 * (cat E capped 25%, F capped 15%), bursaries (cat A) @1.5%, disabled spend
 * @0.45%, black in B/C/D programmes @5% of headcount, black WOMEN in B/C/D
 * programmes @2.5% of headcount. NOTE: the 5th indicator is women-in-programmes
 * (Transport Codes), NOT the generic absorption indicator — that is why
 * Transport Large cannot reuse calculateSkillsScore.
 * Returns a SkillsResult so the store/results view render the breakdown.
 */
export function calculateTransportLargeSkills(
  data: SkillsData,
  config: CalculatorConfig,
): SkillsResult {
  const sk = config.skills ?? ({} as NonNullable<CalculatorConfig['skills']>);
  const maxPoints = config.pillarConfigs?.skillsDevelopment?.maxPoints ?? 15;
  const leviable = data.leviableAmount || 0;
  const programs = data.trainingPrograms || [];

  const learningMax = sk.learningProgrammesMaxPts ?? 3;
  const bursaryMax = sk.bursaryMaxPts ?? 3;
  const disabledMax = sk.disabledLearningMaxPts ?? 3;
  const learnershipsMax = sk.learnershipsMaxPts ?? 3;
  const womenProgMax = sk.absorptionMaxPts ?? 3; // 5th slot = BW in B/C/D programmes

  const overallTarget = leviable * (sk.overallSpendPercent ?? 0.03);
  const bursaryTarget = leviable * (sk.bursarySpendPercent ?? 0.015);
  const disabledTarget = leviable * (sk.disabledSpendPercent ?? 0.0045);
  const progBlackTarget = (sk.learnershipTargetPercent ?? 5.0) / 100;
  const progWomenTarget = (sk.absorptionTargetPercent ?? 2.5) / 100;

  let bursarySpend = 0;
  let disabledSpend = 0;
  let bcBlack = 0;
  let bcWomen = 0;
  let totalBlackLearners = 0;
  const byCategory: Record<TrainingCategoryCode, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };

  for (const tp of programs) {
    // Same accessors as accumulateSpend in skills.ts — input layers don't
    // always populate isBlack/cost, so fall back to race/totalCost.
    const isBlack = tp.isBlack ?? isBlackRace(tp.race);
    if (!isBlack) continue;
    totalBlackLearners++;
    const catCode = tp.categoryCode || mapLegacyCategory(tp.category);
    const cost = tp.cost ?? tp.totalCost ?? 0;
    byCategory[catCode] += cost;
    if (catCode === 'A' || tp.category === 'bursary') bursarySpend += cost;
    if (tp.isDisabled) disabledSpend += cost;
    if (catCode === 'B' || catCode === 'C' || catCode === 'D') {
      bcBlack++;
      if (tp.gender === 'Female') bcWomen++;
    }
  }

  const uncappedTotal = (Object.values(byCategory) as number[]).reduce((a, b) => a + b, 0);
  let totalRecognised = 0;
  const categoryBreakdown: CategoryBreakdown[] = (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as TrainingCategoryCode[]).map((code) => {
    const spend = byCategory[code] || 0;
    let recognised = spend;
    if (code === 'E' && uncappedTotal > 0) recognised = Math.min(spend, uncappedTotal * 0.25);
    if (code === 'F' && uncappedTotal > 0) recognised = Math.min(spend, uncappedTotal * 0.15);
    if (code === 'G') recognised = 0; // G not recognised (pipeline sums A-F only)
    if (code !== 'G') totalRecognised += recognised;
    return {
      code,
      label: CATEGORY_LABELS[code].label,
      examples: CATEGORY_LABELS[code].examples,
      spend,
      recognisedSpend: recognised,
      capApplied: recognised < spend,
    };
  });

  const learningScore = clampScore(safeRatio(totalRecognised, overallTarget, learningMax), learningMax);
  const bursaryScore = clampScore(safeRatio(bursarySpend, bursaryTarget, bursaryMax), bursaryMax);
  const disabledScore = clampScore(safeRatio(disabledSpend, disabledTarget, disabledMax), disabledMax);

  const hc = Math.max(data.headcount ?? 0, 1);
  const learnershipScore = clampScore(safeRatio(bcBlack / hc, progBlackTarget, learnershipsMax), learnershipsMax);
  const womenProgScore = clampScore(safeRatio(bcWomen / hc, progWomenTarget, womenProgMax), womenProgMax);

  const total = round2(clampScore(learningScore + bursaryScore + disabledScore + learnershipScore + womenProgScore, maxPoints));

  const subLines: SkillsSubLine[] = [
    { name: 'Expenditure on learning programmes for Black people', target: `${((sk.overallSpendPercent ?? 0.03) * 100).toFixed(1)}% of payroll`, weighting: learningMax, score: round2(learningScore) },
    { name: 'Expenditure on bursaries for Black students', target: `${((sk.bursarySpendPercent ?? 0.015) * 100).toFixed(1)}% of payroll`, weighting: bursaryMax, score: round2(bursaryScore) },
    { name: 'Expenditure on learning programmes for disabled black employees', target: `${((sk.disabledSpendPercent ?? 0.0045) * 100).toFixed(2)}% of payroll`, weighting: disabledMax, score: round2(disabledScore) },
    { name: 'Black people in learnerships, apprenticeships or internships', target: `${(progBlackTarget * 100).toFixed(1)}% of headcount`, weighting: learnershipsMax, score: round2(learnershipScore) },
    { name: 'Black women in learnerships, apprenticeships or internships', target: `${(progWomenTarget * 100).toFixed(1)}% of headcount`, weighting: womenProgMax, score: round2(womenProgScore) },
  ];

  return {
    learningProgrammes: round2(learningScore),
    bursaries: round2(bursaryScore),
    disabledLearning: round2(disabledScore),
    learnerships: round2(learnershipScore),
    absorption: round2(womenProgScore), // 5th slot (women in programmes) — Transport has no absorption indicator
    total,
    subMinimumMet: true, // Transport Large Skills has no sub-minimum (sectorConfig hasSubMinimum: false)
    categoryBreakdown,
    subLines,
    eapBreakdowns: {},
    eapProvince: 'National',
    rawStats: {
      blackSpend: uncappedTotal,
      bursarySpend,
      disabledSpend,
      learnershipCount: bcBlack,
      absorbedCount: 0,
      totalBlackLearners,
      absorptionRate: 0,
      totalRecognisedSpend: totalRecognised,
      targetOverall: overallTarget,
      targetBursaries: bursaryTarget,
      targetDisabled: disabledTarget,
    },
  };
}
