/**
 * @domain-rule pillar:yes, slides:121-129
 * @see docs/domain/pillars/07_yes_programme.md
 */
import type { YESData, YESCandidate } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { clampScore, round2 } from './shared';

export interface YESResult {
  score: number;
  target: number;
  weighting: number;
  yesTierAchieved: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3';
  yesBeeLevelIncrease: number;
  yesBonusPoints: number;
  qualifiesForLevelUplift: boolean;
  yesHeadcountTarget: number;
  totalCandidates: number;
  blackYouthCount: number;
  blackYouthPercentage: number;
  absorbedCount: number;
  absorptionRate: number;
  totalCost: number;
  costPerCandidate: number;
  tier1Threshold: number;
  tier2Threshold: number;
  tier3Threshold: number;
  progressToTier1: number;
  progressToTier2: number;
  progressToTier3: number;
  targetBreakdown: {
    headcountBased: number;
    npatBased: number;
    revenueBased: number;
    applied: number;
  };
}

/**
 * Revenue-based YES headcount table per RCOGP slide 124
 * @domain-rule pillar:yes, slide:124
 */
const REVENUE_HEADCOUNT_TABLE: Array<{ minRevenue: number; maxRevenue: number; target: number }> = [
  { minRevenue: 50_000_000, maxRevenue: 75_000_000, target: 6 },
  { minRevenue: 75_000_000, maxRevenue: 99_000_000, target: 7 },
  { minRevenue: 99_000_000, maxRevenue: 149_000_000, target: 8 },
  { minRevenue: 149_000_000, maxRevenue: 199_000_000, target: 9 },
  { minRevenue: 199_000_000, maxRevenue: 249_000_000, target: 10 },
  { minRevenue: 249_000_000, maxRevenue: 299_000_000, target: 11 },
  { minRevenue: 299_000_000, maxRevenue: 349_000_000, target: 12 },
  { minRevenue: 349_000_000, maxRevenue: 399_000_000, target: 13 },
  { minRevenue: 399_000_000, maxRevenue: 449_000_000, target: 14 },
  { minRevenue: 449_000_000, maxRevenue: Infinity, target: 15 },
];

function getRevenueBasedTarget(revenue: number): number {
  if (revenue < 50_000_000) return 0;
  for (const band of REVENUE_HEADCOUNT_TABLE) {
    if (revenue >= band.minRevenue && revenue < band.maxRevenue) return band.target;
  }
  return 15;
}

/**
 * YES target = highest of three formulas (slide 123)
 * @domain-rule pillar:yes, slide:123
 */
function calculateHeadcountTarget(
  totalEmployees: number,
  revenue: number,
  averageNpat3yr: number,
  config?: CalculatorConfig
): { applied: number; headcountBased: number; npatBased: number; revenueBased: number } {
  const pct = config?.yes?.headcountPercent ?? 0.015;
  const stipend = config?.yes?.annualStipend ?? 55_000;

  const headcountBased = Math.max(Math.ceil(totalEmployees * pct), 1);
  const npatBased = stipend > 0
    ? Math.max(Math.ceil((pct * averageNpat3yr) / stipend), 1)
    : 1;
  const revenueBased = getRevenueBasedTarget(revenue);

  const applied = Math.max(headcountBased, npatBased, revenueBased);
  return { applied, headcountBased, npatBased, revenueBased };
}

/**
 * Tier determination based on headcount AND absorption rate (slide 123)
 * @domain-rule pillar:yes, slide:123
 *
 * | Achievement                                | Result                      |
 * | Achieve 2x target + 5% absorption          | +2 levels                   |
 * | Achieve 1.5x target + 5% absorption        | +1 level + 3 bonus points   |
 * | Achieve 1x target + 2.5% absorption         | +1 level                    |
 */
function calculateTierAndUplift(
  enrolledCount: number,
  headcountTarget: number,
  absorptionRate: number,
  config?: CalculatorConfig
): {
  tier: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3';
  levelIncrease: number;
  bonusPoints: number;
  thresholds: { tier1: number; tier2: number; tier3: number };
} {
  const t1Mult = config?.yes?.tier1Multiplier ?? 2.0;
  const t2Mult = config?.yes?.tier2Multiplier ?? 1.5;
  const t3Mult = config?.yes?.tier3Multiplier ?? 1.0;

  const thresholds = {
    tier1: Math.max(Math.ceil(headcountTarget * t1Mult), 1),
    tier2: Math.max(Math.ceil(headcountTarget * t2Mult), 1),
    tier3: Math.max(Math.ceil(headcountTarget * t3Mult), 1),
  };

  // Tier 1: 2x target + 5% absorption → +2 levels
  if (enrolledCount >= thresholds.tier1 && absorptionRate >= 5) {
    return { tier: 'Tier 1', levelIncrease: 2, bonusPoints: 0, thresholds };
  }
  // Tier 2: 1.5x target + 5% absorption → +1 level + 3 bonus points
  if (enrolledCount >= thresholds.tier2 && absorptionRate >= 5) {
    return { tier: 'Tier 2', levelIncrease: 1, bonusPoints: 3, thresholds };
  }
  // Tier 3: 1x target + 2.5% absorption → +1 level
  if (enrolledCount >= thresholds.tier3 && absorptionRate >= 2.5) {
    return { tier: 'Tier 3', levelIncrease: 1, bonusPoints: 0, thresholds };
  }

  return { tier: 'None', levelIncrease: 0, bonusPoints: 0, thresholds };
}

