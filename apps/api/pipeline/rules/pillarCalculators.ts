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

export interface AllPillarScores {
  ownership: PillarScore;
  managementControl: PillarScore;
  skillsDevelopment: PillarScore;
  procurement: PillarScore;
  supplierDevelopment: PillarScore;
  enterpriseDevelopment: PillarScore;
  socioEconomicDevelopment: PillarScore;
  yesInitiative: PillarScore;
  totalPoints: number;
  maxPoints: number;
  beeLevel: number;
  recognitionLevel: number;
  isDiscounted: boolean;
  discountedLevel: number;
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

const DEFAULT_BENEFIT_FACTORS: Record<string, number> = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 1.0, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discount: 0.8, employee_time: 1.0,
  shorter_payment_terms: 0.7, equity_investment: 1.0,
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
    if (sh.isDesignatedGroup) totalDG += pct * sh.blackOwnership;
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
  const subMinimumMet = fullOwnership || nv >= 3.2;

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

function calcSkills(programs: TrainingProgramInput[], leviableAmount: number, cfg: SectorConfig): PillarScore {
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

  const learnershipTarget = Math.max(totalBlackLearners * (sk.learnershipTargetPercent / 100), 1);
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

    if (sup.beeLevel >= 1 && sup.beeLevel <= 4) empoweringSpend += sup.spend || 0;
    if (sup.enterpriseType === 'qse') qseSpend += sup.spend || 0;
    if (sup.enterpriseType === 'eme') emeSpend += sup.spend || 0;
    if (sup.blackOwnership >= 0.51) bo51Spend += sup.spend || 0;
    if (sup.blackWomenOwnership >= bwoThreshold) bwo30Spend += sup.spend || 0;
    const isDG = sup.blackOwnership >= 0.51 && ((sup.youthOwnership ?? 0) > 0 || (sup.disabledOwnership ?? 0) > 0);
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

  const sdTarget = npat * (et.sdPercent / 100);
  const edTarget = npat * (et.edPercent / 100);

  let sdSpend = 0, edSpend = 0;
  for (const c of contributions) {
    const factor = DEFAULT_BENEFIT_FACTORS[c.type] ?? c.benefitFactor ?? 1.0;
    const recognised = c.amount * factor;
    if (c.category === 'sd') sdSpend += recognised;
    else if (c.category === 'ed') edSpend += recognised;
  }

  const sdScore = safeRatio(sdSpend, sdTarget, et.sdMaxPts);
  const edScore = safeRatio(edSpend, edTarget, et.edMaxPts);
  const gradBonus = graduationBonus ? et.edGraduationBonus : 0;
  const jobsBonus = jobsCreatedBonus ? et.edJobsBonus : 0;

  const sdTotal = clampScore(sdScore, sdMaxPts);
  const edTotal = clampScore(edScore + gradBonus + jobsBonus, edMaxPts);

  return {
    sd: { score: r2(sdTotal), maxPoints: sdMaxPts, subMinimumMet: sdTotal >= (sdSubMinPct / 100) * sdMaxPts },
    ed: { score: r2(edTotal), maxPoints: edMaxPts, subMinimumMet: edScore >= (et.edMaxPts * 0.4) },
  };
}

// ===========================================================================================
// SED (ported from frontend esd-sed.ts)
// ===========================================================================================

function calcSed(contributions: ContributionInput[], npat: number, cfg: SectorConfig): PillarScore {
  const maxPoints = cfg.pillarConfigs.socioEconomicDevelopment.maxPoints;
  const target = npat * (cfg.targets.sed.spendPercent / 100);
  const totalSpend = contributions.filter(c => c.category === 'sed').reduce((sum, c) => sum + c.amount, 0);
  const score = safeRatio(totalSpend, target, maxPoints);
  return { score: r2(score), maxPoints, subMinimumMet: true };
}

// ===========================================================================================
// YES Initiative (ported from frontend yes.ts)
// ===========================================================================================

function calcYes(programs: TrainingProgramInput[], totalEmployees: number): PillarScore {
  const candidates = programs.filter(p => p.isYesEmployee);
  const headcountTarget = totalEmployees < 500
    ? Math.max(Math.ceil(totalEmployees * 0.025), 1)
    : totalEmployees <= 1000
      ? Math.max(Math.ceil(totalEmployees * 0.015), 8)
      : Math.max(Math.ceil(totalEmployees * 0.01), 15);

  const tier1 = Math.max(Math.ceil(headcountTarget * 1.5), 1);
  const tier2 = Math.max(Math.ceil(headcountTarget * 1.0), 1);
  const tier3 = Math.max(Math.ceil(headcountTarget * 0.5), 1);

  let tier: string = 'None';
  if (candidates.length >= tier1) tier = 'Tier 1';
  else if (candidates.length >= tier2) tier = 'Tier 2';
  else if (candidates.length >= tier3) tier = 'Tier 3';

  const scores: Record<string, number> = { 'None': 0, 'Tier 3': 1, 'Tier 2': 2, 'Tier 1': 3 };
  return { score: r2(scores[tier] || 0), maxPoints: 0, subMinimumMet: true };
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
  },
): AllPillarScores {
  const { employees, shareholders, suppliers, contributions, trainingPrograms, financials } = inputs;

  const ownership = calcOwnership(shareholders, financials, config);
  const management = calcManagement(employees, config, inputs.province);
  const skills = calcSkills(trainingPrograms, financials.leviableAmount, config);
  const procurement = calcProcurement(suppliers, financials.tmps, config);
  const { sd, ed } = calcEsd(contributions, financials.npat, !!inputs.graduationBonus, !!inputs.jobsCreatedBonus, config);
  const sed = calcSed(contributions, financials.npat, config);
  const yes = calcYes(trainingPrograms, employees.length);

  const totalPoints = ownership.score + management.score + skills.score + procurement.score +
    sd.score + ed.score + sed.score + yes.score;

  const maxPoints = config.totalMaxPoints;

  const anySubMinFailed = !ownership.subMinimumMet || !skills.subMinimumMet ||
    !procurement.subMinimumMet || !sd.subMinimumMet || !ed.subMinimumMet;

  const baseLevel = findLevel(totalPoints, config.levelThresholds);
  const isDiscounted = baseLevel.level < 9 && anySubMinFailed;
  const discountedLevel = isDiscounted ? Math.min(baseLevel.level + 1, 8) : baseLevel.level;
  const discountedLevelConfig = config.levelThresholds.find(t => t.level === discountedLevel);
  const finalRecognition = isDiscounted
    ? (discountedLevelConfig?.recognition ?? 0)
    : baseLevel.recognition;

  return {
    ownership,
    managementControl: management,
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
