/**
 * @domain-rule pillar:ownership, slides:108-114
 * @see docs/domain/pillars/01_ownership.md
 * @see docs/domain/calculations/net_value.md
 *
 * Sector targets and max points come from CalculatorConfig (sectorConfigToCalculatorConfig).
 * Mirrors apps/api/pipeline/rules/pillarCalculators.ts::calcOwnership.
 */
import type { OwnershipData, Shareholder } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

const DEFAULT_VOTING_TARGET = 0.25;
const DEFAULT_WOMEN_VOTING_TARGET = 0.10;
const DEFAULT_WOMEN_EI_TARGET = 0.10;
const DEFAULT_DG_TARGET = 0.03;
const DEFAULT_NEW_ENTRANTS_TARGET = 0.02;
const SCHEME_ROW = /esop|bbos|employee share|broad.?based (ownership|scheme)|co-?operative/;
/** The scheme rows the live any-scheme bonus has always recognised (no co-ops). */
const LIVE_SCHEME_ROW = /esop|bbos|employee share|broad.?based (ownership|scheme)/;

/** Is this register row an employee / broad-based ownership scheme or co-op? Read from the row itself, never assumed. */
function isSchemeRow(sh: { name?: string; ownershipType?: unknown }, re: RegExp = SCHEME_ROW): boolean {
  return re.test(`${String(sh.ownershipType ?? '')} ${String(sh.name ?? '')}`.toLowerCase());
}

/**
 * Ownership fulfilment (Transport Codes, Yes/No): the black participants' stake
 * is fulfilled — every black holder's acquisition debt is STATED and is nil,
 * and no entity-level acquisition debt is recorded. A holder whose debt nobody
 * stated leaves the question unanswered, and an unanswered question earns
 * nothing.
 */
export function ownershipFulfilled(
  shareholders: Array<{ blackOwnership: number; outstandingDebt?: number | null }>,
  entityOutstandingDebt: number,
): boolean {
  const black = shareholders.filter((sh) => sh.blackOwnership > 0);
  if (black.length === 0) return false;
  if (entityOutstandingDebt > 0) return false;
  return black.every((sh) => typeof sh.outstandingDebt === 'number' && Number.isFinite(sh.outstandingDebt) && sh.outstandingDebt === 0);
}

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
  /**
   * True when the Codes award this indicator as a BONUS on top of the element's
   * weighting rather than as part of it. The scorecard splits base from bonus off
   * this flag, so an untagged bonus line silently inflates the element's
   * denominator (Transport QSE ownership read 25/28 = "At Risk" when the entity
   * had in fact earned every one of the 25 base points).
   *
   * Which lines are bonus is SECTOR-specific, never universal: black-women voting
   * rights is a base indicator under the generic Codes but a bonus under the
   * Transport Codes. So it is declared per sector on CalculatorConfig.ownership,
   * not hardcoded here.
   */
  isBonus?: boolean;
  /** The line's arithmetic in plain English, for the reviewer. */
  note?: string;
}

export interface OwnershipResult {
  votingRightsBlack: number;
  votingRightsBWO: number;
  economicInterestBlack: number;
  economicInterestBWO: number;
  designatedGroups: number;
  newEntrants: number;
  /** Ownership fulfilment (Transport), 0 where the sector has no such line. */
  ownershipFulfilment: number;
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
    esopBonusMaxPts: oc?.esopBonusMaxPts ?? 0,
    // Set only by a sector that scores the bonus as the Transport Codes word it
    // (scheme economic interest against a target). Unset keeps the live rule:
    // full points once a scheme row appears in the register.
    esopBonusTarget: typeof oc?.esopBonusTarget === 'number' && oc.esopBonusTarget > 0 ? oc.esopBonusTarget : null,
    ownershipFulfilmentMaxPts: oc?.ownershipFulfilmentMax ?? 0,
    // Sector-declared bonus indicators. Default false: under the generic Codes
    // black-women voting rights and black-women economic interest are BASE
    // indicators. The Transport Codes award both as bonus (QSE: 2 + 1 = the 3
    // bonus points that sit on top of ownership's 25-pt weighting for a 28 cap).
    womenVotingIsBonus: oc?.womenVotingIsBonus === true,
    womenEIIsBonus: oc?.womenEIIsBonus === true,
    // QSE: single combined "Black New Entrants or Designated Groups" indicator —
    // a shareholder qualifies on EITHER criterion. (TOOLKIT-RESOLVED.md Q8.)
    combinedNewEntrantsDesignated: oc?.combinedNewEntrantsDesignated === true,
    maxPts,
  };
}

