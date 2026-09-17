/**
 * Per-company access.
 *
 * `pillarScopes` answers "which pillars inside a company may you touch".
 * This answers the question before it: "which companies may you open at all".
 * A consultancy measuring twenty clients needs to put one analyst on three of
 * them, and there was previously no way to express that — membership of a team
 * meant every company that team held.
 *
 * The two compose as a strict AND. A contributor scoped to one company and two
 * pillars sees exactly one company, and exactly two pillars inside it.
 *
 * ABSENT OR EMPTY MEANS ALL. That is the same convention `pillarScopes`
 * already uses, and it is what lets this ship without a migration: every
 * existing member keeps precisely the access they have today.
 *
 * A company you created yourself is always yours, whatever the scopes say —
 * otherwise an owner could lock a member out of their own work.
 */
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { WorkspaceMemberModel } from "../shared/schema";

const logger = createLogger("ClientScopes");

export function normalizeClientScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0),
    ),
  );
}

/**
 * The company ids this user is limited to, across every team they belong to.
 *
 * `null` means unrestricted — either they hold no scoped membership, or one of
 * their memberships is unscoped, in which case the unscoped one wins because
 * scopes narrow rather than subtract.
 */
export async function resolveClientScopeIds(userId: string): Promise<string[] | null> {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const memberships = (await WorkspaceMemberModel.find(
      { userId },
      { _id: 0, role: 1, clientScopes: 1 },
    ).lean()) as Array<{ role?: string; clientScopes?: unknown }>;

    if (memberships.length === 0) return null;

    const ids = new Set<string>();
    for (const m of memberships) {
      // An owner is not limited by a list of companies in their own team.
      if (m.role === "owner") return null;
      const scopes = normalizeClientScopes(m.clientScopes);
      if (scopes.length === 0) return null; // one unscoped membership = unrestricted
      for (const id of scopes) ids.add(id);
    }
    return Array.from(ids);
  } catch (err) {
    // Deny rather than fall open: "we could not work out what you may see" is
    // not the same as "you may see everything". An empty list still lets the
    // creator clause through, so nobody loses their own companies.
    logger.warn("resolveClientScopeIds failed — restricting to own companies", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Narrow a Mongo filter by company scope, keeping whatever the caller already
 * built. The scope clause is ANDed on, so joining an organisation cannot widen
 * a scoped member back out to everything.
 */
export function applyClientScopeFilter(
  base: Record<string, unknown>,
  scopedIds: string[] | null,
  userId: string,
): Record<string, unknown> {
  if (scopedIds === null) return base;
  return {
    $and: [
      base,
      { $or: [{ createdByUserId: userId }, { clientId: { $in: scopedIds } }, { id: { $in: scopedIds } }] },
    ],
  };
}

/** Is this one company within the user's scope? */
export function isClientInScope(
  client: { clientId?: string | null; id?: string | null; createdByUserId?: string | null },
  scopedIds: string[] | null,
  userId: string,
): boolean {
  if (scopedIds === null) return true;
  if (client.createdByUserId && client.createdByUserId === userId) return true;
  const ids = [client.clientId, client.id].filter(Boolean).map(String);
  return ids.some((id) => scopedIds.includes(id));
}
