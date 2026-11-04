/**
 * The live link between the calculators and published rules.
 *
 * Contract (mirrors apps/api/src/routes/rules.ts):
 *   - server says launched:false, or no version is published for the scorecard
 *       -> the SHIPPED config is used, exactly as before the Studio existed.
 *   - server says launched:true with a version
 *       -> the effective config is rebuilt LOCALLY from the signed overrides and its hash
 *          must equal the stamp's configHash. Any mismatch is an error.
 *   - launched but the server is unreachable / answers 5xx / returns something malformed
 *       -> FAIL CLOSED: PublishedRulesUnavailableError. The caller refuses to calculate.
 *          There is no silent fallback to shipped rules for a launched deployment, because
 *          that would score clients under rules that are not the ones in force.
 */
import type { CalculatorConfig } from '../../../../shared/schema';
import { buildEffectiveConfig, hashEffectiveConfig, hashOverrides, RuleValidationError } from './buildEffectiveConfig';
import { isScorecardId, type ScorecardId } from './scorecards';
import { registryHashOf } from './registry';
import type { RuleOverrides, RulesetStamp } from './types';

export class PublishedRulesUnavailableError extends Error {
  constructor(public readonly scorecardId: ScorecardId, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PublishedRulesUnavailableError';
  }
}

export interface ResolvedRules {
  /** Why the rules changed (the publisher's announcement), when a published version is in force. */
  announcement?: string | null;
  config: CalculatorConfig;
  /** null => shipped rules (rules not launched, or nothing published yet). */
  stamp: RulesetStamp | null;
}

