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
import {
  getEAPTargets,
  getEffectiveEap,
  getEffectiveBlackFemaleEap,
  classifyDemographic,
  normalizeProvince,
  type DemographicBreakdown as EAPGroupBreakdown,
} from './eapTargets';
import type { DemoGroup } from './eapNorms';
export type { DemoGroup, DemographicBreakdown as EAPGroupBreakdown } from './eapTargets';

const BLACK_GROUPS: DemoGroup[] = ['AM', 'CM', 'IM', 'AF', 'CF', 'IF'];
const BLACK_FEMALE_GROUPS: DemoGroup[] = ['AF', 'CF', 'IF'];
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Per-demographic band scoring — faithful replica of the workbook `MC Scorecard`
 * (e.g. Senior: E31 = $E$30*EAP!C23, F31 = F$30*EAP!C23, H31 = MIN(G31/E31*F31, F31)).
 * Each demographic group g gets:
 *   subTarget_g = bandTarget × eff_g,  maxPts_g = bandMaxPts × eff_g,
 *   score_g     = min(actual_g / subTarget_g × maxPts_g, maxPts_g)
 * Band score = Σ score_g. The breakdown reports the EAP proportion (eff_g) per group.
 */
function scoreBandPerDemographic(
  emps: Employee[],
  bandTarget: number,
  bandMaxPts: number,
  eapSet: Partial<Record<DemoGroup, number>>,
  groups: DemoGroup[],
): { score: number; breakdown: EAPGroupBreakdown[] } {
  const total = emps.length;
  let score = 0;
  const breakdown: EAPGroupBreakdown[] = [];
  for (const g of groups) {
    const eff = eapSet[g] || 0;
    const subTarget = bandTarget * eff;
    const maxPtsG = bandMaxPts * eff;
    const count = emps.filter(e => classifyDemographic(e.gender, e.race) === g).length;
    const actual = total > 0 ? count / total : 0;
    const scoreG = subTarget > 0 ? Math.min((actual / subTarget) * maxPtsG, maxPtsG) : 0;
    score += scoreG;
    breakdown.push({ group: g, eapTarget: round4(eff), actual: round4(actual), count, totalInLevel: total });
  }
  return { score, breakdown };
}

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
  // Band black / black-female targets (workbook MC Scorecard E30/E37/E43/E50/E56/E63).
  // These are split across demographic groups by the effective EAP for the client's province.
  seniorBlackTarget: 0.60,
  seniorBWTarget: 0.30,
  middleBlackTarget: 0.75,
  middleBWTarget: 0.38,
  juniorBlackTarget: 0.88,
  juniorBWTarget: 0.44,
  disabledTarget: 0.02,
  disabledMaxPts: 2,
  maxPoints: 19,
} as const;

