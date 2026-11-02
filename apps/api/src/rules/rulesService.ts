/**
 * Publishing and serving of rule versions.
 *
 * The service is the only code that appends to the ledger or hands rules to a
 * calculator. It re-verifies the whole chain before it appends to it and before it
 * serves from it, so a tampered, truncated or re-ordered history is never extended
 * and never used: callers get RulesIntegrityError (HTTP 500 + an alarm), not a guess.
 */
import { buildEffectiveConfig, hashOverrides, hashEffectiveConfig, RuleValidationError } from '../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { isScorecardId, SCORECARD_IDS, SCORECARD_SOURCES, type ScorecardId } from '../../../web/Toolkit/src/lib/rules/scorecards';
import { registryHashOf } from '../../../web/Toolkit/src/lib/rules/registry';
import type { RuleOverrides, RulesetStamp } from '../../../web/Toolkit/src/lib/rules/types';
import {
  genesisHash, sealVersion, verifyChain, type RulesVersionRecord, type VersionKind, type VerifyFailure,
} from './ledger.js';
import type { Signer, Verifier } from './signing.js';
import { currentFreeze, type RulesStore, type FreezeEvent } from './store.js';
import { randomUUID } from 'crypto';

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

export class RulesNotFoundError extends Error {
  readonly code = 'RULES_VERSION_NOT_FOUND';
  constructor(public readonly scorecardId: string, public readonly version: number) {
    super(`Version ${version} does not exist for ${scorecardId}`);
    this.name = 'RulesNotFoundError';
  }
}

