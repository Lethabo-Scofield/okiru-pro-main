import type { ProcurementData, Supplier } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

/**
 * @domain-rule pillar:procurement, slides:56,57
 * @see docs/domain/pillars/04_preferential_procurement.md#procurement-recognition-levels
 * @see docs/domain/calculations/scoring_tables.md#b-bbee-recognition-levels
 */
const STANDARD_RECOGNITION_TABLE: Readonly<Record<number, number>> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0,
};

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

function getRecognitionMultiplier(beeLevel: number, config: CalculatorConfig): number {
  if (config.recognitionTable && Array.isArray(config.recognitionTable)) {
    const entry = config.recognitionTable.find(e => e.level === beeLevel);
    if (entry) return entry.multiplier;
  }
  return STANDARD_RECOGNITION_TABLE[beeLevel] ?? 0;
}

/**
 * @domain-rule pillar:procurement, slides:58,61,62
 * @see docs/domain/pillars/04_preferential_procurement.md#scorecard
 * @see docs/domain/calculations/tmps_calculation.md
 * VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
 * CRITICAL FIXES: BO51 target 40%→50%, DG target 12%→2%, DG is bonus (excluded from sub-min)
 */
export function calculateProcurementScore(data: ProcurementData, config: CalculatorConfig): ProcurementResult {
  if (!config) throw new Error('CalculatorConfig is required for procurement score calculation');
  const { tmps } = data;
  const suppliers = data.suppliers || [];
  const pc = config.procurement;

  const allSuppliersTarget = pc.allSuppliersTarget ?? 0.80;
  const allSuppliersMaxPts = pc.allSuppliersMaxPts ?? 5;
  const qseTarget = pc.qseTarget ?? 0.15;
  const qseMaxPts = pc.qseMaxPts ?? 3;
  const emeTarget = pc.emeTarget ?? 0.15;
  const emeMaxPts = pc.emeMaxPts ?? 4;
  const bo51Target = pc.bo51Target ?? 0.50;
  const bo51MaxPts = pc.bo51MaxPts ?? 11;
  const bwo30Target = pc.bwo30Target ?? 0.12;
  const bwo30MaxPts = pc.bwo30MaxPts ?? 4;
  const dgTarget = pc.dgTarget ?? 0.02;
  const dgMaxPts = pc.dgMaxPts ?? 2;
  
  const blackWomenThreshold = config.procurement.blackWomenThreshold ?? 0.30;
  const subMinThreshold = config.pillarConfigs?.preferentialProcurement?.subMinimumPercent ?? 40;
  const maxPoints = config.pillarConfigs?.preferentialProcurement?.maxPoints ?? 29;

  const TARGET_ALL = tmps * allSuppliersTarget;
  const TARGET_QSE = tmps * qseTarget;
  const TARGET_EME = tmps * emeTarget;
  const TARGET_BO51 = tmps * bo51Target;
  const TARGET_BWO30 = tmps * bwo30Target;
  const TARGET_DG = tmps * dgTarget;

  let recognisedSpend = 0;
  let empoweringSpend = 0;
  let qseSpend = 0;
  let emeSpend = 0;
  let blackOwned51Spend = 0;
  let blackFemaleOwned30Spend = 0;
  let designatedGroupSpend = 0;
  let foreignSupplierSpend = 0;

  for (const sup of suppliers) {
    if (sup.isForeignSupplier) {
      foreignSupplierSpend += sup.spend;
      continue;
    }

    const recognised = sup.spend * getRecognitionMultiplier(sup.beeLevel, config);
    recognisedSpend += recognised;

    // Use isEmpoweringSupplier flag when available, fall back to level 1-4
    if (sup.isEmpoweringSupplier ?? (sup.beeLevel >= 1 && sup.beeLevel <= 4)) {
      empoweringSpend += recognised;
    }

    if (sup.enterpriseType === 'qse') {
      qseSpend += recognised;
    }
    if (sup.enterpriseType === 'eme') {
      emeSpend += recognised;
    }

    if (sup.blackOwnership >= 0.51) {
      blackOwned51Spend += recognised;
    }

    if (sup.blackWomenOwnership >= blackWomenThreshold) {
      blackFemaleOwned30Spend += recognised;
    }

    const isDesignatedGroup = sup.blackOwnership >= 0.51 && (sup.youthOwnership > 0 || sup.disabledOwnership > 0);
    if (isDesignatedGroup) {
      designatedGroupSpend += recognised;
    }
  }

  const empoweringScore = clampScore(safeRatio(empoweringSpend, TARGET_ALL, allSuppliersMaxPts), allSuppliersMaxPts);
  const qseScore = clampScore(safeRatio(qseSpend, TARGET_QSE, qseMaxPts), qseMaxPts);
  const emeScore = clampScore(safeRatio(emeSpend, TARGET_EME, emeMaxPts), emeMaxPts);
  const blackOwned51Score = clampScore(safeRatio(blackOwned51Spend, TARGET_BO51, bo51MaxPts), bo51MaxPts);
  const blackFemaleOwned30Score = clampScore(safeRatio(blackFemaleOwned30Spend, TARGET_BWO30, bwo30MaxPts), bwo30MaxPts);
  const designatedGroupScore = clampScore(safeRatio(designatedGroupSpend, TARGET_DG, dgMaxPts), dgMaxPts);

  // Designated Group is a bonus indicator per RCOGP 2019
  const baseTotal = empoweringScore + qseScore + emeScore + blackOwned51Score + blackFemaleOwned30Score;
  const totalScore = clampScore(baseTotal + designatedGroupScore, maxPoints);

  // Sub-minimum excludes bonus points (DG is bonus per RCOGP 2019)
  const baseMaxPoints = allSuppliersMaxPts + qseMaxPts + emeMaxPts + bo51MaxPts + bwo30MaxPts;
  const subMinThresholdPoints = (subMinThreshold / 100) * baseMaxPoints;

  const subLines: ProcurementSubLine[] = [
    { name: "B-BBEE Procurement Spend from Empowering Suppliers", target: `${(allSuppliersTarget * 100).toFixed(0)}% of TMPS`, weighting: allSuppliersMaxPts, score: empoweringScore, spend: empoweringSpend },
    { name: "Spend on QSE Empowering Suppliers", target: `${(qseTarget * 100).toFixed(0)}% of TMPS`, weighting: qseMaxPts, score: qseScore, spend: qseSpend },
    { name: "Spend on EME Suppliers", target: `${(emeTarget * 100).toFixed(0)}% of TMPS`, weighting: emeMaxPts, score: emeScore, spend: emeSpend },
    { name: "Spend on Empowering Suppliers ≥51% Black Owned", target: `${(bo51Target * 100).toFixed(0)}% of TMPS`, weighting: bo51MaxPts, score: blackOwned51Score, spend: blackOwned51Spend },
    { name: "Spend on Empowering Suppliers >30% Black Female Owned", target: `${(bwo30Target * 100).toFixed(0)}% of TMPS`, weighting: bwo30MaxPts, score: blackFemaleOwned30Score, spend: blackFemaleOwned30Spend },
    { name: "Spend on Designated Group Suppliers ≥51% Black Owned", target: `${(dgTarget * 100).toFixed(0)}% of TMPS`, weighting: dgMaxPts, score: designatedGroupScore, spend: designatedGroupSpend, isBonus: true },
  ];

  return {
    base: round2(baseTotal),
    empoweringSuppliers: round2(empoweringScore),
    qseSuppliers: round2(qseScore),
    emeSuppliers: round2(emeScore),
    blackOwned51: round2(blackOwned51Score),
    blackFemaleOwned30: round2(blackFemaleOwned30Score),
    designatedGroup: round2(designatedGroupScore),
    total: round2(totalScore),
    subMinimumMet: baseTotal >= subMinThresholdPoints, // Excludes DG bonus
    recognisedSpend: round2(recognisedSpend),
    target: round2(TARGET_ALL),
    subLines: subLines.map(l => ({ ...l, score: round2(l.score), spend: round2(l.spend) })),
    rawStats: {
      spendAllBlackOwned: round2(suppliers.filter(s => s.blackOwnership >= 0.51).reduce((acc, s) => acc + s.spend, 0)),
      spendBlackWomenOwned: round2(suppliers.filter(s => s.blackWomenOwnership >= blackWomenThreshold).reduce((acc, s) => acc + s.spend, 0)),
      spendQSE: round2(qseSpend),
      spendEME: round2(emeSpend),
      designatedGroupSpend: round2(designatedGroupSpend),
      empoweringSpend: round2(empoweringSpend),
      blackOwned51Spend: round2(blackOwned51Spend),
      blackFemaleOwned30Spend: round2(blackFemaleOwned30Spend),
      foreignSupplierSpend: round2(foreignSupplierSpend),
    },
  };
}