export function calculateYESScore(data: YESData, config?: CalculatorConfig, revenue = 0, averageNpat3yr = 0): YESResult {
  const { totalEmployees, candidates, totalYesCost = 0 } = data;

  const targetResult = calculateHeadcountTarget(totalEmployees, revenue, averageNpat3yr, config);
  const yesHeadcountTarget = targetResult.applied;

  const totalCandidates = candidates.length;
  const blackYouthCount = candidates.filter(c => c.isBlack).length;
  const blackYouthPercentage = totalCandidates > 0
    ? (blackYouthCount / totalCandidates) * 100
    : 0;

  const absorbedCount = candidates.filter(c => c.isAbsorbed).length;
  const absorptionRate = totalCandidates > 0
    ? (absorbedCount / totalCandidates) * 100
    : 0;

  const { tier, levelIncrease, bonusPoints, thresholds } = calculateTierAndUplift(
    totalCandidates,
    yesHeadcountTarget,
    absorptionRate,
    config
  );

  // Black youth threshold gate (default 50%) — no uplift if not met
  const blackYouthThreshold = config?.yes?.blackYouthPercent ?? 50;
  const qualifiesForLevelUplift = blackYouthPercentage >= blackYouthThreshold;
  const yesBeeLevelIncrease = qualifiesForLevelUplift ? levelIncrease : 0;
  const yesBonusPoints = qualifiesForLevelUplift ? bonusPoints : 0;

  const totalCost = totalYesCost || candidates.reduce((sum, c) => sum + c.cost, 0);
  const costPerCandidate = totalCandidates > 0 ? totalCost / totalCandidates : 0;

  const tierScores: Record<typeof tier, number> = {
    'None': 0,
    'Tier 3': config?.yes?.tier3Points ?? 1,
    'Tier 2': config?.yes?.tier2Points ?? 2,
    'Tier 1': config?.yes?.tier1Points ?? 3,
  };
  const score = tierScores[tier];

  const progressToTier1 = thresholds.tier1 > 0 ? Math.min(100, (totalCandidates / thresholds.tier1) * 100) : 0;
  const progressToTier2 = thresholds.tier2 > 0 ? Math.min(100, (totalCandidates / thresholds.tier2) * 100) : 0;
  const progressToTier3 = thresholds.tier3 > 0 ? Math.min(100, (totalCandidates / thresholds.tier3) * 100) : 0;

  return {
    score: round2(score),
    target: 3,
    weighting: 3,
    yesTierAchieved: tier,
    yesBeeLevelIncrease,
    yesBonusPoints,
    qualifiesForLevelUplift,
    yesHeadcountTarget,
    totalCandidates,
    blackYouthCount,
    blackYouthPercentage: round2(blackYouthPercentage),
    absorbedCount,
    absorptionRate: round2(absorptionRate),
    totalCost: round2(totalCost),
    costPerCandidate: round2(costPerCandidate),
    tier1Threshold: thresholds.tier1,
    tier2Threshold: thresholds.tier2,
    tier3Threshold: thresholds.tier3,
    progressToTier1: round2(progressToTier1),
    progressToTier2: round2(progressToTier2),
    progressToTier3: round2(progressToTier3),
    targetBreakdown: {
      headcountBased: targetResult.headcountBased,
      npatBased: targetResult.npatBased,
      revenueBased: targetResult.revenueBased,
      applied: targetResult.applied,
    },
  };
}

export function calculateRecommendedCandidates(
  totalEmployees: number,
  targetTier: 'Tier 1' | 'Tier 2' | 'Tier 3',
  revenue = 0,
  averageNpat3yr = 0
): number {
  const { applied } = calculateHeadcountTarget(totalEmployees, revenue, averageNpat3yr);

  const multipliers: Record<typeof targetTier, number> = {
    'Tier 1': 2.0,
    'Tier 2': 1.5,
    'Tier 3': 1.0,
  };

  return Math.ceil(applied * multipliers[targetTier]);
}

export function meetsBlackYouthRequirement(candidates: YESCandidate[]): boolean {
  if (candidates.length === 0) return false;
  const blackYouthCount = candidates.filter(c => c.isBlack).length;
  return (blackYouthCount / candidates.length) >= 0.5;
}
