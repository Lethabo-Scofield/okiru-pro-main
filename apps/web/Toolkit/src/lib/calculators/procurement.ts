import type { ProcurementData, Supplier } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

const RECOGNITION_TABLE: Readonly<Record<number, number>> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0,
};

const BLACK_WOMEN_OWNERSHIP_THRESHOLD = 0.30;

export interface ProcurementSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  spend: number;
  isBonus?: boolean;
}

// Issue 3: Removed graduationBonus and jobsCreatedBonus from result (ED only bonuses)
export interface ProcurementResult {
  base: number;
  empoweringSuppliers: number;
  qseSuppliers: number;
  emeSuppliers: number;
  blackOwned51: number;
  blackFemaleOwned30: number;
  designatedGroup: number;
  total: number;
  subMinimumMet: boolean;
  recognisedSpend: number;
  target: number;
  subLines: ProcurementSubLine[];
  rawStats: {
    spendAllBlackOwned: number;
    spendBlackWomenOwned: number;
    spendQSE: number;
    spendEME: number;
    designatedGroupSpend: number;
    empoweringSpend: number;
    blackOwned51Spend: number;
    blackFemaleOwned30Spend: number;
    foreignSupplierSpend: number; // Issue 3: Added for TMPS tracking
  };
}

function getRecognitionMultiplier(beeLevel: number): number {
  return RECOGNITION_TABLE[beeLevel] ?? 0;
}

// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// CRITICAL FIXES: BO51 target 40%→50%, DG target 12%→2%, NO procurement bonuses

