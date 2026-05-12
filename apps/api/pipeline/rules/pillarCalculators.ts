/**
 * Pillar Calculators — Ported from Frontend
 *
 * These are the BBBEE scoring functions that produce correct results.
 * Ported 1:1 from apps/web/Toolkit/src/lib/calculators/*.ts to ensure
 * the backend produces identical scores to the frontend.
 *
 * Each sector's rules (targets, max points, sub-minimum thresholds) come
 * from SectorConfig — the backend's sector rule source. The math and
 * edge-case handling mirrors the verified frontend calculators.
 */

import type { SectorConfig } from '../sectorConfig.js';

// ---------------------------------------------------------------------------
// Shared helpers (from frontend shared.ts)
// ---------------------------------------------------------------------------

const BLACK_RACES = ['African', 'Coloured', 'Indian'];

function isBlack(race: string): boolean {
  return BLACK_RACES.includes(race);
}

function safeRatio(value: number, target: number, maxPoints: number): number {
  if (target <= 0 || !Number.isFinite(value)) return 0;
  return clampScore((value / target) * maxPoints, maxPoints);
}

function clampScore(score: number, max: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), max);
}

function r2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Input types (matching calculationEngine.ts exports)
// ---------------------------------------------------------------------------

export interface EmployeeInput {
  name?: string;
  race: string;
  gender: string;
  designation: string;
  isDisabled: boolean;
  isForeign?: boolean;
}

export interface ShareholderInput {
  name: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  shares: number;
  shareValue: number;
  yearsHeld?: number;
  isDesignatedGroup?: boolean;
  blackNewEntrant?: boolean;
}

export interface SupplierInput {
  name: string;
  spend: number;
  beeLevel: number;
  blackOwnership: number;
  blackWomenOwnership: number;
  enterpriseType: string;
  youthOwnership?: number;
  disabledOwnership?: number;
  isDesignatedGroup?: boolean;
  isBlackOwned51?: boolean;
  isBlackWomanOwned30?: boolean;
  isEME?: boolean;
  isQSE?: boolean;
  isForeignSupplier?: boolean;
}

export interface ContributionInput {
  beneficiary: string;
  type: string;
  amount: number;
  category: 'sd' | 'ed' | 'sed';
  benefitFactor?: number;
}

export interface TrainingProgramInput {
  id?: string;
  name?: string;
  category?: string;
  categoryCode?: string;
  cost: number;
  isBlack?: boolean;
  isDisabled?: boolean;
  isAbsorbed?: boolean;
  isYesEmployee?: boolean;
  race?: string;
  gender?: string;
}

export interface FinancialsInput {
  revenue: number;
  npat: number;
  leviableAmount: number;
  tmps: number;
  headcount: number;
  companyValue?: number;
  outstandingDebt?: number;
  yearsHeld?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface PillarScore {
  score: number;
  maxPoints: number;
  subMinimumMet: boolean;
}

export interface YesResult {
  levelBoost: number;
  bonusPoints: number;
  tier: string;
}

export interface AllPillarScores {
  ownership: PillarScore;
  managementControl: PillarScore;
  /** Separate EE pillar when configured (e.g. Transport QSE sheet2); otherwise zeros. */
  employmentEquity: PillarScore;
  skillsDevelopment: PillarScore;
  procurement: PillarScore;
  supplierDevelopment: PillarScore;
  enterpriseDevelopment: PillarScore;
  socioEconomicDevelopment: PillarScore;
  yesInitiative: PillarScore & { levelBoost: number; bonusPoints: number; tier: string };
  totalPoints: number;
  maxPoints: number;
  beeLevel: number;
  recognitionLevel: number;
  isDiscounted: boolean;
  discountedLevel: number;
}

/** Which Transport QSE scorecard elements are measured (exactly four). Maps to toolkit sheet2 elements. */
export type TransportQseMeasuredElement =
  | 'ownership'
  | 'managementControl'
  | 'employmentEquity'
  | 'skillsDevelopment'
  | 'preferentialProcurement'
  | 'enterpriseDevelopment'
  | 'socioEconomicDevelopment';

const TRANSPORT_QSE_DEFAULT_MEASURED: TransportQseMeasuredElement[] = [
  'ownership',
  'managementControl',
  'employmentEquity',
  'skillsDevelopment',
];

const TRANSPORT_QSE_LEVEL_CAP = 107;

function isTransportQseCfg(cfg: SectorConfig): boolean {
  return cfg.sectorCode === 'TRANSPORT' && cfg.scorecardType === 'QSE';
}

/** Sheet2 lists seven elements; QSE entities measure exactly four — others score as max 0 for this assessment. */
function applyTransportQseMeasuredElements(
  cfg: SectorConfig,
  measured?: TransportQseMeasuredElement[],
): SectorConfig {
  const eeBase = cfg.pillarConfigs.employmentEquity ?? {
    maxPoints: 0,
    hasSubMinimum: false,
    subMinimumPercent: 0,
  };

  const active = new Set<TransportQseMeasuredElement>(
    measured && measured.length === 4 ? measured : TRANSPORT_QSE_DEFAULT_MEASURED,
  );

  let activeSum = 0;
  if (active.has('ownership')) activeSum += cfg.pillarConfigs.ownership.maxPoints;
  if (active.has('managementControl')) activeSum += cfg.pillarConfigs.managementControl.maxPoints;
  if (active.has('employmentEquity')) activeSum += eeBase.maxPoints;
  if (active.has('skillsDevelopment')) activeSum += cfg.pillarConfigs.skillsDevelopment.maxPoints;
  if (active.has('preferentialProcurement')) activeSum += cfg.pillarConfigs.preferentialProcurement.maxPoints;
  if (active.has('enterpriseDevelopment')) activeSum += cfg.pillarConfigs.enterpriseDevelopment.maxPoints;
  if (active.has('socioEconomicDevelopment')) activeSum += cfg.pillarConfigs.socioEconomicDevelopment.maxPoints;

  const pin = (key: TransportQseMeasuredElement, pc: PillarConfig): PillarConfig => ({
    ...pc,
    maxPoints: active.has(key) ? pc.maxPoints : 0,
  });

  return {
    ...cfg,
    totalMaxPoints: activeSum,
    pillarConfigs: {
      ...cfg.pillarConfigs,
      ownership: pin('ownership', cfg.pillarConfigs.ownership),
      managementControl: pin('managementControl', cfg.pillarConfigs.managementControl),
      employmentEquity: pin('employmentEquity', eeBase),
      skillsDevelopment: pin('skillsDevelopment', cfg.pillarConfigs.skillsDevelopment),
      preferentialProcurement: pin('preferentialProcurement', cfg.pillarConfigs.preferentialProcurement),
      supplierDevelopment: { ...cfg.pillarConfigs.supplierDevelopment, maxPoints: 0 },
      enterpriseDevelopment: pin('enterpriseDevelopment', cfg.pillarConfigs.enterpriseDevelopment),
      socioEconomicDevelopment: pin('socioEconomicDevelopment', cfg.pillarConfigs.socioEconomicDevelopment),
    },
  };
}

function calcTransportQseManagement(employees: EmployeeInput[], cfg: SectorConfig): PillarScore {
  const maxTotal = cfg.pillarConfigs.managementControl.maxPoints;
  if (maxTotal <= 0) return { score: 0, maxPoints: 0, subMinimumMet: true };

  const grouped: Record<string, EmployeeInput[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (grouped[emp.designation] ??= []).push(emp);
  }
  const countB = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race)).length;
  const countBW = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const pct = (emps: EmployeeInput[], fn: (e: EmployeeInput[]) => number) =>
    emps.length > 0 ? fn(emps) / emps.length : 0;

  const topMgmt = [
    ...(grouped['Board'] || []),
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
    ...(grouped['Other Executive Management'] || []),
    ...(grouped['Senior'] || []),
  ];

  const blackPct = pct(topMgmt, countB);
  const bwPct = pct(topMgmt, countBW);
  let s = clampScore(safeRatio(blackPct, 0.501, 25), 25);
  s += clampScore(safeRatio(bwPct, 0.25, 2), 2);

  return { score: r2(clampScore(s, maxTotal)), maxPoints: maxTotal, subMinimumMet: true };
}

