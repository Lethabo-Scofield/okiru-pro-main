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

const router = Router();

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
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.organizationId = user.organizationId || '';

    return res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
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
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }
  return res.json({
    user: { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, profilePicture: user.profilePicture },
  });
});

export default router;

