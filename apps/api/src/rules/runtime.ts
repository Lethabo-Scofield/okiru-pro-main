/**
 * Process-wide wiring for the rules ledger: the Mongo store, the verifier built from
 * the environment, and the (optional) signer. Nothing here has a fallback - a missing
 * signing key disables publishing, a missing database yields 503s.
 */
import { MongoRulesStore } from './mongoStore.js';
import { signerFromEnv, verifierFromEnv, SigningUnavailableError } from './signing.js';
import type { ServiceDeps } from './rulesService.js';
import { MongoStudioStore } from './studio/mongoStudioStore.js';
import { offsiteFromEnv, type OffsiteStore } from './studio/snapshots.js';
import { notifyConfigFromEnv } from './studio/notify.js';
import type { StudioCtx } from './studio/studioService.js';
import { envReadiness } from './readiness.js';

let warnedNotReady = false;

/**
 * Production publishing stays off until every launch prerequisite is met: RULES_LAUNCHED=true only takes
 * effect when envReadiness() has no failing blocker (signing key, TOTP key, off-site store, build id...).
 */
export function rulesLaunched(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RULES_LAUNCHED !== 'true') return false;
  const r = envReadiness(env);
  if (!r.canLaunch && !warnedNotReady) {
    warnedNotReady = true;
    console.error('[rules] RULES_LAUNCHED=true is IGNORED: launch blockers failing: ' + r.checks.filter((c) => c.severity === 'blocker' && !c.ok).map((c) => c.id).join(', '));
  }
  return r.canLaunch;
}

/** Accounts that see published rules before launch (RULES_PREVIEW_USER_IDS, comma-separated user ids). */
export function previewUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.RULES_PREVIEW_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Whether THIS user is scored under published rules. After launch that is everyone. Before launch it is only the
 * named preview accounts, so experts can see a published change move a real score while clients stay on the shipped
 * rules. Preview needs the same signed rules as a launch (a signing key and a build id); the operational blockers
 * (webhook, heartbeat, ...) are what a launch to clients needs.
 */
export function rulesServedTo(userId: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (rulesLaunched(env)) return true;
  if (!userId || !previewUserIds(env).includes(userId)) return false;
  const required = new Set(['signing-key', 'build-id', 'not-rehearsal-in-prod']);
  return envReadiness(env).checks.filter((c) => required.has(c.id)).every((c) => c.ok);
}

/**
 * Identifies the running build. Set BUILD_ID (e.g. the git SHA) in CI; "dev" is only ever
 * a development default - a production deployment without it still serves, but its stamps
 * say so plainly.
 */
export function buildIdFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.BUILD_ID || env.GIT_SHA || env.SOURCE_VERSION || 'unversioned-build';
}

export function rulesFrozenByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RULES_FREEZE === 'true';
}

let cached: ServiceDeps | null = null;

export function getServiceDeps(env: NodeJS.ProcessEnv = process.env): ServiceDeps {
  if (cached && env === process.env) return { ...cached, envFrozen: rulesFrozenByEnv(env) };
  let signer: ServiceDeps['signer'];
  try {
    signer = signerFromEnv(env);
  } catch (e) {
    if (!(e instanceof SigningUnavailableError)) throw e;
    signer = undefined;
  }
  const deps: ServiceDeps = { store: new MongoRulesStore(), verifier: verifierFromEnv(env), signer, buildId: buildIdFromEnv(env), envFrozen: rulesFrozenByEnv(env) };
  if (env === process.env) cached = deps;
  return deps;
}

let offsiteCache: { value: OffsiteStore | null } | null = null;

/** The Studio's full dependency set. Off-site is resolved once; null => protected publishing disabled. */
export async function getStudioCtx(env: NodeJS.ProcessEnv = process.env): Promise<StudioCtx> {
  if (!offsiteCache) offsiteCache = { value: await offsiteFromEnv(env) };
  return {
    studio: new MongoStudioStore(), rules: getServiceDeps(env), offsite: offsiteCache.value, notifyCfg: notifyConfigFromEnv(env),
    env, now: () => new Date(), requiredApprovals: Math.max(1, Number(env.RULES_REQUIRED_APPROVALS ?? 1) || 1),
  };
}

/** Test seam. */
export function resetServiceDepsForTests(): void {
  cached = null;
  offsiteCache = null;
}