function calcTransportQseEmploymentEquity(
  employees: EmployeeInput[],
  cfg: SectorConfig,
  province?: string,
): PillarScore {
  const maxTotal = cfg.pillarConfigs.employmentEquity?.maxPoints ?? 0;
  if (maxTotal <= 0) return { score: 0, maxPoints: 0, subMinimumMet: true };

  const grouped: Record<string, EmployeeInput[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (grouped[emp.designation] ??= []).push(emp);
  }
  const countB = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race)).length;
  const countBW = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const pct = (emps: EmployeeInput[], fn: (e: EmployeeInput[]) => number) =>
    emps.length > 0 ? fn(emps) / emps.length : 0;

  const all = employees.filter(e => !e.isForeign);
  const mgmtDesignations = new Set([
    'Board',
    'Executive',
    'Executive Director',
    'Other Executive Management',
    'Senior',
    'Middle',
    'Junior',
  ]);
  const mgmt = all.filter(e => mgmtDesignations.has(e.designation));
  const juniorAll = [
    ...(grouped['Junior'] || []),
    ...(grouped['Semi-skilled'] || []),
    ...(grouped['Unskilled'] || []),
  ].filter(e => !e.isForeign);

  const senior = grouped['Senior']?.filter(e => !e.isForeign) || [];
  const middle = grouped['Middle']?.filter(e => !e.isForeign) || [];

  const seniorEAP = getEAP(province || 'national', 'Senior');
  const middleEAP = getEAP(province || 'national', 'Middle');
  const juniorEAP = getEAP(province || 'national', 'Junior');

  let s = 0;
  s += clampScore(safeRatio(pct(mgmt, countB), 0.4, 7.5), 7.5);
  s += clampScore(safeRatio(pct(mgmt, countBW), 0.2, 7.5), 7.5);
  s += clampScore(safeRatio(pct(all, countB), 0.6, 5), 5);
  s += clampScore(safeRatio(pct(all, countBW), 0.3, 5), 5);

  const bonus =
    pct(senior, countB) >= seniorEAP.blackTarget &&
    pct(senior, countBW) >= seniorEAP.blackWomenTarget &&
    pct(middle, countB) >= middleEAP.blackTarget &&
    pct(middle, countBW) >= middleEAP.blackWomenTarget &&
    (juniorAll.length === 0 ||
      (pct(juniorAll, countB) >= juniorEAP.blackTarget &&
        pct(juniorAll, countBW) >= juniorEAP.blackWomenTarget))
      ? 2
      : 0;
  s += bonus;

  return { score: r2(clampScore(s, maxTotal)), maxPoints: maxTotal, subMinimumMet: true };
}

// ---------------------------------------------------------------------------
// EAP Targets (from frontend eapTargets.ts)
// ---------------------------------------------------------------------------

interface EAPValues { blackTarget: number; blackWomenTarget: number; }

const NATIONAL_EAP: Record<string, EAPValues> = {
  Senior: { blackTarget: 0.731, blackWomenTarget: 0.341 },
  Middle: { blackTarget: 0.786, blackWomenTarget: 0.425 },
  Junior: { blackTarget: 0.845, blackWomenTarget: 0.512 },
  'Skilled Technical': { blackTarget: 0.786, blackWomenTarget: 0.425 },
};

const PROVINCIAL_EAP: Record<string, Record<string, EAPValues>> = {
  national: NATIONAL_EAP,
  gauteng: {
    Senior: { blackTarget: 0.733, blackWomenTarget: 0.359 },
    Middle: { blackTarget: 0.794, blackWomenTarget: 0.442 },
    Junior: { blackTarget: 0.861, blackWomenTarget: 0.545 },
    'Skilled Technical': { blackTarget: 0.794, blackWomenTarget: 0.442 },
  },
  'western cape': {
    Senior: { blackTarget: 0.551, blackWomenTarget: 0.311 },
    Middle: { blackTarget: 0.654, blackWomenTarget: 0.422 },
    Junior: { blackTarget: 0.743, blackWomenTarget: 0.526 },
    'Skilled Technical': { blackTarget: 0.654, blackWomenTarget: 0.422 },
  },
  'eastern cape': {
    Senior: { blackTarget: 0.868, blackWomenTarget: 0.454 },
    Middle: { blackTarget: 0.902, blackWomenTarget: 0.501 },
    Junior: { blackTarget: 0.932, blackWomenTarget: 0.558 },
    'Skilled Technical': { blackTarget: 0.902, blackWomenTarget: 0.501 },
  },
  'kwazulu-natal': {
    Senior: { blackTarget: 0.863, blackWomenTarget: 0.421 },
    Middle: { blackTarget: 0.895, blackWomenTarget: 0.467 },
    Junior: { blackTarget: 0.928, blackWomenTarget: 0.523 },
    'Skilled Technical': { blackTarget: 0.895, blackWomenTarget: 0.467 },
  },
  'free state': {
    Senior: { blackTarget: 0.852, blackWomenTarget: 0.461 },
    Middle: { blackTarget: 0.884, blackWomenTarget: 0.492 },
    Junior: { blackTarget: 0.921, blackWomenTarget: 0.534 },
    'Skilled Technical': { blackTarget: 0.884, blackWomenTarget: 0.492 },
  },
  'north west': {
    Senior: { blackTarget: 0.881, blackWomenTarget: 0.435 },
    Middle: { blackTarget: 0.908, blackWomenTarget: 0.479 },
    Junior: { blackTarget: 0.936, blackWomenTarget: 0.531 },
    'Skilled Technical': { blackTarget: 0.908, blackWomenTarget: 0.479 },
  },
  'northern cape': {
    Senior: { blackTarget: 0.611, blackWomenTarget: 0.324 },
    Middle: { blackTarget: 0.705, blackWomenTarget: 0.418 },
    Junior: { blackTarget: 0.798, blackWomenTarget: 0.509 },
    'Skilled Technical': { blackTarget: 0.705, blackWomenTarget: 0.418 },
  },
  mpumalanga: {
    Senior: { blackTarget: 0.894, blackWomenTarget: 0.418 },
    Middle: { blackTarget: 0.917, blackWomenTarget: 0.462 },
    Junior: { blackTarget: 0.941, blackWomenTarget: 0.527 },
    'Skilled Technical': { blackTarget: 0.917, blackWomenTarget: 0.462 },
  },
  limpopo: {
    Senior: { blackTarget: 0.938, blackWomenTarget: 0.465 },
    Middle: { blackTarget: 0.951, blackWomenTarget: 0.498 },
    Junior: { blackTarget: 0.963, blackWomenTarget: 0.542 },
    'Skilled Technical': { blackTarget: 0.951, blackWomenTarget: 0.498 },
  },
};

