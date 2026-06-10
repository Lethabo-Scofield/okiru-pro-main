/**
 * @domain-rule pillar:management_control, slides:96-106
 * @see docs/domain/pillars/02_management_control.md
 * @see docs/domain/calculations/management_control_calc.md
 * VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
 * Config is REQUIRED - all targets come from CalculatorConfig loaded from the API.
 */
import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import {
  isBlackRace,
  normalizeDesignationForScoring,
  safeRatio,
  clampScore,
  round2,
  requireSectorConfig,
  resolveSectorContext,
  allowsRcogpDefaults,
} from './shared';
import type { Province } from './eapTargets';
import { getEAPTargets, normalizeProvince, buildDemographicBreakdown, type DemographicBreakdown as EAPGroupBreakdown } from './eapTargets';
export type { DemoGroup, DemographicBreakdown as EAPGroupBreakdown } from './eapTargets';

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

/** RCOGP Generic defaults when no sector CalculatorConfig is supplied (tests / RCOGP Generic). */
const MANAGEMENT_RCOGP_DEFAULTS = {
  boardBlackTarget: 0.50,
  boardBlackPoints: 2,
  boardWomenTarget: 0.25,
  boardWomenPoints: 1,
  execBlackTarget: 0.50,
  execBlackPoints: 2,
  execWomenTarget: 0.25,
  execWomenPoints: 1,
  otherExecBlackTarget: 0.60,
  otherExecBlackMaxPts: 2,
  otherExecWomenTarget: 0.30,
  otherExecBWMaxPts: 1,
  seniorMaxPts: 2,
  seniorBWMaxPts: 1,
  middleMaxPts: 2,
  middleBWMaxPts: 1,
  juniorMaxPts: 1,
  juniorBWMaxPts: 1,
  disabledTarget: 0.02,
  disabledMaxPts: 2,
  maxPoints: 19,
} as const;

function mgmtFallback<T>(value: T | undefined, rcogpDefault: T, useRcogp: boolean): T {
  if (value !== undefined && value !== null) return value;
  return useRcogp ? rcogpDefault : (value as T);
}

/**
 * Per-demographic EAP scoring per RCOGP slide 100.
 * @see docs/domain/calculations/management_control_calc.md
 */
function calculateEAPScore(employees: Employee[], categoryTarget: number, maxPoints: number): { score: number; breakdown: EAPGroupBreakdown[] } {
  const breakdown = buildDemographicBreakdown(employees);
  if (employees.length === 0) return { score: 0, breakdown };
  const blackPct = countBlack(employees) / employees.length;
  const score = categoryTarget > 0
    ? Math.min((blackPct / categoryTarget) * maxPoints, maxPoints)
    : 0;
  return { score, breakdown };
}

const countBlack = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race)).length;

const countBlackWomen = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race) && e.gender === 'Female').length;

