/**
 * Empowerment Financing (EF) calculator — FSC Banks (FS701) and Long-Term
 * Insurers (FS702) ONLY. Returns null for every other sector / sub-sector
 * (STI, FSC Others/Generic, non-FSC), mirroring the AFS pattern.
 *
 * Scores ONLY the two EF-proper indicators (the SD/ED/bonus rows that share
 * the template's "EF & ESD Scorecard" sheet are already scored by the ESD
 * pillar — re-scoring them here would double-count):
 *
 *   1. Targeted Investments — 12 pts, target = 100% of exposure.
 *      Banks:  achieved D7 (new-loans exposure) / target SUM(C5:C6)
 *              (Balance Sheet Exposure + Additional TI exposure).
 *      LTI:    achieved C6 (portion of TI target) / target C5 (Qualifying Exposure).
 *      Formula pattern: I14 =IFERROR(MIN(K14/SUM(C5:C6)*C14,C14),0).
 *   2. Transaction Financing & Risk Capital — 3 pts, target = 100% of the TF
 *      portfolio; achieved = plain SUM of tblTransactionFinancingData[Value]
 *      (H15 =SUMIFS(tblTransactionFinancingData[Value],…)). No advanced/
 *      outstanding split, no per-facility qualifying weighting in the template.
 *
 * Source: "EF & ESD Scorecard - Banks" / "EF & ESD Scorecard - Long Term" +
 * "Transaction Financing Data", BBBEE Toolkit (FSC) Template v1.0.xlsx
 * (extracted docs/toolkits/extracted_formulas/FSC_Generic.md L15882–16145;
 * spec docs/FSC-Empowerment-Financing-Spec.md).
 *
 * Input shapes (EmpowermentFinancingData):
 * - Template-exact scalars + TF table — used when present (real toolkit exports).
 * - Gathering-workbook facility table (Facility | EF Category | Rand Value
 *   Advanced | Qualifying %) — the BEE information-gathering workbooks carry no
 *   exposure-target scalars, so each line scores the qualifying-weighted
 *   fraction of its declared portfolio: Σ(value × qualifying%) / Σ(value).
 *   This fabricates nothing: a facility without a stated Qualifying % counts
 *   as 0 qualifying (like AFS indicators the sheet doesn't carry), and an
 *   empty portfolio scores 0.
 */
import type { EmpowermentFinancingData, EfFacility } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { round2 } from './shared';

/** Clamp a ratio to [0, 1]. */
function clamp01(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(Math.max(ratio, 0), 1);
}

export interface EfSubLine {
  code: string;
  name: string;
  maxPoints: number;
  score: number;
  achieved: number;
  target: number;
}

export interface EfResult {
  total: number;
  maxPoints: number;
  lines: EfSubLine[];
}

/**
 * Transaction-Financing / Risk-Capital categories vs Targeted-Investment
 * categories, per the FSC EF taxonomy carried in the workbook's own
 * "EF Category" column: B-BBEE Transaction Financing and Black Business
 * Growth / Private-Equity funding belong to the "Transaction Financing and
 * Risk Capital contributions" line; Transformational Infrastructure,
 * Affordable Housing, Agricultural Development and Black SME Financing are
 * Targeted Investments.
 */
function isTransactionFinancingCategory(category: string): boolean {
  return /transaction\s*financ|risk\s*capital|business\s*growth|private\s*equity|\bp\.?e\.?\b/i.test(category);
}

/** Qualifying-weighted ratio over a facility group: Σ(value×q%) / Σ(value). */
function facilityRatio(facilities: EfFacility[]): { achieved: number; target: number } {
  let achieved = 0;
  let target = 0;
  for (const f of facilities) {
    const value = Number(f.valueAdvanced) || 0;
    if (value <= 0) continue;
    target += value;
    achieved += value * (clamp01((f.qualifyingPercent ?? 0) / 100));
  }
  return { achieved, target };
}

/**
 * Calculate the FSC Empowerment Financing pillar (EF-proper: Targeted
 * Investments + Transaction Financing = 15 pts for Banks/LTI).
 * Returns null when the config allocates no EF-proper points (STI's
 * empowermentFinancing.maxPoints=0 block, FSC Others, non-FSC sectors).
 */
export function calculateEmpowermentFinancingScore(
  data: EmpowermentFinancingData,
  cfg: CalculatorConfig,
): EfResult | null {
  const efCfg = cfg.empowermentFinancing;
  if (!efCfg) return null;
  const tiMax = efCfg.targetedInvestmentMaxPts ?? 0;
  const tfMax = efCfg.transactionFinancingMaxPts ?? 0;
  if (tiMax + tfMax <= 0) return null;

  const facilities = data.facilities ?? [];
  const tiFacilities = facilities.filter((f) => !isTransactionFinancingCategory(f.category ?? ''));
  const tfFacilities = facilities.filter((f) => isTransactionFinancingCategory(f.category ?? ''));

  // ---- 1. Targeted Investments (12 pts) ----
  // Template scalars first: Banks SUM(C5:C6) target, else LTI C5 target.
  let tiAchieved = 0;
  let tiTarget = 0;
  const banksTiTarget = (data.balanceSheetExposure ?? 0) + (data.additionalTiExposure ?? 0);
  if (banksTiTarget > 0) {
    tiTarget = banksTiTarget;
    tiAchieved = data.newLoansExposure ?? 0;
  } else if ((data.qualifyingExposure ?? 0) > 0) {
    tiTarget = data.qualifyingExposure ?? 0;
    tiAchieved = data.targetedInvestmentPortion ?? 0;
  } else {
    ({ achieved: tiAchieved, target: tiTarget } = facilityRatio(tiFacilities));
  }
  const tiScore = tiTarget > 0 ? round2(clamp01(tiAchieved / tiTarget) * tiMax) : 0;

  // ---- 2. Transaction Financing & Risk Capital (3 pts) ----
  let tfAchieved = 0;
  let tfTarget = 0;
  if ((data.tfPortfolioValue ?? 0) > 0) {
    tfTarget = data.tfPortfolioValue ?? 0;
    tfAchieved = (data.tfTransactions ?? []).reduce((s, t) => s + (Number(t.value) || 0), 0);
  } else {
    ({ achieved: tfAchieved, target: tfTarget } = facilityRatio(tfFacilities));
  }
  const tfScore = tfTarget > 0 ? round2(clamp01(tfAchieved / tfTarget) * tfMax) : 0;

  const lines: EfSubLine[] = [
    { code: 'EF-TI', name: 'Targeted Investments', maxPoints: tiMax, score: tiScore, achieved: tiAchieved, target: tiTarget },
    { code: 'EF-TF', name: 'Transaction Financing and Risk Capital contributions', maxPoints: tfMax, score: tfScore, achieved: tfAchieved, target: tfTarget },
  ];
  const total = round2(tiScore + tfScore);
  return { total, maxPoints: tiMax + tfMax, lines };
}