function getEAP(province: string, level: string): EAPValues {
  const key = (province || 'national').toLowerCase();
  const table = PROVINCIAL_EAP[key] || NATIONAL_EAP;
  return table[level] || NATIONAL_EAP[level] || { blackTarget: 0.5, blackWomenTarget: 0.25 };
}

// ---------------------------------------------------------------------------
// Benefit factors for ESD/SED
// ---------------------------------------------------------------------------

const DEFAULT_BENEFIT_FACTORS_SD: Record<string, number> = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 1.0, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 1.0, shorter_payment_periods: 0.7, shorter_payment_terms: 0.7,
  equity_investment: 0.0,
};

const DEFAULT_BENEFIT_FACTORS_ED: Record<string, number> = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 1.0, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 1.0, shorter_payment_periods: 0.0, shorter_payment_terms: 0.0,
  equity_investment: 1.0,
};

const DEFAULT_BENEFIT_FACTORS_SED: Record<string, number> = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 0.8, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 0.8, shorter_payment_periods: 0.7, shorter_payment_terms: 0.7,
  equity_investment: 1.0,
};

// ---------------------------------------------------------------------------
// Recognition table
// ---------------------------------------------------------------------------

const RECOGNITION_TABLE: Record<number, number> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0,
};

// ---------------------------------------------------------------------------
// Graduation table (ownership economic interest)
// ---------------------------------------------------------------------------

const GRADUATION_TABLE: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.6,
  5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0,
};

function getGraduationFactor(years: number): number {
  if (years <= 0) return 0;
  let factor = 0;
  for (const y of Object.keys(GRADUATION_TABLE).map(Number).sort((a, b) => a - b)) {
    if (y <= years) factor = GRADUATION_TABLE[y];
    else break;
  }
  return factor;
}

// ===========================================================================================
// OWNERSHIP (ported from frontend ownership.ts)
// ===========================================================================================

function calcOwnership(shareholders: ShareholderInput[], financials: FinancialsInput, cfg: SectorConfig): PillarScore {
  const ot = cfg.targets.ownership;
  const maxTotal = cfg.pillarConfigs.ownership.maxPoints;
  const companyValue = financials.companyValue ?? 0;
  const outstandingDebt = financials.outstandingDebt ?? 0;
  const yearsHeld = financials.yearsHeld ?? 0;

  const totalShares = shareholders.reduce((sum, sh) => sum + sh.shares, 0);
  const hasShares = totalShares > 0;

  let totalBlackVoting = 0, totalBlackWomenVoting = 0;
  let totalEI = 0, totalEIBWO = 0, totalDG = 0;
  let netValueAgg = 0;
  let hasNewEntrant = false;

  for (const sh of shareholders) {
    const pct = hasShares ? sh.shares / totalShares : (shareholders.length > 0 ? 1 / shareholders.length : 0);
    totalBlackVoting += pct * sh.blackOwnership;
    totalBlackWomenVoting += pct * sh.blackWomenOwnership;
    totalEI += pct * sh.blackOwnership;
    totalEIBWO += pct * sh.blackWomenOwnership;
    if (sh.isDesignatedGroup && sh.blackOwnership > 0) totalDG += pct * sh.blackOwnership;
    if (sh.blackNewEntrant) hasNewEntrant = true;

    if (sh.shareValue > 0 && sh.blackOwnership > 0) {
      const debtAttr = outstandingDebt * pct;
      const carrying = sh.shareValue * pct;
      const allocated = companyValue * pct;
      const deemed = (allocated - debtAttr) / carrying;
      netValueAgg += Math.max(0, deemed) * sh.blackOwnership;
    }
  }

  const fullOwnership = totalBlackVoting >= ot.votingRightsTarget && hasShares;

  let vrBlack: number, vrBWO: number, eiBlack: number, eiBWO: number;
  let dg: number, ne: number, nv: number;

  if (fullOwnership) {
    vrBlack = ot.votingRightsMaxPts;
    vrBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);
    eiBlack = ot.economicInterestMaxPts;
    eiBWO = ot.womenEIMaxPts;
    dg = 3;
    ne = hasNewEntrant ? ot.newEntrantsMaxPts : 0;
    nv = ot.netValueMaxPts;
  } else {
    vrBlack = clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.votingRightsMaxPts), ot.votingRightsMaxPts);
    vrBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);

    const gradFactor = getGraduationFactor(yearsHeld);
    const formulaA = gradFactor > 0 ? totalEI * (1 / (ot.economicInterestTarget * gradFactor)) * ot.economicInterestMaxPts : 0;
    const formulaB = (totalEI / ot.economicInterestTarget) * ot.economicInterestMaxPts;
    eiBlack = clampScore(Math.max(formulaA, formulaB), ot.economicInterestMaxPts);

    eiBWO = clampScore(safeRatio(totalEIBWO, ot.womenEITarget, ot.womenEIMaxPts), ot.womenEIMaxPts);
    dg = clampScore(safeRatio(totalDG, 0.10, 3), 3);
    ne = hasNewEntrant ? ot.newEntrantsMaxPts : 0;

    const hasNetValue = companyValue > 0 && shareholders.some(s => s.shareValue > 0);
    if (hasNetValue) {
      nv = clampScore(netValueAgg, ot.netValueMaxPts);
    } else {
      nv = totalBlackVoting >= 1.0
        ? ot.netValueMaxPts
        : clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.netValueMaxPts), ot.netValueMaxPts);
    }
  }

  const total = clampScore(vrBlack + vrBWO + eiBlack + eiBWO + dg + ne + nv, maxTotal);
  const netValueSubMinThreshold = ot.netValueMaxPts * (cfg.pillarConfigs.ownership.subMinimumPercent / 100);
  const subMinimumMet = fullOwnership || nv >= netValueSubMinThreshold;

  return { score: r2(total), maxPoints: maxTotal, subMinimumMet };
}

// ===========================================================================================
// MANAGEMENT CONTROL (ported from frontend management.ts)
// ===========================================================================================

