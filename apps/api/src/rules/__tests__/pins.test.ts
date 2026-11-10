import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { createSigner, createVerifier } from '../signing.js';
import { publishVersion, freeze, emergencyRollback, resolvePublished, RulesNotFoundError, PublishRejectedError, type ServiceDeps } from '../rulesService.js';
import { pinRuleset, rescoreUnderRules, PinConflictError, ClientNotFoundError, type ClientPinStore, type PinMap } from '../pins.js';
import { MemoryRulesStore } from './memoryStore.js';
import { MemoryStudioStore } from '../studio/__tests__/memoryStudioStore.js';
import { verifyAudit } from '../studio/audit.js';

const SID = 'rcogp-generic';
const G = 'benefitFactors[contributionType=guarantees].sdFactor';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
let clock: Date; let rules: ServiceDeps; let studio: MemoryStudioStore; let clients: Map<string, PinMap>; let pins: ClientPinStore;
const later = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };
const deps = () => ({ rules, studio, pins, now: () => clock });
const pub = (v: number) => publishVersion({ scorecardId: SID, overrides: { source: { [G]: v }, calculator: {} }, publishedBy: 't' }, rules);

beforeEach(() => {
  clock = new Date('2026-11-02T10:00:00Z');
  studio = new MemoryStudioStore();
  rules = { store: new MemoryRulesStore(), signer: createSigner('k1', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string), verifier: createVerifier({ k1: publicKey.export({ type: 'spki', format: 'pem' }) as string }), buildId: 'b', now: () => clock };
  clients = new Map([['client-b', {}]]);
  pins = {
    getPins: async (id) => (clients.has(id) ? { ...clients.get(id)! } : null),
    setPin: async (id, sid, pin) => { clients.set(id, { ...clients.get(id)!, [sid]: pin }); },
  };
});

describe('ruleset pins', () => {
  it('pins a client to the version it was scored under, idempotently', async () => {
    await pub(0.5);
    const a = await pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 1, actor: 'u1', reason: 'Workbook submitted' });
    expect(a[SID]).toMatchObject({ version: 1, pinnedBy: 'u1', reason: 'Workbook submitted' });
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 1, actor: 'u1' })).resolves.toMatchObject({ [SID]: { version: 1 } });
    expect((await studio.collection<any>('rulesetPinEvents').find())).toHaveLength(1); // the repeat wrote nothing
  });

  it('can pin version 0 (the shipped rules)', async () => {
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 0, actor: 'u1' })).resolves.toMatchObject({ [SID]: { version: 0 } });
  });

  it('never moves an existing pin, however many versions are published, frozen or rolled back', async () => {
    await pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 0, actor: 'u1' });
    await pub(0.5); later(1); await pub(0.4);
    await freeze(rules, { scope: SID, reason: 'investigating', actor: 'a' });
    later(1);
    await emergencyRollback({ scorecardId: SID, fromVersion: 1, actor: 'a', reason: 'roll back to v1' }, rules);
    expect(clients.get('client-b')![SID].version).toBe(0);
    // and the pinned read still serves version 0 exactly
    expect((await resolvePublished(SID, rules, { version: clients.get('client-b')![SID].version })).stamp).toMatchObject({ version: 0, pinned: true });
    // a different version is refused unless it goes through the explicit re-score path
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 2, actor: 'u1' })).rejects.toThrow(PinConflictError);
  });

  it('re-scoring is explicit, reasoned, audited and recorded as an append-only event', async () => {
    await pub(0.5);
    await pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 0, actor: 'u1' });
    await expect(rescoreUnderRules(deps(), { clientId: 'client-b', scorecardId: SID, toVersion: 'current', actor: 'u2', reason: 'short' })).rejects.toThrow(PublishRejectedError);
    const out = await rescoreUnderRules(deps(), { clientId: 'client-b', scorecardId: SID, toVersion: 'current', actor: 'u2', reason: 'Client asked for the current rules' });
    expect(out[SID]).toMatchObject({ version: 1, pinnedBy: 'u2' });
    const events = await studio.collection<any>('rulesetPinEvents').find();
    expect(events.map((e) => [e.action, e.from, e.to])).toEqual([['pin', null, 0], ['rescore', 0, 1]]);
    await expect(studio.collection('rulesetPinEvents').replace({ ...events[0], to: 9 }, events[0].rev)).rejects.toThrow(/append-only/);
    expect(await verifyAudit(studio, rules.verifier)).toMatchObject({ ok: true, events: 2 });
  });

  it('refuses unknown clients, scorecards and versions', async () => {
    await expect(pinRuleset(deps(), { clientId: 'ghost', scorecardId: SID, version: 0, actor: 'u' })).rejects.toThrow(ClientNotFoundError);
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: 'nope', version: 0, actor: 'u' })).rejects.toThrow(PublishRejectedError);
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 5, actor: 'u' })).rejects.toThrow(RulesNotFoundError);
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: -1, actor: 'u' })).rejects.toThrow(PublishRejectedError);
    await expect(pinRuleset(deps(), { clientId: 'client-b', scorecardId: SID, version: 1.5, actor: 'u' })).rejects.toThrow(PublishRejectedError);
    expect(clients.get('client-b')).toEqual({});
  });
});
