/**
 * Publishing and serving of rule versions.
 *
 * The service is the only code that appends to the ledger or hands rules to a
 * calculator. It re-verifies the whole chain before it appends to it and before it
 * serves from it, so a tampered, truncated or re-ordered history is never extended
 * and never used: callers get RulesIntegrityError (HTTP 500 + an alarm), not a guess.
 */
import { buildEffectiveConfig, hashOverrides, hashEffectiveConfig, RuleValidationError } from '../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { isScorecardId, SCORECARD_IDS, type ScorecardId } from '../../../web/Toolkit/src/lib/rules/scorecards';
import type { RuleOverrides, RulesetStamp } from '../../../web/Toolkit/src/lib/rules/types';
import {
  genesisHash, sealVersion, verifyChain, type RulesVersionRecord, type VersionKind, type VerifyFailure,
} from './ledger.js';
import type { Signer, Verifier } from './signing.js';
import type { RulesStore } from './store.js';

export class RulesIntegrityError extends Error {
  readonly code = 'RULES_INTEGRITY_FAILURE';
  constructor(public readonly scorecardId: string, public readonly failures: VerifyFailure[], message?: string) {
    super(message ?? `Rules ledger for ${scorecardId} failed verification: ${failures.map((f) => `v${f.version}:${f.code} (${f.detail})`).join('; ')}`);
    this.name = 'RulesIntegrityError';
  }
}

export class RulesFrozenError extends Error {
  readonly code = 'RULES_FROZEN';
  constructor(public readonly reason: string | null) {
    super(`Publishing is frozen${reason ? `: ${reason}` : ''}`);
    this.name = 'RulesFrozenError';
  }
}

export class PublishRejectedError extends Error {
  readonly code = 'PUBLISH_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'PublishRejectedError';
  }
}

export interface ServiceDeps {
  store: RulesStore;
  verifier: Verifier;
  /** Absent => publishing disabled (reads and verification still work). */
  signer?: Signer;
  now?: () => Date;
  /** RULES_FREEZE=true freezes regardless of stored state. */
  envFrozen?: boolean;
}

const nowOf = (d: ServiceDeps) => (d.now ?? (() => new Date()))();

export interface PublishInput {
  scorecardId: string;
  overrides: RuleOverrides;
  publishedBy: string;
  changesetId?: string | null;
  /** Defaults to now. A future instant schedules the version. Past instants are refused. */
  effectiveFrom?: Date;
  kind?: VersionKind;
  restoredFromVersion?: number | null;
}

export async function assertNotFrozen(deps: ServiceDeps): Promise<void> {
  if (deps.envFrozen) throw new RulesFrozenError('RULES_FREEZE is set on this deployment');
  const s = await deps.store.getFreezeState();
  if (s.frozen) throw new RulesFrozenError(s.reason);
}

/** Verified history for one scorecard. Throws RulesIntegrityError on any defect. */
export async function loadVerifiedHistory(scorecardId: ScorecardId, deps: ServiceDeps): Promise<RulesVersionRecord[]> {
  const records = await deps.store.getVersions(scorecardId);
  const result = verifyChain(scorecardId, records, deps.verifier);
  if (!result.ok) throw new RulesIntegrityError(scorecardId, result.failures);
  return records;
}