function calcManagement(employees: EmployeeInput[], cfg: SectorConfig, province?: string): PillarScore {
  const mc = cfg.targets.managementControl;
  const ee = cfg.targets.employmentEquity;
  const maxTotal = cfg.pillarConfigs.managementControl.maxPoints;
  const subMinPct = cfg.pillarConfigs.managementControl.subMinimumPercent;

  const grouped: Record<string, EmployeeInput[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (grouped[emp.designation] ??= []).push(emp);
  }

  const countB = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race)).length;
  const countBW = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const pct = (emps: EmployeeInput[], fn: (e: EmployeeInput[]) => number) => emps.length > 0 ? fn(emps) / emps.length : 0;

  const board = grouped['Board'] || [];
  const exec = [...(grouped['Executive'] || []), ...(grouped['Executive Director'] || [])];
  const otherExec = grouped['Other Executive Management'] || [];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];
  const skilledTech = grouped['Skilled Technical'] || [];
  const semiSkilled = grouped['Semi-skilled'] || [];
  const unskilled = grouped['Unskilled'] || [];

  const seniorEAP = getEAP(province || 'national', 'Senior');
  const middleEAP = getEAP(province || 'national', 'Middle');
  const juniorEAP = getEAP(province || 'national', 'Junior');
  const stEAP = getEAP(province || 'national', 'Skilled Technical');

  const boardBlack = clampScore(safeRatio(pct(board, countB), mc.boardBlackTarget, mc.boardBlackMaxPts), mc.boardBlackMaxPts);
  const boardBWO = clampScore(safeRatio(pct(board, countBW), mc.boardBWTarget, mc.boardBWMaxPts), mc.boardBWMaxPts);
  const execBlack = clampScore(safeRatio(pct(exec, countB), mc.execBlackTarget, mc.execBlackMaxPts), mc.execBlackMaxPts);
  const execBWO = clampScore(safeRatio(pct(exec, countBW), mc.execBWTarget, mc.execBWMaxPts), mc.execBWMaxPts);
  const oExecBlack = clampScore(safeRatio(pct(otherExec, countB), mc.otherExecBlackTarget, mc.otherExecBlackMaxPts), mc.otherExecBlackMaxPts);
  const oExecBWO = clampScore(safeRatio(pct(otherExec, countBW), mc.otherExecBWTarget, mc.otherExecBWMaxPts), mc.otherExecBWMaxPts);
  const seniorBlack = clampScore(safeRatio(pct(senior, countB), seniorEAP.blackTarget, mc.seniorMaxPts), mc.seniorMaxPts);
  const seniorBWO = clampScore(safeRatio(pct(senior, countBW), seniorEAP.blackWomenTarget, mc.seniorBWMaxPts), mc.seniorBWMaxPts);
  const middleBlack = clampScore(safeRatio(pct(middle, countB), middleEAP.blackTarget, mc.middleMaxPts), mc.middleMaxPts);
  const middleBWO = clampScore(safeRatio(pct(middle, countBW), middleEAP.blackWomenTarget, mc.middleBWMaxPts), mc.middleBWMaxPts);

  const juniorAll = [...junior, ...semiSkilled, ...unskilled];
  const juniorBlackPct = juniorAll.length > 0 ? countB(juniorAll) / juniorAll.length : 0;
  const juniorBWOPct = juniorAll.length > 0 ? countBW(juniorAll) / juniorAll.length : 0;
  const juniorBlack = clampScore(safeRatio(juniorBlackPct, juniorEAP.blackTarget, mc.juniorMaxPts), mc.juniorMaxPts);
  const juniorBWO = clampScore(safeRatio(juniorBWOPct, juniorEAP.blackWomenTarget, mc.juniorBWMaxPts), mc.juniorBWMaxPts);

  const stBlack = clampScore(safeRatio(pct(skilledTech, countB), stEAP.blackTarget, mc.seniorMaxPts), mc.seniorMaxPts);
  const stBWO = clampScore(safeRatio(pct(skilledTech, countBW), stEAP.blackWomenTarget, mc.seniorBWMaxPts), mc.seniorBWMaxPts);

  const allNonForeign = employees.filter(e => !e.isForeign);
  const disabledEmps = allNonForeign.filter(e => e.isDisabled);
  const blackDisabledPct = allNonForeign.length > 0 ? countB(disabledEmps) / allNonForeign.length : 0;
  const disabledScore = clampScore(safeRatio(blackDisabledPct, ee.disabledTarget, ee.disabledMaxPts), ee.disabledMaxPts);

  const total = boardBlack + boardBWO + execBlack + execBWO + oExecBlack + oExecBWO +
    seniorBlack + seniorBWO + middleBlack + middleBWO + juniorBlack + juniorBWO +
    stBlack + stBWO + disabledScore;

  return {
    score: r2(clampScore(total, maxTotal)),
    maxPoints: maxTotal,
    subMinimumMet: total >= (subMinPct / 100) * maxTotal,
  };
}

// ===========================================================================================
// SKILLS DEVELOPMENT (ported from frontend skills.ts)
// ===========================================================================================

function calcSkills(programs: TrainingProgramInput[], leviableAmount: number, headcount: number, cfg: SectorConfig): PillarScore {
  const sk = cfg.targets.skills;
  const maxPoints = cfg.pillarConfigs.skillsDevelopment.maxPoints;
  const subMinPct = cfg.pillarConfigs.skillsDevelopment.subMinimumPercent;

  const overallTarget = leviableAmount * (sk.overallSpendPercent / 100);
  const bursaryTarget = leviableAmount * (sk.bursarySpendPercent / 100);
  const disabledTarget = leviableAmount * (sk.disabledSpendPercent / 100);

  let totalSpend = 0, bursarySpend = 0, disabledSpend = 0;
  let learnershipCount = 0, absorbedCount = 0, totalBlackLearners = 0;
  const byCategory: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };

  for (const tp of programs) {
    if (!tp.isBlack) continue;
    const cost = tp.cost ?? 0;
    const catCode = tp.categoryCode || mapCategory(tp.category);
    byCategory[catCode] = (byCategory[catCode] || 0) + cost;
    totalBlackLearners++;

    if (catCode === 'A' || tp.category === 'bursary') bursarySpend += cost;
    if (tp.isDisabled) disabledSpend += cost;
    if (catCode === 'B' || tp.category === 'learnership' || tp.category === 'internship') learnershipCount++;
    if (tp.isAbsorbed) absorbedCount++;
  }

  const uncappedTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);
  let totalRecognised = 0;
  for (const code of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    let spend = byCategory[code] || 0;
    if (code === 'E' && uncappedTotal > 0) spend = Math.min(spend, uncappedTotal * 0.25);
    if (code === 'F' && uncappedTotal > 0) spend = Math.min(spend, uncappedTotal * 0.15);
    totalRecognised += spend;
  }

  const learningScore = clampScore(safeRatio(totalRecognised, overallTarget, sk.learningProgrammesMaxPts), sk.learningProgrammesMaxPts);
  const bursaryScore = clampScore(safeRatio(bursarySpend, bursaryTarget, sk.bursaryMaxPts), sk.bursaryMaxPts);
  const disabledScore = clampScore(safeRatio(disabledSpend, disabledTarget, sk.disabledLearningMaxPts), sk.disabledLearningMaxPts);

  const learnershipTarget = Math.max(headcount * (sk.learnershipTargetPercent / 100), 1);
  const learnershipScore = clampScore(safeRatio(learnershipCount, learnershipTarget, sk.learnershipsMaxPts), sk.learnershipsMaxPts);

  const absorptionRate = totalBlackLearners > 0 ? absorbedCount / totalBlackLearners : 0;
  const absorptionScore = clampScore(safeRatio(absorptionRate, sk.absorptionTargetPercent / 100, sk.absorptionMaxPts), sk.absorptionMaxPts);

  const total = clampScore(learningScore + bursaryScore + disabledScore + learnershipScore + absorptionScore, maxPoints);
  const subMinThresholdPts = (subMinPct / 100) * maxPoints;

  return { score: r2(total), maxPoints, subMinimumMet: total >= subMinThresholdPts };
}

