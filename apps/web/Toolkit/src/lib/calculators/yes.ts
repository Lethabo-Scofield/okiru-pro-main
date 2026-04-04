import type { YESData, YESCandidate } from '../types';
import { clampScore, round2 } from './shared';

export interface YESResult {
  // Scores
  score: number;
  target: number;
  weighting: number;
  
  // Tier achievement
  yesTierAchieved: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3';
  
  // BEE level impact
  yesBeeLevelIncrease: number;
  qualifiesForLevelUplift: boolean;
  
  // Targets
  yesHeadcountTarget: number;
  
  // Counts
  totalCandidates: number;
  blackYouthCount: number;
  blackYouthPercentage: number;
  absorbedCount: number;
  absorptionRate: number;
  
  // Cost
  totalCost: number;
  costPerCandidate: number;
  
  // Tier thresholds
  tier1Threshold: number;
  tier2Threshold: number;
  tier3Threshold: number;
  
  // Progress to each tier
  progressToTier1: number;
  progressToTier2: number;
  progressToTier3: number;
}

/**
 * Calculate YES headcount target based on total employees
 * < 500 employees: 2.5%
 * 500 - 1000 employees: 1.5%
 * > 1000 employees: 1%
 */
function calculateHeadcountTarget(totalEmployees: number): number {
  if (totalEmployees < 500) {
    return Math.max(Math.ceil(totalEmployees * 0.025), 1);
  } else if (totalEmployees <= 1000) {
    return Math.max(Math.ceil(totalEmployees * 0.015), 8); // Minimum 8 for 500+
  } else {
    return Math.max(Math.ceil(totalEmployees * 0.01), 15); // Minimum 15 for 1000+
  }
}

/**
 * Calculate which tier the company has achieved
 */
function calculateTier(
  candidates: YESCandidate[],
  headcountTarget: number
): { tier: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3'; thresholds: { tier1: number; tier2: number; tier3: number } } {
  const thresholds = {
    tier1: Math.max(Math.ceil(headcountTarget * 1.5), 1),
    tier2: Math.max(Math.ceil(headcountTarget * 1.0), 1),
    tier3: Math.max(Math.ceil(headcountTarget * 0.5), 1),
  };
  
  const enrolledCount = candidates.length;
  
  if (enrolledCount >= thresholds.tier1) {
    return { tier: 'Tier 1', thresholds };
  } else if (enrolledCount >= thresholds.tier2) {
    return { tier: 'Tier 2', thresholds };
  } else if (enrolledCount >= thresholds.tier3) {
    return { tier: 'Tier 3', thresholds };
  }
  
  return { tier: 'None', thresholds };
}

/**
 * Calculate BEE level increase based on tier and 50% black youth requirement
 */
function calculateLevelIncrease(
  tier: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3',
  blackYouthPercentage: number
): { increase: number; qualifies: boolean } {
  // Tier 1: 2 levels increase
  // Tier 2: 1 level increase
  // Tier 3: 1 level increase
  // But only if 50%+ of YES participants are Black Youth
  
  const qualifies = blackYouthPercentage >= 50;
  
  if (!qualifies) {
    return { increase: 0, qualifies: false };
  }
  
  switch (tier) {
    case 'Tier 1':
      return { increase: 2, qualifies: true };
    case 'Tier 2':
    case 'Tier 3':
      return { increase: 1, qualifies: true };
    default:
      return { increase: 0, qualifies: true }; // Qualifies but no tier achieved
  }
}

export function calculateYESScore(data: YESData): YESResult {
  const { 
    totalEmployees, 
    candidates,
    totalYesCost = 0 
  } = data;
  
  // Calculate target
  const yesHeadcountTarget = calculateHeadcountTarget(totalEmployees);
  
  // Calculate tier
  const { tier, thresholds } = calculateTier(candidates, yesHeadcountTarget);
  
  // Count demographics
  const totalCandidates = candidates.length;
  const blackYouthCount = candidates.filter(c => c.isBlack).length;
  const blackYouthPercentage = totalCandidates > 0 
    ? (blackYouthCount / totalCandidates) * 100 
    : 0;
  
  // Absorption tracking
  const absorbedCount = candidates.filter(c => c.isAbsorbed).length;
  const absorptionRate = totalCandidates > 0 
    ? (absorbedCount / totalCandidates) * 100 
    : 0;
  
  // Calculate level increase
  const { increase: yesBeeLevelIncrease, qualifies: qualifiesForLevelUplift } = calculateLevelIncrease(
    tier, 
    blackYouthPercentage
  );
  
  // Cost calculations
  const totalCost = totalYesCost || candidates.reduce((sum, c) => sum + c.cost, 0);
  const costPerCandidate = totalCandidates > 0 ? totalCost / totalCandidates : 0;
  
  // Score is not applicable for YES - it's a bonus mechanism
  // But we return the tier achievement as the "score"
  // Issue 2: YES Scoring Correction - Tier 1 = 3pts, Tier 2 = 2pts, Tier 3 = 1pt
  const tierScores: Record<typeof tier, number> = {
    'None': 0,
    'Tier 3': 1,
    'Tier 2': 2,
    'Tier 1': 3,
  };
  
  const score = tierScores[tier];
  
  // Progress calculations
  const progressToTier1 = Math.min(100, (totalCandidates / thresholds.tier1) * 100);
  const progressToTier2 = Math.min(100, (totalCandidates / thresholds.tier2) * 100);
  const progressToTier3 = Math.min(100, (totalCandidates / thresholds.tier3) * 100);
  
  return {
    score: round2(score),
    target: 3, // Issue 2: Changed from 5 to 3
    weighting: 3, // Issue 2: Changed from 5 to 3
    yesTierAchieved: tier,
    yesBeeLevelIncrease,
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
  };
}

/**
 * Calculate recommended number of YES candidates to achieve a specific tier
 */
export function calculateRecommendedCandidates(
  totalEmployees: number,
  targetTier: 'Tier 1' | 'Tier 2' | 'Tier 3'
): number {
  const baseTarget = calculateHeadcountTarget(totalEmployees);
  
  const multipliers: Record<typeof targetTier, number> = {
    'Tier 1': 1.5,
    'Tier 2': 1.0,
    'Tier 3': 0.5,
  };
  
  return Math.ceil(baseTarget * multipliers[targetTier]);
}

/**
 * Check if company meets 50% black youth requirement
 */
export function meetsBlackYouthRequirement(candidates: YESCandidate[]): boolean {
  if (candidates.length === 0) return false;
  const blackYouthCount = candidates.filter(c => c.isBlack).length;
  return (blackYouthCount / candidates.length) >= 0.5;
}
