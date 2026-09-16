/**
 * SEC-005 — mass-assignment guard.
 *
 * Strips server-controlled and prototype-pollution-prone keys from a
 * client-supplied create/update body before it is spread into a persistence
 * call. Prevents a caller from overriding identity, tenant, or audit fields via
 * mass assignment (e.g. `id`, `organizationId`, `createdAt`). The route still
 * sets `clientId` explicitly afterwards, and Mongoose strips unknown fields —
 * this closes the "known-but-not-writable field" gap those two don't cover.
 */
const BLOCKED_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
  'id',
  '_id',
  'clientId',
  'organizationId',
  'createdAt',
  'updatedAt',
  'createdByUserId',
  'uploadedByUserId',
]);

// Returns the same static type as the input (routes type req.body as `any`) so
// callers keep compiling; the runtime result has the blocked keys removed.
export function stripServerControlledFields<T>(body: T): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {} as T;
  const out: Record<string, unknown> = {};
  // Object.keys returns only own enumerable keys, so a raw "__proto__" in the
  // JSON body is a normal key here (and is dropped by the blocklist).
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = (body as Record<string, unknown>)[key];
  }
  return out as T;
}
