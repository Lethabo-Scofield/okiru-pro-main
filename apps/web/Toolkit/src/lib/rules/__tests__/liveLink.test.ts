import { describe, it, expect, vi } from 'vitest';
import { resolveRules, startRulesWatcher, PublishedRulesUnavailableError, HEADS_POLL_MS, type FetchLike, type WatcherEnv } from '../liveLink';
import { buildEffectiveConfig, hashEffectiveConfig, hashOverrides } from '../buildEffectiveConfig';
import { SCORECARD_SOURCES } from '../scorecards';
import type { RuleOverrides } from '../types';

const G = 'benefitFactors[contributionType=guarantees].sdFactor';
const shipped = SCORECARD_SOURCES['rcogp-generic'].shipped;
const reply = (status: number, body: unknown): FetchLike => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function publishedBody(overrides: RuleOverrides, tweak: (b: any) => void = () => {}) {
  const cfg = buildEffectiveConfig('rcogp-generic', overrides);
  const body = {
    launched: true,
    stamp: {
      scorecardId: 'rcogp-generic', version: 3,
      configHash: await hashEffectiveConfig(cfg), overridesHash: await hashOverrides(overrides),
      effectiveFrom: '2026-11-02T00:00:00.000Z',
    },
    overrides,
  };
  tweak(body);
  return body;
}

describe('resolveRules (fail-closed live link)', () => {
  it('uses the SHIPPED config when rules are not launched', async () => {
    const r = await resolveRules('rcogp-generic', shipped, reply(200, { launched: false, stamp: null, overrides: null }));
    expect(r.config).toBe(shipped);
    expect(r.stamp).toBeNull();
  });

  it('uses the shipped config when launched but nothing is published for this scorecard', async () => {
    const r = await resolveRules('rcogp-generic', shipped, reply(200, { launched: true, stamp: null, overrides: null }));
    expect(r.config).toBe(shipped);
    expect(r.stamp).toBeNull();
  });

  it('rebuilds the published config locally, verifies its hash and returns the stamp', async () => {
    const ov: RuleOverrides = { source: { [G]: 0.5 }, calculator: {} };
    const r = await resolveRules('rcogp-generic', shipped, reply(200, await publishedBody(ov)));
    expect(r.stamp?.version).toBe(3);
    const g = (r.config as any).benefitFactors.find((b: any) => b.type === 'guarantees');
    expect(g.factor).toBe(0.5);
    expect(r.config).not.toBe(shipped);
  });

  it('fails closed when the server cannot be reached', async () => {
    const down: FetchLike = async () => { throw new TypeError('network down'); };
    await expect(resolveRules('rcogp-generic', shipped, down, true)).rejects.toThrow(PublishedRulesUnavailableError);
  });

  it.each([500, 503, 401, 404])('fails closed on HTTP %i (never falls back to shipped)', async (status) => {
    await expect(resolveRules('rcogp-generic', shipped, reply(status, { code: 'X' }), true)).rejects.toThrow(PublishedRulesUnavailableError);
  });

  it.each([
    ['null body', null],
    ['no launched flag', { stamp: null }],
    ['stamp for another scorecard', (b: any) => { b.stamp.scorecardId = 'rcogp-qse'; }],
    ['bad hash shape', (b: any) => { b.stamp.configHash = 'zz'; }],
    ['stamp without overrides', (b: any) => { b.overrides = null; }],
  ])('fails closed on a malformed response: %s', async (_name, mutation) => {
    const ov: RuleOverrides = { source: { [G]: 0.5 }, calculator: {} };
    const body = typeof mutation === 'function' ? await publishedBody(ov, mutation) : mutation;
    await expect(resolveRules('rcogp-generic', shipped, reply(200, body), true)).rejects.toThrow(PublishedRulesUnavailableError);
  });

  it('fails closed when the local hash does not match the stamp (server/client divergence or tampering)', async () => {
    const ov: RuleOverrides = { source: { [G]: 0.5 }, calculator: {} };
    const body = await publishedBody(ov, (b) => { b.overrides.source[G] = 0.6; });
    await expect(resolveRules('rcogp-generic', shipped, reply(200, body), true)).rejects.toThrow(/integrity/);
  });

  it('fails closed on overrides that do not validate (unknown path / out of bounds)', async () => {
    const ov: RuleOverrides = { source: { [G]: 0.5 }, calculator: {} };
    const body = await publishedBody(ov, (b) => { b.overrides = { source: { 'targets.nope.x': 1 }, calculator: {} }; });
    await expect(resolveRules('rcogp-generic', shipped, reply(200, body), true)).rejects.toThrow(/valid configuration/);
  });
});

