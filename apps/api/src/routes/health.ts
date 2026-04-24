import { Router, type Request as ExpressRequest, type Response } from 'express';
import { checkArangoHealth } from '../../arango/connection.js';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const router = Router();
const isProd = process.env.NODE_ENV === "production";

router.get('/health', async (_req: Request, res: Response) => {
  const arangoHealth = await checkArangoHealth();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProd ? 'production' : 'development',
    arangodb: arangoHealth,
  });
});

router.get('/', (_req: Request, res: Response) => {
  return res.json({ status: "ok", name: "Okiru Backend", version: "1.0.0" });
});

export default router;