export async function publishVersion(input: PublishInput, deps: ServiceDeps): Promise<RulesVersionRecord> {
  if (!isScorecardId(input.scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${input.scorecardId}"`);
  const scorecardId = input.scorecardId;
  if (!deps.signer) {
    const { SigningUnavailableError } = await import('./signing.js');
    throw new SigningUnavailableError();
  }
  // Freeze stops ordinary publishing and restores. An emergency rollback is the recovery
  // path FROM a bad state, so it is the one operation a freeze must not block.
  if (input.kind !== 'rollback') await assertNotFrozen(deps);

  const history = await loadVerifiedHistory(scorecardId, deps);
  const head = history[history.length - 1];
  const now = nowOf(deps);
  const kind = input.kind ?? 'publish';
  // Restores and rollbacks always take effect immediately: a newer version number supersedes
  // any still-scheduled version, which is what makes them able to cancel a pending change.
  const effectiveFrom = kind === 'publish' ? (input.effectiveFrom ?? now) : now;
  if (effectiveFrom.getTime() < now.getTime() - 1000) {
    throw new PublishRejectedError('effectiveFrom may not be in the past; published history is never rewritten');
  }
  const latestEffective = history.reduce((m, r) => Math.max(m, Date.parse(r.effectiveFrom)), 0);
  if (kind === 'publish' && effectiveFrom.getTime() < latestEffective) {
    throw new PublishRejectedError('effectiveFrom must not precede an already-published version');
  }

  let configHash: string;
  try {
    configHash = await hashEffectiveConfig(buildEffectiveConfig(scorecardId, input.overrides));
  } catch (e) {
    if (e instanceof RuleValidationError) throw new PublishRejectedError(e.message);
    throw e;
  }
  const overrides: RuleOverrides = { source: input.overrides.source ?? {}, calculator: input.overrides.calculator ?? {} };

  const record = sealVersion({
    scorecardId,
    version: (head?.version ?? 0) + 1,
    kind,
    overrides,
    overridesHash: await hashOverrides(overrides),
    configHash,
    effectiveFrom: effectiveFrom.toISOString(),
    publishedAt: now.toISOString(),
    publishedBy: input.publishedBy,
    changesetId: input.changesetId ?? null,
    restoredFromVersion: input.restoredFromVersion ?? null,
    parentVersion: head?.version ?? null,
    prevChainHash: head?.chainHash ?? genesisHash(scorecardId),
  }, deps.signer);

  await deps.store.appendVersion(record, head?.version ?? 0);
  return record;
}

export interface PublishedRules {
  scorecardId: ScorecardId;
  /** null => no published version is in force yet; callers use the shipped config. */
  stamp: RulesetStamp | null;
  overrides: RuleOverrides | null;
  /** Head of the chain, so clients can cheaply detect "something changed". */
  chainHead: string | null;
  headVersion: number;
}

/** The version in force at `at`: highest version whose effectiveFrom has passed. */
export function activeVersionAt(history: RulesVersionRecord[], at: Date): RulesVersionRecord | null {
  let active: RulesVersionRecord | null = null;
  for (const r of history) {
    if (Date.parse(r.effectiveFrom) <= at.getTime() && (!active || r.version > active.version)) active = r;
  }
  return active;
}

export async function resolvePublished(scorecardId: ScorecardId, deps: ServiceDeps, at?: Date): Promise<PublishedRules> {
  const history = await loadVerifiedHistory(scorecardId, deps);
  const head = history[history.length - 1] ?? null;
  const active = activeVersionAt(history, at ?? nowOf(deps));
  if (!active) {
    return { scorecardId, stamp: null, overrides: null, chainHead: head?.chainHash ?? null, headVersion: head?.version ?? 0 };
  }
  // Recompute rather than trust: this is what catches a signed-but-stale version after the
  // shipped baseline or the registry changed underneath it.
  let recomputed: string;
  try {
    recomputed = await hashEffectiveConfig(buildEffectiveConfig(scorecardId, active.overrides));
  } catch (e) {
    throw new RulesIntegrityError(scorecardId, [{ version: active.version, code: 'config-hash-mismatch', detail: `stored overrides no longer build: ${(e as Error).message}` }]);
  }
  if (recomputed !== active.configHash) {
    throw new RulesIntegrityError(scorecardId, [{ version: active.version, code: 'config-hash-mismatch', detail: 'effective config no longer matches the signed configHash (shipped baseline or registry changed)' }]);
  }
  return {
    scorecardId,
    stamp: {
      scorecardId,
      version: active.version,
      configHash: active.configHash,
      overridesHash: active.overridesHash,
      effectiveFrom: active.effectiveFrom,
    },
    overrides: active.overrides,
    chainHead: head?.chainHash ?? null,
    headVersion: head?.version ?? 0,
  };
}

export interface HeadSummary {
  scorecardId: ScorecardId;
  activeVersion: number | null;
  headVersion: number;
  chainHead: string | null;
  configHash: string | null;
}

/** One cheap call the clients poll: has anything changed for any scorecard? */
export async function resolveHeads(deps: ServiceDeps, at?: Date): Promise<HeadSummary[]> {
  const out: HeadSummary[] = [];
  for (const id of SCORECARD_IDS) {
    const p = await resolvePublished(id, deps, at);
    out.push({ scorecardId: id, activeVersion: p.stamp?.version ?? null, headVersion: p.headVersion, chainHead: p.chainHead, configHash: p.stamp?.configHash ?? null });
  }
  return out;
}

/* ------------------------------------------------------------------ restore / rollback / freeze */

export interface RestoreInput {
  scorecardId: string;
  /** Version whose rules are re-instated, or 'shipped' for the unmodified shipped configuration. */
  fromVersion: number | 'shipped';
  actor: string;
  reason: string;
  changesetId?: string | null;
}

async function reinstate(kind: 'restore' | 'rollback', input: RestoreInput, deps: ServiceDeps): Promise<RulesVersionRecord> {
  if (!isScorecardId(input.scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${input.scorecardId}"`);
  if (!input.reason || input.reason.trim().length < 5) throw new PublishRejectedError('A reason of at least 5 characters is required');
  // Verify FIRST: a rollback target is only trusted if the whole history it sits in verifies.
  const history = await loadVerifiedHistory(input.scorecardId, deps);
  let overrides: RuleOverrides;
  let restoredFromVersion: number | null;
  if (input.fromVersion === 'shipped') {
    overrides = { source: {}, calculator: {} };
    restoredFromVersion = null;
  } else {
    const target = history.find((r) => r.version === input.fromVersion);
    if (!target) throw new PublishRejectedError(`Version ${input.fromVersion} does not exist for ${input.scorecardId}`);
    overrides = target.overrides;
    restoredFromVersion = target.version;
  }
  return publishVersion({
    scorecardId: input.scorecardId,
    overrides,
    publishedBy: input.actor,
    changesetId: input.changesetId ?? null,
    kind,
    restoredFromVersion,
  }, deps);
}

/** Normal restore: re-publishes an earlier version's rules as a NEW version. Blocked by freeze. */
export const restoreVersion = (input: RestoreInput, deps: ServiceDeps) => reinstate('restore', input, deps);

/** Emergency rollback: same operation, but allowed while frozen. Never skips verification or signing. */
export const emergencyRollback = (input: RestoreInput, deps: ServiceDeps) => reinstate('rollback', input, deps);

export async function setFreeze(deps: ServiceDeps, change: { frozen: boolean; reason: string; actor: string }): Promise<void> {
  if (change.frozen && (!change.reason || change.reason.trim().length < 5)) throw new PublishRejectedError('A reason of at least 5 characters is required to freeze');
  await deps.store.setFreezeState({
    frozen: change.frozen,
    reason: change.frozen ? change.reason : null,
    by: change.actor,
    at: nowOf(deps).toISOString(),
  });
}