/** A stored version cannot be used by the running build (the registry changed under it). */
export class RulesIncompatibleError extends Error {
  readonly code = 'RULES_INCOMPATIBLE';
  constructor(public readonly scorecardId: string, public readonly version: number, detail: string) {
    super(`Version ${version} of ${scorecardId} is incompatible with this build: ${detail}`);
    this.name = 'RulesIncompatibleError';
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
  /** Identifies the running build; stamped on every version and every served stamp. */
  buildId: string;
  now?: () => Date;
  /** RULES_FREEZE=true freezes publishing everywhere, independent of the Studio. */
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
  announcement?: string | null;
  authors?: string[];
  approvers?: string[];
}

/** Throws RulesFrozenError (HTTP 423) when publishing to `scorecardId` is frozen. */
export async function assertNotFrozen(deps: ServiceDeps, scorecardId: string): Promise<void> {
  if (deps.envFrozen) throw new RulesFrozenError('RULES_FREEZE is set on this deployment');
  const f = currentFreeze(await deps.store.getFreezeEvents(), scorecardId);
  if (f) throw new RulesFrozenError(f.reason);
}

/** Verified history for one scorecard. Throws RulesIntegrityError on any defect. */
export async function loadVerifiedHistory(scorecardId: ScorecardId, deps: ServiceDeps): Promise<RulesVersionRecord[]> {
  const records = await deps.store.getVersions(scorecardId);
  const result = verifyChain(scorecardId, records, deps.verifier);
  if (!result.ok) throw new RulesIntegrityError(scorecardId, result.failures);
  return records;
}

/**
 * Runs between sealing (signing) the candidate and appending it. If it throws, NOTHING is
 * appended - this is where the signed pre-publication snapshot is taken and verified.
 */
export type BeforeAppend = (candidate: RulesVersionRecord, history: RulesVersionRecord[]) => Promise<void>;

export async function publishVersion(input: PublishInput, deps: ServiceDeps, beforeAppend?: BeforeAppend): Promise<RulesVersionRecord> {
  if (!isScorecardId(input.scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${input.scorecardId}"`);
  const scorecardId = input.scorecardId;
  if (!deps.signer) {
    const { SigningUnavailableError } = await import('./signing.js');
    throw new SigningUnavailableError();
  }
  // Freeze stops ordinary publishing and restores. An emergency rollback is the recovery
  // path FROM a bad state, so it is the one operation a freeze must not block.
  if (input.kind !== 'rollback') await assertNotFrozen(deps, scorecardId);

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
    registryHash: await registryHashOf(scorecardId),
    buildId: deps.buildId,
    announcement: input.announcement ?? null,
    authors: input.authors ?? [],
    approvers: input.approvers ?? [],
    publishedAt: now.toISOString(),
    publishedBy: input.publishedBy,
    changesetId: input.changesetId ?? null,
    restoredFromVersion: input.restoredFromVersion ?? null,
    parentVersion: head?.version ?? null,
    prevChainHash: head?.chainHash ?? genesisHash(scorecardId),
  }, deps.signer);

  if (beforeAppend) await beforeAppend(record, history);
  await deps.store.appendVersion(record, head?.version ?? 0);
  return record;
}

export interface PublishedRules {
  scorecardId: ScorecardId;
  /** Always present: version 0 (shipped) when nothing is published or a freeze selects it. */
  stamp: RulesetStamp;
  overrides: RuleOverrides;
  /** Head of the chain, so clients can cheaply detect "something changed". */
  chainHead: string | null;
  headVersion: number;
}

export interface ResolveOptions {
  /** Pin: serve exactly this version (0 = shipped). Ignores the timeline and any freeze. */
  version?: number;
  /** Serve the version that was in force at the END of this UTC day (YYYY-MM-DD). */
  periodEnd?: string;
  /** Test seam / explicit instant. */
  at?: Date;
}

/** The version in force at `at`: highest version whose effectiveFrom has passed. */
export function activeVersionAt(history: RulesVersionRecord[], at: Date): RulesVersionRecord | null {
  let active: RulesVersionRecord | null = null;
  for (const r of history) {
    if (Date.parse(r.effectiveFrom) <= at.getTime() && (!active || r.version > active.version)) active = r;
  }
  return active;
}

export function endOfUtcDay(isoDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new PublishRejectedError('periodEnd must be YYYY-MM-DD');
  const d = new Date(`${isoDate}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) throw new PublishRejectedError('periodEnd is not a valid date');
  return d;
}

const SHIPPED_EFFECTIVE_FROM = '1970-01-01T00:00:00.000Z';
const EMPTY: RuleOverrides = { source: {}, calculator: {} };
type Flags = { pinned: boolean; frozen: boolean };

async function stampFor(
  scorecardId: ScorecardId, record: RulesVersionRecord | null, deps: ServiceDeps, flags: Flags,
): Promise<{ stamp: RulesetStamp; overrides: RuleOverrides }> {
  const registryHash = await registryHashOf(scorecardId);
  if (!record) {
    return {
      stamp: {
        scorecardId, version: 0,
        configHash: await hashEffectiveConfig(SCORECARD_SOURCES[scorecardId].shipped),
        overridesHash: await hashOverrides(EMPTY),
        effectiveFrom: SHIPPED_EFFECTIVE_FROM, registryHash, buildId: deps.buildId, ...flags,
      },
      overrides: EMPTY,
    };
  }
  // Compatibility: the registry the version was published against must be the one this build runs.
  if (record.registryHash !== registryHash) {
    throw new RulesIncompatibleError(scorecardId, record.version, 'the rule registry changed after this version was published');
  }
  // Recompute rather than trust: catches a signed-but-stale version after the shipped baseline moved.
  let recomputed: string;
  try {
    recomputed = await hashEffectiveConfig(buildEffectiveConfig(scorecardId, record.overrides));
  } catch (e) {
    throw new RulesIntegrityError(scorecardId, [{ version: record.version, code: 'config-hash-mismatch', detail: `stored overrides no longer build: ${(e as Error).message}` }]);
  }
  if (recomputed !== record.configHash) {
    throw new RulesIntegrityError(scorecardId, [{ version: record.version, code: 'config-hash-mismatch', detail: 'effective config no longer matches the signed configHash (shipped baseline changed)' }]);
  }
  return {
    stamp: {
      scorecardId, version: record.version, configHash: record.configHash, overridesHash: record.overridesHash,
      effectiveFrom: record.effectiveFrom, registryHash: record.registryHash, buildId: deps.buildId, ...flags,
    },
    overrides: record.overrides,
  };
}

export async function resolvePublished(scorecardId: ScorecardId, deps: ServiceDeps, opts: ResolveOptions = {}): Promise<PublishedRules> {
  const history = await loadVerifiedHistory(scorecardId, deps);
  const head = history[history.length - 1] ?? null;
  const base = { scorecardId, chainHead: head?.chainHash ?? null, headVersion: head?.version ?? 0 };

  // 1. An explicit pin always wins: pins are never moved by publishing, freezing or rollback.
  if (opts.version !== undefined) {
    if (opts.version === 0) return { ...base, ...(await stampFor(scorecardId, null, deps, { pinned: true, frozen: false })) };
    const rec = history.find((r) => r.version === opts.version);
    if (!rec) throw new RulesNotFoundError(scorecardId, opts.version);
    return { ...base, ...(await stampFor(scorecardId, rec, deps, { pinned: true, frozen: false })) };
  }

  // 2. A freeze serves the selected last-known-good version to unpinned clients.
  const freezeEvent = currentFreeze(await deps.store.getFreezeEvents(), scorecardId);
  if (freezeEvent) {
    const rec = freezeEvent.serveVersion === 0 ? null : history.find((r) => r.version === freezeEvent.serveVersion) ?? null;
    if (freezeEvent.serveVersion !== 0 && !rec) throw new RulesNotFoundError(scorecardId, freezeEvent.serveVersion);
    return { ...base, ...(await stampFor(scorecardId, rec, deps, { pinned: false, frozen: true })) };
  }

  // 3. The effective-date timeline (optionally as at the end of a measurement period).
  const at = opts.at ?? (opts.periodEnd ? endOfUtcDay(opts.periodEnd) : nowOf(deps));
  return { ...base, ...(await stampFor(scorecardId, activeVersionAt(history, at), deps, { pinned: false, frozen: false })) };
}

export interface HeadSummary {
  scorecardId: ScorecardId;
  activeVersion: number;
  headVersion: number;
  chainHead: string | null;
  configHash: string;
  frozen: boolean;
}

/** One cheap call the clients poll: has anything changed for any scorecard? */
export async function resolveHeads(deps: ServiceDeps, opts: Pick<ResolveOptions, 'at'> = {}): Promise<HeadSummary[]> {
  const out: HeadSummary[] = [];
  for (const id of SCORECARD_IDS) {
    const p = await resolvePublished(id, deps, opts);
    out.push({ scorecardId: id, activeVersion: p.stamp.version, headVersion: p.headVersion, chainHead: p.chainHead, configHash: p.stamp.configHash, frozen: p.stamp.frozen });
  }
  return out;
}

/* ------------------------------------------------------------------ restore / rollback / freeze */

export interface RestoreInput {
  scorecardId: string;
  /** Version whose rules are re-instated, or 'shipped' / 0 for the unmodified shipped configuration. */
  fromVersion: number | 'shipped';
  actor: string;
  reason: string;
  changesetId?: string | null;
  announcement?: string | null;
  authors?: string[];
  approvers?: string[];
}

async function reinstate(kind: 'restore' | 'rollback', input: RestoreInput, deps: ServiceDeps, beforeAppend?: BeforeAppend): Promise<RulesVersionRecord> {
  if (!isScorecardId(input.scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${input.scorecardId}"`);
  if (!input.reason || input.reason.trim().length < 5) throw new PublishRejectedError('A reason of at least 5 characters is required');
  // Verify FIRST: a rollback target is only trusted if the whole history it sits in verifies.
  const history = await loadVerifiedHistory(input.scorecardId, deps);
  let overrides: RuleOverrides;
  let restoredFromVersion: number | null;
  if (input.fromVersion === 'shipped' || input.fromVersion === 0) {
    overrides = { source: {}, calculator: {} };
    restoredFromVersion = null;
  } else {
    const target = history.find((r) => r.version === input.fromVersion);
    if (!target) throw new PublishRejectedError(`Version ${input.fromVersion} does not exist for ${input.scorecardId}`);
    // Signature is already verified with the chain; also require build compatibility.
    await stampFor(input.scorecardId, target, deps, { pinned: false, frozen: false });
    overrides = target.overrides;
    restoredFromVersion = target.version;
  }
  return publishVersion({
    scorecardId: input.scorecardId, overrides, publishedBy: input.actor, changesetId: input.changesetId ?? null,
    kind, restoredFromVersion, announcement: input.announcement ?? input.reason,
    authors: input.authors, approvers: input.approvers,
  }, deps, beforeAppend);
}

/** Normal restore: re-publishes an earlier version's rules as a NEW version. Blocked by freeze. */
export const restoreVersion = (input: RestoreInput, deps: ServiceDeps, beforeAppend?: BeforeAppend) => reinstate('restore', input, deps, beforeAppend);

/** Emergency rollback: same operation, but allowed while frozen. Never skips verification or signing. */
export const emergencyRollback = (input: RestoreInput, deps: ServiceDeps, beforeAppend?: BeforeAppend) => reinstate('rollback', input, deps, beforeAppend);

export interface FreezeInput {
  /** A scorecard id, or '*' for every scorecard. */
  scope: string;
  reason: string;
  actor: string;
  /** Version served to unpinned clients while frozen (default: the version in force now; 0 = shipped). */
  serveVersion?: number;
}

function assertScope(scope: string): void {
  if (scope !== '*' && !isScorecardId(scope)) throw new PublishRejectedError(`Unknown freeze scope "${scope}"`);
}

function assertReason(reason: string, what: string): void {
  if (!reason || reason.trim().length < 5) throw new PublishRejectedError(`A reason of at least 5 characters is required to ${what}`);
}

/** Appends freeze events (one per scorecard; '*' fans out so each keeps its own last known good). */
export async function freeze(deps: ServiceDeps, input: FreezeInput): Promise<FreezeEvent[]> {
  assertScope(input.scope);
  assertReason(input.reason, 'freeze');
  if (input.scope === '*' && input.serveVersion !== undefined) {
    throw new PublishRejectedError('A global freeze serves each scorecard its current version; freeze one scorecard to choose a version');
  }
  const ids = input.scope === '*' ? [...SCORECARD_IDS] : [input.scope as ScorecardId];
  const at = nowOf(deps).toISOString();
  const events: FreezeEvent[] = [];
  for (const id of ids) {
    const history = await loadVerifiedHistory(id, deps);
    let serveVersion = input.serveVersion;
    if (serveVersion === undefined) serveVersion = activeVersionAt(history, nowOf(deps))?.version ?? 0;
    if (serveVersion !== 0 && !history.some((r) => r.version === serveVersion)) {
      throw new PublishRejectedError(`Version ${serveVersion} does not exist for ${id}`);
    }
    events.push({ id: randomUUID(), scope: id, action: 'freeze', serveVersion, reason: input.reason, actor: input.actor, at });
  }
  for (const e of events) await deps.store.appendFreezeEvent(e);
  return events;
}

export async function unfreeze(deps: ServiceDeps, input: { scope: string; reason: string; actor: string }): Promise<FreezeEvent[]> {
  assertScope(input.scope);
  assertReason(input.reason, 'unfreeze');
  const scopes = input.scope === '*' ? [...SCORECARD_IDS] : [input.scope];
  const at = nowOf(deps).toISOString();
  const events: FreezeEvent[] = scopes.map((scope) => ({
    id: randomUUID(), scope, action: 'unfreeze' as const, serveVersion: 0, reason: input.reason, actor: input.actor, at,
  }));
  for (const e of events) await deps.store.appendFreezeEvent(e);
  return events;
}