function groupByDesignation(employees: Employee[]): Record<string, Employee[]> {
  const groups: Record<string, Employee[]> = {};
  for (const emp of employees) {
    const key = normalizeDesignationForScoring(emp.designation);
    (groups[key] ??= []).push(emp);
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
  const { sectorCode, scorecardType } = resolveSectorContext(config);
  const management = requireSectorConfig(
    sectorCode,
    'management',
    config?.management as Record<string, unknown> | undefined,
    scorecardType,
  ) as Partial<NonNullable<CalculatorConfig['management']>>;
  const managementControl = requireSectorConfig(
    sectorCode,
    'managementControl',
    config?.managementControl as Record<string, unknown> | undefined,
    scorecardType,
  ) as Partial<NonNullable<CalculatorConfig['managementControl']>>;
  const employees = data.employees || [];
  console.log('[SCORING-TRACE] calculateManagementScore received:', {
    employeeCount: employees.length,
    eapProvince,
    designations: [...new Set(employees.map(e => e.designation))].slice(0, 8),
  });
  const grouped = groupByDesignation(employees);
  const combineExcoSenior = data.combineExcoSenior === true;
  const useRcogp = allowsRcogpDefaults(sectorCode, scorecardType);
  const rcogp = MANAGEMENT_RCOGP_DEFAULTS;

  const cfg = managementControl;
  const boardBlackTarget = mgmtFallback(cfg?.boardBlackTarget ?? management.boardBlackTarget, rcogp.boardBlackTarget, useRcogp);
  const boardWomenTarget = mgmtFallback(cfg?.boardBWTarget ?? management.boardWomenTarget, rcogp.boardWomenTarget, useRcogp);
  const boardBlackMaxPts = mgmtFallback(cfg?.boardBlackMaxPts ?? management.boardBlackPoints, rcogp.boardBlackPoints, useRcogp);
  const boardBWMaxPts = mgmtFallback(cfg?.boardBWMaxPts ?? management.boardWomenPoints, rcogp.boardWomenPoints, useRcogp);
  
  const execBlackTarget = mgmtFallback(cfg?.execBlackTarget ?? management.execBlackTarget, rcogp.execBlackTarget, useRcogp);
  const execWomenTarget = mgmtFallback(cfg?.execBWTarget ?? management.execWomenTarget, rcogp.execWomenTarget, useRcogp);
  const execBlackMaxPts = mgmtFallback(cfg?.execBlackMaxPts ?? management.execBlackPoints, rcogp.execBlackPoints, useRcogp);
  const execBWMaxPts = mgmtFallback(cfg?.execBWMaxPts ?? management.execWomenPoints, rcogp.execWomenPoints, useRcogp);
  
  const otherExecBlackTarget = mgmtFallback(cfg?.otherExecBlackTarget, rcogp.otherExecBlackTarget, useRcogp);
  const otherExecWomenTarget = mgmtFallback(cfg?.otherExecBWTarget, rcogp.otherExecWomenTarget, useRcogp);
  const otherExecBlackMaxPts = mgmtFallback(cfg?.otherExecBlackMaxPts, rcogp.otherExecBlackMaxPts, useRcogp);
  const otherExecBWMaxPts = mgmtFallback(cfg?.otherExecBWMaxPts, rcogp.otherExecBWMaxPts, useRcogp);
  
  const seniorMaxPts = mgmtFallback(cfg?.seniorMaxPts, rcogp.seniorMaxPts, useRcogp);
  const seniorBWMaxPts = mgmtFallback(cfg?.seniorBWMaxPts, rcogp.seniorBWMaxPts, useRcogp);
  const middleMaxPts = mgmtFallback(cfg?.middleMaxPts, rcogp.middleMaxPts, useRcogp);
  const middleBWMaxPts = mgmtFallback(cfg?.middleBWMaxPts, rcogp.middleBWMaxPts, useRcogp);
  const juniorMaxPts = mgmtFallback(cfg?.juniorMaxPts, rcogp.juniorMaxPts, useRcogp);
  const juniorBWMaxPts = mgmtFallback(cfg?.juniorBWMaxPts, rcogp.juniorBWMaxPts, useRcogp);
  
  const disabledTarget = mgmtFallback(
    config?.employmentEquity?.disabledTarget ?? cfg?.disabledTarget ?? management.disabledTarget,
    rcogp.disabledTarget,
    useRcogp,
  );
  const disabledMaxPts = mgmtFallback(
    config?.employmentEquity?.disabledMaxPts ?? cfg?.disabledMaxPts,
    rcogp.disabledMaxPts,
    useRcogp,
  );
  
  const configuredMcMax = config?.pillarConfigs?.managementControl?.maxPoints;
  const maxTotal = (configuredMcMax != null && configuredMcMax > 0)
    ? configuredMcMax
    : mgmtFallback(config?.managementControl?.maxPoints, rcogp.maxPoints, useRcogp);
  const subMinPercent = config?.pillarConfigs?.managementControl?.subMinimumPercent ?? 40;

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

  const seniorTarget = cfg?.seniorBlackTarget ?? seniorEAP.blackTarget;
  const seniorBWTarget = seniorEAP.blackWomenTarget;
  const middleTarget = cfg?.middleBlackTarget ?? middleEAP.blackTarget;
  const middleBWTarget = middleEAP.blackWomenTarget;
  const juniorTarget = cfg?.juniorBlackTarget ?? juniorEAP.blackTarget;
  const juniorBWTarget = juniorEAP.blackWomenTarget;

  // Toolkit toggle: merge Other Executive + Senior into one band (4 + 2 pts).
  const combinedExcoSeniorEmps = [...otherExec, ...senior];
  const combinedExcoBlackPct = pctOf(combinedExcoSeniorEmps, countBlack);
  const combinedExcoBWOPct = pctOf(combinedExcoSeniorEmps, countBlackWomen);
  const combinedExcoBlackMax = otherExecBlackMaxPts + seniorMaxPts;
  const combinedExcoBWMax = otherExecBWMaxPts + seniorBWMaxPts;

  let otherExecBlackScore: number;
  let otherExecBWOScore: number;
  let seniorBlack: number;
  let seniorBWO: number;

  if (combineExcoSenior) {
    otherExecBlackScore = clampScore(
      safeRatio(combinedExcoBlackPct, otherExecBlackTarget, combinedExcoBlackMax),
      combinedExcoBlackMax,
    );
    otherExecBWOScore = clampScore(
      safeRatio(combinedExcoBWOPct, otherExecWomenTarget, combinedExcoBWMax),
      combinedExcoBWMax,
    );
    seniorBlack = 0;
    seniorBWO = 0;
  } else {
    otherExecBlackScore = clampScore(safeRatio(otherExecBlackPct, otherExecBlackTarget, otherExecBlackMaxPts), otherExecBlackMaxPts);
    otherExecBWOScore = clampScore(safeRatio(otherExecBWOPct, otherExecWomenTarget, otherExecBWMaxPts), otherExecBWMaxPts);
    seniorBlack = clampScore(safeRatio(seniorBlackPct, seniorTarget, seniorMaxPts), seniorMaxPts);
    seniorBWO = clampScore(safeRatio(seniorBWOPct, seniorBWTarget, seniorBWMaxPts), seniorBWMaxPts);
  }

  // Lake Trading Fix Plan §1 Bug 2 — match the Excel ground-truth template
  // (and `apps/api/pipeline/rules/pillarCalculators.ts::calcManagement`) by
  // scoring Black and BWO independently with simple safeRatio against the
  // provincial EAP target. The per-demographic breakdown is still surfaced
  // below for UI diagnostics. Junior includes Semi-skilled and Unskilled.

  const juniorCombined = [...junior, ...semiSkilled, ...unskilled];
  const juniorCombinedBlackPct = pctOf(juniorCombined, countBlack);
  const juniorCombinedBWOPct = pctOf(juniorCombined, countBlackWomen);

  const middleBlack = clampScore(safeRatio(middleBlackPct, middleTarget, middleMaxPts), middleMaxPts);
  const middleBWO = clampScore(safeRatio(middleBWOPct, middleBWTarget, middleBWMaxPts), middleBWMaxPts);
  const juniorBlackScore = clampScore(safeRatio(juniorCombinedBlackPct, juniorTarget, juniorMaxPts), juniorMaxPts);
  const juniorBWOScore = clampScore(safeRatio(juniorCombinedBWOPct, juniorBWTarget, juniorBWMaxPts), juniorBWMaxPts);

  const seniorEAPResult = calculateEAPScore(senior, seniorTarget, seniorMaxPts + seniorBWMaxPts);
  const middleEAPResult = calculateEAPScore(middle, middleTarget, middleMaxPts + middleBWMaxPts);
  const juniorEAPResult = calculateEAPScore(juniorCombined, juniorTarget, juniorMaxPts + juniorBWMaxPts);

  // Skilled Technical is informational only (not part of RCOGP 19-point total)
  const skilledTechnicalBlackScore = clampScore(safeRatio(skilledTechnicalBlackPct, skilledTechnicalEAP.blackTarget, seniorMaxPts), seniorMaxPts);
  const skilledTechnicalBWOScore = clampScore(safeRatio(skilledTechnicalBWOPct, skilledTechnicalEAP.blackWomenTarget, seniorBWMaxPts), seniorBWMaxPts);
  const disabledScore = clampScore(safeRatio(blackDisabledPct, disabledTarget, disabledMaxPts), disabledMaxPts);

  // FSC (and similar): Senior/Middle/Junior bands are permanently NOT AVAILABLE (0 pts).
  const smjNotAvailable =
    seniorMaxPts === 0 && seniorBWMaxPts === 0 &&
    middleMaxPts === 0 && middleBWMaxPts === 0 &&
    juniorMaxPts === 0 && juniorBWMaxPts === 0;

  // RCOGP total: Board + Exec + Other Exec + Senior + Middle + Junior + Disabled = 19
  const totalPoints = boardVotingBlack + boardVotingBWO +
    execDirectorsBlack + execDirectorsBWO +
    otherExecBlackScore + otherExecBWOScore +
    seniorBlack + seniorBWO +
    middleBlack + middleBWO +
    juniorBlackScore + juniorBWOScore +
    disabledScore;

  const smjSubLines: ManagementSubLine[] = smjNotAvailable
    ? [
        { name: "Senior Management (NOT AVAILABLE)", target: "0%", weighting: 0, score: 0 },
        { name: "Middle Management (NOT AVAILABLE)", target: "0%", weighting: 0, score: 0 },
        { name: "Junior Management (NOT AVAILABLE)", target: "0%", weighting: 0, score: 0 },
      ]
    : [
        { name: "Black employees in senior management", target: `${(seniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorMaxPts, score: seniorBlack },
        { name: "Black female employees in senior management", target: `${(seniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorBWMaxPts, score: seniorBWO },
        { name: "Black employees in middle management", target: `${(middleEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: middleMaxPts, score: middleBlack },
        { name: "Black female employees in middle management", target: `${(middleEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: middleBWMaxPts, score: middleBWO },
        { name: "Black employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: juniorMaxPts, score: juniorBlackScore },
        { name: "Black female employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: juniorBWMaxPts, score: juniorBWOScore },
      ];

  const skilledTechnicalSubLines: ManagementSubLine[] = seniorMaxPts > 0
    ? [
        { name: "Black employees in skilled technical positions", target: `${(skilledTechnicalEAP.blackTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorMaxPts, score: skilledTechnicalBlackScore },
        { name: "Black female employees in skilled technical positions", target: `${(skilledTechnicalEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`, weighting: seniorBWMaxPts, score: skilledTechnicalBWOScore },
      ]
    : [];

  const subLines: ManagementSubLine[] = [
    { name: "Exercisable voting rights of black board members", target: `${(boardBlackTarget * 100).toFixed(0)}%`, weighting: boardBlackMaxPts, score: boardVotingBlack },
    { name: "Exercisable voting rights of black female board members", target: `${(boardWomenTarget * 100).toFixed(0)}%`, weighting: boardBWMaxPts, score: boardVotingBWO },
    { name: "Black executive directors", target: `${(execBlackTarget * 100).toFixed(0)}%`, weighting: execBlackMaxPts, score: execDirectorsBlack },
    { name: "Black female executive directors", target: `${(execWomenTarget * 100).toFixed(0)}%`, weighting: execBWMaxPts, score: execDirectorsBWO },
    { name: "Black other executive management", target: `${(otherExecBlackTarget * 100).toFixed(0)}%`, weighting: otherExecBlackMaxPts, score: otherExecBlackScore },
    { name: "Black female other executive management", target: `${(otherExecWomenTarget * 100).toFixed(0)}%`, weighting: otherExecBWMaxPts, score: otherExecBWOScore },
    ...smjSubLines,
    ...skilledTechnicalSubLines,
    { name: "Black employees with disabilities", target: `${(disabledTarget * 100).toFixed(0)}%`, weighting: disabledMaxPts, score: disabledScore },
  ];

  const finalTotal = round2(clampScore(totalPoints, maxTotal));
  console.log(`[SCORING-TRACE] calculateManagementScore result: ${finalTotal} / ${maxTotal}`);

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
    total: finalTotal,
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
