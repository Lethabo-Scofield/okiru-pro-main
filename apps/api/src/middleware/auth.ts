import type { Request as ExpressRequest, Response, NextFunction } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { ClientModel, ProcessorSessionModel, WorkspaceMemberModel } from '../../models.js';
import { createLogger } from '../logger.js';

const logger = createLogger('PillarAccess');

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
  // FAIL CLOSED on a missing/degenerate client id. Before mergeParams was set
  // on the nested routers, req.params.clientId was undefined here and this
  // guard PASSED OPEN — no tenancy or scope check at all, and creates wrote
  // clientId:"undefined" orphans (proven live, 2026-07-26 probe). A request
  // with no client context has nothing to authorise against.
  if (!clientId || clientId === 'undefined' || clientId === 'null') {
    res.status(400).json({ message: "Client context required" });
    return false;
  }

  try {
    // The company’s own binding is the authority; the workspace-bound
    // ProcessorSession is a fallback for companies made through the super-admin
    // processor. ProcessorSession used to be the ONLY link consulted here, and
    // a normally-created company has client.workspaceId set but no
    // workspace-bound session — so this lookup found nothing and fell straight
    // through to `return true`. Pillar scopes were recorded and then never
    // applied to essentially every company: a workspace viewer was read-only in
    // the workbook and could add and delete shareholders in the toolkit, on the
    // same data. resolveWorkbookPillarAccess in apps/web already resolves it in
    // this order; this is the toolkit side agreeing with it.
    const client = (await ClientModel.findOne(
      { $or: [{ clientId }, { id: clientId }] },
      { _id: 0, workspaceId: 1, createdByUserId: 1 },
    ).lean()) as { workspaceId?: string | null; createdByUserId?: string | null } | null;

    let workspaceId = client?.workspaceId ? String(client.workspaceId) : "";
    let ownerId: string | null = client?.createdByUserId ?? null;

    if (!workspaceId) {
      const session = await ProcessorSessionModel.findOne({
        clientId,
        workspaceId: { $nin: [null, ''] },
      })
        .sort({ updatedAt: -1 })
        .lean() as any;

      if (!session?.workspaceId) return true; // no workspace overlay → pass
      workspaceId = String(session.workspaceId);
      ownerId = session.createdBy ?? session.createdByUserId ?? ownerId;
    }

    if (ownerId && ownerId === userId) return true;

    const member = await WorkspaceMemberModel.findOne({
      workspaceId,
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
  } catch (err) {
    // FAIL CLOSED. This used to `return true` on any lookup error, reasoning
    // that verifyClientAccess upstream still enforced org/creator so only the
    // finer pillar overlay was skipped. But "skip the pillar overlay" is
    // exactly the escalation the overlay exists to prevent: a scoped
    // collaborator or a read-only viewer would, during a Mongo blip, be handed
    // full write access to a pillar they may not touch. A lookup we could not
    // complete is not a grant. 503 says so honestly — retryable, not a 403 that
    // would read as a settled denial — and the mutation is refused meanwhile.
    // Mirrors the web side's resolveWorkbookPillarAccess, which already falls
    // back to read-only on the same error.
    logger.warn('pillar-access lookup failed — denying (fail closed)', {
      clientId,
      pillarKey,
      requireFull,
      error: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.status(503).json({ message: 'Access check temporarily unavailable — please retry' });
    }
    return false;
  }
}

export async function verifyClientAccess(req: Request, res: Response): Promise<boolean> {
  const clientId = String(req.params.id ?? req.params.clientId ?? '');
  // FAIL CLOSED — see verifyPillarAccessInner for why an empty id must never
  // pass: it silently disabled tenancy on every nested create until 2026-07-26.
  if (!clientId || clientId === 'undefined' || clientId === 'null') {
    res.status(400).json({ message: "Client context required" });
    return false;
  }

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
  // Audit P2 #9: a personal-tenant user (no organizationId, sole creator path)
  // owns the resources they created. Prior code only checked org equality, so
  // any client created via the personal-tenant flow returned 403 to its own
  // creator on every per-entity write. Mirror verifyClientAccess: creator OR
  // shared org match is sufficient. Workspace overlay still gated by
  // verifyPillarAccess upstream where applicable.
  const sessionUserId = req.session.userId ?? null;
  const creatorId = (client as { createdByUserId?: string | null }).createdByUserId ?? null;
  if (creatorId && sessionUserId && creatorId === sessionUserId) return true;
  if (client.organizationId && req.session.organizationId && client.organizationId === req.session.organizationId) {
    return true;
  }
  res.status(403).json({ message: "Access denied" });
  return false;
}

