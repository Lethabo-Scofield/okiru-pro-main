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
  genderOf: (e: Employee) => Employee['gender'] = (e) => e.gender,
): { score: number; breakdown: EAPGroupBreakdown[] } {
  // The whole band is the denominator, foreign nationals included; only a black
  // South African fills a demographic group (toolkit `Black?`).
  const total = emps.length;
  let score = 0;
  const breakdown: EAPGroupBreakdown[] = [];
  for (const g of groups) {
    const eff = eapSet[g] || 0;
    const subTarget = bandTarget * eff;
    const maxPtsG = bandMaxPts * eff;
    const count = emps.filter(e => !e.isForeign && classifyDemographic(genderOf(e), e.race) === g).length;
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
  /** Free-text detail rendered under the row (informational bands, caveats). */
  note?: string;
  /**
   * Bonus indicator — awarded on top of the element weighting, not out of it.
   * No generic-Codes MC indicator is a bonus, so this calculator never sets it;
   * the field exists because the Management Control page renders either these
   * lines or the Transport calculators' (which do carry bonuses), and the split
   * shown to the user must come from the flag rather than from the page guessing.
   */
  isBonus?: boolean;
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
  /** The total before rounding: the scorecard adds these, as the toolkit adds full precision. */
  exactTotal?: number;
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

function mgmtFallback<T>(value: T | undefined, rcogpDefault: T, _useRcogp: boolean): T {
  if (value !== undefined && value !== null) return value;
  // A missing config value must never propagate as `undefined` — that flows into
  // a sub-line weighting / target and crashes `.toFixed()` on the pillar page
  // (live "Cannot read properties of undefined (reading 'toFixed')" on Transport
  // Management Control). Fall back to the RCOGP default (always a number) for
  // every sector; a complete sector config never reaches this line.
  return rcogpDefault;
}

/**
 * Toolkit `Black?`: African, Coloured or Indian AND not a foreign national.
 * Foreign nationals still count in every denominator — they are employees —
 * but never as black. (MC Data: Black? = AND(race ∈ {A,C,I}, Foreign.calcs <> "Yes").)
 */
const isBlackSouthAfrican = (e: Employee): boolean => isBlackRace(e.race) && !e.isForeign;

/**
 * Toolkit `Gender [Verified]`: the 7th digit of a 13-digit SA ID number decides
 * (5-9 male, 1-4 female); a missing, foreign or unreadable ID keeps the entered
 * gender. The toolkit's combined Other Exec + Senior sheet scores on this, its
 * separate sheet on the entered gender — reproduced as written.
 */
export function verifiedGender(e: Employee): Employee['gender'] {
  const id = String(e.idNumber ?? '').replace(/\s/g, '');
  if (!/^\d{13}$/.test(id) || id.slice(10, 12) === '18') return e.gender;
  const d = id[6];
  if (d >= '5') return 'Male';
  if (d > '0') return 'Female';
  return e.gender;
}

const countBlack = (emps: Employee[]): number =>
  emps.filter(isBlackSouthAfrican).length;

const countBlackWomenBy = (genderOf: (e: Employee) => Employee['gender']) => (emps: Employee[]): number =>
  emps.filter(e => isBlackSouthAfrican(e) && genderOf(e) === 'Female').length;

const countBlackWomen = countBlackWomenBy((e) => e.gender);

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
  // The toolkit's combined sheet reads gender from the ID number; its separate
  // sheet reads the gender entered. Each layout is reproduced as written.
  const genderOf = combineExcoSenior ? verifiedGender : (e: Employee) => e.gender;
  const countBW = countBlackWomenBy(genderOf);
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

  // Board line. The Empower toolkit measures it by HEADCOUNT — black board
  // members over all board members — even though the indicator is worded
  // "exercisable voting rights" and the MC Data sheet collects voting rights
  // (no formula reads that column). Headcount is the default so the score
  // matches the toolkit; a sector may set boardMeasure 'votingRights' to weight
  // each member by the voting rights entered, used only when they add up to a
  // complete board (≈100%).
  const boardMeasure = cfg?.boardMeasure ?? 'headcount';
  const boardVotingSum = board.reduce((s, e) => s + (e.votingRightsPercent ?? 0), 0);
  const useBoardVotingWeights = boardMeasure === 'votingRights' && boardVotingSum >= 99 && boardVotingSum <= 101;
  const boardBlackVoting = board.reduce((s, e) => s + (isBlackSouthAfrican(e) ? (e.votingRightsPercent ?? 0) : 0), 0);
  const boardBWVoting = board.reduce((s, e) => s + (isBlackSouthAfrican(e) && genderOf(e) === 'Female' ? (e.votingRightsPercent ?? 0) : 0), 0);
  const boardBlackPct = useBoardVotingWeights ? boardBlackVoting / boardVotingSum : pctOf(board, countBlack);
  const boardBWOPct = useBoardVotingWeights ? boardBWVoting / boardVotingSum : pctOf(board, countBW);
  const execBlackPct = pctOf(execDirs, countBlack);
  const execBWOPct = pctOf(execDirs, countBW);
  const otherExecBlackPct = pctOf(otherExec, countBlack);
  const otherExecBWOPct = pctOf(otherExec, countBW);
  const seniorBlackPct = pctOf(senior, countBlack);
  const seniorBWOPct = pctOf(senior, countBW);
  const middleBlackPct = pctOf(middle, countBlack);
  const middleBWOPct = pctOf(middle, countBW);
  const juniorBlackPct = pctOf(junior, countBlack);
  const juniorBWOPct = pctOf(junior, countBW);
  // Employment Equity additional levels percentages
  const skilledTechnicalBlackPct = pctOf(skilledTechnical, countBlack);
  const skilledTechnicalBWOPct = pctOf(skilledTechnical, countBlackWomen);
  const semiSkilledBlackPct = pctOf(semiSkilled, countBlack);
  const semiSkilledBWOPct = pctOf(semiSkilled, countBlackWomen);
  const unskilledBlackPct = pctOf(unskilled, countBlack);
  const unskilledBWOPct = pctOf(unskilled, countBlackWomen);

  // Disabled line: black South African employees with a disability over ALL
  // employees — every row except non-executive board members (toolkit
  // Employee? = designation <> "Non-executive Director").
  const staff = employees.filter(e => normalizeDesignationForScoring(e.designation) !== 'Board');
  const disabledEmps = staff.filter(e => e.isDisabled);
  const blackDisabledPct = staff.length > 0
    ? countBlack(disabledEmps) / staff.length
    : 0;

  const boardVotingBlack = clampScore(safeRatio(boardBlackPct, boardBlackTarget, boardBlackMaxPts), boardBlackMaxPts);
  const boardVotingBWO = clampScore(safeRatio(boardBWOPct, boardWomenTarget, boardBWMaxPts), boardBWMaxPts);
  const execDirectorsBlack = clampScore(safeRatio(execBlackPct, execBlackTarget, execBlackMaxPts), execBlackMaxPts);
  const execDirectorsBWO = clampScore(safeRatio(execBWOPct, execWomenTarget, execBWMaxPts), execBWMaxPts);

  // Junior band = "Junior Manager" only. The toolkit counts no Semi-skilled or
  // Unskilled employee in any Management Control band (MC Scorecard K57:K66
  // filter Designation.calcs = "Junior Manager"); folding them in moved the
  // junior lines away from the toolkit's.

  // Per-demographic band scoring — faithful replica of the workbook MC Scorecard.
  // Black bands split their target across the 6-group effective EAP; black-female
  // bands split across the black-female-only effective set. Scores sum per band.
  const seniorBlackResult = scoreBandPerDemographic(senior, seniorBlackTarget, seniorMaxPts, effEap, BLACK_GROUPS, genderOf);
  const seniorBWResult = scoreBandPerDemographic(senior, seniorBWBandTarget, seniorBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS, genderOf);
  const middleBlackResult = scoreBandPerDemographic(middle, middleBlackTarget, middleMaxPts, effEap, BLACK_GROUPS, genderOf);
  const middleBWResult = scoreBandPerDemographic(middle, middleBWBandTarget, middleBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS, genderOf);
  const juniorBlackResult = scoreBandPerDemographic(junior, juniorBlackTarget, juniorMaxPts, effEap, BLACK_GROUPS, genderOf);
  const juniorBWResult = scoreBandPerDemographic(junior, juniorBWBandTarget, juniorBWMaxPts, effBfEap, BLACK_FEMALE_GROUPS, genderOf);

  // Toolkit toggle: merge Other Executive + Senior into one band (aggregate scoring).
  const combinedExcoSeniorEmps = [...otherExec, ...senior];
  const combinedExcoBlackPct = pctOf(combinedExcoSeniorEmps, countBlack);
  const combinedExcoBWOPct = pctOf(combinedExcoSeniorEmps, countBW);
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
    const smjBWOPct = pctOf(smj, countBW);
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
        // Combined layout: senior management is scored inside the other-executive
        // line, so its own two lines carry no weighting (toolkit Summary C35:C36 "N/A").
        { name: "Black employees in senior management", target: `${(seniorBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: combineExcoSenior && !isQse ? 0 : seniorMaxPts, score: seniorBlack, ...(combineExcoSenior && !isQse ? { note: 'Combined with other executive management.' } : {}) },
        { name: "Black female employees in senior management", target: `${(seniorBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: combineExcoSenior && !isQse ? 0 : seniorBWMaxPts, score: seniorBWO, ...(combineExcoSenior && !isQse ? { note: 'Combined with other executive management.' } : {}) },
        { name: "Black employees in middle management", target: `${(middleBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: middleMaxPts, score: middleBlack },
        { name: "Black female employees in middle management", target: `${(middleBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: middleBWMaxPts, score: middleBWO },
        { name: "Black employees in junior management", target: `${(juniorBlackTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: juniorMaxPts, score: juniorBlackScore },
        { name: "Black female employees in junior management", target: `${(juniorBWBandTarget * 100).toFixed(0)}% (EAP-adjusted)`, weighting: juniorBWMaxPts, score: juniorBWOScore },
      ];

  /**
   * Skilled Technical is INFORMATIONAL — the Codes do not award points for it,
   * and `totalPoints` below deliberately excludes these two scores.
   *
   * They used to be emitted with `weighting: seniorMaxPts` (borrowed from the
   * Senior band), which put points into the breakdown that the pillar can never
   * award: RCOGP Generic MC showed 15 lines summing to 22 against a 19-pt cap,
   * RCOGP QSE 23 against 15. That breaks the invariant that a breakdown
   * reconciles to its pillar, and it corrupts the base/bonus split, which is
   * derived from these same sub-line weightings.
   *
   * Emitted as weighting 0 / score 0 with the achievement in the note — the
   * same shape `eapDetailRows` uses for informational rows — so the reader
   * still sees the band without it pretending to be scored.
   */
  const skilledTechnicalSubLines: ManagementSubLine[] = seniorMaxPts > 0
    ? [
        {
          name: "Black employees in skilled technical positions (informational — not scored)",
          target: `${(skilledTechnicalEAP.blackTarget * 100).toFixed(1)}% (EAP)`,
          weighting: 0,
          score: 0,
          note: `Actual ${(skilledTechnicalBlackPct * 100).toFixed(1)}% — the Codes award no points for this band.`,
        },
        {
          name: "Black female employees in skilled technical positions (informational — not scored)",
          target: `${(skilledTechnicalEAP.blackWomenTarget * 100).toFixed(1)}% (EAP)`,
          weighting: 0,
          score: 0,
          note: `Actual ${(skilledTechnicalBWOPct * 100).toFixed(1)}% — the Codes award no points for this band.`,
        },
      ]
    : [];

  const subLines: ManagementSubLine[] = [
    { name: "Exercisable voting rights of black board members", target: `${(boardBlackTarget * 100).toFixed(0)}%`, weighting: boardBlackMaxPts, score: boardVotingBlack },
    { name: "Exercisable voting rights of black female board members", target: `${(boardWomenTarget * 100).toFixed(0)}%`, weighting: boardBWMaxPts, score: boardVotingBWO },
    { name: "Black executive directors", target: `${(execBlackTarget * 100).toFixed(0)}%`, weighting: execBlackMaxPts, score: execDirectorsBlack },
    { name: "Black female executive directors", target: `${(execWomenTarget * 100).toFixed(0)}%`, weighting: execBWMaxPts, score: execDirectorsBWO },
    { name: "Black other executive management", target: `${(otherExecBlackTarget * 100).toFixed(0)}%`, weighting: combineExcoSenior && !isQse ? combinedExcoBlackMax : otherExecBlackMaxPts, score: otherExecBlackScore },
    { name: "Black female other executive management", target: `${(otherExecWomenTarget * 100).toFixed(0)}%`, weighting: combineExcoSenior && !isQse ? combinedExcoBWMax : otherExecBWMaxPts, score: otherExecBWOScore },
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
    exactTotal: clampScore(totalPoints, maxTotal),
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
      boardBWOPct: pctOf(board, countBW),
      execBlackPct: pctOf(execDirs, countBlack),
      execBWOPct: pctOf(execDirs, countBW),
      otherExecBlackPct: pctOf(otherExec, countBlack),
      otherExecBWOPct: pctOf(otherExec, countBW),
      seniorBlackPct: pctOf(senior, countBlack),
      seniorBWOPct: pctOf(senior, countBW),
      middleBlackPct: pctOf(middle, countBlack),
      middleBWOPct: pctOf(middle, countBW),
      juniorBlackPct: pctOf(junior, countBlack),
      juniorBWOPct: pctOf(junior, countBW),
      disabledBlackPct: blackDisabledPct,
    },
  };
}
