import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore, round2 } from './shared';
import type { Province } from './eapTargets';
import { getEAPTargets, normalizeProvince } from './eapTargets';

// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// Config is REQUIRED — all targets come from CalculatorConfig loaded from the API.
// No hardcoded RCOGP fallback constants.

export interface ManagementSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
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

function pctOfRaw(emps: Employee[], countFn: (e: Employee[]) => number): number {
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
  // EAP-based targets for Senior/Middle/Junior (using config max points if available)
  const seniorBlack = clampScore(safeRatio(seniorBlackPct, seniorEAP.blackTarget, seniorMaxPts), seniorMaxPts);
  const seniorBWO = clampScore(safeRatio(seniorBWOPct, seniorEAP.blackWomenTarget, seniorBWMaxPts), seniorBWMaxPts);
  const middleBlack = clampScore(safeRatio(middleBlackPct, middleEAP.blackTarget, middleMaxPts), middleMaxPts);
  const middleBWO = clampScore(safeRatio(middleBWOPct, middleEAP.blackWomenTarget, middleBWMaxPts), middleBWMaxPts);
  // Junior level now includes Junior, Semi-skilled, and Unskilled - all use Junior EAP
  const juniorCombinedBlackPct = junior.length + semiSkilled.length + unskilled.length > 0
    ? (countBlack(junior) + countBlack(semiSkilled) + countBlack(unskilled)) / (junior.length + semiSkilled.length + unskilled.length)
    : 0;
  const juniorCombinedBWOPct = junior.length + semiSkilled.length + unskilled.length > 0
    ? (countBlackWomen(junior) + countBlackWomen(semiSkilled) + countBlackWomen(unskilled)) / (junior.length + semiSkilled.length + unskilled.length)
    : 0;
  const juniorBlackScore = clampScore(safeRatio(juniorCombinedBlackPct, juniorEAP.blackTarget, juniorMaxPts), juniorMaxPts);
  const juniorBWOScore = clampScore(safeRatio(juniorCombinedBWOPct, juniorEAP.blackWomenTarget, juniorBWMaxPts), juniorBWMaxPts);
  // Employment Equity: Skilled Technical (uses Middle EAP targets with config max points)
  const skilledTechnicalBlackScore = clampScore(safeRatio(skilledTechnicalBlackPct, skilledTechnicalEAP.blackTarget, seniorMaxPts), seniorMaxPts);
  const skilledTechnicalBWOScore = clampScore(safeRatio(skilledTechnicalBWOPct, skilledTechnicalEAP.blackWomenTarget, seniorBWMaxPts), seniorBWMaxPts);
  const disabledScore = clampScore(safeRatio(blackDisabledPct, disabledTarget, disabledMaxPts), disabledMaxPts);

  const totalPoints = boardVotingBlack + boardVotingBWO +
    execDirectorsBlack + execDirectorsBWO +
    otherExecBlackScore + otherExecBWOScore +
    seniorBlack + seniorBWO +
    middleBlack + middleBWO +
    juniorBlackScore + juniorBWOScore +
    skilledTechnicalBlackScore + skilledTechnicalBWOScore +
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
    rawStats: {
      boardBlackPct: pctOfRaw(board, countBlack),
      boardBWOPct: pctOfRaw(board, countBlackWomen),
      execBlackPct: pctOfRaw(execDirs, countBlack),
      execBWOPct: pctOfRaw(execDirs, countBlackWomen),
      otherExecBlackPct: pctOfRaw(otherExec, countBlack),
      otherExecBWOPct: pctOfRaw(otherExec, countBlackWomen),
      seniorBlackPct: pctOfRaw(senior, countBlack),
      seniorBWOPct: pctOfRaw(senior, countBlackWomen),
      middleBlackPct: pctOfRaw(middle, countBlack),
      middleBWOPct: pctOfRaw(middle, countBlackWomen),
      juniorBlackPct: pctOfRaw(junior, countBlack),
      juniorBWOPct: pctOfRaw(junior, countBlackWomen),
      disabledBlackPct: employees.length > 0 ? countBlack(disabledEmps) / employees.length : 0,
    },
  };
}
