/**
 * @domain-rule pillar:ownership, slides:108-114
 * @see docs/domain/pillars/01_ownership.md
 * @see docs/domain/calculations/net_value.md
 *
 * Sector targets and max points come from CalculatorConfig (sectorConfigToCalculatorConfig).
 * Mirrors apps/api/pipeline/rules/pillarCalculators.ts::calcOwnership.
 */
import type { OwnershipData } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

const DEFAULT_VOTING_TARGET = 0.25;
const DEFAULT_WOMEN_VOTING_TARGET = 0.10;
const DEFAULT_WOMEN_EI_TARGET = 0.10;
const DEFAULT_DG_TARGET = 0.03;
const DEFAULT_NEW_ENTRANTS_TARGET = 0.02;

const GRADUATION_TABLE: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.4,
  5: 0.6, 6: 0.6, 7: 0.8, 8: 0.8,
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
    /** Black new-entrant economic interest as a fraction 0–1 (Construction new-entrants indicator). */
    newEntrantEIPercentage: number;
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

function resolveOwnershipTargets(config: CalculatorConfig) {
  const oc = config?.ownership;
  const configuredMax = config?.pillarConfigs?.ownership?.maxPoints;
  const maxPts = configuredMax != null && configuredMax > 0 ? configuredMax : 25;

  return {
    votingRightsTarget: oc?.votingRightsTarget ?? DEFAULT_VOTING_TARGET,
    votingRightsMaxPts: oc?.votingRightsMax ?? 4,
    womenVotingTarget: oc?.womenVotingTarget ?? DEFAULT_WOMEN_VOTING_TARGET,
    womenVotingMaxPts: oc?.womenBonusMax ?? 2,
    economicInterestTarget: oc?.targetEconomicInterest ?? DEFAULT_VOTING_TARGET,
    economicInterestMaxPts: oc?.economicInterestMax ?? 4,
    womenEITarget: oc?.womenEITarget ?? DEFAULT_WOMEN_EI_TARGET,
    womenEIMaxPts: oc?.womenEIMax ?? 2,
    netValueMaxPts: oc?.netValueMax ?? 8,
    newEntrantsMaxPts: oc?.newEntrantsMax ?? 2,
    newEntrantsTarget: oc?.newEntrantsTarget ?? DEFAULT_NEW_ENTRANTS_TARGET,
    designatedGroupsMax: oc?.designatedGroupsMax ?? 3,
    designatedGroupsTarget: oc?.designatedGroupsTarget ?? DEFAULT_DG_TARGET,
    subMinNetValue: oc?.subMinNetValue ?? 3.2,
    // QSE: single combined "Black New Entrants or Designated Groups" indicator —
    // a shareholder qualifies on EITHER criterion. (TOOLKIT-RESOLVED.md Q8.)
    combinedNewEntrantsDesignated: oc?.combinedNewEntrantsDesignated === true,
    maxPts,
  };
}