function mapCategory(cat?: string): string {
  switch (cat) {
    case 'bursary': return 'A';
    case 'learnership': case 'internship': return 'B';
    case 'short_course': return 'C';
    default: return 'D';
  }
}

// ===========================================================================================
// PROCUREMENT (ported from frontend procurement.ts)
// ===========================================================================================

function calcProcurement(suppliers: SupplierInput[], tmps: number, cfg: SectorConfig): PillarScore {
  const pc = cfg.targets.procurement;
  const maxPoints = cfg.pillarConfigs.preferentialProcurement.maxPoints;
  const subMinPct = cfg.pillarConfigs.preferentialProcurement.subMinimumPercent;

  const targetAll = tmps * pc.allSuppliersTarget;
  const targetQSE = tmps * pc.qseTarget;
  const targetEME = tmps * pc.emeTarget;
  const targetBO51 = tmps * pc.bo51Target;
  const targetBWO30 = tmps * pc.bwo30Target;
  const targetDG = tmps * pc.dgTarget;
  const bwoThreshold = 0.30;

  let empoweringSpend = 0, qseSpend = 0, emeSpend = 0;
  let bo51Spend = 0, bwo30Spend = 0, dgSpend = 0;

  for (const sup of suppliers) {
    if (sup.isForeignSupplier) continue;

    if (sup.beeLevel >= 1 && sup.beeLevel <= 8) empoweringSpend += sup.spend || 0;
    if (sup.enterpriseType === 'qse') qseSpend += sup.spend || 0;
    if (sup.enterpriseType === 'eme') emeSpend += sup.spend || 0;
    if (sup.blackOwnership >= 0.51) bo51Spend += sup.spend || 0;
    if (sup.blackWomenOwnership >= bwoThreshold) bwo30Spend += sup.spend || 0;
    const isDG = sup.isDesignatedGroup || (
      sup.blackOwnership >= 0.51 && ((sup.youthOwnership ?? 0) > 0 || (sup.disabledOwnership ?? 0) > 0)
    );
    if (isDG) dgSpend += sup.spend || 0;
  }

  const empScore = clampScore(safeRatio(empoweringSpend, targetAll, pc.allSuppliersMaxPts), pc.allSuppliersMaxPts);
  const qseScore = clampScore(safeRatio(qseSpend, targetQSE, pc.qseMaxPts), pc.qseMaxPts);
  const emeScore = clampScore(safeRatio(emeSpend, targetEME, pc.emeMaxPts), pc.emeMaxPts);
  const bo51Score = clampScore(safeRatio(bo51Spend, targetBO51, pc.bo51MaxPts), pc.bo51MaxPts);
  const bwo30Score = clampScore(safeRatio(bwo30Spend, targetBWO30, pc.bwo30MaxPts), pc.bwo30MaxPts);
  const dgScore = clampScore(safeRatio(dgSpend, targetDG, pc.dgMaxPts), pc.dgMaxPts);

  const base = empScore + qseScore + emeScore + bo51Score + bwo30Score + dgScore;
  const total = clampScore(base, maxPoints);
  const subMinPts = (subMinPct / 100) * maxPoints;

  return { score: r2(total), maxPoints, subMinimumMet: base >= subMinPts };
}

// ===========================================================================================
// ESD — Supplier Development + Enterprise Development (ported from frontend esd-sed.ts)
// ===========================================================================================

function buildBenefitLookup(cfg: SectorConfig): { sd: Record<string, number>; ed: Record<string, number> } {
  const sd: Record<string, number> = { ...DEFAULT_BENEFIT_FACTORS_SD };
  const ed: Record<string, number> = { ...DEFAULT_BENEFIT_FACTORS_ED };
  if (cfg.benefitFactors?.length) {
    for (const bf of cfg.benefitFactors) {
      sd[bf.contributionType] = bf.sdFactor;
      ed[bf.contributionType] = bf.edFactor;
    }
  }
  return { sd, ed };
}

function calcEsd(
  contributions: ContributionInput[],
  npat: number,
  graduationBonus: boolean,
  jobsCreatedBonus: boolean,
  cfg: SectorConfig,
): { sd: PillarScore; ed: PillarScore } {
  const et = cfg.targets.esd;
  const sdMaxPts = cfg.pillarConfigs.supplierDevelopment.maxPoints;
  const edMaxPts = cfg.pillarConfigs.enterpriseDevelopment.maxPoints;
  const sdSubMinPct = cfg.pillarConfigs.supplierDevelopment.subMinimumPercent;
  const edSubMinPct = cfg.pillarConfigs.enterpriseDevelopment.subMinimumPercent;

  const effectiveNpat = Math.max(npat, 0);
  const sdTarget = effectiveNpat * (et.sdPercent / 100);
  const edTarget = effectiveNpat * (et.edPercent / 100);

  const factors = buildBenefitLookup(cfg);
  let sdSpend = 0, edSpend = 0;
  for (const c of contributions) {
    if (c.category === 'sd') {
      const factor = factors.sd[c.type] ?? c.benefitFactor ?? 1.0;
      sdSpend += c.amount * factor;
    } else if (c.category === 'ed') {
      const factor = factors.ed[c.type] ?? c.benefitFactor ?? 1.0;
      edSpend += c.amount * factor;
    }
  }

  const sdScore = safeRatio(sdSpend, sdTarget, et.sdMaxPts);
  const edScore = safeRatio(edSpend, edTarget, et.edMaxPts);
  const gradBonus = graduationBonus ? et.edGraduationBonus : 0;
  const jobsBonus = jobsCreatedBonus ? et.edJobsBonus : 0;

  const sdTotal = clampScore(sdScore, sdMaxPts);
  const edTotal = clampScore(edScore + gradBonus + jobsBonus, edMaxPts);

  return {
    sd: { score: r2(sdTotal), maxPoints: sdMaxPts, subMinimumMet: sdTotal >= (sdSubMinPct / 100) * sdMaxPts },
    ed: { score: r2(edTotal), maxPoints: edMaxPts, subMinimumMet: edSubMinPct > 0 ? edTotal >= (edSubMinPct / 100) * edMaxPts : true },
  };
}