export type FetchLike = (input: string, init?: { credentials?: 'include'; cache?: 'no-store'; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface PublishedBody {
  announcement?: string | null;
  launched: boolean;
  stamp: RulesetStamp | null;
  overrides: RuleOverrides | null;
}

const HASH_RE = /^[0-9a-f]{64}$/;

function parseBody(scorecardId: ScorecardId, body: unknown): PublishedBody {
  const b = body as Partial<PublishedBody> | null;
  if (!b || typeof b !== 'object' || typeof b.launched !== 'boolean') {
    throw new PublishedRulesUnavailableError(scorecardId, 'Published rules response was malformed');
  }
  if (!b.launched || b.stamp == null) return { launched: b.launched, stamp: null, overrides: null };
  const announcement = typeof b.announcement === 'string' ? b.announcement.slice(0, 500) : null;
  const s = b.stamp;
  if (s.scorecardId !== scorecardId || !Number.isInteger(s.version) || s.version < 0 || !HASH_RE.test(s.configHash) || !HASH_RE.test(s.overridesHash)
    || !HASH_RE.test(s.registryHash) || typeof s.buildId !== 'string' || typeof s.pinned !== 'boolean' || typeof s.frozen !== 'boolean' || !b.overrides) {
    throw new PublishedRulesUnavailableError(scorecardId, 'Published rules stamp was malformed');
  }
  return { launched: true, stamp: s, overrides: b.overrides, announcement };
}

/**
 * True when THIS deployment has been launched (VITE_RULES_LAUNCHED=true, set together with
 * RULES_LAUNCHED on the API). Only then does "the server could not be reached" mean
 * "refuse to calculate": before launch the shipped rules ARE the rules in force, so an
 * unreachable rules endpoint must not take the Toolkit down.
 */
export function deploymentIsLaunched(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_RULES_LAUNCHED === 'true';
}

export async function resolveRules(
  scorecardId: ScorecardId,
  shipped: CalculatorConfig,
  fetchImpl: FetchLike = (globalThis.fetch as unknown) as FetchLike,
  failClosed: boolean = deploymentIsLaunched(),
  /** A client pin: serve exactly this version (0 = shipped), regardless of what is current. */
  pinVersion?: number,
): Promise<ResolvedRules> {
  let body: PublishedBody;
  try {
    const res = await fetchImpl(`/api/rules/published/${encodeURIComponent(scorecardId)}${pinVersion === undefined ? '' : `?version=${pinVersion}`}`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new PublishedRulesUnavailableError(scorecardId, `Published rules request failed (${res.status})`);
    body = parseBody(scorecardId, await res.json());
  } catch (e) {
    const err = e instanceof PublishedRulesUnavailableError
      ? e
      : new PublishedRulesUnavailableError(scorecardId, 'Published rules could not be reached', e);
    if (failClosed) throw err;
    console.warn('[rules] published rules unavailable before launch; using shipped rules:', err.message);
    return { config: shipped, stamp: null };
  }

  if (!body.launched || !body.stamp || !body.overrides) return { config: shipped, stamp: null };

  // Build compatibility: the version must have been published against the registry THIS build runs.
  if (body.stamp.registryHash !== await registryHashOf(scorecardId)) {
    throw new PublishedRulesUnavailableError(scorecardId, 'Published rules are not compatible with this version of the app; reload to update');
  }

  let config: CalculatorConfig;
  try {
    // Version 0 IS the shipped configuration: use it as-is (and still verify the hash below).
    config = body.stamp.version === 0 && Object.keys(body.overrides.source ?? {}).length + Object.keys(body.overrides.calculator ?? {}).length === 0
      ? shipped
      : buildEffectiveConfig(scorecardId, body.overrides);
  } catch (e) {
    if (e instanceof RuleValidationError) throw new PublishedRulesUnavailableError(scorecardId, 'Published rules do not build into a valid configuration', e);
    throw e;
  }
  const [configHash, overridesHash] = await Promise.all([hashEffectiveConfig(config), hashOverrides(body.overrides)]);
  if (configHash !== body.stamp.configHash || overridesHash !== body.stamp.overridesHash) {
    throw new PublishedRulesUnavailableError(scorecardId, 'Published rules failed the integrity check on this device');
  }
  return { config, stamp: body.stamp, announcement: body.announcement ?? null };
}

/* ------------------------------------------------------------------ change watching */

export interface WatcherEnv {
  fetchImpl: FetchLike;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  addEventListener?: (type: 'focus' | 'visibilitychange', fn: () => void) => void;
  removeEventListener?: (type: 'focus' | 'visibilitychange', fn: () => void) => void;
  isVisible?: () => boolean;
  channel?: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null; close(): void } | null;
}

export const HEADS_POLL_MS = 60_000;

/**
 * Polls /api/rules/heads (every 60 s, on focus, and when another tab announces a change)
 * and calls `onChange` when the set of in-force versions differs from the last look.
 * The first successful look only records the baseline.
 */
export function startRulesWatcher(onChange: () => void, env: WatcherEnv = browserEnv()): () => void {
  let last: string | null = null;
  let stopped = false;

  const check = async () => {
    if (stopped) return;
    try {
      const res = await env.fetchImpl('/api/rules/heads', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { launched?: boolean; heads?: Array<{ scorecardId: string; activeVersion: number | null; chainHead: string | null; configHash: string | null }> };
      const signature = JSON.stringify((body.launched ? body.heads ?? [] : []).filter((h) => isScorecardId(h.scorecardId)).map((h) => [h.scorecardId, h.activeVersion, h.chainHead, h.configHash]));
      if (last !== null && signature !== last) {
        env.channel?.postMessage({ type: 'rules-changed' });
        last = signature;
        onChange();
        return;
      }
      last = signature;
    } catch {
      // A failed poll is not a change; the next resolveRules() decides whether we fail closed.
    }
  };

  const handle = env.setInterval(() => { if (env.isVisible?.() !== false) void check(); }, HEADS_POLL_MS);
  const onFocus = () => void check();
  env.addEventListener?.('focus', onFocus);
  env.addEventListener?.('visibilitychange', onFocus);
  if (env.channel) env.channel.onmessage = () => { if (!stopped) onChange(); };
  void check();

  return () => {
    stopped = true;
    env.clearInterval(handle);
    env.removeEventListener?.('focus', onFocus);
    env.removeEventListener?.('visibilitychange', onFocus);
    if (env.channel) { env.channel.onmessage = null; env.channel.close(); }
  };
}

function browserEnv(): WatcherEnv {
  const g = globalThis as unknown as {
    fetch: FetchLike; setInterval: WatcherEnv['setInterval']; clearInterval: WatcherEnv['clearInterval'];
    addEventListener?: WatcherEnv['addEventListener']; removeEventListener?: WatcherEnv['removeEventListener'];
    document?: { visibilityState?: string }; BroadcastChannel?: new (n: string) => NonNullable<WatcherEnv['channel']>;
  };
  return {
    fetchImpl: g.fetch.bind(globalThis) as FetchLike,
    setInterval: g.setInterval.bind(globalThis),
    clearInterval: g.clearInterval.bind(globalThis),
    addEventListener: g.addEventListener?.bind(globalThis),
    removeEventListener: g.removeEventListener?.bind(globalThis),
    isVisible: () => g.document?.visibilityState !== 'hidden',
    channel: g.BroadcastChannel ? new g.BroadcastChannel('okiru-rules') : null,
  };
}
