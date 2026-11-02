/**
 * Process-wide wiring for the rules ledger: the Mongo store, the verifier built from
 * the environment, and the (optional) signer. Nothing here has a fallback - a missing
 * signing key disables publishing, a missing database yields 503s.
 */
import { MongoRulesStore } from './mongoStore.js';
import { signerFromEnv, verifierFromEnv, SigningUnavailableError } from './signing.js';
import type { ServiceDeps } from './rulesService.js';

/** Production publishing stays off until every launch prerequisite is met. */
export function rulesLaunched(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RULES_LAUNCHED === 'true';
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

/** Test seam. */
export function resetServiceDepsForTests(): void {
  cached = null;
}
