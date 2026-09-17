/**
 * Which companies a user may see, for the routes that live in apps/api.
 *
 * A mirror of apps/web/server/clientScopes.ts, reading the same
 * `workspace_members` collection. The two apps keep their own Mongoose models,
 * so the read is duplicated rather than the rule: absent or empty scopes mean
 * every company, an owner is never limited within their own team, and one
 * unscoped membership makes the user unscoped.
 *
 * This exists because the document library is organisation-wide. Without it, a
 * member limited to three companies could still read the evidence uploaded for
 * every other company in the organisation — the files are usually where the
 * sensitive detail actually is.
 */
import mongoose from 'mongoose';
import { WorkspaceMemberModel } from '../../models.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ClientScopes');

/**
 * `null` means unrestricted: nobody has scoped this user in any team.
 *
 * Otherwise the answer is the companies named by their scoped memberships. As
 * on the web side, owning one team does not lift a limit set on you in
 * another — but this module only sees documents, which carry a company id and
 * not a workspace id, so a team where the user is unrestricted contributes
 * nothing here and their access to those companies' documents comes from
 * having uploaded them or from an explicit scope.
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
    let anyScoped = false;
    for (const m of memberships) {
      const scopes = Array.isArray(m.clientScopes)
        ? m.clientScopes.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
        : [];
      if (m.role === 'owner' || scopes.length === 0) continue;
      anyScoped = true;
      for (const id of scopes) ids.add(id);
    }
    if (!anyScoped) return null;
    return Array.from(ids);
  } catch (err) {
    // Restrict rather than fall open. An empty list still lets a user's own
    // uploads through via the uploader clause below.
    logger.warn('resolveClientScopeIds failed — restricting to own uploads', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Narrow a document filter to the companies this user may see.
 *
 * Documents they uploaded themselves stay visible whatever the scopes say —
 * including ones not yet filed under a company, which would otherwise be
 * stranded the moment they were uploaded.
 *
 * Note what is deliberately NOT here: a blanket allowance for every unfiled
 * document. Unfiled is not the same as unowned, and letting it through would
 * mean a member limited to three companies could read a colleague's upload
 * simply because nobody had attached it to a company yet — which is exactly
 * the window where a document is most likely to be misfiled evidence.
 */
export function applyDocumentScopeFilter(
  filter: Record<string, any>,
  scopedIds: string[] | null,
  userId: string,
): Record<string, any> {
  if (scopedIds === null) return filter;
  return {
    $and: [
      filter,
      {
        $or: [
          { uploadedByUserId: userId },
          { userId },
          { entityId: { $in: scopedIds } },
        ],
      },
    ],
  };
}
