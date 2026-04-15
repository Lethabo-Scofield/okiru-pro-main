/**
 * @domain-rule pillar:management_control, slides:96-106
 * @see docs/domain/pillars/02_management_control.md
 * @see docs/domain/calculations/management_control_calc.md
 * VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
 * Config is REQUIRED - all targets come from CalculatorConfig loaded from the API.
 */
import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore, round2 } from './shared';
import type { Province } from './eapTargets';
import { getEAPTargets, normalizeProvince } from './eapTargets';

export interface ManagementSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
}

export interface EAPGroupBreakdown {
  group: DemoGroup;
  eapTarget: number;
  actual: number;
  count: number;
  totalInLevel: number;
}

export interface ManagementResult {
  boardVotingBlack: number;
  boardVotingBWO: number;
  execDirectorsBlack: number;
  execDirectorsBWO: number;
  otherExecBlack: number;
  otherExecBWO: number;
  seniorBlack: number;
  seniorBWO: number;
  middleBlack: number;
  middleBWO: number;
  juniorBlack: number;
  juniorBWO: number;
  skilledTechnicalBlack: number;
  skilledTechnicalBWO: number;
  disabled: number;
  total: number;
  subMinimumMet: boolean;
  subLines: ManagementSubLine[];
  eapBreakdowns: Record<string, EAPGroupBreakdown[]>;
  eapProvince: string;
  rawStats: {
    boardBlackPct: number;
    boardBWOPct: number;
    execBlackPct: number;
    execBWOPct: number;
    otherExecBlackPct: number;
    otherExecBWOPct: number;
    seniorBlackPct: number;
    seniorBWOPct: number;
    middleBlackPct: number;
    middleBWOPct: number;
    juniorBlackPct: number;
    juniorBWOPct: number;
    disabledBlackPct: number;
  };
}

export type DemoGroup = 'AM' | 'CM' | 'IM' | 'AF' | 'CF' | 'IF';

/**
 * National EAP proportions per demographic group (slide 100)
 * @domain-rule pillar:management_control, slide:100
 * @see docs/domain/calculations/management_control_calc.md
 */
const NATIONAL_EAP_DEMOGRAPHICS: Record<DemoGroup, number> = {
  AM: 0.435, CM: 0.046, IM: 0.017,
  AF: 0.375, CF: 0.042, IF: 0.010,
};

function classifyDemographic(emp: Employee): DemoGroup | null {
  if (!isBlackRace(emp.race)) return null;
  const racePrefix = emp.race === 'African' ? 'A' : emp.race === 'Coloured' ? 'C' : 'I';
  const genderSuffix = emp.gender === 'Female' ? 'F' : 'M';
  return `${racePrefix}${genderSuffix}` as DemoGroup;
}

/**
 * Per-demographic EAP scoring per RCOGP slide 100.
 * Each group gets its own effective target, effective weight, and score.
 * Achievement is capped at the EAP proportion to prevent gaming.
 */
function calculateEAPScore(employees: Employee[], categoryTarget: number, maxPoints: number): { score: number; breakdown: EAPGroupBreakdown[] } {
  if (employees.length === 0) return { score: 0, breakdown: [] };
  let totalScore = 0;
  const breakdown: EAPGroupBreakdown[] = [];
  for (const group of Object.keys(NATIONAL_EAP_DEMOGRAPHICS) as DemoGroup[]) {
    const eapProp = NATIONAL_EAP_DEMOGRAPHICS[group];
    const effectiveTarget = eapProp * categoryTarget;
    const effectiveWeight = eapProp * maxPoints;

    const count = employees.filter(e => classifyDemographic(e) === group).length;
    const ratio = employees.length > 0 ? count / employees.length : 0;
    breakdown.push({ group, eapTarget: round2(eapProp), actual: round2(ratio), count, totalInLevel: employees.length });

    if (effectiveTarget <= 0) continue;
    const cappedRatio = Math.min(ratio, eapProp);
    const achievement = cappedRatio / effectiveTarget;
    totalScore += Math.min(achievement, 1) * effectiveWeight;
  }
  return { score: totalScore, breakdown };
}

const countBlack = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race)).length;

const countBlackWomen = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race) && e.gender === 'Female').length;

function groupByDesignation(employees: Employee[]): Record<string, Employee[]> {
  const groups: Record<string, Employee[]> = {};
  for (const emp of employees) {
    (groups[emp.designation] ??= []).push(emp);
  }
  return groups;
}

