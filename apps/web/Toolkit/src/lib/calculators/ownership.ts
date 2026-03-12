import type { OwnershipData } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore } from './shared';

const FULL_OWNERSHIP_THRESHOLD = 0.25;
const WOMEN_VOTING_TARGET = 0.10;
const WOMEN_ECONOMIC_TARGET = 0.10;
const DESIGNATED_GROUP_TARGET = 0.10;
const MAX_TOTAL = 25;

const GRADUATION_TABLE: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.6,
  5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0,
  9: 1.0, 10: 1.0,
};

export interface OwnershipSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
}

export interface OwnershipResult {
  votingRightsBlack: number;
  votingRightsBWO: number;
  economicInterestBlack: number;
  economicInterestBWO: number;
  designatedGroups: number;
  newEntrants: number;
  netValue: number;
  total: number;
  subMinimumMet: boolean;
  fullOwnershipAwarded: boolean;
  subLines: OwnershipSubLine[];
  rawStats: {
    blackVotingPercentage: number;
    blackWomenVotingPercentage: number;
    economicInterestPercentage: number;
    economicInterestBWOPercentage: number;
    designatedGroupPercentage: number;
    netValuePercentage: number;
  };
}

function getGraduationFactor(years: number): number {
  if (years <= 0) return 0;
  const yearKeys = Object.keys(GRADUATION_TABLE).map(Number).sort((a, b) => a - b);
  let factor = 0;
  for (const y of yearKeys) {
    if (y <= years) factor = GRADUATION_TABLE[y];
    else break;
  }
  return factor;
}

export function calculateOwnershipScore(data: OwnershipData, config?: CalculatorConfig): OwnershipResult {
  const shareholders = data.shareholders || [];
  const { companyValue, outstandingDebt, yearsHeld } = data;

  const oc = config?.ownership;
  const SUB_MIN_NET_VALUE = oc?.subMinNetValue ?? 3.2;
  const TARGET_ECONOMIC_INTEREST = oc?.targetEconomicInterest ?? FULL_OWNERSHIP_THRESHOLD;

  const totalSharesRaw = shareholders.reduce((acc, sh) => acc + sh.shares, 0);
  const hasShares = totalSharesRaw > 0;

  let totalBlackVoting = 0;
  let totalBlackWomenVoting = 0;
  let totalEconomicInterest = 0;
  let totalEconomicInterestBWO = 0;
  let totalDesignatedGroup = 0;
  let netValuePointsAgg = 0;
  let hasNewEntrant = false;

  for (const sh of shareholders) {
    const pct = hasShares
      ? sh.shares / totalSharesRaw
      : shareholders.length > 0 ? 1 / shareholders.length : 0;

    totalBlackVoting += pct * sh.blackOwnership;
    totalBlackWomenVoting += pct * sh.blackWomenOwnership;
    totalEconomicInterest += pct * sh.blackOwnership;
    totalEconomicInterestBWO += pct * sh.blackWomenOwnership;
    totalDesignatedGroup += pct * sh.blackOwnership;

    if (sh.blackNewEntrant) hasNewEntrant = true;

    if (sh.shareValue > 0 && sh.blackOwnership > 0) {
      const debtAttributable = outstandingDebt * pct;
      const carryingValue = sh.shareValue * pct;
      const shareValueAllocated = companyValue * pct;
      const deemedValue = (shareValueAllocated - debtAttributable) / carryingValue;
      netValuePointsAgg += Math.max(0, deemedValue) * sh.blackOwnership;
    }
  }

  const fullOwnershipAwarded = totalBlackVoting >= FULL_OWNERSHIP_THRESHOLD && hasShares;

  let votingRightsBlack: number;
  let votingRightsBWO: number;
  let economicInterestBlack: number;
  let economicInterestBWO: number;
  let designatedGroups: number;
  let newEntrants: number;
  let netValuePoints: number;

  if (fullOwnershipAwarded) {
    votingRightsBlack = 4;
    votingRightsBWO = clampScore(safeRatio(totalBlackWomenVoting, WOMEN_VOTING_TARGET, 2), 2);
    economicInterestBlack = 4;
    economicInterestBWO = 2;
    designatedGroups = 3;
    newEntrants = hasNewEntrant ? 2 : 0;
    netValuePoints = 8;
  } else {
    votingRightsBlack = clampScore(safeRatio(totalBlackVoting, FULL_OWNERSHIP_THRESHOLD, 4), 4);
    votingRightsBWO = clampScore(safeRatio(totalBlackWomenVoting, WOMEN_VOTING_TARGET, 2), 2);

    const gradFactor = getGraduationFactor(yearsHeld);
    const formulaA = gradFactor > 0
      ? totalEconomicInterest * (1 / (TARGET_ECONOMIC_INTEREST * gradFactor)) * 4
      : 0;
    const formulaB = (totalEconomicInterest / TARGET_ECONOMIC_INTEREST) * 4;
    economicInterestBlack = clampScore(Math.max(formulaA, formulaB), 4);

    economicInterestBWO = clampScore(safeRatio(totalEconomicInterestBWO, WOMEN_ECONOMIC_TARGET, 2), 2);
    designatedGroups = clampScore(safeRatio(totalDesignatedGroup, DESIGNATED_GROUP_TARGET, 3), 3);
    newEntrants = hasNewEntrant ? 2 : 0;

    const hasNetValue = companyValue > 0 && shareholders.some(s => s.shareValue > 0);
    if (hasNetValue) {
      netValuePoints = clampScore(netValuePointsAgg, 8);
    } else {
      netValuePoints = totalBlackVoting >= 1.0
        ? 8
        : clampScore(safeRatio(totalBlackVoting, FULL_OWNERSHIP_THRESHOLD, 8), 8);
    }
  }

  const subMinimumMet = fullOwnershipAwarded || netValuePoints >= SUB_MIN_NET_VALUE;
  const totalPoints = votingRightsBlack + votingRightsBWO + economicInterestBlack + economicInterestBWO + designatedGroups + newEntrants + netValuePoints;

  const subLines: OwnershipSubLine[] = [
    { name: "Exercisable voting rights of black individuals", target: "25% + 1 vote", weighting: 4, score: votingRightsBlack },
    { name: "Exercisable voting rights of black females", target: "10%", weighting: 2, score: votingRightsBWO },
    { name: "Economic interest of black individuals", target: "25%", weighting: 4, score: economicInterestBlack },
    { name: "Economic interest of black females", target: "10%", weighting: 2, score: economicInterestBWO },
    { name: "Economic interest of black designated groups or participants in ownership schemes", target: "10%", weighting: 3, score: designatedGroups },
    { name: "Economic interest of black new entrants", target: "New entrant", weighting: 2, score: newEntrants },
    { name: "Net value", target: "≥ 3.2 pts", weighting: 8, score: netValuePoints },
  ];

  return {
    votingRightsBlack,
    votingRightsBWO,
    economicInterestBlack,
    economicInterestBWO,
    designatedGroups,
    newEntrants,
    netValue: netValuePoints,
    total: clampScore(totalPoints, MAX_TOTAL),
    subMinimumMet,
    fullOwnershipAwarded,
    subLines,
    rawStats: {
      blackVotingPercentage: totalBlackVoting,
      blackWomenVotingPercentage: totalBlackWomenVoting,
      economicInterestPercentage: totalEconomicInterest,
      economicInterestBWOPercentage: totalEconomicInterestBWO,
      designatedGroupPercentage: totalDesignatedGroup,
      netValuePercentage: fullOwnershipAwarded ? 1.0 : (netValuePointsAgg / 8),
    },
  };
}