describe('resolveRules before launch', () => {
  it('uses the shipped rules when the endpoint is unreachable or erroring (nothing is in force yet)', async () => {
    const down: FetchLike = async () => { throw new TypeError('network down'); };
    for (const f of [down, reply(500, {}), reply(200, null)]) {
      const r = await resolveRules('rcogp-generic', shipped, f, false);
      expect(r.config).toBe(shipped);
      expect(r.stamp).toBeNull();
    }
  });

  it('still refuses a tampered answer once the SERVER says it is launched, whatever the client flag', async () => {
    const ov: RuleOverrides = { source: { [G]: 0.5 }, calculator: {} };
    const body = await publishedBody(ov, (b) => { b.overrides.source[G] = 0.6; });
    await expect(resolveRules('rcogp-generic', shipped, reply(200, body), false)).rejects.toThrow(/integrity/);
  });
});

describe('startRulesWatcher', () => {
  function harness() {
    let heads = [{ scorecardId: 'rcogp-generic', activeVersion: 1, chainHead: 'a', configHash: 'h1' }];
    let tick: () => void = () => {};
    const listeners: Record<string, () => void> = {};
    const channel = { posted: [] as unknown[], postMessage(m: unknown) { this.posted.push(m); }, onmessage: null as any, close: vi.fn() };
    const env: WatcherEnv = {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ launched: true, heads }) }),
      setInterval: (fn, ms) => { expect(ms).toBe(HEADS_POLL_MS); tick = fn; return 1; },
      clearInterval: vi.fn(),
      addEventListener: (t, fn) => { listeners[t] = fn; },
      removeEventListener: vi.fn(),
      isVisible: () => true,
      channel,
    };
    return { env, setHeads: (h: typeof heads) => { heads = h; }, tick: () => tick(), listeners, channel };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('records a baseline on the first look and notifies only on change', async () => {
    const h = harness();
    const onChange = vi.fn();
    const stop = startRulesWatcher(onChange, h.env);
    await flush();
    expect(onChange).not.toHaveBeenCalled();

    h.tick(); await flush();
    expect(onChange).not.toHaveBeenCalled();

    h.setHeads([{ scorecardId: 'rcogp-generic', activeVersion: 2, chainHead: 'b', configHash: 'h2' }]);
    h.tick(); await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(h.channel.posted).toEqual([{ type: 'rules-changed' }]);

    h.tick(); await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('re-checks on window focus and reacts to another tab announcing a change', async () => {
    const h = harness();
    const onChange = vi.fn();
    startRulesWatcher(onChange, h.env);
    await flush();
    h.setHeads([{ scorecardId: 'rcogp-generic', activeVersion: 2, chainHead: 'b', configHash: 'h2' }]);
    h.listeners.focus(); await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    h.channel.onmessage({ data: { type: 'rules-changed' } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('stop() clears the timer and closes the channel', async () => {
    const h = harness();
    const stop = startRulesWatcher(vi.fn(), h.env);
    stop();
    expect(h.env.clearInterval).toHaveBeenCalled();
    expect(h.channel.close).toHaveBeenCalled();
  });
});
