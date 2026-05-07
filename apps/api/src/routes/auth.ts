import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';
import { recordAudit, validateBody } from '../security/index.js';

const logger = createLogger("Auth");

// Sign-up always creates an Organization row, then the User (org / tenant layer). — Lethabo
const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(200).optional(),
  email: z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return undefined;
      return String(v).trim().toLowerCase();
    },
    z.string().email().optional(),
  ),
  organizationName: z.string().trim().min(2).max(200),
}).passthrough();

const loginSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1),
}).passthrough().refine(
  (b) => Boolean(b.username || b.email),
  { message: "Username or email is required", path: ["username"] },
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for check endpoints (more permissive)
const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { available: false, valid: false, message: "Too many requests, try again shortly" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registered organizations for subscription-based sign-up (matches web server)
const REGISTERED_ORGANIZATIONS = [
  { id: "okiru", name: "Okiru", subscriptionId: process.env.OKIRU_SUB_ID || "OKR-2026-001", emailDomain: "okiru.co.za" },
  { id: "param-solutions", name: "Param Solutions", subscriptionId: process.env.PARAM_SUB_ID || "PRM-2026-001", emailDomain: "paramsolutions.co.za" },
];

const router = Router();

// Get organizations list (for sign-up)
router.get('/organizations', (_req: Request, res: Response) => {
  res.json(REGISTERED_ORGANIZATIONS.map(o => ({ id: o.id, name: o.name, emailDomain: o.emailDomain })));
});

// Check subscription validity
router.post('/check-subscription', checkLimiter, async (req: Request, res: Response) => {
  try {
    const { organizationId, subscriptionId } = req.body;
    if (!organizationId) {
      return res.json({ valid: false, message: "Select an organization" });
    }
    const org = REGISTERED_ORGANIZATIONS.find(o => o.id === organizationId);
    if (!org) {
      return res.json({ valid: false, message: "Invalid organization" });
    }
    const trimmedSubId = typeof subscriptionId === 'string' ? subscriptionId.trim().toUpperCase() : '';
    if (!trimmedSubId) {
      return res.json({ valid: false, message: "Subscription ID is required" });
    }
    if (trimmedSubId !== org.subscriptionId) {
      return res.json({ valid: false, message: "Invalid subscription ID" });
    }
    return res.json({ valid: true, message: "Subscription verified" });
  } catch {
    return res.json({ valid: false, message: "Unable to verify right now" });
  }
});

// Check username availability
router.post('/check-username', checkLimiter, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const trimmed = typeof username === 'string' ? username.trim() : '';
    if (!trimmed) return res.json({ available: false, message: "Username is required" });
    if (trimmed.length < 3) return res.json({ available: false, message: "At least 3 characters" });
    if (trimmed.length > 50) return res.json({ available: false, message: "Must not exceed 50 characters" });
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return res.json({ available: false, message: "Only letters, numbers, dots, hyphens, underscores" });
    
    const existing = await storage.getUserByUsername(trimmed);
    if (existing) {
      return res.json({ available: false, message: "Username already taken" });
    }
    return res.json({ available: true, message: "Username is available" });
  } catch {
    return res.json({ available: false, message: "Unable to check right now" });
  }
});

// Check email availability
router.post('/check-email', checkLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const trimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!trimmed) return res.json({ available: false, message: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return res.json({ available: false, message: "Invalid email format" });
    
    const existing = await storage.getUserByUsernameOrEmail?.(trimmed) || await storage.getUserByUsername(trimmed);
    if (existing) {
      return res.json({ available: false, message: "Email already registered" });
    }
    return res.json({ available: true, message: "Email is available" });
  } catch {
    return res.json({ available: false, message: "Unable to check right now" });
  }
});

router.post('/register', authLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { username, password, fullName, email, organizationName } = req.body;

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      await recordAudit(req, {
        action: "user.register",
        resourceType: "user",
        resourceId: null,
        result: "failure",
        actorUserId: null,
        organizationId: null,
        metadata: { reason: "username_taken", username },
      });
      return res.status(409).json({ message: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const org = await storage.createOrganization({ name: organizationName });
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      fullName: fullName || username,
      email: email || null,
      organizationId: org.id,
    });

    req.session.userId = user.id;
    req.session.organizationId = org.id;

    logger.info('User registered', { userId: user.id, durationMs: Date.now() - start });

    await recordAudit(req, {
      action: "user.register",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      actorUserId: user.id,
      organizationId: org.id,
      metadata: { username, organizationId: org.id },
    });

    return res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: org.id, profilePicture: user.profilePicture },
      organization: org,
    });
  } catch (error: unknown) {
    logger.error('Register error', error);
    await recordAudit(req, {
      action: "user.register",
      resourceType: "user",
      result: "failure",
      actorUserId: null,
      organizationId: null,
      metadata: { reason: "exception" },
    });
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { username, email, password } = req.body;
    logger.info('Login attempt', { username, email, ip: req.ip });

    // Support both username and email login
    const loginIdentifier = username || email;
    logger.debug('Looking up user', { loginIdentifier });

    // Use getUserByUsernameOrEmail if available, otherwise fall back to getUserByUsername
    const getUserFn = storage.getUserByUsernameOrEmail || storage.getUserByUsername;
    const user = await getUserFn(loginIdentifier);

    if (!user) {
      logger.info('Login failed: user not found', { loginIdentifier });
      await recordAudit(req, {
        action: "user.login.failed",
        resourceType: "user",
        result: "failure",
        actorUserId: null,
        organizationId: null,
        metadata: { reason: "user_not_found", loginIdentifier },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    logger.debug('User found, checking password', { userId: user.id });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      logger.info('Login failed: password mismatch', { loginIdentifier });
      await recordAudit(req, {
        action: "user.login.failed",
        resourceType: "user",
        resourceId: user.id,
        result: "failure",
        actorUserId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: "password_mismatch" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    logger.info('User logged in', { userId: user.id, durationMs: Date.now() - start });
    req.session.userId = user.id;
    req.session.organizationId = user.organizationId || '';
    logger.debug('Session set', { userId: req.session.userId, organizationId: req.session.organizationId });

    await recordAudit(req, {
      action: "user.login",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      actorUserId: user.id,
      organizationId: user.organizationId ?? null,
    });

    return res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
    });
  } catch (error: unknown) {
    logger.error('Login error', error);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  const userId = req.session.userId ?? null;
  const orgId = req.session.organizationId ?? null;
  req.session.destroy(() => {
    res.clearCookie('okiru.web.sid', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    void recordAudit(req, {
      action: "user.logout",
      resourceType: "user",
      resourceId: userId,
      result: "success",
      actorUserId: userId,
      organizationId: orgId,
    });
    res.json({ message: "Logged out" });
  });
});

router.get('/me', async (req: Request, res: Response) => {
  logger.debug('/me called', { userId: req.session.userId, sessionID: req.sessionID });
  if (!req.session.userId) {
    logger.debug('/me: No session userId, returning 401');
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    logger.warn('/me: User not found in database', { userId: req.session.userId });
    return res.status(401).json({ message: "User not found" });
  }
  logger.debug('/me: Returning user', { userId: user.id });
  return res.json({
    user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
  });
});

export default router;
