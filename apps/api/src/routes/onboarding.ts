import { Router, type Request as ExpressRequest, type Response, type NextFunction } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../logger.js';
import { mongoose } from '../../db.js';

const logger = createLogger("Onboarding");
const router = Router();

const MAX_LEN = 500;

/** Saved when user skips company onboarding so gating treats them as “complete”. */
export const ONBOARDING_SKIPPED_COMPANY_NAME =
  "— Company profile skipped (add details anytime in Settings)";

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

function requireMongo(_req: Request, res: Response, next: NextFunction) {
  if (mongoose.connection.readyState !== 1) {
    logger.warn("Onboarding: MongoDB not ready", { readyState: mongoose.connection.readyState });
    return res.status(503).json({ message: "Database temporarily unavailable. Try again in a moment." });
  }
  next();
}

router.get('/me', requireAuth, requireMongo, async (req: Request, res: Response) => {
  try {
    const userId = String(req.session.userId!);
    const profile = await storage.getCompanyProfileByUserId(userId);
    // 200 + profile:null avoids browser console "404 Not Found" noise; clients treat empty profile as incomplete.
    if (!profile) return res.status(200).json({ profile: null, message: "Onboarding not completed" });
    return res.json({ profile });
  } catch (error: unknown) {
    logger.error("GET /me error", error);
    const rid = res.getHeader("x-request-id");
    return res.status(500).json({
      message: "Failed to load onboarding profile",
      ...(typeof rid === "string" ? { requestId: rid } : {}),
    });
  }
});

router.post('/skip', requireAuth, requireMongo, async (req: Request, res: Response) => {
  try {
    const userId = String(req.session.userId!);
    const profile = await storage.upsertCompanyProfile(userId, {
      companyName: ONBOARDING_SKIPPED_COMPANY_NAME,
      role: null,
      beeLevel: null,
      employeeRange: null,
      industry: null,
      industryOther: null,
      annualRevenue: null,
      acquisitionSource: null,
      acquisitionSourceOther: null,
      toolsUsed: [],
      toolsUsedOther: null,
      biggestChallenge: null,
    });
    logger.info("Onboarding skipped", { userId });
    return res.json({ profile, skipped: true });
  } catch (error: unknown) {
    logger.error("POST /skip error", error);
    const rid = res.getHeader("x-request-id");
    return res.status(500).json({
      message: "Failed to skip onboarding",
      ...(typeof rid === "string" ? { requestId: rid } : {}),
    });
  }
});

router.post('/', requireAuth, requireMongo, async (req: Request, res: Response) => {
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
    logger.error("POST / error", error);
    const rid = res.getHeader("x-request-id");
    return res.status(500).json({
      message: "Failed to save onboarding profile",
      ...(typeof rid === "string" ? { requestId: rid } : {}),
    });
  }
});

export default router;
