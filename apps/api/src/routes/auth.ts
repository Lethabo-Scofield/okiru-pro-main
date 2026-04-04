import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { storage } from '../../storage.js';

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

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, organizationName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ message: "Username must be 3-50 characters" });
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const org = await storage.createOrganization({ name: organizationName || `${username}'s Organization` });
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      fullName: fullName || username,
      email: email || null,
      organizationId: org.id,
    });

    req.session.userId = user.id;
    req.session.organizationId = org.id;

    return res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: org.id, profilePicture: user.profilePicture },
      organization: org,
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    console.log(`[AuthRoute] Login attempt: username=${username}, email=${email}, ip=${req.ip}`);
    
    if ((!username && !email) || !password) {
      console.log(`[AuthRoute] Login rejected: missing credentials`);
      return res.status(400).json({ message: "Username/email and password are required" });
    }

    // Support both username and email login
    const loginIdentifier = username || email;
    console.log(`[AuthRoute] Looking up user: ${loginIdentifier}`);
    
    // Use getUserByUsernameOrEmail if available, otherwise fall back to getUserByUsername
    const getUserFn = storage.getUserByUsernameOrEmail || storage.getUserByUsername;
    const user = await getUserFn(loginIdentifier);
    
    if (!user) {
      console.log(`[AuthRoute] Login failed: user ${loginIdentifier} not found in database`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log(`[AuthRoute] User found: id=${user.id}, checking password...`);
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log(`[AuthRoute] Login failed: password mismatch for ${loginIdentifier}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log(`[AuthRoute] Login successful: userId=${user.id}, setting session...`);
    req.session.userId = user.id;
    req.session.organizationId = user.organizationId || '';
    console.log(`[AuthRoute] Session set: userId=${req.session.userId}, orgId=${req.session.organizationId}`);

    return res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
    });
  } catch (error: unknown) {
    console.error('[AuthRoute] Login error:', error);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie('okiru.sid');
    res.json({ message: "Logged out" });
  });
});

router.get('/me', async (req: Request, res: Response) => {
  console.log(`[AuthRoute] /me called: session.userId=${req.session.userId}, sessionID=${req.sessionID}`);
  if (!req.session.userId) {
    console.log(`[AuthRoute] /me: No session userId, returning 401`);
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    console.log(`[AuthRoute] /me: User ${req.session.userId} not found in database`);
    return res.status(401).json({ message: "User not found" });
  }
  console.log(`[AuthRoute] /me: Returning user ${user.id}`);
  return res.json({
    user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
  });
});

export default router;
