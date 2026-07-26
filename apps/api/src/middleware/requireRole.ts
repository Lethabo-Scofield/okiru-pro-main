import type { Request, Response, NextFunction } from 'express';
import { storage } from '../../storage.js';
import { hasAnyRole } from '../security/roles.js';

/**
 * Role guards for platform-privileged routes. These run AFTER requireAuth (or
 * check the session themselves) and look the user up to read their effective
 * role, so they must not be used on hot paths without need.
 *
 * Extracted from the copies that lived inside adminUsers.ts / adminAnalytics.ts
 * so the same enforcement can gate destructive dev/expert endpoints (sector
 * seed, template ingestion, mapping rebuilds) that were previously wide open.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  const user = await storage.getUser(userId);
  if (!user || !hasAnyRole(user, 'admin', 'super_admin')) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  const user = await storage.getUser(userId);
  if (!user || !hasAnyRole(user, 'super_admin')) {
    return res.status(403).json({ message: 'Super-admin access required' });
  }
  next();
}
