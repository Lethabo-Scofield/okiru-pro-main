import type { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/apiResponse.js';

export function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PARSER_ADMIN_TOKEN;
  if (!expected && process.env.NODE_ENV !== 'production') return next();
  if (!expected) return res.status(503).json(fail('PARSER_ADMIN_TOKEN is required in production', 'ADMIN_TOKEN_NOT_CONFIGURED'));

  const actual = req.header('x-parser-admin-token') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (actual !== expected) return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  next();
}
