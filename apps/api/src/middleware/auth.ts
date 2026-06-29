import type { Request as ExpressRequest, Response, NextFunction } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { ClientModel, ProcessorSessionModel, WorkspaceMemberModel } from '../../models.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// Pillar keys used in workspace member.pillarScopes (mirrors apps/web/server/
// scorecardCollaboration.ts SCORECARD_PILLAR_KEYS).
const PILLAR_KEYS = new Set([
  'ownership', 'management', 'skills', 'procurement', 'supplierDevelopment',
  'enterpriseDevelopment', 'employmentEquity', 'sed', 'yes',
]);

// Same loose match as apps/web — management↔EE, esd↔SD↔ED.
function pillarInScope(pillar: string, scopes: readonly string[]): boolean {
  if (scopes.includes(pillar)) return true;
  if (pillar === 'management' && scopes.includes('employmentEquity')) return true;
  if (pillar === 'employmentEquity' && scopes.includes('management')) return true;
  if ((pillar === 'supplierDevelopment' || pillar === 'enterpriseDevelopment') && scopes.includes('esd')) return true;
  if (pillar === 'esd' && (scopes.includes('supplierDevelopment') || scopes.includes('enterpriseDevelopment'))) return true;
  return false;
}

function normalizePillarScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const k = x.trim();
    if (PILLAR_KEYS.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Pillar-scope guard for per-entity write routes. Call AFTER verifyClientAccess
 * (or alongside it) on routes that mutate a single pillar (employees/training/
 * suppliers/contributions/etc.).
 *
 * Behaviour:
 *   - If no workspace-bound ProcessorSession exists for this client (single-
 *     tenant flow), returns true unchanged — same as the pre-RBAC behaviour.
 *   - If a workspace-bound assessment exists:
 *       owner of that assessment            → allow
 *       workspace member role=owner         → allow
 *       workspace member role=viewer        → 403 (read-only)
 *       workspace member, no pillarScopes   → allow (full collaborator)
 *       workspace member, pillarScopes ∋ k  → allow
 *       workspace member, pillarScopes ∌ k  → 403 (out of scope)
 *       not a member of the bound workspace → 403
 *   - Mongo unavailable / lookup error      → allow (fail-open at infra layer
 *     to avoid masking outages; still gated by verifyClientAccess upstream).
 *
 * Audit B15-srv: closes the apps/api half of A2 (the apps/web read endpoint
 * was already gated in commit 7da3c05b).
 */
export async function verifyPillarAccess(
  req: Request,
  res: Response,
  pillarKey: string,
  explicitClientId?: string | null,
): Promise<boolean> {
  return verifyPillarAccessInner(req, res, pillarKey, explicitClientId, false);
}

/**
 * Stricter than verifyPillarAccess — requires the caller to have FULL scorecard
 * access (no pillar restriction). Use for cross-pillar entities like
 * financial-years (affects every pillar via revenue/NPAT/leviable) and
 * scenarios (captures the whole scorecard).
 */
export async function verifyFullScorecardAccess(
  req: Request,
  res: Response,
  explicitClientId?: string | null,
): Promise<boolean> {
  return verifyPillarAccessInner(req, res, '__full__', explicitClientId, true);
}

async function verifyPillarAccessInner(
  req: Request,
  res: Response,
  pillarKey: string,
  explicitClientId: string | null | undefined,
  requireFull: boolean,
): Promise<boolean> {
  const userId = req.session.userId!;
  // For PATCH/DELETE on /:id (employees/:id, suppliers/:id, etc.), the caller
  // looks up the entity first and passes the clientId in; for create routes
  // mounted under /:clientId/... we read it from params.
  const clientId = explicitClientId ?? String(req.params.clientId ?? req.params.id ?? '');
  if (!clientId) return true;

  try {
    const session = await ProcessorSessionModel.findOne({
      clientId,
      workspaceId: { $nin: [null, ''] },
    })
      .sort({ updatedAt: -1 })
      .lean() as any;

    if (!session?.workspaceId) return true; // no workspace overlay → pass

    const ownerId = session.createdBy ?? session.createdByUserId ?? null;
    if (ownerId && ownerId === userId) return true;

    const member = await WorkspaceMemberModel.findOne({
      workspaceId: String(session.workspaceId),
      userId,
    }).lean() as any;

    if (!member) {
      res.status(403).json({ message: "Access denied (not a workspace member)" });
      return false;
    }
    if (member.role === 'owner') return true;
    if (member.role === 'viewer') {
      res.status(403).json({ message: "Access denied (read-only)" });
      return false;
    }
    const scopes = normalizePillarScopes(member.pillarScopes);
    if (scopes.length === 0) return true; // collaborator, full access
    if (requireFull) {
      res.status(403).json({ message: "Access denied (cross-pillar action requires full scorecard access)" });
      return false;
    }
    if (pillarInScope(pillarKey, scopes)) return true;
    res.status(403).json({ message: `Access denied (pillar '${pillarKey}' out of scope)` });
    return false;
  } catch {
    // Infra error — don't mask outages with a 5xx storm at the auth layer;
    // verifyClientAccess upstream is still enforcing org/creator.
    return true;
  }
}

export async function verifyClientAccess(req: Request, res: Response): Promise<boolean> {
  const clientId = String(req.params.id ?? req.params.clientId ?? '');
  if (!clientId) return true;

  const sessionUserId = req.session.userId!;
  const sessionOrgId = req.session.organizationId ?? null;

  // Web toolkit records use `clientId`; API records use `id` — same collection.
  const raw = await ClientModel.findOne({
    $or: [{ id: clientId }, { clientId }],
  }).lean() as { id?: string; clientId?: string; organizationId?: string | null; createdByUserId?: string | null } | null;

  if (!raw) {
    res.status(404).json({ message: "Client not found" });
    return false;
  }

  const creatorId = raw.createdByUserId ?? null;
  const orgId = raw.organizationId ?? null;

  if (creatorId && creatorId === sessionUserId) return true;
  if (orgId && sessionOrgId && orgId === sessionOrgId) return true;

  res.status(403).json({ message: "Access denied" });
  return false;
}

export async function verifyResourceOwnership(req: Request, res: Response, clientId: string | null): Promise<boolean> {
  if (!clientId) {
    res.status(404).json({ message: "Not found" });
    return false;
  }
  const client = await storage.getClient(clientId);
  if (!client) {
    res.status(404).json({ message: "Not found" });
    return false;
  }
  if (client.organizationId !== req.session.organizationId) {
    res.status(403).json({ message: "Access denied" });
    return false;
  }
  return true;
}