// ===========================================================================================
// SED (ported from frontend esd-sed.ts)
// ===========================================================================================

function calcSed(contributions: ContributionInput[], npat: number, cfg: SectorConfig): PillarScore {
  const maxPoints = cfg.pillarConfigs.socioEconomicDevelopment.maxPoints;
  const effectiveNpat = Math.max(npat, 0);
  const target = effectiveNpat * (cfg.targets.sed.spendPercent / 100);

  let totalSpend = 0;
  for (const c of contributions) {
    if (c.category !== 'sed') continue;
    const factor = DEFAULT_BENEFIT_FACTORS_SED[c.type] ?? c.benefitFactor ?? 1.0;
    totalSpend += c.amount * factor;
  }

  const score = safeRatio(totalSpend, target, maxPoints);
  return { score: r2(score), maxPoints, subMinimumMet: true };
}

// ===========================================================================================
// YES Initiative (ported from frontend yes.ts)
// ===========================================================================================

function calcYes(
  programs: TrainingProgramInput[],
  totalEmployees: number,
): PillarScore & YesResult {
  const candidates = programs.filter(p => p.isYesEmployee);
  const absorbed = candidates.filter(p => p.isAbsorbed);
  const absorptionRate = candidates.length > 0 ? absorbed.length / candidates.length : 0;
  const headcountTarget = totalEmployees < 500
    ? Math.max(Math.ceil(totalEmployees * 0.025), 1)
    : totalEmployees <= 1000
      ? Math.max(Math.ceil(totalEmployees * 0.015), 8)
      : Math.max(Math.ceil(totalEmployees * 0.01), 15);

  let levelBoost = 0;
  let bonusPoints = 0;
  let tier = 'None';

  if (candidates.length >= headcountTarget * 2 && absorptionRate >= 0.05) {
    tier = 'Tier 1';
    levelBoost = 2;
  } else if (candidates.length >= headcountTarget * 1.5 && absorptionRate >= 0.05) {
    tier = 'Tier 2';
    levelBoost = 1;
    bonusPoints = 3;
  } else if (candidates.length >= headcountTarget && absorptionRate >= 0.025) {
    tier = 'Tier 3';
    levelBoost = 1;
  }

  return {
    score: 0,
    maxPoints: 0,
    subMinimumMet: true,
    levelBoost,
    bonusPoints,
    tier,
  };
}

// ===========================================================================================
// Transport Sector — Large Enterprise (docs/Transport Codes.xlsx sheet1)
// ===========================================================================================

function isTransportLargeGeneric(cfg: SectorConfig): boolean {
  return cfg.sectorCode === 'TRANSPORT' && cfg.scorecardType === 'Generic';
}

function calcTransportLargeOwnership(
  shareholders: ShareholderInput[],
  financials: FinancialsInput,
  cfg: SectorConfig,
): PillarScore {
  const ot = cfg.targets.ownership;
  const maxTotal = cfg.pillarConfigs.ownership.maxPoints;
  const companyValue = financials.companyValue ?? 0;
  const outstandingDebt = financials.outstandingDebt ?? 0;

  const totalShares = shareholders.reduce((sum, sh) => sum + sh.shares, 0);
  const hasShares = totalShares > 0;

  let totalBlackVoting = 0, totalBlackWomenVoting = 0;
  let totalEI = 0, totalEIBWO = 0, totalDG = 0;
  let netValueAgg = 0;
  let hasNewEntrant = false;

  for (const sh of shareholders) {
    const pct = hasShares ? sh.shares / totalShares : (shareholders.length > 0 ? 1 / shareholders.length : 0);
    totalBlackVoting += pct * sh.blackOwnership;
    totalBlackWomenVoting += pct * sh.blackWomenOwnership;
    totalEI += pct * sh.blackOwnership;
    totalEIBWO += pct * sh.blackWomenOwnership;
    if (sh.isDesignatedGroup && sh.blackOwnership > 0) totalDG += pct * sh.blackOwnership;
    if (sh.blackNewEntrant) hasNewEntrant = true;

    if (sh.shareValue > 0 && sh.blackOwnership > 0) {
      const debtAttr = outstandingDebt * pct;
      const carrying = sh.shareValue * pct;
      const allocated = companyValue * pct;
      const deemed = (allocated - debtAttr) / carrying;
      netValueAgg += Math.max(0, deemed) * sh.blackOwnership;
    }
  }

  const fullOwnership = totalBlackVoting >= ot.votingRightsTarget && hasShares;

  const vrBlack = clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.votingRightsMaxPts), ot.votingRightsMaxPts);
  const vrBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);
  const eiBlack = clampScore(safeRatio(totalEI, ot.economicInterestTarget, ot.economicInterestMaxPts), ot.economicInterestMaxPts);
  const eiBWO = clampScore(safeRatio(totalEIBWO, ot.womenEITarget, ot.womenEIMaxPts), ot.womenEIMaxPts);

  const dgTarget = ot.economicInterestDesignatedGroupTarget ?? 0.025;
  const dgMax = ot.economicInterestDesignatedGroupMaxPts ?? 0;
  const dgPts = dgMax > 0 ? clampScore(safeRatio(totalDG, dgTarget, dgMax), dgMax) : 0;

  let nv = 0;
  const hasNetValue = companyValue > 0 && shareholders.some(s => s.shareValue > 0);
  if (hasNetValue) {
    nv = clampScore(netValueAgg, ot.netValueMaxPts);
  } else {
    nv = totalBlackVoting >= 1.0
      ? ot.netValueMaxPts
      : clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.netValueMaxPts), ot.netValueMaxPts);
  }

  const fulfil = totalBlackVoting >= ot.votingRightsTarget && totalEI >= ot.economicInterestTarget ? 1 : 0;
  const nePts = hasNewEntrant ? ot.newEntrantsMaxPts : 0;

  const total = clampScore(vrBlack + vrBWO + eiBlack + eiBWO + dgPts + nv + fulfil + nePts, maxTotal);

  const netValueSubMinThreshold = ot.netValueMaxPts * (cfg.pillarConfigs.ownership.subMinimumPercent / 100);
  const subMinimumMet = cfg.pillarConfigs.ownership.subMinimumPercent <= 0
    ? true
    : (fullOwnership || nv >= netValueSubMinThreshold);

  return { score: r2(total), maxPoints: maxTotal, subMinimumMet };
}

