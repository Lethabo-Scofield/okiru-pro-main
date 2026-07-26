/**
 * Deemed B-BBEE status levels — the affidavit route the Amended Codes grant
 * small enterprises (Statement 000 §4; mirrored by the aligned sector codes,
 * incl. the FSC's QSFI provisions).
 *
 *   EME (revenue < R10m):        deemed Level 4 automatically;
 *                                ≥51% black-owned → Level 2; 100% → Level 1.
 *   QSE / QSFI (R10m-R50m):      ≥51% black-owned → Level 2; 100% → Level 1.
 *
 * Ownership is measured on a DIRECT FLOW-THROUGH basis, and the entitlement is
 * evidenced by an annual sworn affidavit (or CIPC certificate for EMEs) — no
 * scorecard verification required. An entity may still elect to be verified on
 * the scorecard; the deemed level is a floor, so the FINAL level is whichever
 * is better.
 *
 * TRANSPORT IS EXCLUDED. The Transport Sector Code (GG 32511, 2009) predates
 * the amended framework and was never aligned; it has no deemed-level
 * provisions (its EMEs use accounting-officer letters under a different
 * regime). Deeming a Transport QSE Level 2 at 51% would award a status its
 * code does not grant. Certificate BE13609 confirms in practice: a 100%
 * black-owned Transport QSE was scored on points, not deemed.
 */

/** Sector codes on the legacy (non-aligned) framework — no deeming. */
const NO_DEEMING_SECTORS = new Set(['TRANSPORT']);

export interface DeemedLevelInput {
  sectorCode: string;
  scorecardType: string;
  /** Black voting rights, flow-through fraction 0-1. */
  blackVotingPct: number;
  /** Black economic interest, flow-through fraction 0-1. */
  blackEconomicInterestPct: number;
}

export interface DeemedLevel {
  level: number;
  /** Human reason, shown beside the level so it never reads as a computed score. */
  reason: string;
}

/** Both voting and economic interest must carry the threshold (flow-through). */
function flowThroughBlackOwnership(input: DeemedLevelInput): number {
  return Math.min(input.blackVotingPct, input.blackEconomicInterestPct);
}

/**
 * The deemed level this entity is entitled to via the affidavit route, or null
 * when no deeming applies (Generic entities, legacy-code sectors, or a
 * QSE below 51% black ownership).
 */
export function resolveDeemedLevel(input: DeemedLevelInput): DeemedLevel | null {
  if (NO_DEEMING_SECTORS.has(input.sectorCode.toUpperCase())) return null;

  const type = input.scorecardType.trim().toUpperCase();
  const isEme = type === 'EME';
  const isQse = /QSE/.test(type);
  if (!isEme && !isQse) return null;

  const black = flowThroughBlackOwnership(input);
  // "100%" tolerates rounding noise from percentage round-trips, nothing more.
  if (black >= 0.9995) {
    return {
      level: 1,
      reason: `100% black-owned ${isEme ? 'EME' : 'QSE'} — deemed Level 1 (annual sworn affidavit route, Amended Codes Statement 000 §4).`,
    };
  }
  if (black >= 0.51) {
    return {
      level: 2,
      reason: `At least 51% black-owned ${isEme ? 'EME' : 'QSE'} — deemed Level 2 (annual sworn affidavit route, Amended Codes Statement 000 §4).`,
    };
  }
  if (isEme) {
    return {
      level: 4,
      reason: 'Exempted Micro Enterprise (revenue under R10m) — deemed Level 4 automatically (Amended Codes Statement 000 §4).',
    };
  }
  return null;
}

/**
 * The better of a computed level and the deemed entitlement (lower number
 * wins; the deemed level is a floor, never a cap).
 */
export function applyDeemedLevel(
  computedLevel: number,
  deemed: DeemedLevel | null,
): { level: number; deemedApplied: boolean } {
  if (!deemed || deemed.level >= computedLevel) {
    return { level: computedLevel, deemedApplied: false };
  }
  return { level: deemed.level, deemedApplied: true };
}
