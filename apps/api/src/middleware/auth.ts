import type { Request as ExpressRequest, Response, NextFunction } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { ClientModel } from '../../models.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
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