function pctOf(emps: Employee[], countFn: (e: Employee[]) => number): number {
  return emps.length > 0 ? countFn(emps) / emps.length : 0;
}

export function calculateManagementScore(
  data: ManagementData,
  config: CalculatorConfig,
  eapProvince?: string
): ManagementResult {
  if (!config) throw new Error('CalculatorConfig is required for management score calculation');
  const employees = data.employees || [];
  const grouped = groupByDesignation(employees);

  const cfg = config.managementControl;
  const boardBlackTarget = cfg?.boardBlackTarget ?? config.management.boardBlackTarget;
  const boardWomenTarget = cfg?.boardBWTarget ?? config.management.boardWomenTarget;
  const boardBlackMaxPts = cfg?.boardBlackMaxPts ?? config.management.boardBlackPoints;
  const boardBWMaxPts = cfg?.boardBWMaxPts ?? config.management.boardWomenPoints;
  
  const execBlackTarget = cfg?.execBlackTarget ?? config.management.execBlackTarget;
  const execWomenTarget = cfg?.execBWTarget ?? config.management.execWomenTarget;
  const execBlackMaxPts = cfg?.execBlackMaxPts ?? config.management.execBlackPoints;
  const execBWMaxPts = cfg?.execBWMaxPts ?? config.management.execWomenPoints;
  
  const otherExecBlackTarget = cfg?.otherExecBlackTarget ?? 0.60;
  const otherExecWomenTarget = cfg?.otherExecBWTarget ?? 0.30;
  const otherExecBlackMaxPts = cfg?.otherExecBlackMaxPts ?? 2;
  const otherExecBWMaxPts = cfg?.otherExecBWMaxPts ?? 1;
  
  const seniorMaxPts = cfg?.seniorMaxPts ?? 2;
  const seniorBWMaxPts = cfg?.seniorBWMaxPts ?? 1;
  const middleMaxPts = cfg?.middleMaxPts ?? 2;
  const middleBWMaxPts = cfg?.middleBWMaxPts ?? 1;
  const juniorMaxPts = cfg?.juniorMaxPts ?? 1;
  const juniorBWMaxPts = cfg?.juniorBWMaxPts ?? 1;
  
  const disabledTarget = config.employmentEquity?.disabledTarget ?? cfg?.disabledTarget ?? config.management.disabledTarget ?? 0.02;
  const disabledMaxPts = config.employmentEquity?.disabledMaxPts ?? cfg?.disabledMaxPts ?? 2;
  
  const maxTotal = config.pillarConfigs?.managementControl?.maxPoints ?? config.managementControl?.maxPoints ?? 19;
  const subMinPercent = config.pillarConfigs?.managementControl?.subMinimumPercent ?? 40;

  // Get EAP targets based on province
  const province = normalizeProvince(eapProvince || 'National') as Province;
  const seniorEAP = getEAPTargets(province, 'Senior');
  const middleEAP = getEAPTargets(province, 'Middle');
  const juniorEAP = getEAPTargets(province, 'Junior');
  const skilledTechnicalEAP = getEAPTargets(province, 'Skilled Technical'); // Uses Middle EAP targets

  const board = grouped['Board'] || [];
  const execDirs = [
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
  ];
  const otherExec = grouped['Other Executive Management'] || [];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];
  // Employment Equity levels: Skilled Technical uses Middle EAP, Semi-skilled and Unskilled use Junior EAP
  const skilledTechnical = grouped['Skilled Technical'] || [];
  const semiSkilled = grouped['Semi-skilled'] || [];
  const unskilled = grouped['Unskilled'] || [];

  const boardBlackPct = pctOf(board, countBlack);
  const boardBWOPct = pctOf(board, countBlackWomen);
  const execBlackPct = pctOf(execDirs, countBlack);
  const execBWOPct = pctOf(execDirs, countBlackWomen);
  const otherExecBlackPct = pctOf(otherExec, countBlack);
  const otherExecBWOPct = pctOf(otherExec, countBlackWomen);
  const seniorBlackPct = pctOf(senior, countBlack);
  const seniorBWOPct = pctOf(senior, countBlackWomen);
  const middleBlackPct = pctOf(middle, countBlack);
  const middleBWOPct = pctOf(middle, countBlackWomen);
  const juniorBlackPct = pctOf(junior, countBlack);
  const juniorBWOPct = pctOf(junior, countBlackWomen);
  // Employment Equity additional levels percentages
  const skilledTechnicalBlackPct = pctOf(skilledTechnical, countBlack);
  const skilledTechnicalBWOPct = pctOf(skilledTechnical, countBlackWomen);
  const semiSkilledBlackPct = pctOf(semiSkilled, countBlack);
  const semiSkilledBWOPct = pctOf(semiSkilled, countBlackWomen);
  const unskilledBlackPct = pctOf(unskilled, countBlack);
  const unskilledBWOPct = pctOf(unskilled, countBlackWomen);

  const disabledEmps = employees.filter(e => e.isDisabled);
  const blackDisabledPct = employees.length > 0
    ? countBlack(disabledEmps) / employees.length
    : 0;

  const boardVotingBlack = clampScore(safeRatio(boardBlackPct, boardBlackTarget, boardBlackMaxPts), boardBlackMaxPts);
  const boardVotingBWO = clampScore(safeRatio(boardBWOPct, boardWomenTarget, boardBWMaxPts), boardBWMaxPts);
  const execDirectorsBlack = clampScore(safeRatio(execBlackPct, execBlackTarget, execBlackMaxPts), execBlackMaxPts);
  const execDirectorsBWO = clampScore(safeRatio(execBWOPct, execWomenTarget, execBWMaxPts), execBWMaxPts);
  const otherExecBlackScore = clampScore(safeRatio(otherExecBlackPct, otherExecBlackTarget, otherExecBlackMaxPts), otherExecBlackMaxPts);
  const otherExecBWOScore = clampScore(safeRatio(otherExecBWOPct, otherExecWomenTarget, otherExecBWMaxPts), otherExecBWMaxPts);
  // Per-demographic EAP scoring (slide 100) for Senior/Middle/Junior
  const seniorTarget = cfg?.seniorBlackTarget ?? seniorEAP.blackTarget;
  const middleTarget = cfg?.middleBlackTarget ?? middleEAP.blackTarget;
  const juniorTarget = cfg?.juniorBlackTarget ?? juniorEAP.blackTarget;

  const seniorEAPResult = calculateEAPScore(senior, seniorTarget, seniorMaxPts + seniorBWMaxPts);
  const seniorScore = clampScore(seniorEAPResult.score, seniorMaxPts + seniorBWMaxPts);
  const middleEAPResult = calculateEAPScore(middle, middleTarget, middleMaxPts + middleBWMaxPts);
  const middleScore = clampScore(middleEAPResult.score, middleMaxPts + middleBWMaxPts);

  const juniorCombined = [...junior, ...semiSkilled, ...unskilled];
  const juniorEAPResult = calculateEAPScore(juniorCombined, juniorTarget, juniorMaxPts + juniorBWMaxPts);
  const juniorScore = clampScore(juniorEAPResult.score, juniorMaxPts + juniorBWMaxPts);

  // Split combined EAP score into Black/BWO proportions for display
  const seniorBlack = clampScore(seniorScore * (seniorMaxPts / (seniorMaxPts + seniorBWMaxPts)), seniorMaxPts);
  const seniorBWO = clampScore(seniorScore - seniorBlack, seniorBWMaxPts);
  const middleBlack = clampScore(middleScore * (middleMaxPts / (middleMaxPts + middleBWMaxPts)), middleMaxPts);
  const middleBWO = clampScore(middleScore - middleBlack, middleBWMaxPts);
  const juniorBlackScore = clampScore(juniorScore * (juniorMaxPts / (juniorMaxPts + juniorBWMaxPts)), juniorMaxPts);
  const juniorBWOScore = clampScore(juniorScore - juniorBlackScore, juniorBWMaxPts);

  // Skilled Technical is informational only (not part of RCOGP 19-point total)
  const skilledTechnicalBlackScore = clampScore(safeRatio(skilledTechnicalBlackPct, skilledTechnicalEAP.blackTarget, seniorMaxPts), seniorMaxPts);
  const skilledTechnicalBWOScore = clampScore(safeRatio(skilledTechnicalBWOPct, skilledTechnicalEAP.blackWomenTarget, seniorBWMaxPts), seniorBWMaxPts);
  const disabledScore = clampScore(safeRatio(blackDisabledPct, disabledTarget, disabledMaxPts), disabledMaxPts);

  // RCOGP total: Board + Exec + Other Exec + Senior + Middle + Junior + Disabled = 19
  const totalPoints = boardVotingBlack + boardVotingBWO +
    execDirectorsBlack + execDirectorsBWO +
    otherExecBlackScore + otherExecBWOScore +
    seniorBlack + seniorBWO +
    middleBlack + middleBWO +
    juniorBlackScore + juniorBWOScore +
    disabledScore;

  const subLines: ManagementSubLine[] = [
    { name: "Exercisable voting rights of black board members", target: `${(boardBlackTarget * 100).toFixed(0)}%`, weighting: boardBlackMaxPts, score: boardVotingBlack },
    { name: "Exercisable voting rights of black female board members", target: `${(boardWomenTarget * 100).toFixed(0)}%`, weighting: boardBWMaxPts, score: boardVotingBWO },
    { name: "Black executive directors", target: `${(execBlackTarget * 100).toFixed(0)}%`, weighting: execBlackMaxPts, score: execDirectorsBlack },
    { name: "Black female executive directors", target: `${(execWomenTarget * 100).toFixed(0)}%`, weighting: execBWMaxPts, score: execDirectorsBWO },
    { name: "Black other executive management", target: `${(otherExecBlackTarget * 100).toFixed(0)}%`, weighting: otherExecBlackMaxPts, score: otherExecBlackScore },
    { name: "Black female other executive management", target: `${(otherExecWomenTarget * 100).toFixed(0)}%`, weighting: otherExecBWMaxPts, score: otherExecBWOScore },
    // EAP-based with actual percentage
    { name: "Black employees in senior management", target: `${(seniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorMaxPts, score: seniorBlack },
    { name: "Black female employees in senior management", target: `${(seniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorBWMaxPts, score: seniorBWO },
    { name: "Black employees in middle management", target: `${(middleEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: middleMaxPts, score: middleBlack },
    { name: "Black female employees in middle management", target: `${(middleEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: middleBWMaxPts, score: middleBWO },
    { name: "Black employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: juniorMaxPts, score: juniorBlackScore },
    { name: "Black female employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: juniorBWMaxPts, score: juniorBWOScore },
    { name: "Black employees in skilled technical positions", target: `${(skilledTechnicalEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorMaxPts, score: skilledTechnicalBlackScore },
    { name: "Black female employees in skilled technical positions", target: `${(skilledTechnicalEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorBWMaxPts, score: skilledTechnicalBWOScore },
    { name: "Black employees with disabilities", target: `${(disabledTarget * 100).toFixed(0)}%`, weighting: disabledMaxPts, score: disabledScore },
  ];

  return {
    boardVotingBlack: round2(boardVotingBlack),
    boardVotingBWO: round2(boardVotingBWO),
    execDirectorsBlack: round2(execDirectorsBlack),
    execDirectorsBWO: round2(execDirectorsBWO),
    otherExecBlack: round2(otherExecBlackScore),
    otherExecBWO: round2(otherExecBWOScore),
    seniorBlack: round2(seniorBlack),
    seniorBWO: round2(seniorBWO),
    middleBlack: round2(middleBlack),
    middleBWO: round2(middleBWO),
    juniorBlack: round2(juniorBlackScore),
    juniorBWO: round2(juniorBWOScore),
    skilledTechnicalBlack: round2(skilledTechnicalBlackScore),
    skilledTechnicalBWO: round2(skilledTechnicalBWOScore),
    disabled: round2(disabledScore),
    total: round2(clampScore(totalPoints, maxTotal)),
    subMinimumMet: totalPoints >= (subMinPercent / 100) * maxTotal,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    eapBreakdowns: {
      senior: seniorEAPResult.breakdown,
      middle: middleEAPResult.breakdown,
      junior: juniorEAPResult.breakdown,
    },
    eapProvince: province,
    rawStats: {
      boardBlackPct: pctOf(board, countBlack),
      boardBWOPct: pctOf(board, countBlackWomen),
      execBlackPct: pctOf(execDirs, countBlack),
      execBWOPct: pctOf(execDirs, countBlackWomen),
      otherExecBlackPct: pctOf(otherExec, countBlack),
      otherExecBWOPct: pctOf(otherExec, countBlackWomen),
      seniorBlackPct: pctOf(senior, countBlack),
      seniorBWOPct: pctOf(senior, countBlackWomen),
      middleBlackPct: pctOf(middle, countBlack),
      middleBWOPct: pctOf(middle, countBlackWomen),
      juniorBlackPct: pctOf(junior, countBlack),
      juniorBWOPct: pctOf(junior, countBlackWomen),
      disabledBlackPct: employees.length > 0 ? countBlack(disabledEmps) / employees.length : 0,
    },
  };
}