export function calculateProcurementScore(data: ProcurementData, config?: CalculatorConfig): ProcurementResult {
  const { tmps } = data;
  const suppliers = data.suppliers || [];
  const pc = config?.procurement;

  const subMinThreshold = pc?.subMinThreshold ?? 11.6;

  const TARGET_80 = tmps * 0.80;
  const TARGET_15_QSE = tmps * 0.15;
  const TARGET_15_EME = tmps * 0.15;
  // CRITICAL FIX: BO51 target is 50% (NOT 40%)
  const TARGET_50_BLACK51 = tmps * 0.50;
  const TARGET_12_FEMALE30 = tmps * 0.12;
  // CRITICAL FIX: Designated Group target is 2% (NOT 12%)
  const TARGET_2_DESIGNATED = tmps * 0.02;

  let recognisedSpend = 0;
  let empoweringSpend = 0;
  let qseSpend = 0;
  let emeSpend = 0;
  let blackOwned51Spend = 0;
  let blackFemaleOwned30Spend = 0;
  let designatedGroupSpend = 0;

  // Issue 3: Added foreign supplier tracking
  let foreignSupplierSpend = 0;

  for (const sup of suppliers) {
    // Issue 3: Foreign suppliers excluded from Empowering Supplier recognition but included in TMPS
    if (sup.isForeignSupplier) {
      foreignSupplierSpend += sup.spend;
      // Foreign suppliers ARE included in TMPS but NOT for Empowering Supplier recognition
      continue;
    }

    const recognised = sup.spend * getRecognitionMultiplier(sup.beeLevel);
    recognisedSpend += recognised;

    if (sup.beeLevel >= 1 && sup.beeLevel <= 4) {
      empoweringSpend += sup.spend;
    }

    if (sup.enterpriseType === 'qse') {
      qseSpend += sup.spend;
    }
    if (sup.enterpriseType === 'eme') {
      emeSpend += sup.spend;
    }

    if (sup.blackOwnership >= 0.51) {
      blackOwned51Spend += sup.spend;
    }

    if (sup.blackWomenOwnership >= BLACK_WOMEN_OWNERSHIP_THRESHOLD) {
      blackFemaleOwned30Spend += sup.spend;
    }

    const isDesignatedGroup = sup.blackOwnership >= 0.51 && (sup.youthOwnership > 0 || sup.disabledOwnership > 0);
    if (isDesignatedGroup) {
      designatedGroupSpend += sup.spend;
    }
  }

  const empoweringScore = clampScore(safeRatio(empoweringSpend, TARGET_80, 5), 5);
  const qseScore = clampScore(safeRatio(qseSpend, TARGET_15_QSE, 3), 3);
  const emeScore = clampScore(safeRatio(emeSpend, TARGET_15_EME, 4), 4);
  // CRITICAL FIX: 50% target (not 40%), 11 pts (not 10)
  const blackOwned51Score = clampScore(safeRatio(blackOwned51Spend, TARGET_50_BLACK51, 11), 11);
  const blackFemaleOwned30Score = clampScore(safeRatio(blackFemaleOwned30Spend, TARGET_12_FEMALE30, 4), 4);
  // CRITICAL FIX: 2% target (not 12%)
  const designatedGroupScore = clampScore(safeRatio(designatedGroupSpend, TARGET_2_DESIGNATED, 2), 2);

  // Issue 3: Procurement has NO graduation/jobs bonuses - these are ED only!
  const baseTotal = empoweringScore + qseScore + emeScore + blackOwned51Score + blackFemaleOwned30Score + designatedGroupScore;
  // Cap at 29 - procurement has NO bonus points
  const totalScore = clampScore(baseTotal, 29);

  const subLines: ProcurementSubLine[] = [
    { name: "B-BBEE Procurement Spend from Empowering Suppliers", target: "80% of TMPS", weighting: 5, score: empoweringScore, spend: empoweringSpend },
    { name: "Spend on QSE Empowering Suppliers", target: "15% of TMPS", weighting: 3, score: qseScore, spend: qseSpend },
    { name: "Spend on EME Suppliers", target: "15% of TMPS", weighting: 4, score: emeScore, spend: emeSpend },
    // CRITICAL FIX: 50% target (not 40%)
    { name: "Spend on Empowering Suppliers ≥51% Black Owned", target: "50% of TMPS", weighting: 11, score: blackOwned51Score, spend: blackOwned51Spend },
    { name: "Spend on Empowering Suppliers >30% Black Female Owned", target: "12% of TMPS", weighting: 4, score: blackFemaleOwned30Score, spend: blackFemaleOwned30Spend },
    // CRITICAL FIX: 2% target (not 12%)
    { name: "Spend on Designated Group Suppliers ≥51% Black Owned", target: "2% of TMPS (bonus row)", weighting: 2, score: designatedGroupScore, spend: designatedGroupSpend },
    // NOTE: No procurement bonus rows - bonuses are ED only
  ];

  // Issue 3: Removed graduationBonus and jobsCreatedBonus from return
  return {
    base: round2(baseTotal),
    empoweringSuppliers: round2(empoweringScore),
    qseSuppliers: round2(qseScore),
    emeSuppliers: round2(emeScore),
    blackOwned51: round2(blackOwned51Score),
    blackFemaleOwned30: round2(blackFemaleOwned30Score),
    designatedGroup: round2(designatedGroupScore),
    total: round2(totalScore),
    subMinimumMet: baseTotal >= subMinThreshold,
    recognisedSpend: round2(recognisedSpend),
    target: round2(TARGET_80),
    subLines: subLines.map(l => ({ ...l, score: round2(l.score), spend: round2(l.spend) })),
    rawStats: {
      spendAllBlackOwned: round2(suppliers.filter(s => s.blackOwnership >= 0.51).reduce((acc, s) => acc + s.spend, 0)),
      spendBlackWomenOwned: round2(suppliers.filter(s => s.blackWomenOwnership >= BLACK_WOMEN_OWNERSHIP_THRESHOLD).reduce((acc, s) => acc + s.spend, 0)),
      spendQSE: round2(qseSpend),
      spendEME: round2(emeSpend),
      designatedGroupSpend: round2(designatedGroupSpend),
      empoweringSpend: round2(empoweringSpend),
      blackOwned51Spend: round2(blackOwned51Spend),
      blackFemaleOwned30Spend: round2(blackFemaleOwned30Spend),
      foreignSupplierSpend: round2(foreignSupplierSpend), // Issue 3: Added
    },
  };
}