function mgmtFallback<T>(value: T | undefined, rcogpDefault: T, useRcogp: boolean): T {
  if (value !== undefined && value !== null) return value;
  return useRcogp ? rcogpDefault : (value as T);
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
  eapProvince?: string,
  eapYear?: number,
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
  const grouped = groupByDesignation(employees);
  const combineExcoSenior = data.combineExcoSenior === true;
  const useRcogp = allowsRcogpDefaults(sectorCode, scorecardType);
  // QSE scorecards score Senior+Middle+Junior management as ONE combined band
  // against flat 60%/30% targets (no provincial-EAP split). See the isQse branch
  // below. (TOOLKIT-RESOLVED.md S4; DISCREPANCY-LEDGER rcogp/qse D-01, ict/qse D-02.)
  const isQse = String(scorecardType ?? '').toUpperCase() === 'QSE';
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

  // Get EAP targets based on province + report year.
  const province = normalizeProvince(eapProvince || 'National') as Province;
  const skilledTechnicalEAP = getEAPTargets(province, 'Skilled Technical'); // informational only

  // Per-demographic effective EAP sets (workbook EAP!C23:C28 = 6-group; C30:C32 = black-female).
  const effEap = getEffectiveEap(province, eapYear);
  const effBfEap = getEffectiveBlackFemaleEap(province, eapYear);

  // Band black / black-female targets — config-driven (RCOGP fallback 0.60/0.75/0.88, 0.30/0.38/0.44).
  const seniorBlackTarget = mgmtFallback(cfg?.seniorBlackTarget, rcogp.seniorBlackTarget, useRcogp);
  const seniorBWBandTarget = mgmtFallback(cfg?.seniorBWTarget, rcogp.seniorBWTarget, useRcogp);
  const middleBlackTarget = mgmtFallback(cfg?.middleBlackTarget, rcogp.middleBlackTarget, useRcogp);
  const middleBWBandTarget = mgmtFallback(cfg?.middleBWTarget, rcogp.middleBWTarget, useRcogp);
  const juniorBlackTarget = mgmtFallback(cfg?.juniorBlackTarget, rcogp.juniorBlackTarget, useRcogp);
  const juniorBWBandTarget = mgmtFallback(cfg?.juniorBWTarget, rcogp.juniorBWTarget, useRcogp);

  // Board members for the voting indicator = non-executive board members PLUS
  // executive directors (executive directors sit on the board). Without the exec
  // directors, an entity whose only directors are executive scores 0 board voting
  // even when they hold all the voting rights — e.g. Lake Trading's 2 executive
  // directors at 50% each (Excel credits the full 2 points).
  const board = [
    ...(grouped['Board'] || []),
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
  ];
  // QSE "Executive Management" (Section 1) combines Executive Directors AND Other
  // Executive Managers into ONE band (workbook MC Scorecard F24 = COUNTIFS over
  // Designation.calcs ∈ {Executive Director, Other Executive Manager}). The Generic
  // codes keep Other Executive Management as a separate band, so only fold it in for
  // QSE. (DISCREPANCY-LEDGER rcogp/qse & ict/qse D-01.)
  const execDirs = isQse
    ? [
        ...(grouped['Executive'] || []),
        ...(grouped['Executive Director'] || []),
        ...(grouped['Other Executive Management'] || []),
      ]
    : [
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

  // Board "exercisable voting rights": weight each board member by their entered
  // votingRightsPercent when the board's voting shares are an intentionally COMPLETE
  // distribution (sum ≈ 100%); otherwise fall back to equal-weight headcount. This
  // connects the previously-orphaned votingRightsPercent input — live bug: a user
  // entered 33% black-female board voting and scored 0 because the field was never
  // read. Targets stay the per-sector config values (boardBlackTarget/boardWomenTarget).
  const boardVotingSum = board.reduce((s, e) => s + (e.votingRightsPercent ?? 0), 0);
  const useBoardVotingWeights = boardVotingSum >= 99 && boardVotingSum <= 101;
  const boardBlackVoting = board.reduce((s, e) => s + (isBlackRace(e.race) ? (e.votingRightsPercent ?? 0) : 0), 0);
  const boardBWVoting = board.reduce((s, e) => s + (isBlackRace(e.race) && e.gender === 'Female' ? (e.votingRightsPercent ?? 0) : 0), 0);
  const boardBlackPct = useBoardVotingWeights ? boardBlackVoting / boardVotingSum : pctOf(board, countBlack);
  const boardBWOPct = useBoardVotingWeights ? boardBWVoting / boardVotingSum : pctOf(board, countBlackWomen);
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

  // Junior band combines Junior + Semi-skilled + Unskilled (workbook grouping).
  const juniorCombined = [...junior, ...semiSkilled, ...unskilled];

  // Per-demographic band scoring — faithful replica of the workbook MC Scorecard.
  // Black bands split their target across the 6-group effective EAP; black-female
  // bands split across the black-female-only effective set. Scores sum per band.
  const seniorBlackResult = scoreBandPerDemographic(senior, seniorBlackTarget, seniorMaxPts, effEap, BLACK_GROUPS);
  const seniorBWResult = scoreBandPerDemographic(senior, seniorBWBandTarget, seniorBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS);
  const middleBlackResult = scoreBandPerDemographic(middle, middleBlackTarget, middleMaxPts, effEap, BLACK_GROUPS);
  const middleBWResult = scoreBandPerDemographic(middle, middleBWBandTarget, middleBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS);
  const juniorBlackResult = scoreBandPerDemographic(juniorCombined, juniorBlackTarget, juniorMaxPts, effEap, BLACK_GROUPS);
  const juniorBWResult = scoreBandPerDemographic(juniorCombined, juniorBWBandTarget, juniorBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS);

  // Toolkit toggle: merge Other Executive + Senior into one band (aggregate scoring).
  const combinedExcoSeniorEmps = [...otherExec, ...senior];
  const combinedExcoBlackPct = pctOf(combinedExcoSeniorEmps, countBlack);
  const combinedExcoBWOPct = pctOf(combinedExcoSeniorEmps, countBlackWomen);
  const combinedExcoBlackMax = otherExecBlackMaxPts + seniorMaxPts;
  const combinedExcoBWMax = otherExecBWMaxPts + seniorBWMaxPts;

  let otherExecBlackScore: number;
  let otherExecBWOScore: number;
  let seniorBlack: number;
  let seniorBWO: number;

  if (isQse) {
    // QSE Management Control Section 2: Senior + Middle + Junior management are
    // scored as ONE combined band against FLAT targets (60% / 30%), not the
    // Generic per-band provincial-EAP split. Workbook MC Scorecard:
    //   F29 = Σ COUNTIFS(Designation.calcs ∈ {Senior,Middle,Junior Manager}, Black?=Yes)
    //         / Σ COUNTIFS(Designation.calcs ∈ {…})
    //   G29 = MIN(F29 / 0.60 × 6, 6);  the black-female row uses 0.30 × 2.
    // seniorMaxPts (6) + seniorBWMaxPts (2) carry the whole 8-pt SMJ band;
    // middle/junior maxPts are 0, so their EAP-split results stay 0.
    const smj = [...senior, ...middle, ...junior];
    const smjBlackPct = pctOf(smj, countBlack);
    const smjBWOPct = pctOf(smj, countBlackWomen);
    otherExecBlackScore = clampScore(safeRatio(otherExecBlackPct, otherExecBlackTarget, otherExecBlackMaxPts), otherExecBlackMaxPts);
    otherExecBWOScore = clampScore(safeRatio(otherExecBWOPct, otherExecWomenTarget, otherExecBWMaxPts), otherExecBWMaxPts);
    seniorBlack = clampScore(safeRatio(smjBlackPct, seniorBlackTarget, seniorMaxPts), seniorMaxPts);
    seniorBWO = clampScore(safeRatio(smjBWOPct, seniorBWBandTarget, seniorBWMaxPts), seniorBWMaxPts);
  } else if (combineExcoSenior) {
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
    seniorBlack = clampScore(seniorBlackResult.score, seniorMaxPts);
    seniorBWO = clampScore(seniorBWResult.score, seniorBWMaxPts);
  }

  const middleBlack = clampScore(middleBlackResult.score, middleMaxPts);
  const middleBWO = clampScore(middleBWResult.score, middleBWMaxPts);
  const juniorBlackScore = clampScore(juniorBlackResult.score, juniorMaxPts);
  const juniorBWOScore = clampScore(juniorBWResult.score, juniorBWMaxPts);

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
        { name: "Black employees in senior management", target: `${(seniorBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: seniorMaxPts, score: seniorBlack },
        { name: "Black female employees in senior management", target: `${(seniorBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: seniorBWMaxPts, score: seniorBWO },
        { name: "Black employees in middle management", target: `${(middleBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: middleMaxPts, score: middleBlack },
        { name: "Black female employees in middle management", target: `${(middleBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: middleBWMaxPts, score: middleBWO },
        { name: "Black employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: juniorMaxPts, score: juniorBlackScore },
        { name: "Black female employees in junior management (incl. Semi-skilled & Unskilled)", target: `${(juniorBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: juniorBWMaxPts, score: juniorBWOScore },
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
      senior: seniorBlackResult.breakdown,
      middle: middleBlackResult.breakdown,
      junior: juniorBlackResult.breakdown,
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
