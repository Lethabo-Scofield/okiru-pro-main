/**
 * Client ruleset pins: a submitted / finalised scorecard stays on the rules version it was
 * scored under. Publishing, freezing or rolling back NEVER moves a pin. The only way a pin
 * changes is an explicit, reasoned, audited "re-score under current rules" action; every pin
 * and re-score is also an append-only event.
 */
import { randomUUID } from 'crypto';
import { isScorecardId } from '../../../web/Toolkit/src/lib/rules/scorecards';
import { loadVerifiedHistory, resolvePublished, PublishRejectedError, RulesNotFoundError, type ServiceDeps } from './rulesService.js';
import { appendAudit } from './studio/audit.js';
import type { Doc, StudioStore } from './studio/studioStore.js';

export interface RulesetPin { version: number; pinnedAt: string; pinnedBy: string; reason: string | null }
export type PinMap = Record<string, RulesetPin>;

export interface ClientPinStore {
  /** null when the client does not exist. */
  getPins(clientId: string): Promise<PinMap | null>;
  setPin(clientId: string, scorecardId: string, pin: RulesetPin): Promise<void>;
}

export class PinConflictError extends Error {
  readonly code = 'PIN_EXISTS';
  constructor(public readonly current: number) {
    super(`This scorecard is already pinned to version ${current}. Use "Re-score under current rules" to change it, with a reason.`);
    this.name = 'PinConflictError';
  }
}

export class ClientNotFoundError extends Error {
  readonly code = 'CLIENT_NOT_FOUND';
  constructor() { super('Client not found'); this.name = 'ClientNotFoundError'; }
}

interface PinEvent extends Doc {
  clientId: string;
  scorecardId: string;
  action: 'pin' | 'rescore';
  from: number | null;
  to: number;
  actor: string;
  reason: string | null;
  createdAt: string;
}

interface PinDeps { rules: ServiceDeps; studio: StudioStore; pins: ClientPinStore; now: () => Date }

async function record(d: PinDeps, e: Omit<PinEvent, 'id' | 'rev' | 'createdAt'>): Promise<void> {
  const at = d.now();
  await d.studio.collection<PinEvent>('rulesetPinEvents').insert({ ...e, id: randomUUID(), rev: 1, createdAt: at.toISOString() });
  await appendAudit(d.studio, d.rules.signer, { actor: e.actor, action: `client.ruleset_${e.action}`, target: e.clientId, details: { scorecardId: e.scorecardId, from: e.from, to: e.to }, now: at });
}

async function assertVersionServable(d: PinDeps, scorecardId: string, version: number): Promise<void> {
  if (!isScorecardId(scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${scorecardId}"`);
  if (!Number.isInteger(version) || version < 0) throw new PublishRejectedError('version must be a non-negative integer');
  if (version === 0) return; // the shipped rules always exist
  const history = await loadVerifiedHistory(scorecardId, d.rules);
  if (!history.some((r) => r.version === version)) throw new RulesNotFoundError(scorecardId, version);
  await resolvePublished(scorecardId, d.rules, { version }); // verifies compatibility as well
}

/** Pins a scorecard to the version it was scored under. Idempotent for the same version; never moves an existing pin. */
export async function pinRuleset(d: PinDeps, input: { clientId: string; scorecardId: string; version: number; actor: string; reason?: string | null }): Promise<PinMap> {
  const current = await d.pins.getPins(input.clientId);
  if (current === null) throw new ClientNotFoundError();
  await assertVersionServable(d, input.scorecardId, input.version);
  const existing = current[input.scorecardId];
  if (existing) {
    if (existing.version === input.version) return current;
    throw new PinConflictError(existing.version);
  }
  const pin: RulesetPin = { version: input.version, pinnedAt: d.now().toISOString(), pinnedBy: input.actor, reason: input.reason?.slice(0, 500) ?? null };
  await d.pins.setPin(input.clientId, input.scorecardId, pin);
  await record(d, { clientId: input.clientId, scorecardId: input.scorecardId, action: 'pin', from: null, to: input.version, actor: input.actor, reason: pin.reason });
  return { ...current, [input.scorecardId]: pin };
}

/** The ONLY operation that changes an existing pin. Explicit target, mandatory reason, audited. */
export async function rescoreUnderRules(d: PinDeps, input: { clientId: string; scorecardId: string; toVersion: number | 'current'; actor: string; reason: string }): Promise<PinMap> {
  if (!input.reason || input.reason.trim().length < 10) throw new PublishRejectedError('A reason of at least 10 characters is required to re-score under different rules');
  const current = await d.pins.getPins(input.clientId);
  if (current === null) throw new ClientNotFoundError();
  if (!isScorecardId(input.scorecardId)) throw new PublishRejectedError(`Unknown scorecard "${input.scorecardId}"`);
  const to = input.toVersion === 'current' ? (await resolvePublished(input.scorecardId, d.rules)).stamp.version : input.toVersion;
  await assertVersionServable(d, input.scorecardId, to);
  const pin: RulesetPin = { version: to, pinnedAt: d.now().toISOString(), pinnedBy: input.actor, reason: input.reason.trim().slice(0, 500) };
  await d.pins.setPin(input.clientId, input.scorecardId, pin);
  await record(d, { clientId: input.clientId, scorecardId: input.scorecardId, action: 'rescore', from: current[input.scorecardId]?.version ?? null, to, actor: input.actor, reason: pin.reason });
  return { ...current, [input.scorecardId]: pin };
}

/** Mongo-backed pin store over the existing Client collection. */
export async function createMongoClientPinStore(): Promise<ClientPinStore> {
  const { ClientModel } = await import('../../models.js');
  const find = (clientId: string) => ClientModel.findOne({ $or: [{ id: clientId }, { clientId }] });
  return {
    async getPins(clientId) {
      const c = await find(clientId).lean() as { rulesetPins?: PinMap } | null;
      return c ? { ...(c.rulesetPins ?? {}) } : null;
    },
    async setPin(clientId, scorecardId, pin) {
      if (!isScorecardId(scorecardId)) throw new Error('Unknown scorecard');
      await ClientModel.updateOne({ $or: [{ id: clientId }, { clientId }] }, { $set: { [`rulesetPins.${scorecardId}`]: pin } });
    },
  };
}
