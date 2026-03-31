import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore, round2 } from './shared';
import type { Province } from './eapTargets';
import { getEAPTargets, normalizeProvince } from './eapTargets';

// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// CRITICAL FIXES: Executive Directors targets changed from 60%/30% to 50%/25%

const BOARD_BLACK_TARGET = 0.50;
const BOARD_WOMEN_TARGET = 0.25;
// CRITICAL FIX: Executive Directors Black target is 50% (NOT 60%)
const EXEC_BLACK_TARGET = 0.50;
// CRITICAL FIX: Executive Directors Women target is 25% (NOT 30%)
const EXEC_WOMEN_TARGET = 0.25;
const OTHER_EXEC_BLACK_TARGET = 0.60;
const OTHER_EXEC_WOMEN_TARGET = 0.30;

// EAP-based targets for Senior/Middle/Junior (province-specific)
// These are defaults; actual values come from EAP lookup
const DEFAULT_SENIOR_TARGET = 0.731;   // National EAP
const DEFAULT_MIDDLE_TARGET = 0.786; // National EAP
const DEFAULT_JUNIOR_TARGET = 0.845; // National EAP

const DISABLED_TARGET = 0.03;
const MAX_TOTAL = 19;

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

export function calculateManagementScore(
  data: ManagementData,
  config?: CalculatorConfig,
  eapProvince?: string
): ManagementResult {
  const employees = data.employees || [];
  const grouped = groupByDesignation(employees);

  // Get EAP targets based on province
  const province = normalizeProvince(eapProvince || 'National') as Province;
  const seniorEAP = getEAPTargets(province, 'Senior');
  const middleEAP = getEAPTargets(province, 'Middle');
  const juniorEAP = getEAPTargets(province, 'Junior');

  const board = grouped['Board'] || [];
  const execDirs = [
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
  ];
  const otherExec = grouped['Other Executive Management'] || [];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];

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

  const disabledEmps = employees.filter(e => e.isDisabled);
  const blackDisabledPct = employees.length > 0
    ? countBlack(disabledEmps) / employees.length
    : 0;

  const boardVotingBlack = clampScore(safeRatio(boardBlackPct, BOARD_BLACK_TARGET, 2), 2);
  const boardVotingBWO = clampScore(safeRatio(boardBWOPct, BOARD_WOMEN_TARGET, 1), 1);
  // CRITICAL FIX: Executive Directors use 50% target (NOT 60%)
  const execDirectorsBlack = clampScore(safeRatio(execBlackPct, EXEC_BLACK_TARGET, 2), 2);
  // CRITICAL FIX: Executive Directors Women use 25% target (NOT 30%)
  const execDirectorsBWO = clampScore(safeRatio(execBWOPct, EXEC_WOMEN_TARGET, 1), 1);
  const otherExecBlackScore = clampScore(safeRatio(otherExecBlackPct, OTHER_EXEC_BLACK_TARGET, 2), 2);
  const otherExecBWOScore = clampScore(safeRatio(otherExecBWOPct, OTHER_EXEC_WOMEN_TARGET, 1), 1);
  // EAP-based targets for Senior/Middle/Junior
  const seniorBlack = clampScore(safeRatio(seniorBlackPct, seniorEAP.blackTarget, 2), 2);
  const seniorBWO = clampScore(safeRatio(seniorBWOPct, seniorEAP.blackWomenTarget, 1), 1);
  const middleBlack = clampScore(safeRatio(middleBlackPct, middleEAP.blackTarget, 2), 2);
  const middleBWO = clampScore(safeRatio(middleBWOPct, middleEAP.blackWomenTarget, 1), 1);
  const juniorBlackScore = clampScore(safeRatio(juniorBlackPct, juniorEAP.blackTarget, 1), 1);
  const juniorBWOScore = clampScore(safeRatio(juniorBWOPct, juniorEAP.blackWomenTarget, 1), 1);
  const disabledScore = clampScore(safeRatio(blackDisabledPct, DISABLED_TARGET, 2), 2);

  const totalPoints = boardVotingBlack + boardVotingBWO +
    execDirectorsBlack + execDirectorsBWO +
    otherExecBlackScore + otherExecBWOScore +
    seniorBlack + seniorBWO +
    middleBlack + middleBWO +
    juniorBlackScore + juniorBWOScore +
    disabledScore;

  const subLines: ManagementSubLine[] = [
    { name: "Exercisable voting rights of black board members", target: "50%", weighting: 2, score: boardVotingBlack },
    { name: "Exercisable voting rights of black female board members", target: "25%", weighting: 1, score: boardVotingBWO },
    // CRITICAL FIX: Correct target is 50% (not 60%)
    { name: "Black executive directors", target: "50%", weighting: 2, score: execDirectorsBlack },
    // CRITICAL FIX: Correct target is 25% (not 30%)
    { name: "Black female executive directors", target: "25%", weighting: 1, score: execDirectorsBWO },
    { name: "Black other executive management", target: "60%", weighting: 2, score: otherExecBlackScore },
    { name: "Black female other executive management", target: "30%", weighting: 1, score: otherExecBWOScore },
    // EAP-based with actual percentage
    { name: "Black employees in senior management", target: `${(seniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: 2, score: seniorBlack },
    { name: "Black female employees in senior management", target: `${(seniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: 1, score: seniorBWO },
    { name: "Black employees in middle management", target: `${(middleEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: 2, score: middleBlack },
    { name: "Black female employees in middle management", target: `${(middleEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: 1, score: middleBWO },
    { name: "Black employees in junior management", target: `${(juniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: 1, score: juniorBlackScore },
    { name: "Black female employees in junior management", target: `${(juniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: 1, score: juniorBWOScore },
    { name: "Black employees with disabilities", target: "3%", weighting: 2, score: disabledScore },
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
    disabled: round2(disabledScore),
    total: round2(clampScore(totalPoints, MAX_TOTAL)),
    subMinimumMet: true,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    rawStats: {
      boardBlackPct: round2(boardBlackPct),
      boardBWOPct: round2(boardBWOPct),
      execBlackPct: round2(execBlackPct),
      execBWOPct: round2(execBWOPct),
      otherExecBlackPct: round2(otherExecBlackPct),
      otherExecBWOPct: round2(otherExecBWOPct),
      seniorBlackPct: round2(seniorBlackPct),
      seniorBWOPct: round2(seniorBWOPct),
      middleBlackPct: round2(middleBlackPct),
      middleBWOPct: round2(middleBWOPct),
      juniorBlackPct: round2(juniorBlackPct),
      juniorBWOPct: round2(juniorBWOPct),
      disabledBlackPct: round2(blackDisabledPct),
    },
  };
}
