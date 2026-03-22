import type { ProcurementData, Supplier } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore } from './shared';

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

export interface ProcurementResult {
  base: number;
  empoweringSuppliers: number;
  qseSuppliers: number;
  emeSuppliers: number;
  blackOwned51: number;
  blackFemaleOwned30: number;
  designatedGroup: number;
  graduationBonus: number;
  jobsCreatedBonus: number;
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
  };
}

function getRecognitionMultiplier(beeLevel: number): number {
  return RECOGNITION_TABLE[beeLevel] ?? 0;
}

export function calculateProcurementScore(data: ProcurementData, config?: CalculatorConfig): ProcurementResult {
  const { tmps } = data;
  const suppliers = data.suppliers || [];
  const pc = config?.procurement;

  const subMinThreshold = pc?.subMinThreshold ?? 11.6;

  const TARGET_80 = tmps * 0.80;
  const TARGET_15_QSE = tmps * 0.15;
  const TARGET_15_EME = tmps * 0.15;
  const TARGET_40_BLACK51 = tmps * 0.40;
  const TARGET_12_FEMALE30 = tmps * 0.12;
  const TARGET_12_DESIGNATED = tmps * 0.12;

  let recognisedSpend = 0;
  let empoweringSpend = 0;
  let qseSpend = 0;
  let emeSpend = 0;
  let blackOwned51Spend = 0;
  let blackFemaleOwned30Spend = 0;
  let designatedGroupSpend = 0;

  for (const sup of suppliers) {
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
  const blackOwned51Score = clampScore(safeRatio(blackOwned51Spend, TARGET_40_BLACK51, 11), 11);
  const blackFemaleOwned30Score = clampScore(safeRatio(blackFemaleOwned30Spend, TARGET_12_FEMALE30, 4), 4);
  const designatedGroupScore = clampScore(safeRatio(designatedGroupSpend, TARGET_12_DESIGNATED, 2), 2);

  const graduationBonusScore = data.graduationBonus ? 1 : 0;
  const jobsCreatedBonusScore = data.jobsCreatedBonus ? 1 : 0;

  const baseTotal = empoweringScore + qseScore + emeScore + blackOwned51Score + blackFemaleOwned30Score + designatedGroupScore;
  const totalScore = clampScore(baseTotal + graduationBonusScore + jobsCreatedBonusScore, 29 + 2);

  const subLines: ProcurementSubLine[] = [
    { name: "B-BBEE Procurement Spend from Empowering Suppliers", target: "80% of TMPS", weighting: 5, score: empoweringScore, spend: empoweringSpend },
    { name: "Spend on QSE Empowering Suppliers", target: "15% of TMPS", weighting: 3, score: qseScore, spend: qseSpend },
    { name: "Spend on EME Suppliers", target: "15% of TMPS", weighting: 4, score: emeScore, spend: emeSpend },
    { name: "Spend on Empowering Suppliers ≥51% Black Owned", target: "40% of TMPS", weighting: 11, score: blackOwned51Score, spend: blackOwned51Spend },
    { name: "Spend on Empowering Suppliers >30% Black Female Owned", target: "12% of TMPS", weighting: 4, score: blackFemaleOwned30Score, spend: blackFemaleOwned30Spend },
    { name: "Spend on Designated Group Suppliers ≥51% Black Owned", target: "12% of TMPS", weighting: 2, score: designatedGroupScore, spend: designatedGroupSpend },
    { name: "Bonus: Graduation of ED Beneficiaries to SD", target: "Tick-box", weighting: 1, score: graduationBonusScore, spend: 0, isBonus: true },
    { name: "Bonus: Jobs Created from ED & SD Initiatives", target: "Tick-box", weighting: 1, score: jobsCreatedBonusScore, spend: 0, isBonus: true },
  ];

  return {
    base: baseTotal,
    empoweringSuppliers: empoweringScore,
    qseSuppliers: qseScore,
    emeSuppliers: emeScore,
    blackOwned51: blackOwned51Score,
    blackFemaleOwned30: blackFemaleOwned30Score,
    designatedGroup: designatedGroupScore,
    graduationBonus: graduationBonusScore,
    jobsCreatedBonus: jobsCreatedBonusScore,
    total: totalScore,
    subMinimumMet: baseTotal >= subMinThreshold,
    recognisedSpend,
    target: TARGET_80,
    subLines,
    rawStats: {
      spendAllBlackOwned: suppliers.filter(s => s.blackOwnership >= 0.51).reduce((acc, s) => acc + s.spend, 0),
      spendBlackWomenOwned: suppliers.filter(s => s.blackWomenOwnership >= BLACK_WOMEN_OWNERSHIP_THRESHOLD).reduce((acc, s) => acc + s.spend, 0),
      spendQSE: qseSpend,
      spendEME: emeSpend,
      designatedGroupSpend,
      empoweringSpend,
      blackOwned51Spend,
      blackFemaleOwned30Spend,
    },
  };
}