function calcTransportLargeManagementAndEE(employees: EmployeeInput[], cfg: SectorConfig): PillarScore {
  const maxTotal = cfg.pillarConfigs.managementControl.maxPoints;
  const eeCfg = cfg.targets.employmentEquity;

  const grouped: Record<string, EmployeeInput[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (grouped[emp.designation] ??= []).push(emp);
  }

  const countB = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race)).length;
  const countBW = (emps: EmployeeInput[]) => emps.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const pct = (emps: EmployeeInput[], fn: (e: EmployeeInput[]) => number) =>
    emps.length > 0 ? fn(emps) / emps.length : 0;

  const board = grouped['Board'] || [];
  const exec = [...(grouped['Executive'] || []), ...(grouped['Executive Director'] || [])];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];
  const semiSkilled = grouped['Semi-skilled'] || [];
  const unskilled = grouped['Unskilled'] || [];
  const allNonForeign = employees.filter(e => !e.isForeign);

  let mc = 0;
  mc += clampScore(safeRatio(pct(board, countB), 0.5, 1.5), 1.5);
  mc += clampScore(safeRatio(pct(board, countBW), 0.25, 1.5), 1.5);
  mc += clampScore(safeRatio(pct(exec, countB), 0.5, 1), 1);
  mc += clampScore(safeRatio(pct(exec, countBW), 0.25, 1), 1);
  mc += clampScore(safeRatio(pct(senior, countB), 0.4, 1.5), 1.5);
  mc += clampScore(safeRatio(pct(senior, countBW), 0.2, 1.5), 1.5);
  mc += clampScore(safeRatio(pct(middle, countB), 0.4, 1), 1);
  mc += clampScore(safeRatio(pct(middle, countBW), 0.2, 1), 1);
  mc += clampScore(safeRatio(pct(board, countB), 0.4, 1), 1);

  let ee = 0;
  ee += clampScore(safeRatio(pct(senior, countB), 0.43, 2.5), 2.5);
  ee += clampScore(safeRatio(pct(senior, countBW), 0.22, 2.5), 2.5);
  ee += clampScore(safeRatio(pct(middle, countB), 0.63, 1.5), 1.5);
  ee += clampScore(safeRatio(pct(middle, countBW), 0.32, 1.5), 1.5);
  ee += clampScore(safeRatio(pct(junior, countB), 0.68, 1.5), 1.5);
  ee += clampScore(safeRatio(pct(junior, countBW), 0.34, 1.5), 1.5);

  const semiPool = [...semiSkilled, ...unskilled];
  const semiBw = semiPool.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const semiBwPctTotal = allNonForeign.length > 0 ? semiBw / allNonForeign.length : 0;
  ee += clampScore(safeRatio(semiBwPctTotal, 0.15, 2), 2);

  const blackDisabledPct = allNonForeign.length > 0 ? countB(allNonForeign.filter(e => e.isDisabled)) / allNonForeign.length : 0;
  ee += clampScore(safeRatio(blackDisabledPct, eeCfg.disabledTarget, eeCfg.disabledMaxPts), eeCfg.disabledMaxPts);

  const bwDisabledPct = allNonForeign.length > 0
    ? allNonForeign.filter(e => e.isDisabled && isBlack(e.race) && e.gender === 'Female').length / allNonForeign.length
    : 0;
  const dwMax = eeCfg.disabledWomenMaxPts ?? 0;
  const dwT = eeCfg.disabledWomenTarget ?? 0.01;
  if (dwMax > 0) {
    ee += clampScore(safeRatio(bwDisabledPct, dwT, dwMax), dwMax);
  }

  const bonusEE =
    pct(senior, countB) >= 0.43 && pct(senior, countBW) >= 0.22 &&
    pct(middle, countB) >= 0.63 && pct(middle, countBW) >= 0.32 &&
    pct(junior, countB) >= 0.68 && pct(junior, countBW) >= 0.34
    ? 3
    : 0;
  ee += bonusEE;

  const total = clampScore(mc + ee, maxTotal);
  return { score: r2(total), maxPoints: maxTotal, subMinimumMet: true };
}

function calcTransportLargeSkills(
  programs: TrainingProgramInput[],
  leviableAmount: number,
  headcount: number,
  cfg: SectorConfig,
): PillarScore {
  const sk = cfg.targets.skills;
  const maxPoints = cfg.pillarConfigs.skillsDevelopment.maxPoints;

  const overallTarget = leviableAmount * (sk.overallSpendPercent / 100);
  const bursaryTarget = leviableAmount * (sk.bursarySpendPercent / 100);
  const disabledTarget = leviableAmount * (sk.disabledSpendPercent / 100);

  let bursarySpend = 0, disabledSpend = 0;
  const byCategory: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };

  let bcBlack = 0, bcWomen = 0;
  for (const tp of programs) {
    if (!tp.isBlack) continue;
    const cost = tp.cost ?? 0;
    const catCode = tp.categoryCode || mapCategory(tp.category);
    byCategory[catCode] = (byCategory[catCode] || 0) + cost;
    if (catCode === 'A' || tp.category === 'bursary') bursarySpend += cost;
    if (tp.isDisabled) disabledSpend += cost;
    if (['B', 'C', 'D'].includes(catCode)) {
      bcBlack++;
      if (tp.gender === 'Female') bcWomen++;
    }
  }

  const uncappedTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);
  let totalRecognised = 0;
  for (const code of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    let spend = byCategory[code] || 0;
    if (code === 'E' && uncappedTotal > 0) spend = Math.min(spend, uncappedTotal * 0.25);
    if (code === 'F' && uncappedTotal > 0) spend = Math.min(spend, uncappedTotal * 0.15);
    totalRecognised += spend;
  }

  const learningScore = clampScore(safeRatio(totalRecognised, overallTarget, sk.learningProgrammesMaxPts), sk.learningProgrammesMaxPts);
  const bursaryScore = clampScore(safeRatio(bursarySpend, bursaryTarget, sk.bursaryMaxPts), sk.bursaryMaxPts);
  const disabledScore = clampScore(safeRatio(disabledSpend, disabledTarget, sk.disabledLearningMaxPts), sk.disabledLearningMaxPts);

  const hc = Math.max(headcount, 1);
  const progBlackTarget = sk.learnershipTargetPercent / 100;
  const progWomenTarget = sk.absorptionTargetPercent / 100;
  const learnershipScore = clampScore(safeRatio(bcBlack / hc, progBlackTarget, sk.learnershipsMaxPts), sk.learnershipsMaxPts);
  const womenProgScore = clampScore(safeRatio(bcWomen / hc, progWomenTarget, sk.absorptionMaxPts), sk.absorptionMaxPts);

  const total = clampScore(learningScore + bursaryScore + disabledScore + learnershipScore + womenProgScore, maxPoints);
  return { score: r2(total), maxPoints, subMinimumMet: true };
}

