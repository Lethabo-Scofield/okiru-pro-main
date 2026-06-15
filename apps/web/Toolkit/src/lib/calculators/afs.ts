/**
 * Access to Financial Services (AFS) calculator — FSC sub-sectors FS701/FS702/FS703.
 *
 * AFS totals 12 points for all three sub-sectors; the internal structure differs:
 * - Banks (FS701): geographic access + electronic channels (6 indicators, 12 pts)
 * - Long-Term Insurers (FS702): products / penetration / transactional access (3 indicators, 12 pts)
 * - Short-Term Insurers (FS703): commercial products + insurance policies (2 sub-totals, 12 pts)
 *
 * Source: AFS Scorecard - Banks / Long Term / Short Term sheets,
 *   BBBEE Toolkit (FSC) Template v1.0.xlsx (rendered 2026-06-01).
 *
 * @see docs/domain/sectors/fsc/generic/sls.md §6.10–6.12
 */
import type { AfsData } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { round2 } from './shared';

/** Clamp a ratio to [0, 1]. */
function clamp01(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(Math.max(ratio, 0), 1);
}

export interface AfsSubLine {
  code: string;
  name: string;
  target: string;
  maxPoints: number;
  score: number;
}

export interface AfsResult {
  total: number;
  maxPoints: number;
  subSector: 'Banks' | 'LTI' | 'STI';
  lines: AfsSubLine[];
}

// ---------------------------------------------------------------------------
// Banks (FS701): 6 indicators
// ---------------------------------------------------------------------------

function calculateBanksAfs(data: AfsData, cfg: NonNullable<CalculatorConfig['accessToFinancialServices']>): AfsResult {
  const lines: AfsSubLine[] = [];

  // Transaction Point within 5km — % of qualifying area (target 85%, 1 pt)
  const tpCov = (data.transactionPointCoverage ?? 0) / 100;
  const tpTarget = cfg.transactionPointTarget ?? 0.85;
  const tpMax = cfg.transactionPointMaxPts ?? 1;
  const tpScore = clamp01(tpCov / tpTarget) * tpMax;
  lines.push({ code: '2.1.2a', name: 'Transaction Point within 5km', target: `${tpTarget * 100}%`, maxPoints: tpMax, score: round2(tpScore) });

  // Service Point within 10km — % of qualifying area (target 70%, 1 pt)
  const spCov = (data.servicePointCoverage ?? 0) / 100;
  const spTarget = cfg.servicePointTarget ?? 0.70;
  const spMax = cfg.servicePointMaxPts ?? 1;
  const spScore = clamp01(spCov / spTarget) * spMax;
  lines.push({ code: '2.1.2b', name: 'Service Point within 10km', target: `${spTarget * 100}%`, maxPoints: spMax, score: round2(spScore) });

  // Sales Point within 15km — % of qualifying area (target 60%, 2 pts)
  const salesCov = (data.salesPointCoverage ?? 0) / 100;
  const salesTarget = cfg.salesPointTarget ?? 0.60;
  const salesMax = cfg.salesPointMaxPts ?? 2;
  const salesScore = clamp01(salesCov / salesTarget) * salesMax;
  lines.push({ code: '2.1.3', name: 'Sales Point within 15km', target: `${salesTarget * 100}%`, maxPoints: salesMax, score: round2(salesScore) });

  // Electronic Access — national target (yes/no, 2 pts)
  const eaMax = cfg.electronicAccessMaxPts ?? 2;
  const eaScore = data.electronicAccessCompliant ? eaMax : 0;
  lines.push({ code: '2.1.4', name: 'Electronic Access (national)', target: 'National', maxPoints: eaMax, score: eaScore });

  // Point of Presence — at least one per measurement unit (yes/no, 3 pts)
  const popMax = cfg.pointOfPresenceMaxPts ?? 3;
  const popScore = data.hasPointOfPresence ? popMax : 0;
  lines.push({ code: '2.2', name: 'Point of Presence per measurement unit', target: 'Yes', maxPoints: popMax, score: popScore });

  // Active Accounts in Target Market — national target (yes/no, 3 pts)
  const aaMax = cfg.activeAccountsMaxPts ?? 3;
  const aaScore = data.activeAccountsCompliant ? aaMax : 0;
  lines.push({ code: '2.3', name: 'Active Accounts (target market)', target: 'National', maxPoints: aaMax, score: aaScore });

  const total = round2(lines.reduce((s, l) => s + l.score, 0));
  return { total, maxPoints: cfg.maxPoints, subSector: 'Banks', lines };
}