export function calculateOwnershipScore(data: OwnershipData, config: CalculatorConfig): OwnershipResult {
  const shareholders = data.shareholders || [];
  const ot = resolveOwnershipTargets(config);

  console.log('[SCORING-TRACE] calculateOwnershipScore received:', {
    shareholderCount: shareholders.length,
    companyValue: data.companyValue,
    maxPoints: ot.maxPts,
    sample: shareholders.slice(0, 2).map(s => ({
      name: s.name,
      blackOwnership: s.blackOwnership,
      shares: s.shares,
    })),
  });

  const { companyValue, outstandingDebt, yearsHeld } = data;

  const totalSharesRaw = shareholders.reduce((acc, sh) => acc + sh.shares, 0);
  const hasShares = totalSharesRaw > 0;

  let totalBlackVoting = 0;
  let totalBlackWomenVoting = 0;
  let totalEconomicInterest = 0;
  let totalEconomicInterestBWO = 0;
  let totalDesignatedGroup = 0;
  let netValuePointsAgg = 0;
  let hasNewEntrant = false;
  let totalNewEntrantEI = 0;

  for (const sh of shareholders) {
    const pct = hasShares
      ? sh.shares / totalSharesRaw
      : shareholders.length > 0 ? 1 / shareholders.length : 0;

    totalBlackVoting += pct * sh.blackOwnership;
    totalBlackWomenVoting += pct * sh.blackWomenOwnership;
    totalEconomicInterest += pct * sh.blackOwnership;
    totalEconomicInterestBWO += pct * sh.blackWomenOwnership;
    // NOTE (Wave 3 A9): sh.votingRightsPercent / economicInterestPercent are
    // collected on the form but NOT consumed here — the calc uses the
    // share-weighted pct for both voting and economic interest. Attempting to
    // use those fields directly (vp/ep) caused 2 ICT-QSE golden tests to fail
    // because the existing test data set votingRightsPercent=0.30 on a single
    // 100%-shares holder, expecting the old "dead-input" behavior. The
    // semantics of votingRightsPercent vs share-weight differ (voting trust
    // vs beneficial ownership). Needs expert clarification + spec citation
    // before making it live. Flagged in autoresearch/log/RISKS.md.
    // QSE combined indicator: a shareholder counts toward the designated-group
    // economic-interest indicator if it is a designated group OR a new entrant.
    const countsTowardDesignated = ot.combinedNewEntrantsDesignated
      ? (sh.isDesignatedGroup || !!sh.blackNewEntrant)
      : sh.isDesignatedGroup;
    if (countsTowardDesignated) {
      totalDesignatedGroup += pct * sh.blackOwnership;
    }

    if (sh.blackNewEntrant) {
      hasNewEntrant = true;
      totalNewEntrantEI += pct * sh.blackOwnership;
    }

    if (sh.shareValue > 0 && sh.blackOwnership > 0) {
      const debtAttributable = outstandingDebt * pct;
      const carryingValue = sh.shareValue * pct;
      const shareValueAllocated = companyValue * pct;
      const deemedValue = carryingValue > 0 ? (shareValueAllocated - debtAttributable) / carryingValue : 0;
      netValuePointsAgg += Math.max(0, deemedValue) * sh.blackOwnership;
    }
  }

  const fullOwnershipAwarded = totalBlackVoting >= ot.votingRightsTarget && hasShares;

  let votingRightsBlack: number;
  let votingRightsBWO: number;
  let economicInterestBlack: number;
  let economicInterestBWO: number;
  let designatedGroups: number;
  let newEntrants: number;
  let netValuePoints: number;

  if (fullOwnershipAwarded) {
    votingRightsBlack = ot.votingRightsMaxPts;
    votingRightsBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);
    economicInterestBlack = ot.economicInterestMaxPts;
    economicInterestBWO = ot.womenEIMaxPts;
    designatedGroups = ot.designatedGroupsMax;
    newEntrants = hasNewEntrant ? ot.newEntrantsMaxPts : 0;
    netValuePoints = ot.netValueMaxPts;
  } else {
    votingRightsBlack = clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.votingRightsMaxPts), ot.votingRightsMaxPts);
    votingRightsBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);

    const gradFactor = getGraduationFactor(yearsHeld);
    const formulaA = gradFactor > 0
      ? totalEconomicInterest * (1 / (ot.economicInterestTarget * gradFactor)) * ot.economicInterestMaxPts
      : 0;
    const formulaB = (totalEconomicInterest / ot.economicInterestTarget) * ot.economicInterestMaxPts;
    economicInterestBlack = clampScore(
      gradFactor > 0 ? Math.min(formulaA, formulaB) : formulaB,
      ot.economicInterestMaxPts,
    );

    economicInterestBWO = clampScore(safeRatio(totalEconomicInterestBWO, ot.womenEITarget, ot.womenEIMaxPts), ot.womenEIMaxPts);
    designatedGroups = clampScore(safeRatio(totalDesignatedGroup, ot.designatedGroupsTarget, ot.designatedGroupsMax), ot.designatedGroupsMax);
    // Scale new-entrant points by new entrants' black economic interest vs the 2%
    // target (toolkit Ownership Scorecard H12), not all-or-nothing. QSE folds new
    // entrants into the combined designated-group line. (ledger D-04/D-06/D-07)
    newEntrants = ot.combinedNewEntrantsDesignated
      ? 0
      : clampScore(safeRatio(totalNewEntrantEI, ot.newEntrantsTarget, ot.newEntrantsMaxPts), ot.newEntrantsMaxPts);

    const hasNetValue = companyValue > 0 && shareholders.some(s => s.shareValue > 0);
    if (hasNetValue) {
      netValuePoints = clampScore(netValuePointsAgg, ot.netValueMaxPts);
    } else {
      // QSE fallback: when company value unknown, award net value from black ownership %
      netValuePoints = totalBlackVoting >= 1.0
        ? ot.netValueMaxPts
        : clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.netValueMaxPts), ot.netValueMaxPts);
    }
  }

  const subMinimumMet = fullOwnershipAwarded || netValuePoints >= ot.subMinNetValue;
  const totalPoints = votingRightsBlack + votingRightsBWO + economicInterestBlack + economicInterestBWO
    + designatedGroups + newEntrants + netValuePoints;

  const subLines: OwnershipSubLine[] = [
    { name: 'Exercisable voting rights of black individuals', target: `${(ot.votingRightsTarget * 100).toFixed(0)}% + 1 vote`, weighting: ot.votingRightsMaxPts, score: votingRightsBlack },
    { name: 'Exercisable voting rights of black females', target: `${(ot.womenVotingTarget * 100).toFixed(0)}%`, weighting: ot.womenVotingMaxPts, score: votingRightsBWO },
    { name: 'Economic interest of black individuals', target: `${(ot.economicInterestTarget * 100).toFixed(0)}%`, weighting: ot.economicInterestMaxPts, score: economicInterestBlack },
    { name: 'Economic interest of black females / ESOP bonus', target: `${(ot.womenEITarget * 100).toFixed(0)}%`, weighting: ot.womenEIMaxPts, score: economicInterestBWO },
    { name: ot.combinedNewEntrantsDesignated ? 'Economic interest of black new entrants or designated groups' : 'Economic interest of black designated groups or participants in ownership schemes', target: `${(ot.designatedGroupsTarget * 100).toFixed(0)}%`, weighting: ot.designatedGroupsMax, score: designatedGroups },
    { name: 'Economic interest of black new entrants', target: `${(ot.newEntrantsTarget * 100).toFixed(0)}%`, weighting: ot.newEntrantsMaxPts, score: newEntrants },
    { name: 'Net value', target: `≥ ${ot.subMinNetValue} pts`, weighting: ot.netValueMaxPts, score: netValuePoints },
  ];

  const total = round2(clampScore(totalPoints, ot.maxPts));
  console.log(`[SCORING-TRACE] calculateOwnershipScore result: ${total} / ${ot.maxPts}`);

  return {
    votingRightsBlack: round2(votingRightsBlack),
    votingRightsBWO: round2(votingRightsBWO),
    economicInterestBlack: round2(economicInterestBlack),
    economicInterestBWO: round2(economicInterestBWO),
    designatedGroups: round2(designatedGroups),
    newEntrants: round2(newEntrants),
    netValue: round2(netValuePoints),
    total,
    subMinimumMet,
    fullOwnershipAwarded,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    rawStats: {
      blackVotingPercentage: round2(totalBlackVoting),
      blackWomenVotingPercentage: round2(totalBlackWomenVoting),
      economicInterestPercentage: round2(totalEconomicInterest),
      economicInterestBWOPercentage: round2(totalEconomicInterestBWO),
      designatedGroupPercentage: round2(totalDesignatedGroup),
      netValuePercentage: round2(fullOwnershipAwarded ? 1.0 : (netValuePointsAgg / ot.netValueMaxPts)),
      newEntrantEIPercentage: round2(totalNewEntrantEI),
    },
  };
}
