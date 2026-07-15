import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that rejects unauthenticated requests.
 * Checks for req.session.userId set by the login flow.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.session as any)?.userId;
  if (userId) {
    next();
    return;
  }
  // Offline-demo identity forwarded by the web server's proxy (Mongo-less
  // local dev only — the proxy strips any client-supplied copy of this header
  // before setting it, and never sets it in production, so it cannot become
  // an auth bypass). Same pattern as adminAnalytics.ts.
  if (
    process.env.NODE_ENV !== 'production' &&
    req.headers['x-okiru-demo-user'] === 'demo-offline-user'
  ) {
    next();
    return;
  }
  res.status(401).json({ message: 'Not authenticated' });
}
