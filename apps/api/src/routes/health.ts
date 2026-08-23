import { Router, type Request as ExpressRequest, type Response } from 'express';
import { mongoose } from '../../db.js';
import { checkCertificateBlobStorage } from '../services/azureCertStorage.js';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const router = Router();
const isProd = process.env.NODE_ENV === "production";

// Liveness probe — returns 200 unless the process is misbehaving. Used by k8s
// liveness probes, which restart the pod on failure. We deliberately DON'T fail
// liveness on MongoDB outages (restarting the pod won't fix downstream).
router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProd ? 'production' : 'development',
  });
});

// Readiness probe — 503 when a critical dependency is down so k8s takes the pod
// out of rotation (and rollouts stall visibly) instead of probes silently staying
// green during a DB/secrets outage like the one logged in autoresearch/RISKS.md.
router.get('/ready', async (_req: Request, res: Response) => {
  const mongoState = mongoose.connection?.readyState; // 1 = connected
  const mongoOk = mongoState === 1;
  let mongoPingMs: number | null = null;
  if (mongoOk) {
    try {
      const start = Date.now();
      await mongoose.connection.db?.admin().ping();
      mongoPingMs = Date.now() - start;
    } catch {
      // ping failed → treat as not ready
      return res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        mongo: { connected: true, ping: 'failed' },
      });
    }
  }
  const blobStorage = await checkCertificateBlobStorage();

  const body = {
    status: mongoOk ? 'ok' : 'not_ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProd ? 'production' : 'development',
    mongo: { connected: mongoOk, readyState: mongoState, pingMs: mongoPingMs },
    blob_storage: blobStorage,
  };
  return res.status(mongoOk ? 200 : 503).json(body);
});

router.get('/', (_req: Request, res: Response) => {
  return res.json({ status: "ok", name: "Okiru Backend", version: "1.0.0" });
});

export default router;

