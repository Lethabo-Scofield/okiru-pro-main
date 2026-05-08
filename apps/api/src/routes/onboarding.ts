import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Onboarding");
const router = Router();

const MAX_LEN = 500;

function sanitizeStr(v: unknown, max = MAX_LEN): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function sanitizeArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 50)
    .map((x) => x.slice(0, MAX_LEN));
}

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.session.userId!);
    const profile = await storage.getCompanyProfileByUserId(userId);
    // 200 + profile:null avoids browser console "404 Not Found" noise; clients treat empty profile as incomplete.
    if (!profile) return res.status(200).json({ profile: null, message: "Onboarding not completed" });
    return res.json({ profile });
  } catch (error: unknown) {
    logger.error('GET /me error', error);
    return res.status(500).json({ message: "Failed to load onboarding profile" });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.session.userId!);
    const body = req.body ?? {};

    const companyName = sanitizeStr(body.companyName);
    if (!companyName) {
      return res.status(400).json({ message: "Company name is required" });
    }

    const data = {
      companyName,
      role: sanitizeStr(body.role),
      beeLevel: sanitizeStr(body.beeLevel),
      employeeRange: sanitizeStr(body.employeeRange),
      industry: sanitizeStr(body.industry),
      industryOther: sanitizeStr(body.industryOther),
      annualRevenue: sanitizeStr(body.annualRevenue),
      acquisitionSource: sanitizeStr(body.acquisitionSource),
      acquisitionSourceOther: sanitizeStr(body.acquisitionSourceOther),
      toolsUsed: sanitizeArr(body.toolsUsed),
      toolsUsedOther: sanitizeStr(body.toolsUsedOther),
      biggestChallenge: sanitizeStr(body.biggestChallenge, 2000),
    };

    const profile = await storage.upsertCompanyProfile(userId, data);
    logger.info('Onboarding saved', { userId, companyName: profile.companyName });
    return res.json({ profile });
  } catch (error: unknown) {
    logger.error('POST / error', error);
    return res.status(500).json({ message: "Failed to save onboarding profile" });
  }
});

export default router;
