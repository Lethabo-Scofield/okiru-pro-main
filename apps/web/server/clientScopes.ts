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

export interface ClientScope {
  /** Company ids granted explicitly by a scoped membership. */
  clientIds: string[];
  /** Teams where this user is unrestricted — every company in them is theirs. */
  openWorkspaceIds: string[];
}

/**
 * What this user may see, across every team they belong to.
 *
 * `null` means unrestricted: they hold no scoped membership anywhere.
 *
 * Scopes are per team, so the answer has to be too. Owning one team does not
 * lift a limit somebody placed on you in another — an earlier version returned
 * "unrestricted" the moment it saw an owner row, which let anyone who owned a
 * team of their own read every company in a team that had deliberately scoped
 * them. Teams where you are an owner, or a member with no scope set,
 * contribute all of their companies; scoped memberships contribute only the
 * companies they name.
 */
export async function resolveClientScopeIds(userId: string): Promise<ClientScope | null> {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const memberships = (await WorkspaceMemberModel.find(
      { userId },
      { _id: 0, role: 1, workspaceId: 1, clientScopes: 1 },
    ).lean()) as Array<{ role?: string; workspaceId?: string; clientScopes?: unknown }>;

    if (memberships.length === 0) return null;

    const clientIds = new Set<string>();
    const openWorkspaceIds = new Set<string>();
    let anyScoped = false;

    for (const m of memberships) {
      const scopes = normalizeClientScopes(m.clientScopes);
      if (m.role === "owner" || scopes.length === 0) {
        if (m.workspaceId) openWorkspaceIds.add(String(m.workspaceId));
        continue;
      }
      anyScoped = true;
      for (const id of scopes) clientIds.add(id);
    }

    // Nobody has scoped them anywhere: leave the query untouched.
    if (!anyScoped) return null;
    return { clientIds: Array.from(clientIds), openWorkspaceIds: Array.from(openWorkspaceIds) };
  } catch (err) {
    // Deny rather than fall open: "we could not work out what you may see" is
    // not the same as "you may see everything". An empty list still lets the
    // creator clause through, so nobody loses their own companies.
    logger.warn("resolveClientScopeIds failed — restricting to own companies", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { clientIds: [], openWorkspaceIds: [] };
  }
}

/**
 * Narrow a Mongo filter by company scope, keeping whatever the caller already
 * built. The scope clause is ANDed on, so joining an organisation cannot widen
 * a scoped member back out to everything.
 */
export function applyClientScopeFilter(
  base: Record<string, unknown>,
  scope: ClientScope | null,
  userId: string,
): Record<string, unknown> {
  if (scope === null) return base;
  return {
    $and: [
      base,
      {
        $or: [
          { createdByUserId: userId },
          { clientId: { $in: scope.clientIds } },
          { id: { $in: scope.clientIds } },
          { workspaceId: { $in: scope.openWorkspaceIds } },
        ],
      },
    ],
  };
}

/** Is this one company within the user's scope? */
export function isClientInScope(
  client: {
    clientId?: string | null;
    id?: string | null;
    workspaceId?: string | null;
    createdByUserId?: string | null;
  },
  scope: ClientScope | null,
  userId: string,
): boolean {
  if (scope === null) return true;
  if (client.createdByUserId && client.createdByUserId === userId) return true;
  if (client.workspaceId && scope.openWorkspaceIds.includes(String(client.workspaceId))) return true;
  const ids = [client.clientId, client.id].filter(Boolean).map(String);
  return ids.some((id) => scope.clientIds.includes(id));
}