function calcTransportLargeProcurement(suppliers: SupplierInput[], tmps: number, cfg: SectorConfig): PillarScore {
  const pc = cfg.targets.procurement;
  const maxPoints = cfg.pillarConfigs.preferentialProcurement.maxPoints;

  let empoweringSpend = 0, qseEmeSpend = 0, bo51Spend = 0, bwo30Spend = 0;

  for (const sup of suppliers) {
    if (sup.isForeignSupplier) continue;
    if (sup.beeLevel >= 1 && sup.beeLevel <= 8) empoweringSpend += sup.spend || 0;
    if (sup.enterpriseType === 'qse' || sup.enterpriseType === 'eme') qseEmeSpend += sup.spend || 0;
    if (sup.blackOwnership >= 0.51) bo51Spend += sup.spend || 0;
    if (sup.blackWomenOwnership >= 0.30) bwo30Spend += sup.spend || 0;
  }

  const empScore = clampScore(safeRatio(empoweringSpend, tmps * pc.allSuppliersTarget, pc.allSuppliersMaxPts), pc.allSuppliersMaxPts);
  const qemScore = clampScore(safeRatio(qseEmeSpend, tmps * pc.qseTarget, pc.qseMaxPts), pc.qseMaxPts);
  const bo51Score = clampScore(safeRatio(bo51Spend, tmps * pc.bo51Target, pc.bo51MaxPts), pc.bo51MaxPts);
  const bwo30Score = clampScore(safeRatio(bwo30Spend, tmps * pc.bwo30Target, pc.bwo30MaxPts), pc.bwo30MaxPts);

  const total = clampScore(empScore + qemScore + bo51Score + bwo30Score, maxPoints);
  return { score: r2(total), maxPoints, subMinimumMet: true };
}

// ===========================================================================================
// Deemed NPAT — for loss-making entities
// ===========================================================================================

function resolveDeemedNpat(revenue: number, cfg: SectorConfig): number {
  if (revenue <= 0) return 0;
  const norms = cfg.industryNorms;
  if (!norms?.length) return revenue * 0.0558;
  const allIndustry = norms.find(n => n.industry.toLowerCase() === 'all industries');
  const normPercent = allIndustry?.normPercent ?? 5.58;
  return revenue * (normPercent / 100);
}

// ===========================================================================================
// MASTER FUNCTION — Orchestrates all pillar calculations
// ===========================================================================================

export function calculateAllPillars(
  config: SectorConfig,
  inputs: {
    employees: EmployeeInput[];
    shareholders: ShareholderInput[];
    suppliers: SupplierInput[];
    contributions: ContributionInput[];
    trainingPrograms: TrainingProgramInput[];
    financials: FinancialsInput;
    graduationBonus?: boolean;
    jobsCreatedBonus?: boolean;
    province?: string;
    /** Transport QSE: exactly four elements from sheet2; omit uses default quartet (Ownership, MC, EE, Skills) = 107 pts max. */
    transportQseMeasuredElements?: TransportQseMeasuredElement[];
  },
): AllPillarScores {
  const { employees, shareholders, suppliers, contributions, trainingPrograms, financials } = inputs;

  const cfgEffective = isTransportQseCfg(config)
    ? applyTransportQseMeasuredElements(config, inputs.transportQseMeasuredElements)
    : config;

  const effectiveNpat = financials.npat > 0
    ? financials.npat
    : resolveDeemedNpat(financials.revenue, cfgEffective);

  let ownership: PillarScore;
  let management: PillarScore;
  let employmentEquity: PillarScore;
  let skills: PillarScore;
  let procurement: PillarScore;

  if (isTransportQseCfg(config)) {
    ownership = calcOwnership(shareholders, financials, cfgEffective);
    management = calcTransportQseManagement(employees, cfgEffective);
    employmentEquity = calcTransportQseEmploymentEquity(employees, cfgEffective, inputs.province);
    skills = calcSkills(trainingPrograms, financials.leviableAmount, financials.headcount || employees.length, cfgEffective);
    procurement = calcProcurement(suppliers, financials.tmps, cfgEffective);
  } else {
    ownership = isTransportLargeGeneric(config)
      ? calcTransportLargeOwnership(shareholders, financials, config)
      : calcOwnership(shareholders, financials, config);
    management = isTransportLargeGeneric(config)
      ? calcTransportLargeManagementAndEE(employees, config)
      : calcManagement(employees, config, inputs.province);
    employmentEquity = {
      score: 0,
      maxPoints: config.pillarConfigs.employmentEquity?.maxPoints ?? 0,
      subMinimumMet: true,
    };
    skills = isTransportLargeGeneric(config)
      ? calcTransportLargeSkills(trainingPrograms, financials.leviableAmount, financials.headcount || employees.length, config)
      : calcSkills(trainingPrograms, financials.leviableAmount, financials.headcount || employees.length, config);
    procurement = isTransportLargeGeneric(config)
      ? calcTransportLargeProcurement(suppliers, financials.tmps, config)
      : calcProcurement(suppliers, financials.tmps, config);
  }

  const { sd, ed } = calcEsd(contributions, effectiveNpat, !!inputs.graduationBonus, !!inputs.jobsCreatedBonus, cfgEffective);
  const sed = calcSed(contributions, effectiveNpat, cfgEffective);
  const yes = calcYes(trainingPrograms, employees.length);

  const totalPoints = ownership.score + management.score + employmentEquity.score + skills.score + procurement.score +
    sd.score + ed.score + sed.score + yes.bonusPoints;

  const maxPoints = cfgEffective.totalMaxPoints;

  let levelThresholds = cfgEffective.levelThresholds;
  if (isTransportQseCfg(config) && cfgEffective.totalMaxPoints !== TRANSPORT_QSE_LEVEL_CAP) {
    levelThresholds = config.levelThresholds.map(t => ({
      ...t,
      minPoints: Math.round((t.minPoints * cfgEffective.totalMaxPoints / TRANSPORT_QSE_LEVEL_CAP) * 100) / 100,
    }));
  }

  const anySubMinFailed = !ownership.subMinimumMet || !skills.subMinimumMet ||
    !procurement.subMinimumMet || !sd.subMinimumMet || !ed.subMinimumMet;

  const baseLevel = findLevel(totalPoints, levelThresholds);
  const isDiscounted = baseLevel.level < 9 && anySubMinFailed;
  let discountedLevel = isDiscounted ? Math.min(baseLevel.level + 1, 8) : baseLevel.level;

  if (yes.levelBoost > 0 && discountedLevel <= 8) {
    discountedLevel = Math.max(discountedLevel - yes.levelBoost, 1);
  }

  const discountedLevelConfig = levelThresholds.find(t => t.level === discountedLevel);
  const finalRecognition = (isDiscounted || yes.levelBoost > 0)
    ? (discountedLevelConfig?.recognition ?? 0)
    : baseLevel.recognition;

  return {
    ownership,
    managementControl: management,
    employmentEquity,
    skillsDevelopment: skills,
    procurement,
    supplierDevelopment: sd,
    enterpriseDevelopment: ed,
    socioEconomicDevelopment: sed,
    yesInitiative: yes,
    totalPoints: r2(totalPoints),
    maxPoints,
    beeLevel: baseLevel.level,
    recognitionLevel: finalRecognition,
    isDiscounted,
    discountedLevel,
  };
}

function findLevel(totalPoints: number, thresholds: Array<{ level: number; minPoints: number; recognition: number }>): { level: number; recognition: number } {
  const sorted = [...thresholds].sort((a, b) => b.minPoints - a.minPoints);
  for (const t of sorted) {
    if (totalPoints >= t.minPoints) return { level: t.level, recognition: t.recognition };
  }
  return { level: 9, recognition: 0 };
}