export function calculateOwnershipScore(data: OwnershipData, config: CalculatorConfig): OwnershipResult {
  const ot = resolveOwnershipTargets(config);
  if (config?.ownership?.ownershipMethod === 'toolkit') {
    return calculateToolkitOwnership(data, ot, config.ownership.netValueTarget);
  }
  // The original method was always fed a share value of R1 where none was on
  // file: the store, the workbook import and the bulk import wrote that
  // placeholder. The data now keeps the truth (0) so the toolkit method can
  // tell a real value split from none, and the placeholder is applied here,
  // for the original method only, so every sector not yet checked against
  // its own toolkit scores exactly as it did.
  const shareholders = (data.shareholders || []).map((sh) =>
    (sh.shareValue > 0 ? sh : { ...sh, shareValue: 1 }));


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
    // NOTE: Annexe 100(D) 2.2.3 also recognises black participants in
    // collective vehicles (ESOP/BBOS/co-ops/qualifying trusts) on this line,
    // but qualification depends on the vehicle's DEED meeting Annexe 100(E) —
    // not on its name. Name-based inference was tried and broke the
    // certificate-verified Sandile QSE pin (own 27 → 28 vs BE13609), so scheme
    // recognition stays an attested input: the practitioner marks the row
    // isDesignatedGroup when the deed qualifies.
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

  // EVERY indicator scores on its own measure (Annexe 100). The old fast path
  // awarded FULL points for EI, black-women EI, designated groups and net value
  // the moment black voting crossed 25% — inventing points for indicators the
  // entity never evidenced (a 25%-voting entity got the black-women EI maximum
  // with zero black women). Removed per audit 2026-07-26 item 12a.
  const votingRightsBlack = clampScore(safeRatio(totalBlackVoting, ot.votingRightsTarget, ot.votingRightsMaxPts), ot.votingRightsMaxPts);
  const votingRightsBWO = clampScore(safeRatio(totalBlackWomenVoting, ot.womenVotingTarget, ot.womenVotingMaxPts), ot.womenVotingMaxPts);

  // Economic interest is a PLAIN ratio to target. The time-graduation factor
  // used to sit here inside a min() that could never select it (factor <= 1
  // makes the graduated formula the LARGER one) — dead code that belonged on
  // Net Value anyway: Annexe 100(E) grows the NET VALUE target over the first
  // ten years (target = EI target x factor), it does not touch EI.
  // (Audit 2026-07-26 item 12b.)
  const economicInterestBlack = clampScore(
    safeRatio(totalEconomicInterest, ot.economicInterestTarget, ot.economicInterestMaxPts),
    ot.economicInterestMaxPts,
  );

  const economicInterestBWO = clampScore(safeRatio(totalEconomicInterestBWO, ot.womenEITarget, ot.womenEIMaxPts), ot.womenEIMaxPts);
  const designatedGroups = clampScore(safeRatio(totalDesignatedGroup, ot.designatedGroupsTarget, ot.designatedGroupsMax), ot.designatedGroupsMax);
  // Scale new-entrant points by new entrants' black economic interest vs the 2%
  // target (toolkit Ownership Scorecard H12), not all-or-nothing. QSE folds new
  // entrants into the combined designated-group line. (ledger D-04/D-06/D-07)
  const newEntrants = ot.combinedNewEntrantsDesignated
    ? 0
    : clampScore(safeRatio(totalNewEntrantEI, ot.newEntrantsTarget, ot.newEntrantsMaxPts), ot.newEntrantsMaxPts);

  let netValuePoints: number;
  const hasNetValue = companyValue > 0 && shareholders.some(s => s.shareValue > 0);
  if (hasNetValue) {
    // Annexe 100(E): the net-value target phases in over ten years — in year t
    // the entity must show EI-target x graduation-factor(t) of net value, so a
    // young deal's achieved value is measured against the SMALLER target.
    const gradFactor = getGraduationFactor(yearsHeld);
    const graduated = gradFactor > 0 ? netValuePointsAgg / gradFactor : netValuePointsAgg;
    netValuePoints = clampScore(graduated, ot.netValueMaxPts);
  } else if (outstandingDebt > 0) {
    // Recorded acquisition debt with NO valuation cannot be netted — Annexe
    // 100(C) needs the equity value to weigh the debt against. No number is
    // invented: the points wait for a valuation.
    netValuePoints = 0;
  } else {
    // No valuation AND no recorded acquisition debt: Annexe 100(C) reduces
    // exactly to black ECONOMIC INTEREST — net value % = blackEI × (1 − debt/V),
    // and debt = 0 cancels the valuation out of the formula entirely. Scored
    // against the time-graduated target (Annexe 100(E)), same as the valued
    // path. This is why a verifier awards a debt-free 100% black owner full
    // net value with no valuation on file. The old fallback scored from
    // VOTING (the wrong measure) and ignored recorded debt.
    const gradFactor = getGraduationFactor(yearsHeld);
    const graduatedTarget = ot.economicInterestTarget * (gradFactor > 0 ? gradFactor : 1);
    netValuePoints = clampScore(
      safeRatio(totalEconomicInterest, graduatedTarget, ot.netValueMaxPts),
      ot.netValueMaxPts,
    );
  }

  // ESOP/BBOS scheme bonus (Transport), detected from the row's own
  // ownershipType/name, never assumed. Two rules:
  //   - live (no esopBonusTarget): full points once a scheme row appears —
  //     what every Transport Large client is scored on today;
  //   - the Codes' wording (esopBonusTarget set — held back, see
  //     TRANSPORT_QSE_CODES_OWNERSHIP_LINES): the BLACK ECONOMIC INTEREST held
  //     through scheme or co-op rows against the target.
  let esopBonus = 0;
  if (ot.esopBonusMaxPts > 0 && ot.esopBonusTarget === null) {
    const esopEvidence = shareholders.some((sh) => isSchemeRow(sh as { name?: string; ownershipType?: unknown }, LIVE_SCHEME_ROW));
    esopBonus = esopEvidence ? ot.esopBonusMaxPts : 0;
  } else if (ot.esopBonusMaxPts > 0 && ot.esopBonusTarget !== null) {
    let schemeBlackEI = 0;
    for (const sh of shareholders) {
      if (!isSchemeRow(sh as { name?: string; ownershipType?: unknown })) continue;
      const pct = hasShares ? sh.shares / totalSharesRaw : shareholders.length > 0 ? 1 / shareholders.length : 0;
      schemeBlackEI += pct * sh.blackOwnership;
    }
    esopBonus = clampScore(safeRatio(schemeBlackEI, ot.esopBonusTarget, ot.esopBonusMaxPts), ot.esopBonusMaxPts);
  }

  // Ownership fulfilment (Transport Codes "Ownership fulfilment | Yes | 1").
  const fulfilment = ot.ownershipFulfilmentMaxPts > 0
    && ownershipFulfilled(
      shareholders as Array<{ blackOwnership: number; outstandingDebt?: number | null }>,
      outstandingDebt,
    )
    ? ot.ownershipFulfilmentMaxPts
    : 0;

  const subMinimumMet = netValuePoints >= ot.subMinNetValue;
  const totalPoints = votingRightsBlack + votingRightsBWO + economicInterestBlack + economicInterestBWO
    + designatedGroups + newEntrants + fulfilment + netValuePoints + esopBonus;

  // Each line is emitted only when the sector actually allocates points to it.
  // A sector that folds new entrants into the combined designated line (QSE), or
  // that has no designated-group line at all (Transport QSE), must not show a
  // phantom always-zero row — that made the breakdown's weightings sum to more
  // than the pillar cap and read as nonsense. INVARIANT: the surviving lines'
  // weightings sum to pillarConfigs.ownership.maxPoints. (Enforced by
  // ownershipBreakdown.reconciliation.test.ts.)
  const subLines: OwnershipSubLine[] = [
    { name: 'Exercisable voting rights of black individuals', target: `${(ot.votingRightsTarget * 100).toFixed(0)}% + 1 vote`, weighting: ot.votingRightsMaxPts, score: votingRightsBlack },
    { name: 'Exercisable voting rights of black females', target: `${(ot.womenVotingTarget * 100).toFixed(0)}%`, weighting: ot.womenVotingMaxPts, score: votingRightsBWO, isBonus: ot.womenVotingIsBonus || undefined },
    { name: 'Economic interest of black individuals', target: `${(ot.economicInterestTarget * 100).toFixed(0)}%`, weighting: ot.economicInterestMaxPts, score: economicInterestBlack },
    // Only when the sector has the line (Transport QSE does not).
    ...(ot.womenEIMaxPts > 0
      ? [{ name: 'Economic interest of black females', target: `${(ot.womenEITarget * 100).toFixed(0)}%`, weighting: ot.womenEIMaxPts, score: economicInterestBWO, isBonus: ot.womenEIIsBonus || undefined }]
      : []),
    // Designated-groups line: shown when the sector allocates points to it, or
    // when it is the combined "new entrants OR designated groups" QSE indicator.
    ...(ot.designatedGroupsMax > 0 || ot.combinedNewEntrantsDesignated
      ? [{ name: ot.combinedNewEntrantsDesignated ? 'Economic interest of black new entrants or designated groups' : 'Economic interest of black designated groups or participants in ownership schemes', target: `${(ot.designatedGroupsTarget * 100).toFixed(0)}%`, weighting: ot.designatedGroupsMax, score: designatedGroups }]
      : []),
    // Separate new-entrants line: only when it carries its own points and is not
    // already folded into the combined indicator above.
    ...(ot.newEntrantsMaxPts > 0 && !ot.combinedNewEntrantsDesignated
      ? [{ name: 'Economic interest of black new entrants', target: `${(ot.newEntrantsTarget * 100).toFixed(0)}%`, weighting: ot.newEntrantsMaxPts, score: newEntrants }]
      : []),
    ...(ot.ownershipFulfilmentMaxPts > 0
      ? [{ name: 'Ownership fulfilment', target: 'Yes — black participants\' acquisition debt stated and nil', weighting: ot.ownershipFulfilmentMaxPts, score: fulfilment }]
      : []),
    { name: 'Net value', target: `≥ ${ot.subMinNetValue} pts`, weighting: ot.netValueMaxPts, score: netValuePoints },
    ...(ot.esopBonusMaxPts > 0 && ot.esopBonusTarget === null
      ? [{ name: 'ESOP / broad-based scheme participation (bonus)', target: 'scheme in share register', weighting: ot.esopBonusMaxPts, score: esopBonus, isBonus: true }]
      : []),
    ...(ot.esopBonusMaxPts > 0 && ot.esopBonusTarget !== null
      ? [{ name: 'ESOP / broad-based scheme / co-op participation (bonus)', target: `${(ot.esopBonusTarget * 100).toFixed(0)}% economic interest through schemes`, weighting: ot.esopBonusMaxPts, score: esopBonus, isBonus: true }]
      : []),
  ];

  const total = round2(clampScore(totalPoints, ot.maxPts));

  return {
    votingRightsBlack: round2(votingRightsBlack),
    votingRightsBWO: round2(votingRightsBWO),
    economicInterestBlack: round2(economicInterestBlack),
    economicInterestBWO: round2(economicInterestBWO),
    designatedGroups: round2(designatedGroups),
    newEntrants: round2(newEntrants),
    ownershipFulfilment: round2(fulfilment),
    netValue: round2(netValuePoints),
    total,
    subMinimumMet,
    // Retained in the result shape for UI compatibility; permanently false now
    // that every indicator scores on its own measure (audit item 12a).
    fullOwnershipAwarded: false,
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
    rawStats: {
      blackVotingPercentage: round2(totalBlackVoting),
      blackWomenVotingPercentage: round2(totalBlackWomenVoting),
      economicInterestPercentage: round2(totalEconomicInterest),
      economicInterestBWOPercentage: round2(totalEconomicInterestBWO),
      designatedGroupPercentage: round2(totalDesignatedGroup),
      netValuePercentage: round2(netValuePointsAgg / ot.netValueMaxPts),
      newEntrantEIPercentage: round2(totalNewEntrantEI),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The Empower toolkit's ownership arithmetic (RCOGP Generic template), checked
// line by line against the workbook recalculated by Excel. Selected by
// CalculatorConfig.ownership.ownershipMethod === 'toolkit'; every other sector
// keeps the calculation above until its own template has been checked.
//
// Where the spreadsheet's FORMULAS are mechanically broken they are not copied:
//   - its target cells go through LEFT(E,3), which reads 3% and 2% as "0.0"
//     (designated groups and new entrants can never score) and 25% as 0.2
//     (economic interest full marks from 20%). The real targets are used;
//   - its first indebted-shareholder row uses a different formula from the
//     rows below it, so the result depended on row order. Every indebted
//     shareholder is netted the same way here;
//   - its later rows net a NON-black shareholder's debt as a negative stake,
//     and ignore the indebted shareholder's black share. Only black
//     shareholders' debt is netted, against their black share.
// The graduation factor is computed by the toolkit and never used in its
// score, so it plays no part here either.
// ─────────────────────────────────────────────────────────────────────────────

const finitePositive = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** A fraction the record states (zero included), or null when it states none. */
const statedFraction = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;

export type OwnershipWeightBasis = 'value' | 'shares' | 'equal' | 'none';

/**
 * Each shareholder's weight: its share VALUE over the total share value, which
 * is how the toolkit weighs holders (the number of shares never enters its
 * score). When any holder has no value on file the value split is unknown, so
 * holders are weighed by number of shares, and failing that equally.
 */
export function ownershipHolderWeights(
  shareholders: ReadonlyArray<Pick<Shareholder, 'shares' | 'shareValue'>>,
): { weights: number[]; basis: OwnershipWeightBasis } {
  const n = shareholders.length;
  if (n === 0) return { weights: [], basis: 'none' };
  const values = shareholders.map((sh) => finitePositive(sh.shareValue));
  if (values.every((v) => v > 0)) {
    const total = values.reduce((a, v) => a + v, 0);
    return { weights: values.map((v) => v / total), basis: 'value' };
  }
  const shares = shareholders.map((sh) => finitePositive(sh.shares));
  const totalShares = shares.reduce((a, v) => a + v, 0);
  if (totalShares > 0) return { weights: shares.map((v) => v / totalShares), basis: 'shares' };
  return { weights: shareholders.map(() => 1 / n), basis: 'equal' };
}

const pctText = (f: number): string => `${Number((f * 100).toFixed(1))}%`;
const randText = (v: number): string => `R${Math.round(v).toLocaleString('en-ZA')}`;

/** "46.4% ÷ 25% × 4 = 7.43, capped at 4" — the line's points, worked. */
function pointsWorking(measure: number, target: number, maxPts: number): string {
  const raw = target > 0 ? (measure / target) * maxPts : 0;
  const base = `${pctText(measure)} ÷ ${pctText(target)} × ${maxPts} = ${raw.toFixed(2)}`;
  if (raw > maxPts) return `${base}, capped at ${maxPts}`;
  if (raw < 0) return `${base}, floored at 0`;
  return base;
}

function calculateToolkitOwnership(
  data: OwnershipData,
  ot: ReturnType<typeof resolveOwnershipTargets>,
  netValueTargetCfg: number | undefined,
): OwnershipResult {
  const shareholders = data.shareholders || [];
  const netValueTarget = typeof netValueTargetCfg === 'number' && netValueTargetCfg > 0 ? netValueTargetCfg : 1;
  const companyValue = finitePositive(data.companyValue);
  const { weights, basis } = ownershipHolderWeights(shareholders);

  // Toolkit 'Ownership Data' W4..Z4 (whole register), W2/X2 (black holders
  // carrying acquisition debt) and 'Oustanding Debts Calcs' H1/V1 (the net
  // value of those holders' stakes).
  let blackShare = 0;
  let blackWomenShare = 0;
  let designatedShare = 0;
  let newEntrantShare = 0;
  let indebtedBlack = 0;
  let indebtedBlackWomen = 0;
  let netIndebtedBlack = 0;
  let netIndebtedBlackWomen = 0;
  let indebtedHolders = 0;
  let statedHolderDebt = 0;

  shareholders.forEach((sh, i) => {
    const w = weights[i] ?? 0;
    const bo = statedFraction(sh.blackOwnership) ?? 0;
    const bwo = statedFraction(sh.blackWomenOwnership) ?? 0;
    const dg = statedFraction(sh.designatedGroupOwnership) ?? (sh.isDesignatedGroup ? bo : 0);
    const ne = statedFraction(sh.blackNewEntrantOwnership) ?? (sh.blackNewEntrant ? bo : 0);
    blackShare += w * bo;
    blackWomenShare += w * bwo;
    designatedShare += w * dg;
    newEntrantShare += w * ne;

    const debt = finitePositive(sh.outstandingDebt);
    statedHolderDebt += debt;
    if (bo > 0 && debt > 0) {
      indebtedHolders += 1;
      indebtedBlack += w * bo;
      indebtedBlackWomen += w * bwo;
      // Deemed net value of the stake: its share of the company's value less
      // the debt, as a fraction of the company's value. With no valuation on
      // file the stake cannot be netted and counts for nothing.
      if (companyValue > 0) {
        const deemed = (companyValue * w - debt) / companyValue;
        netIndebtedBlack += deemed * bo;
        netIndebtedBlackWomen += deemed * bwo;
      }
    }
  });

  const freeBlack = blackShare - indebtedBlack;
  const freeBlackWomen = blackWomenShare - indebtedBlackWomen;
  const eiBlack = freeBlack + netIndebtedBlack;
  const eiBlackWomen = freeBlackWomen + netIndebtedBlackWomen;
  // The toolkit's net value measure is the same debt-netted black economic
  // interest, scored against its own target (Ownership Scorecard E13 = 100%).
  const netValueMeasure = eiBlack;

  const votingRightsBlack = safeRatio(blackShare, ot.votingRightsTarget, ot.votingRightsMaxPts);
  const votingRightsBWO = safeRatio(blackWomenShare, ot.womenVotingTarget, ot.womenVotingMaxPts);
  const economicInterestBlack = safeRatio(eiBlack, ot.economicInterestTarget, ot.economicInterestMaxPts);
  const economicInterestBWO = safeRatio(eiBlackWomen, ot.womenEITarget, ot.womenEIMaxPts);
  const designatedGroups = safeRatio(designatedShare, ot.designatedGroupsTarget, ot.designatedGroupsMax);
  const newEntrants = safeRatio(newEntrantShare, ot.newEntrantsTarget, ot.newEntrantsMaxPts);
  const netValuePoints = safeRatio(netValueMeasure, netValueTarget, ot.netValueMaxPts);

  const subMinimumMet = netValuePoints >= ot.subMinNetValue;
  const totalPoints = votingRightsBlack + votingRightsBWO + economicInterestBlack + economicInterestBWO
    + designatedGroups + newEntrants + netValuePoints;

  // Plain-English working for the reviewer.
  const basisText: Record<OwnershipWeightBasis, string> = {
    value: 'Each shareholder counts by the value of their shares.',
    shares: 'Not every shareholder has a share value on file, so each counts by number of shares.',
    equal: 'No share values or share counts on file, so every shareholder counts equally.',
    none: 'No shareholders on file.',
  };
  const eiWorking = (free: number, net: number, who: string): string => {
    if (indebtedHolders === 0) return '';
    if (companyValue <= 0) {
      return ` ${pctText(free)} is held by ${who} without acquisition debt; with no company value on file, the stakes of the ${indebtedHolders} indebted black shareholder(s) cannot be netted and add nothing.`;
    }
    return ` That is ${pctText(free)} held by ${who} without acquisition debt + ${pctText(net)} net value of the indebted black shareholders' stakes (their share of the ${randText(companyValue)} company value less their debt).`;
  };
  const entityDebt = finitePositive(data.outstandingDebt);
  const netValueNote = [
    `Black economic interest after acquisition debt ${pointsWorking(netValueMeasure, netValueTarget, ot.netValueMaxPts)}.`,
    `Sub-minimum ${round2(ot.subMinNetValue)} points: ${subMinimumMet ? 'met' : 'not met'}.`,
    entityDebt > 0 && statedHolderDebt === 0
      ? `An outstanding debt of ${randText(entityDebt)} is recorded for the company, but no shareholder states their own acquisition debt; debt is netted per shareholder, so it was not deducted.`
      : '',
  ].filter(Boolean).join(' ');

  const subLines: OwnershipSubLine[] = [
    {
      name: 'Exercisable voting rights of black individuals',
      target: `${(ot.votingRightsTarget * 100).toFixed(0)}% + 1 vote`,
      weighting: ot.votingRightsMaxPts,
      score: votingRightsBlack,
      note: `Black voting rights ${pointsWorking(blackShare, ot.votingRightsTarget, ot.votingRightsMaxPts)}. ${basisText[basis]}`,
    },
    {
      name: 'Exercisable voting rights of black females',
      target: `${(ot.womenVotingTarget * 100).toFixed(0)}%`,
      weighting: ot.womenVotingMaxPts,
      score: votingRightsBWO,
      isBonus: ot.womenVotingIsBonus || undefined,
      note: `Black women's voting rights ${pointsWorking(blackWomenShare, ot.womenVotingTarget, ot.womenVotingMaxPts)}.`,
    },
    {
      name: 'Economic interest of black individuals',
      target: `${(ot.economicInterestTarget * 100).toFixed(0)}%`,
      weighting: ot.economicInterestMaxPts,
      score: economicInterestBlack,
      note: `Black economic interest ${pointsWorking(eiBlack, ot.economicInterestTarget, ot.economicInterestMaxPts)}.${eiWorking(freeBlack, netIndebtedBlack, 'black shareholders')}`,
    },
    ...(ot.womenEIMaxPts > 0
      ? [{
          name: 'Economic interest of black females',
          target: `${(ot.womenEITarget * 100).toFixed(0)}%`,
          weighting: ot.womenEIMaxPts,
          score: economicInterestBWO,
          isBonus: ot.womenEIIsBonus || undefined,
          note: `Black women's economic interest ${pointsWorking(eiBlackWomen, ot.womenEITarget, ot.womenEIMaxPts)}.${eiWorking(freeBlackWomen, netIndebtedBlackWomen, 'black women')}`,
        }]
      : []),
    ...(ot.designatedGroupsMax > 0
      ? [{
          name: 'Economic interest of black designated groups or participants in ownership schemes',
          target: `${(ot.designatedGroupsTarget * 100).toFixed(0)}%`,
          weighting: ot.designatedGroupsMax,
          score: designatedGroups,
          note: `Designated groups' economic interest ${pointsWorking(designatedShare, ot.designatedGroupsTarget, ot.designatedGroupsMax)}.`,
        }]
      : []),
    ...(ot.newEntrantsMaxPts > 0
      ? [{
          name: 'Economic interest of black new entrants',
          target: `${(ot.newEntrantsTarget * 100).toFixed(0)}%`,
          weighting: ot.newEntrantsMaxPts,
          score: newEntrants,
          note: `Black new entrants' economic interest ${pointsWorking(newEntrantShare, ot.newEntrantsTarget, ot.newEntrantsMaxPts)}.`,
        }]
      : []),
    {
      name: 'Net value',
      target: `≥ ${ot.subMinNetValue} pts`,
      weighting: ot.netValueMaxPts,
      score: netValuePoints,
      note: netValueNote,
    },
  ];

  return {
    votingRightsBlack: round2(votingRightsBlack),
    votingRightsBWO: round2(votingRightsBWO),
    economicInterestBlack: round2(economicInterestBlack),
    economicInterestBWO: round2(economicInterestBWO),
    designatedGroups: round2(designatedGroups),
    newEntrants: round2(newEntrants),
    ownershipFulfilment: 0,
    netValue: round2(netValuePoints),
    total: round2(clampScore(totalPoints, ot.maxPts)),
    subMinimumMet,
    fullOwnershipAwarded: false,
    subLines: subLines.map((l) => ({ ...l, score: round2(l.score) })),
    rawStats: {
      blackVotingPercentage: round2(blackShare),
      blackWomenVotingPercentage: round2(blackWomenShare),
      economicInterestPercentage: round2(eiBlack),
      economicInterestBWOPercentage: round2(eiBlackWomen),
      designatedGroupPercentage: round2(designatedShare),
      netValuePercentage: round2(netValueMeasure),
      newEntrantEIPercentage: round2(newEntrantShare),
    },
  };
}
