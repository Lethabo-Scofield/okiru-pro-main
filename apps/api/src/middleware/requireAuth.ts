import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that rejects unauthenticated requests.
 * Checks for req.session.userId set by the login flow.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }
  next();
}
