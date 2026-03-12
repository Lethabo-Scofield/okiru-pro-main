import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore } from './shared';

const BOARD_BLACK_TARGET = 0.50;
const BOARD_WOMEN_TARGET = 0.25;
const EXEC_BLACK_TARGET = 0.60;
const EXEC_WOMEN_TARGET = 0.30;
const OTHER_EXEC_BLACK_TARGET = 0.60;
const OTHER_EXEC_WOMEN_TARGET = 0.30;
const SENIOR_TARGET = 0.60;
const MIDDLE_TARGET = 0.75;
const JUNIOR_TARGET = 0.88;
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

export function calculateManagementScore(data: ManagementData, config?: CalculatorConfig): ManagementResult {
  const employees = data.employees || [];
  const grouped = groupByDesignation(employees);

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
  const execDirectorsBlack = clampScore(safeRatio(execBlackPct, EXEC_BLACK_TARGET, 2), 2);
  const execDirectorsBWO = clampScore(safeRatio(execBWOPct, EXEC_WOMEN_TARGET, 1), 1);
  const otherExecBlackScore = clampScore(safeRatio(otherExecBlackPct, OTHER_EXEC_BLACK_TARGET, 2), 2);
  const otherExecBWOScore = clampScore(safeRatio(otherExecBWOPct, OTHER_EXEC_WOMEN_TARGET, 1), 1);
  const seniorBlack = clampScore(safeRatio(seniorBlackPct, SENIOR_TARGET, 2), 2);
  const seniorBWO = clampScore(safeRatio(seniorBWOPct, SENIOR_TARGET * 0.5, 1), 1);
  const middleBlack = clampScore(safeRatio(middleBlackPct, MIDDLE_TARGET, 2), 2);
  const middleBWO = clampScore(safeRatio(middleBWOPct, MIDDLE_TARGET * 0.5, 1), 1);
  const juniorBlackScore = clampScore(safeRatio(juniorBlackPct, JUNIOR_TARGET, 1), 1);
  const juniorBWOScore = clampScore(safeRatio(juniorBWOPct, JUNIOR_TARGET * 0.5, 1), 1);
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
    { name: "Black executive directors", target: "60%", weighting: 2, score: execDirectorsBlack },
    { name: "Black female executive directors", target: "30%", weighting: 1, score: execDirectorsBWO },
    { name: "Black other executive management", target: "60%", weighting: 2, score: otherExecBlackScore },
    { name: "Black female other executive management", target: "30%", weighting: 1, score: otherExecBWOScore },
    { name: "Black employees in senior management", target: "60% / EAP", weighting: 2, score: seniorBlack },
    { name: "Black female employees in senior management", target: "30% / EAP", weighting: 1, score: seniorBWO },
    { name: "Black employees in middle management", target: "75% / EAP", weighting: 2, score: middleBlack },
    { name: "Black female employees in middle management", target: "37.5% / EAP", weighting: 1, score: middleBWO },
    { name: "Black employees in junior management", target: "88%", weighting: 1, score: juniorBlackScore },
    { name: "Black female employees in junior management", target: "44%", weighting: 1, score: juniorBWOScore },
    { name: "Black employees with disabilities", target: "3%", weighting: 2, score: disabledScore },
  ];

  return {
    boardVotingBlack,
    boardVotingBWO,
    execDirectorsBlack,
    execDirectorsBWO,
    otherExecBlack: otherExecBlackScore,
    otherExecBWO: otherExecBWOScore,
    seniorBlack,
    seniorBWO,
    middleBlack,
    middleBWO,
    juniorBlack: juniorBlackScore,
    juniorBWO: juniorBWOScore,
    disabled: disabledScore,
    total: clampScore(totalPoints, MAX_TOTAL),
    subMinimumMet: true,
    subLines,
    rawStats: {
      boardBlackPct,
      boardBWOPct,
      execBlackPct,
      execBWOPct,
      otherExecBlackPct,
      otherExecBWOPct,
      seniorBlackPct,
      seniorBWOPct,
      middleBlackPct,
      middleBWOPct,
      juniorBlackPct,
      juniorBWOPct,
      disabledBlackPct: blackDisabledPct,
    },
  };
}