// ---------------------------------------------------------------------------
// Long-Term Insurers (FS702): 3 indicators
// ---------------------------------------------------------------------------

function calculateLtiAfs(data: AfsData, cfg: NonNullable<CalculatorConfig['accessToFinancialServices']>): AfsResult {
  const lines: AfsSubLine[] = [];

  // Appropriate Products — numerator / denominator → ratio (3 pts)
  const apMax = cfg.appropriateProductsMaxPts ?? 3;
  const apNum = data.appropriateProductsNumerator ?? 0;
  const apDen = data.appropriateProductsDenominator ?? 0;
  const apScore = apDen > 0 ? clamp01(apNum / apDen) * apMax : 0;
  lines.push({ code: '2.1', name: 'Appropriate Products', target: 'Compliant product ratio', maxPoints: apMax, score: round2(apScore) });

  // Market Penetration — on-book policies vs SAIA communicated (7 pts)
  const mpMax = cfg.marketPenetrationMaxPts ?? 7;
  const mpPolicies = data.marketPenetrationPolicies ?? 0;
  const mpSaia = data.saiaCommunicatedPolicies ?? 0;
  const mpScore = mpSaia > 0 ? clamp01(mpPolicies / mpSaia) * mpMax : 0;
  lines.push({ code: '2.2', name: 'Market Penetration (on-book vs SAIA)', target: 'SAIA communicated', maxPoints: mpMax, score: round2(mpScore) });

  // Transactional Accesses — % of polygons covered (target 80%, 2 pts)
  const taTarget = cfg.transactionalAccessTarget ?? 0.80;
  const taMax = cfg.transactionalAccessMaxPts ?? 2;
  const taCov = (data.transactionalAccessCoverage ?? 0) / 100;
  const taScore = clamp01(taCov / taTarget) * taMax;
  lines.push({ code: '2.3', name: 'Transactional Accesses (polygon coverage)', target: `${taTarget * 100}%`, maxPoints: taMax, score: round2(taScore) });

  const total = round2(lines.reduce((s, l) => s + l.score, 0));
  return { total, maxPoints: cfg.maxPoints, subSector: 'LTI', lines };
}

// ---------------------------------------------------------------------------
// Short-Term Insurers (FS703): 2 sub-totals
// ---------------------------------------------------------------------------

function calculateStiAfs(data: AfsData, cfg: NonNullable<CalculatorConfig['accessToFinancialServices']>): AfsResult {
  const lines: AfsSubLine[] = [];

  // Commercial Products — 6 product lines, each 100% target, equal weight
  const commercialMax = cfg.commercialProductsMaxPts ?? 2;
  const linesCount = cfg.commercialLinesCount ?? 6;
  const ptsPerLine = commercialMax / linesCount;
  const offered = [
    data.commercialEquipment,
    data.commercialLiability,
    data.commercialProperty,
    data.commercialAgriculture,
    data.commercialLivestock,
    data.commercialOther,
  ];
  const offeredCount = offered.filter(Boolean).length;
  const commercialScore = round2(offeredCount * ptsPerLine);
  lines.push({ code: '2.1', name: 'Appropriate Products (Commercial)', target: '100%', maxPoints: commercialMax, score: commercialScore });

  // Insurance Policies — yes/no (100% target, 10 pts)
  const ipMax = cfg.insurancePoliciesMaxPts ?? 10;
  const ipTarget = cfg.insurancePoliciesTarget ?? 1.0;
  const ipScore = data.insurancePoliciesCompliant ? ipMax : 0;
  lines.push({ code: '2.2', name: 'Insurance Policies', target: `${ipTarget * 100}%`, maxPoints: ipMax, score: ipScore });

  const total = round2(lines.reduce((s, l) => s + l.score, 0));
  return { total, maxPoints: cfg.maxPoints, subSector: 'STI', lines };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Calculate the AFS pillar score for FSC Banks, LTI, or STI.
 * The `subSector` is read from `cfg.accessToFinancialServices.subSector`.
 * Returns null if AFS is not configured (i.e. FSC Others).
 */
export function calculateAfsScore(
  data: AfsData,
  cfg: CalculatorConfig,
): AfsResult | null {
  const afsCfg = cfg.accessToFinancialServices;
  if (!afsCfg) return null;

  switch (afsCfg.subSector) {
    case 'Banks': return calculateBanksAfs(data, afsCfg);
    case 'LTI':   return calculateLtiAfs(data, afsCfg);
    case 'STI':   return calculateStiAfs(data, afsCfg);
    default:      return null;
  }
}
