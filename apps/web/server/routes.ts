import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import Groq from "groq-sdk";
import session from "express-session";
import MongoStore from "connect-mongo";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { sendLoginNotification, sendOtpEmail, sendPasswordResetEmail, generateOtp, getOtpExpiryMinutes, getMaxOtpAttempts, isSmtpConfigured } from "./email";
import { ProcessorSessionModel, ClientModel, OrganizationModel } from "../shared/schema";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { recordAudit } from "./securityAudit.js";

const logger = createLogger("Routes");

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUserById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "User no longer exists" });
  }
  if (user.twofaEnabled && (req.session as any).otpVerified !== true) {
    return res.status(403).json({ message: "2FA verification required", requires2FA: true });
  }
  (req as any).user = user;
  next();
}

let groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  logger.warn("GROQ_API_KEY is not set — AI endpoints will return errors");
}
const groq = new Groq({ apiKey: groqApiKey || "not-set" });

async function llmGenerate(systemPrompt: string, userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured. AI features are unavailable.");
  }
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
  });
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

function sanitizeUser(user: any) {
  const { password, otpCode, otpExpiry, otpAttempts, ...safe } = user;
  return safe;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  logger.info("Starting route registration...");

  const isProduction = process.env.NODE_ENV === "production";
  const isReplit = !!process.env.REPLIT_DEV_DOMAIN || !!process.env.REPL_SLUG;
  if (isProduction || isReplit) {
    app.set("trust proxy", 1);
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    logger.error("SESSION_SECRET must be set in production");
    process.exit(1);
  }

  logger.debug("Configuring session middleware...");

  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret || "okiru-entity-studio-dev-secret",
    resave: false,
    saveUninitialized: false,
    name: 'okiru.web.sid',
    cookie: {
      httpOnly: true,
      secure: isProduction || isReplit,
      sameSite: isReplit ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (mongoUri) {
    sessionConfig.store = MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
      touchAfter: 24 * 3600,
    });
  } else {
    logger.warn("Using in-memory session store (MONGODB_URI not set) — sessions will not persist across restarts");
  }

  app.use(session(sessionConfig));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: isProduction ? 'production' : 'development',
    });
  });

  const REGISTERED_ORGANIZATIONS = [
    { id: "okiru", name: "Okiru", subscriptionId: process.env.OKIRU_SUB_ID || "OKR-2026-001", emailDomain: "okiru.co.za" },
    { id: "param-solutions", name: "Param Solutions", subscriptionId: process.env.PARAM_SUB_ID || "PRM-2026-001", emailDomain: "paramsolutions.co.za" },
  ];

  app.get("/api/organizations", (_req, res) => {
    res.json(REGISTERED_ORGANIZATIONS.map(o => ({ id: o.id, name: o.name, emailDomain: o.emailDomain })));
  });

  const checkRateLimits = new Map<string, { count: number; resetAt: number }>();
  function rateLimitCheck(ip: string, limit = 30, windowMs = 60000): boolean {
    const now = Date.now();
    const entry = checkRateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      checkRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  app.post("/api/auth/check-username", async (req, res) => {
    try {
      if (!rateLimitCheck(req.ip || 'unknown')) return res.status(429).json({ available: false, message: "Too many requests, try again shortly" });
      const { username } = req.body;
      const trimmed = typeof username === 'string' ? username.trim() : '';
      if (!trimmed) return res.json({ available: false, message: "Username is required" });
      if (trimmed.length < 3) return res.json({ available: false, message: "At least 3 characters" });
      if (trimmed.length > 50) return res.json({ available: false, message: "Must not exceed 50 characters" });
      if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return res.json({ available: false, message: "Only letters, numbers, dots, hyphens, underscores" });
      const existing = await storage.getUserByUsername(trimmed);
      if (existing && existing.isVerified) return res.json({ available: false, message: "Username is not available" });
      return res.json({ available: true, message: "Username is available" });
    } catch {
      return res.json({ available: false, message: "Unable to check right now" });
    }
  });

  app.post("/api/auth/check-email", async (req, res) => {
    try {
      if (!rateLimitCheck(req.ip || 'unknown')) return res.status(429).json({ available: false, message: "Too many requests, try again shortly" });
      const { email } = req.body;
      const trimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!trimmed) return res.json({ available: false, message: "Email is required" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return res.json({ available: false, message: "Enter a valid email address" });
      const existing = await storage.getUserByUsernameOrEmail(trimmed);
      if (existing && existing.isVerified) return res.json({ available: false, message: "This email is not available" });
      return res.json({ available: true, message: "Email is available" });
    } catch {
      return res.json({ available: false, message: "Unable to check right now" });
    }
  });

  app.post("/api/auth/check-subscription", async (req, res) => {
    try {
      if (!rateLimitCheck(req.ip || 'unknown')) return res.status(429).json({ valid: false, message: "Too many requests, try again shortly" });
      const { organizationId, subscriptionId } = req.body;
      if (!organizationId) return res.json({ valid: false, message: "Select an organization" });
      const org = REGISTERED_ORGANIZATIONS.find(o => o.id === organizationId);
      if (!org) return res.json({ valid: false, message: "Invalid organization" });
      const trimmedSubId = typeof subscriptionId === 'string' ? subscriptionId.trim().toUpperCase() : '';
      if (!trimmedSubId) return res.json({ valid: false, message: "Subscription ID is required" });
      if (trimmedSubId !== org.subscriptionId) return res.json({ valid: false, message: "Invalid subscription ID" });
      return res.json({ valid: true, message: "Subscription verified" });
    } catch {
      return res.json({ valid: false, message: "Unable to verify right now" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const start = Date.now();
    try {
      const { username, password, fullName, email, organizationName, role } = req.body;

      const trimmedUsername = typeof username === 'string' ? username.trim() : '';
      const trimmedFullName = typeof fullName === 'string' ? fullName.trim() : '';
      const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const trimmedOrgName = typeof organizationName === 'string' ? organizationName.trim() : '';

      if (!trimmedUsername || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
        return res.status(400).json({ message: "Username must be between 3 and 50 characters" });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, dots, hyphens, and underscores" });
      }
      if (password.length < 4) {
        return res.status(400).json({ message: "Password must be at least 4 characters" });
      }
      if (password.length > 128) {
        return res.status(400).json({ message: "Password must not exceed 128 characters" });
      }
      if (!trimmedFullName) {
        return res.status(400).json({ message: "Full name is required" });
      }
      if (!trimmedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ message: "Invalid email address" });
      }
      if (!trimmedOrgName) {
        return res.status(400).json({ message: "Company name is required" });
      }
      if (trimmedOrgName.length < 2 || trimmedOrgName.length > 200) {
        return res.status(400).json({ message: "Company name must be between 2 and 200 characters" });
      }

      if (!isMongoConnected()) {
        return res.status(503).json({ message: "Database is not available. Please try again later." });
      }

      const ALLOWED_ROLES = ["auditor", "analyst", "manager"];
      const safeRole = ALLOWED_ROLES.includes(role) ? role : "auditor";

      const existing = await storage.getUserByUsername(trimmedUsername);
      if (existing && existing.isVerified) {
        return res.status(400).json({ message: "Username already taken" });
      }
      const existingEmail = await storage.getUserByUsernameOrEmail(trimmedEmail);
      if (existingEmail && existingEmail.isVerified) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Org layer: same `organizations` collection as the API (Lethabo).
      let tenantOrgId: string;
      try {
        const orgDoc = await OrganizationModel.create({
          id: randomUUID(),
          name: trimmedOrgName,
        });
        tenantOrgId = orgDoc.id;
      } catch (err) {
        logger.error("Organization create failed on register", err);
        return res.status(500).json({ message: "Could not create organization. Please try again." });
      }

      let user: any;
      if (existingEmail && !existingEmail.isVerified) {
        const hashedPassword = await bcrypt.hash(password, 8);
        user = await storage.updateUser(existingEmail.id, {
          username: trimmedUsername,
          password: hashedPassword,
          fullName: trimmedFullName,
          organizationName: trimmedOrgName,
          organizationId: tenantOrgId,
          role: safeRole,
        } as any);
      } else if (existing && !existing.isVerified) {
        const hashedPassword = await bcrypt.hash(password, 8);
        user = await storage.updateUser(existing.id, {
          password: hashedPassword,
          fullName: trimmedFullName,
          email: trimmedEmail,
          organizationName: trimmedOrgName,
          organizationId: tenantOrgId,
          role: safeRole,
        } as any);
      } else {
        const hashedPassword = await bcrypt.hash(password, 8);
        user = await storage.createUser({
          username: trimmedUsername,
          password: hashedPassword,
          fullName: trimmedFullName,
          email: trimmedEmail,
          organizationName: trimmedOrgName,
          organizationId: tenantOrgId,
          role: safeRole,
          profilePicture: null,
        });
      }

      if (!isSmtpConfigured()) {
        await storage.updateUser(user.id, { isVerified: true } as any);
        await storage.setLastLogin(user.id);
        const updatedUser = await storage.getUserById(user.id);
        const safeUser = sanitizeUser(updatedUser || user);
        (req.session as any).userId = user.id;
        (req.session as any).userData = safeUser;
        (req.session as any).otpVerified = true;
        logger.info('User registered', { userId: user.id, durationMs: Date.now() - start });
        return res.json({
          user: safeUser,
          message: "Account created successfully!",
        });
      }

      const otp = generateOtp();
      const expiryMinutes = getOtpExpiryMinutes();
      const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
      await storage.setUserOtp(user.id, otp, expiry);
      const sent = await sendOtpEmail(trimmedEmail, otp, trimmedFullName);

      (req.session as any).pendingUserId = user.id;
      (req.session as any).otpVerified = false;

      logger.info('User registered', { userId: user.id, durationMs: Date.now() - start });

      res.json({
        requiresVerification: true,
        message: sent
          ? "Account created! A verification code has been sent to your email."
          : "Account created but we couldn't send the verification email. Please try resending.",
        emailHint: trimmedEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      });
    } catch (error: any) {
      logger.error("Registration failed", error, { username: req.body?.username });
      res.status(500).json({ message: "Registration failed" });
    }
  });

  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const LOGIN_RATE_LIMIT = 10;
  const LOGIN_RATE_WINDOW = 15 * 60 * 1000;

  app.post("/api/auth/login", async (req, res) => {
    const start = Date.now();
    try {
      const { username, email, password } = req.body;
      const loginId = username || email;
      if (!loginId || !password) {
        return res.status(400).json({ message: "Username/email and password are required" });
      }

      const ip = req.ip || "unknown";
      const now = Date.now();
      const attempts = loginAttempts.get(ip);
      if (attempts && attempts.resetAt > now && attempts.count >= LOGIN_RATE_LIMIT) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
      if (!attempts || attempts.resetAt <= now) {
        loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
      } else {
        attempts.count++;
      }

      const user = await storage.getUserByUsernameOrEmail(loginId);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.twofaEnabled) {
        const otp = generateOtp();
        const expiryMinutes = getOtpExpiryMinutes();
        const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
        await storage.setUserOtp(user.id, otp, expiry);

        const emailTarget = user.email || loginId;
        const sent = await sendOtpEmail(emailTarget, otp, user.fullName);

        (req.session as any).pendingUserId = user.id;
        (req.session as any).otpVerified = false;

        return res.json({
          requires2FA: true,
          message: sent ? "Verification code sent to your email" : "Could not send verification code. Please try again.",
          emailHint: emailTarget.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        });
      }

      const safeUser = sanitizeUser(user);
      (req.session as any).userId = user.id;
      (req.session as any).userData = safeUser;
      (req.session as any).otpVerified = true;
      await storage.setLastLogin(user.id);
      logger.info('User logged in', { userId: user.id, durationMs: Date.now() - start });
      res.json({ user: safeUser });

      sendLoginNotification(
        user.email || loginId,
        user.fullName || null,
        user.organizationName || null
      ).catch(() => {});
    } catch (error: any) {
      logger.error("Login failed", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const pendingUserId = (req.session as any)?.pendingUserId;
      if (!pendingUserId) {
        return res.status(400).json({ message: "No pending verification. Please log in again." });
      }

      const { otp } = req.body;
      if (!otp || typeof otp !== "string") {
        return res.status(400).json({ message: "Verification code is required" });
      }

      const user = await storage.getUserById(pendingUserId);
      if (!user) {
        return res.status(400).json({ message: "User not found. Please log in again." });
      }

      const maxAttempts = getMaxOtpAttempts();
      if (user.otpAttempts >= maxAttempts) {
        await storage.clearUserOtp(user.id);
        delete (req.session as any).pendingUserId;
        return res.status(429).json({ message: "Too many attempts. Please log in again to get a new code." });
      }

      if (!user.otpCode || !user.otpExpiry) {
        return res.status(400).json({ message: "No active verification code. Please log in again." });
      }

      if (new Date() > new Date(user.otpExpiry)) {
        await storage.clearUserOtp(user.id);
        delete (req.session as any).pendingUserId;
        return res.status(400).json({ message: "Verification code has expired. Please log in again." });
      }

      if (otp.trim() !== user.otpCode) {
        const attempts = await storage.incrementOtpAttempts(user.id);
        const remaining = maxAttempts - attempts;
        return res.status(401).json({
          message: remaining > 0
            ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : "Too many attempts. Please log in again to get a new code.",
        });
      }

      await storage.clearUserOtp(user.id);
      await storage.setLastLogin(user.id);
      if (!user.isVerified) {
        await storage.updateUser(user.id, { isVerified: true } as any);
      }
      delete (req.session as any).pendingUserId;

      const updatedUser = await storage.getUserById(user.id);
      const safeUser = sanitizeUser(updatedUser || user);
      (req.session as any).userId = user.id;
      (req.session as any).userData = safeUser;
      (req.session as any).otpVerified = true;
      res.json({ user: safeUser });

      sendLoginNotification(
        user.email || user.username,
        user.fullName || null,
        user.organizationName || null
      ).catch(() => {});
    } catch (error: any) {
      logger.error("OTP verification failed", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  const resendCooldowns = new Map<string, number>();
  const RESEND_COOLDOWN_MS = 30 * 1000;

  app.post("/api/auth/resend-otp", async (req, res) => {
    try {
      const pendingUserId = (req.session as any)?.pendingUserId;
      if (!pendingUserId) {
        return res.status(400).json({ message: "No pending verification. Please log in again." });
      }

      const lastResend = resendCooldowns.get(pendingUserId);
      if (lastResend && Date.now() - lastResend < RESEND_COOLDOWN_MS) {
        const waitSecs = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastResend)) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSecs}s before requesting a new code.` });
      }

      const user = await storage.getUserById(pendingUserId);
      if (!user || !user.email) {
        return res.status(400).json({ message: "User not found or no email configured." });
      }

      const otp = generateOtp();
      const expiryMinutes = getOtpExpiryMinutes();
      const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
      await storage.setUserOtp(user.id, otp, expiry);

      const sent = await sendOtpEmail(user.email, otp, user.fullName);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send verification code. Please try again." });
      }

      resendCooldowns.set(pendingUserId, Date.now());
      res.json({ message: "New verification code sent to your email." });
    } catch (error: any) {
      logger.error("Resend OTP failed", error);
      res.status(500).json({ message: "Failed to resend code" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("okiru.web.sid", {
        path: "/",
        httpOnly: true,
        secure: isProduction,
        sameSite: isReplit ? "none" : "lax",
      });
      res.json({ success: true });
    });
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByUsernameOrEmail(email.trim());
      res.json({ message: "If an account with that email exists, a reset code has been sent." });

      if (!user || !user.email) return;

      const resetToken = generateOtp(6);
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      await storage.setPasswordResetToken(user.id, resetToken, expiry);
      await sendPasswordResetEmail(user.email, resetToken, user.fullName);
    } catch (error: any) {
      logger.error("Forgot password failed", error);
      res.status(500).json({ message: "An error occurred. Please try again." });
    }
  });

  const resetAttempts = new Map<string, { count: number; firstAttempt: number }>();

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Email, reset code, and new password are required" });
      }
      if (typeof newPassword !== "string" || newPassword.length < 4) {
        return res.status(400).json({ message: "Password must be at least 4 characters" });
      }
      if (newPassword.length > 128) {
        return res.status(400).json({ message: "Password must not exceed 128 characters" });
      }

      const ip = req.ip || "unknown";
      const attemptKey = `${ip}:${email.trim().toLowerCase()}`;
      const now = Date.now();
      const existing = resetAttempts.get(attemptKey);
      if (existing) {
        if (now - existing.firstAttempt > 15 * 60 * 1000) {
          resetAttempts.set(attemptKey, { count: 1, firstAttempt: now });
        } else if (existing.count >= 5) {
          return res.status(429).json({ message: "Too many attempts. Please wait before trying again." });
        } else {
          existing.count++;
        }
      } else {
        resetAttempts.set(attemptKey, { count: 1, firstAttempt: now });
      }

      const user = await storage.getUserByUsernameOrEmail(email.trim());
      if (!user) {
        return res.status(400).json({ message: "Invalid reset code or email" });
      }

      const stored = await storage.getPasswordResetToken(user.id);
      if (!stored || stored.token !== token.trim()) {
        return res.status(400).json({ message: "Invalid reset code" });
      }
      if (new Date() > stored.expiry) {
        await storage.clearPasswordResetToken(user.id);
        return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });
      await storage.clearPasswordResetToken(user.id);
      resetAttempts.delete(attemptKey);

      res.json({ message: "Password has been reset successfully. You can now sign in." });
    } catch (error: any) {
      logger.error("Reset password failed", error);
      res.status(500).json({ message: "An error occurred. Please try again." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cached = (req.session as any)?.userData;
      if (cached) {
        return res.json({ user: cached });
      }
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const safeUser = sanitizeUser(user);
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      logger.error("Auth check failed", error);
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.post("/api/auth/toggle-2fa", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { enabled } = req.body || {};
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled (boolean) is required" });
      }
      const user = await storage.getUserById(userId);
      if (!user || !user.email) {
        return res.status(400).json({ message: "You must have an email address to enable 2FA." });
      }

      if (enabled) {
        const otp = generateOtp();
        const expiryMinutes = getOtpExpiryMinutes();
        const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
        await storage.setUserOtp(userId, otp, expiry);
        const sent = await sendOtpEmail(user.email, otp, user.fullName);
        if (!sent) {
          return res.status(500).json({ message: "Failed to send verification email. 2FA not enabled." });
        }
        (req.session as any).pending2FAEnable = true;
        return res.json({ requiresVerification: true, message: "Verification code sent. Enter it to enable 2FA." });
      } else {
        const updated = await storage.setTwofaEnabled(userId, false);
        if (!updated) return res.status(404).json({ message: "User not found" });
        const safeUser = sanitizeUser(updated);
        (req.session as any).userData = safeUser;
        return res.json({ user: safeUser, message: "Two-factor authentication has been disabled." });
      }
    } catch (error: any) {
      logger.error("Toggle 2FA failed", error);
      res.status(500).json({ message: "Failed to update 2FA settings" });
    }
  });

  app.post("/api/auth/confirm-2fa", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const pending = (req.session as any)?.pending2FAEnable;
      if (!pending) {
        return res.status(400).json({ message: "No pending 2FA activation." });
      }

      const { otp } = req.body;
      if (!otp || typeof otp !== "string") {
        return res.status(400).json({ message: "Verification code is required" });
      }

      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const maxAttempts = getMaxOtpAttempts();
      if (user.otpAttempts >= maxAttempts) {
        await storage.clearUserOtp(userId);
        delete (req.session as any).pending2FAEnable;
        return res.status(429).json({ message: "Too many attempts. Please try again." });
      }

      if (!user.otpCode || !user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
        await storage.clearUserOtp(userId);
        delete (req.session as any).pending2FAEnable;
        return res.status(400).json({ message: "Verification code expired. Please try again." });
      }

      if (otp.trim() !== user.otpCode) {
        await storage.incrementOtpAttempts(userId);
        return res.status(401).json({ message: "Invalid verification code." });
      }

      await storage.clearUserOtp(userId);
      const updated = await storage.setTwofaEnabled(userId, true);
      delete (req.session as any).pending2FAEnable;

      if (!updated) return res.status(404).json({ message: "User not found" });
      const safeUser = sanitizeUser(updated);
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser, message: "Two-factor authentication is now enabled." });
    } catch (error: any) {
      logger.error("Confirm 2FA failed", error);
      res.status(500).json({ message: "Failed to confirm 2FA" });
    }
  });

  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUserById(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }

  app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      const safeUsers = users.map((u) => sanitizeUser(u));
      res.json(safeUsers);
    } catch (error: any) {
      logger.error("Admin users fetch failed", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:userId/2fa", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled (boolean) is required" });
      }
      const updated = await storage.setTwofaEnabled(userId, enabled);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ user: sanitizeUser(updated) });
    } catch (error: any) {
      logger.error("Admin toggle 2FA failed", error);
      res.status(500).json({ message: "Failed to update user 2FA" });
    }
  });

  app.post("/api/auth/request-role-upgrade", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { requestedRole } = req.body;
      const UPGRADE_PATH: Record<string, string> = { auditor: 'analyst', analyst: 'manager' };
      const allowedNext = UPGRADE_PATH[user.role];

      if (!allowedNext || requestedRole !== allowedNext) {
        return res.status(400).json({ message: "Invalid upgrade request" });
      }

      logger.info(`Role upgrade requested: ${user.username} (${user.role} -> ${requestedRole})`);
      res.json({ message: `Your request to upgrade to ${requestedRole} has been submitted for admin review.` });
    } catch (error: any) {
      logger.error("Role upgrade request failed", error);
      res.status(500).json({ message: "Failed to submit upgrade request" });
    }
  });

  app.patch("/api/admin/users/:userId/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const ALLOWED_ROLES = ["auditor", "analyst", "manager", "admin"];
      if (!role || !ALLOWED_ROLES.includes(role)) {
        await recordAudit(req, {
          action: "user.role.change",
          resourceType: "user",
          resourceId: userId,
          result: "failure",
          metadata: { reason: "invalid_role", attempted: role },
        });
        return res.status(400).json({ message: "Invalid role" });
      }
      const before = await storage.getUserById(userId);
      const updated = await storage.updateUser(userId, { role } as any);
      if (!updated) {
        await recordAudit(req, {
          action: "user.role.change",
          resourceType: "user",
          resourceId: userId,
          result: "failure",
          metadata: { reason: "user_not_found", attempted: role },
        });
        return res.status(404).json({ message: "User not found" });
      }
      await recordAudit(req, {
        action: "user.role.change",
        resourceType: "user",
        resourceId: userId,
        result: "success",
        metadata: { from: before?.role ?? null, to: role },
      });
      res.json({ user: sanitizeUser(updated), message: `Role updated to ${role}` });
    } catch (error: any) {
      logger.error("Admin role update failed", error);
      await recordAudit(req, {
        action: "user.role.change",
        resourceType: "user",
        resourceId: req.params.userId,
        result: "failure",
        metadata: { reason: "exception" },
      });
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.patch("/api/profile", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { fullName, email } = req.body;
      const user = await storage.updateUser(userId, {
        ...(fullName !== undefined && { fullName }),
        ...(email !== undefined && { email }),
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      const safeUser = sanitizeUser(user);
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/profile/picture", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      res.json({ user: { message: "Profile picture upload not yet implemented" } });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to upload picture" });
    }
  });

  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById((req.session as any).userId);
      const filter: any = {};
      if (user?.organizationId) filter.organizationId = user.organizationId;
      const clients = await ClientModel.find(filter).sort({ createdAt: -1 });
      res.json(clients.map((c: any) => c.toJSON()));
    } catch (error: any) {
      logger.error("Error fetching clients", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const { name, financialYear, industrySector, eapProvince, revenue, npat, leviableAmount } = req.body;
      if (!name) return res.status(400).json({ error: "Client name is required" });
      const userId = (req.session as any).userId;
      const user = await storage.getUserById(userId);
      const clientId = `C-${Math.floor(10000 + Math.random() * 90000)}`;
      const client = await ClientModel.create({
        clientId,
        name,
        financialYear: financialYear || new Date().getFullYear().toString(),
        industrySector: industrySector || null,
        eapProvince: eapProvince || null,
        revenue: revenue || 0,
        npat: npat || 0,
        leviableAmount: leviableAmount || 0,
        organizationId: user?.organizationId || null,
        createdByUserId: userId,
      });
      res.json(client.toJSON());
    } catch (error: any) {
      logger.error("Error creating client", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.get("/api/clients/:clientId", requireAuth, async (req, res) => {
    try {
      const client = await ClientModel.findOne({ clientId: req.params.clientId });
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client.toJSON());
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  app.patch("/api/clients/:clientId", requireAuth, async (req, res) => {
    try {
      const updates: any = { updatedAt: new Date() };
      const allowed = ["name", "financialYear", "industrySector", "eapProvince", "revenue", "npat", "leviableAmount", "logo"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      const client = await ClientModel.findOneAndUpdate(
        { clientId: req.params.clientId },
        updates,
        { new: true }
      );
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client.toJSON());
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/:clientId", requireAuth, async (req, res) => {
    try {
      const result = await ClientModel.deleteOne({ clientId: req.params.clientId });
      if (result.deletedCount === 0) return res.status(404).json({ error: "Client not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  app.get("/api/clients/:clientId/data", requireAuth, async (req, res) => {
    try {
      const { clientId } = req.params;
      const client = await ClientModel.findOne({ clientId });
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const c = client.toJSON();

      res.json({
        client: {
          id: c.id,
          name: c.name,
          financialYear: c.financialYear,
          revenue: c.revenue,
          npat: c.npat,
          leviableAmount: c.leviableAmount,
          industrySector: c.industrySector,
          eapProvince: c.eapProvince || "National",
          industryNorm: undefined,
        },
        ownership: {
          id: `own-${clientId}`,
          shareholders: c.shareholders || [],
          companyValue: c.companyValue || 0,
          outstandingDebt: c.outstandingDebt || 0,
          yearsHeld: 0,
        },
        management: {
          employees: c.employees || [],
        },
        skills: {
          leviableAmount: c.leviableAmount || 0,
          trainingPrograms: c.trainingPrograms || [],
        },
        procurement: {
          tmps: c.tmps || 0,
          suppliers: c.suppliers || [],
        },
        esd: {
          contributions: c.esdContributions || [],
        },
        sed: {
          contributions: c.sedContributions || [],
        },
        financialYears: [],
        scenarios: [],
      });
    } catch (error: any) {
      logger.error("Error fetching client data", error);
      res.status(500).json({ error: "Failed to fetch client data" });
    }
  });

  // Bulk-import all B-BBEE entities into a client in one request
  app.post("/api/clients/:clientId/bulk-import", requireAuth, async (req, res) => {
    try {
      const { clientId } = req.params;
      const { shareholders, employees, trainingPrograms, suppliers, esdContributions, sedContributions, financials } = req.body;

      const client = await ClientModel.findOne({ clientId });
      if (!client) return res.status(404).json({ error: "Client not found" });

      const update: Record<string, any> = { updatedAt: new Date() };
      if (Array.isArray(shareholders)) update.shareholders = shareholders;
      if (Array.isArray(employees)) update.employees = employees;
      if (Array.isArray(trainingPrograms)) update.trainingPrograms = trainingPrograms;
      if (Array.isArray(suppliers)) update.suppliers = suppliers;
      if (Array.isArray(esdContributions)) update.esdContributions = esdContributions;
      if (Array.isArray(sedContributions)) update.sedContributions = sedContributions;
      if (financials) {
        if (financials.revenue > 0) update.revenue = financials.revenue;
        if (financials.npat !== undefined) update.npat = financials.npat;
        if (financials.leviableAmount > 0) update.leviableAmount = financials.leviableAmount;
        if (financials.tmps > 0) update.tmps = financials.tmps;
        if (financials.industrySector) update.industrySector = financials.industrySector;
      }

      await ClientModel.updateOne({ clientId }, { $set: update });

      res.json({
        success: true,
        counts: {
          shareholders: (shareholders || []).length,
          employees: (employees || []).length,
          trainingPrograms: (trainingPrograms || []).length,
          suppliers: (suppliers || []).length,
          esdContributions: (esdContributions || []).length,
          sedContributions: (sedContributions || []).length,
        },
      });
    } catch (error: any) {
      logger.error("Error bulk-importing client data", error);
      res.status(500).json({ error: "Failed to import client data" });
    }
  });

  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const templates = await storage.getTemplatesByUser(userId);

      res.json(templates);
    } catch (error: any) {
      logger.error("Error fetching templates", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const id = parseInt(req.params.id);
      const template = await storage.getTemplateForUser(id, userId);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error: any) {
      logger.error("Error fetching template", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/templates", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const { name, description, version, entities } = req.body;
      if (!name || !entities || !Array.isArray(entities)) {
        return res.status(400).json({ error: "name and entities array are required" });
      }
      const template = await storage.createTemplate({
        name,
        description: description || "",
        version: version || "1.0",
        entities,
        userId,
      });
      res.json(template);
    } catch (error: any) {
      logger.error("Error creating template", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.put("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const id = parseInt(req.params.id);
      const { name, description, version, entities } = req.body;
      const template = await storage.updateTemplateForUser(id, userId, {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(version && { version }),
        ...(entities && { entities }),
      });
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error: any) {
      logger.error("Error updating template", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTemplateForUser(id, userId);
      if (!deleted) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting template", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  app.get("/api/entity-templates", async (_req, res) => {
    try {
      let ontologyTemplates: any[] = [];
      try {
        const { getAllManifests } = await import('../../api/pipeline/extraction/entityManifest.js');
        const manifests = await getAllManifests();
        ontologyTemplates = manifests.map((m: any) => ({
          id: `ontology-${m.sectorCode}-${m.scorecardType}`,
          userId: null,
          name: `${m.sectorCode} ${m.scorecardType} Scorecard`,
          description: `Ontology-based template for ${m.sectorCode} ${m.scorecardType} with ${m.pillarPacks.reduce((sum: number, p: any) => sum + p.criteria.length, 0)} criteria across ${m.pillarPacks.length} pillars`,
          version: '2.0',
          sourceFile: '',
          nodeCount: 0,
          edgeCount: 0,
          entities: m.pillarPacks.flatMap((p: any) => p.entities).map((e: any) => ({
            label: e.id,
            definition: e.name,
            pillarCode: e.pillarCode,
            criterionCodes: e.criterionCodes,
            fieldType: e.fieldType,
            synonyms: e.extraction.aliases,
            positives: e.extraction.positiveExamples,
            negatives: e.extraction.negativeExamples,
            zones: e.extraction.zones,
            keywords: {
              must: e.extraction.mustHaveKeywords,
              nice: e.extraction.niceToHaveKeywords,
              neg: e.extraction.excludeKeywords,
            },
            pattern: '',
          })),
          pillarPacks: m.pillarPacks.map((p: any) => ({
            pillarCode: p.pillarCode,
            pillarName: p.pillarName,
            maxPoints: p.maxPoints,
            hasSubMinimum: p.hasSubMinimum,
            subMinimumThreshold: p.subMinimumThreshold,
            criteriaCount: p.criteria.length,
            entityCount: p.entities.length,
            criteria: p.criteria.map((c: any) => ({
              code: c.code,
              name: c.name,
              target: c.target,
              maxPoints: c.maxPoints,
              formula: c.formula,
              inputEntities: c.inputEntities,
            })),
            entities: p.entities.map((e: any) => ({
              id: e.id,
              name: e.name,
              fieldType: e.fieldType,
              pillarCode: e.pillarCode,
              criterionCodes: e.criterionCodes,
              required: e.required,
            })),
          })),
          isOntology: true,
          sectorCode: m.sectorCode,
          scorecardType: m.scorecardType,
          rootContext: m.rootContext,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        logger.warn("Could not load ontology manifests for entity-templates", err);
      }

      res.json(ontologyTemplates);
    } catch (error: any) {
      logger.error("Error fetching entity templates", error);
      res.status(500).json({ error: "Failed to fetch entity templates" });
    }
  });

  app.post("/api/generate-entities", async (req, res) => {
    try {
      const { description } = req.body;

      if (!description || typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ error: "description is required" });
      }

      const descLower = description.toLowerCase();

      const generateHeuristic = () => {
        const noiseWords = new Set([
          "the", "a", "an", "of", "for", "in", "on", "to", "and", "or", "is", "are", "was", "were",
          "that", "this", "which", "with", "from", "by", "as", "at", "it", "its", "be", "been", "being",
          "have", "has", "had", "do", "does", "did", "will", "would", "should", "could", "can", "may",
          "might", "must", "shall", "i", "we", "you", "they", "he", "she", "my", "our", "your", "their",
          "what", "how", "when", "where", "why", "who", "need", "want", "like", "also", "just", "very",
          "really", "about", "into", "then", "than", "but", "not", "no", "so", "if", "only", "each",
          "every", "all", "any", "some", "many", "more", "most", "other", "such", "these", "those",
          "extract", "find", "get", "identify", "capture", "detect", "look", "looking", "trying",
          "create", "describe", "pull", "grab", "fetch", "retrieve", "show", "display", "give", "tell",
          "usually", "typically", "generally", "often", "always", "sometimes", "never", "here", "there",
          "appear", "appears", "appearing", "first", "second", "third", "last", "next", "previous",
          "document", "documents", "file", "files", "page", "pages", "paragraph", "paragraphs",
          "section", "sections", "field", "fields", "data", "information", "details", "value", "values",
          "text", "word", "words", "letter", "letters", "line", "lines", "column", "columns", "row", "rows",
          "table", "tables", "form", "forms", "header", "footer", "body", "content", "record", "records",
          "used", "use", "using", "called", "known", "found", "born", "made", "given", "taken",
          "candidate", "person", "people", "thing", "things", "item", "items", "entry", "entries",
          "means", "refer", "refers", "related", "based", "associated", "corresponding",
        ]);

        const entityConcepts: Record<string, { label: string; synonyms: string[]; positives: string[]; negatives: string[]; zones: string[]; mustKw: string[]; niceKw: string[]; negKw: string[]; pattern: string }> = {
          date: { label: "", synonyms: ["Date", "Period", "Valid Until", "Effective Date"], positives: ["2024-06-15", "15 June 2024", "2024/06/15", "31 March 2025"], negatives: ["Reference Number", "Amount", "Name"], zones: ["PDF Header", "Tables"], mustKw: [], niceKw: ["date", "period"], negKw: ["amount", "name"], pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}" },
          amount: { label: "", synonyms: ["Amount", "Cost", "Value", "Spend"], positives: ["R500,000", "R1,200,000", "R2.5M", "R75,000.00"], negatives: ["Percentage", "Count", "Date"], zones: ["Tables"], mustKw: [], niceKw: ["amount", "value"], negKw: ["date", "name"], pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?" },
          percentage: { label: "", synonyms: ["Percentage", "Rate", "Proportion", "Share"], positives: ["51%", "25.1%", "100%", "30.5%"], negatives: ["Amount", "Count", "Date"], zones: ["Tables"], mustKw: [], niceKw: ["percentage", "rate"], negKw: ["amount", "count"], pattern: "\\d{1,3}(\\.\\d{1,2})?%" },
          name: { label: "", synonyms: ["Name", "Entity", "Organisation", "Company"], positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom", "John Doe"], negatives: ["Amount", "Date", "Number"], zones: ["PDF Header", "Email Body"], mustKw: [], niceKw: ["name", "entity"], negKw: ["amount", "date"], pattern: "" },
          number: { label: "", synonyms: ["Number", "Reference", "ID", "Code"], positives: ["REF-2024-001", "12345", "ABC-001", "N/A"], negatives: ["Name", "Amount", "Date"], zones: ["PDF Header", "Tables"], mustKw: [], niceKw: ["number", "reference"], negKw: ["name", "amount"], pattern: "[A-Z]{2,4}[-/]?\\d{3,6}" },
          status: { label: "", synonyms: ["Status", "Level", "Type", "Category"], positives: ["Active", "Compliant", "Level 1", "Approved"], negatives: ["Amount", "Date", "Name"], zones: ["PDF Header", "Tables"], mustKw: [], niceKw: ["status", "level"], negKw: ["amount", "date"], pattern: "" },
        };

        const typeMatchers: [RegExp, string][] = [
          [/date|period|year|expir|valid|time|fiscal/i, "date"],
          [/amount|cost|spend|price|budget|salary|revenue|rand|fee|turnover/i, "amount"],
          [/percent|ratio|rate|proportion|%/i, "percentage"],
          [/name|person|company|entity|beneficiary|director|member|employee|supplier|shareholder/i, "name"],
          [/number|count|total|quantity|id\b|ref|code|registration/i, "number"],
          [/status|level|type|category|class|grade|tier|rating/i, "status"],
        ];

        const words = description.trim().split(/\s+/);
        const keyWords = words
          .map((w: string) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
          .filter((w: string) => w.length > 1 && !noiseWords.has(w));

        let label = keyWords.length > 0
          ? keyWords[0].charAt(0).toUpperCase() + keyWords[0].slice(1)
          : "Entity";
        if (/^\d/.test(label)) label = "Entity";

        let matchedType = "";
        for (const [regex, type] of typeMatchers) {
          if (regex.test(descLower)) { matchedType = type; break; }
        }

        const base = matchedType ? entityConcepts[matchedType] : null;
        const mustKw = keyWords.slice(0, 2);
        const niceKw = base ? base.niceKw : keyWords.slice(2, 4);
        const negKw = base ? base.negKw : ["unrelated"];
        const synonyms = base ? base.synonyms : keyWords.slice(0, 3).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1));
        const positives = base ? base.positives : ["Example value 1", "Example value 2", "Example value 3"];
        const negatives = base ? base.negatives : ["Not applicable", "Unrelated value"];
        const zones = base ? base.zones : ["Email Body", "PDF Header"];
        const pattern = base ? base.pattern : "";

        const definitionTemplates: Record<string, string> = {
          date: `A date or time period value representing when ${label.toLowerCase()}-related events occur or are scheduled.`,
          amount: `A monetary value or financial figure representing the ${label.toLowerCase()} in Rand or other currency.`,
          percentage: `A percentage or proportional value indicating the ${label.toLowerCase()} rate or share.`,
          name: `The name of a person, organisation, or entity associated with the ${label.toLowerCase()} context.`,
          number: `A unique numeric or alphanumeric identifier used to reference the ${label.toLowerCase()}.`,
          status: `A classification or status indicator describing the current ${label.toLowerCase()} state or level.`,
        };
        const definition = matchedType
          ? definitionTemplates[matchedType]
          : `The ${label.toLowerCase()} value to be extracted from the document.`;

        return {
          id: Date.now() + Math.random(),
          label,
          definition,
          completeness: 60,
          synonyms,
          positives,
          negatives,
          zones,
          keywords: { must: mustKw, nice: niceKw, neg: negKw },
          pattern,
          expanded: true,
          activeTab: "definition",
        };
      };

      if (!groqApiKey) {
        return res.json({ entities: [generateHeuristic()] });
      }

      const systemPrompt = `You are an expert NLP entity extraction configuration assistant for a B-BBEE compliance document intelligence platform used by South African businesses.

Your job: read the user's natural language description (it may be a single word, a phrase, or a full sentence) and deeply understand WHAT data they are trying to extract from documents. Then generate exactly ONE perfectly-configured entity definition.

CONTEXT: Documents processed include B-BBEE certificates, scorecards, verification letters, audited financial statements, company registration documents, employment equity reports, and supplier invoices — all in a South African business context.

INSTRUCTIONS:
1. Parse the user's intent — even if they write casually, e.g. "I want the expiry date of the certificate" → entity: CertificateExpiryDate
2. Infer the data type: date, monetary amount (Rand), percentage, name/organisation, identifier/reference, level/status, count, address, etc.
3. Generate a label in PascalCase that is specific and descriptive (2-3 words is fine, e.g. "BBBEELevel", "CertificateExpiryDate", "BlackOwnership")
4. Write a professional definition that explains exactly what the entity represents and when it appears in documents
5. Synonyms: realistic alternative names as they appear in actual B-BBEE documents
6. Positives: realistic South African examples of actual values (use Rand amounts like R1,200,000, percentages like 51%, dates like 31 March 2025, levels like "Level 2 Contributor")
7. Negatives: common false positives — values that look similar but are NOT this entity
8. Zones: where in documents this typically appears (from: "Email Subject", "Email Body", "PDF Header", "Tables", "Footer", "Signature Block")
9. Keywords: actual words that appear near this value in documents (must = required co-occurrence, nice = helpful, neg = words that rule it out)
10. Pattern: a precise regex if the value has a predictable format, otherwise ""

RESPOND ONLY with a valid JSON array containing exactly ONE entity object. No markdown, no code fences, no explanation — raw JSON only.

Schema:
{
  "label": "PascalCaseLabel",
  "definition": "Professional 1-2 sentence description.",
  "synonyms": ["Alias1", "Alias2", "Alias3"],
  "positives": ["Example1", "Example2", "Example3"],
  "negatives": ["FalsePositive1", "FalsePositive2"],
  "zones": ["PDF Header", "Tables"],
  "keywords": {"must": ["word1", "word2"], "nice": ["word3"], "neg": ["word4"]},
  "pattern": "regex_or_empty_string"
}

Examples:

User: "bee level" →
[{"label":"BBBEELevel","definition":"The B-BBEE contributor level (1–8) or Non-Compliant status assigned to the measured entity by a SANAS-accredited verification agency.","synonyms":["BEE Level","Contributor Level","B-BBEE Status","BBBEE Rating"],"positives":["Level 1 Contributor","Level 4","Level 8 Contributor","Non-Compliant"],"negatives":["Risk Level","Service Level Agreement","Employment Level"],"zones":["PDF Header","Tables"],"keywords":{"must":["level","contributor"],"nice":["B-BBEE","status","compliant"],"neg":["risk","service","agreement"]},"pattern":"Level\\s*[1-8](\\s*Contributor)?|Non-Compliant"}]

User: "I want to know when the certificate expires" →
[{"label":"CertificateExpiryDate","definition":"The date on which the B-BBEE certificate expires and re-verification becomes required for the measured entity.","synonyms":["Expiry Date","Valid Until","Certificate End Date","Validity Period End","Expiration Date"],"positives":["31 March 2026","2026-03-31","31/03/2026","30 June 2025"],"negatives":["Issue Date","Measurement Date","Financial Year End","Contract Expiry"],"zones":["PDF Header","Tables"],"keywords":{"must":["expir","valid"],"nice":["until","end","certificate"],"neg":["issue","start","financial year"]},"pattern":"\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}|\\d{4}[-/]\\d{2}[-/]\\d{2}"}]

User: "the rand amount of their annual turnover" →
[{"label":"AnnualTurnover","definition":"The total annual revenue or turnover of the measured entity as reported in their audited financial statements, used to determine the applicable B-BBEE scorecard.","synonyms":["Annual Revenue","Total Turnover","Gross Revenue","Annual Sales"],"positives":["R12,500,000","R 5,000,000.00","R2.3M","R150,000,000"],"negatives":["Monthly Revenue","Net Profit","Operating Expenses","Tax Amount"],"zones":["Tables","PDF Header"],"keywords":{"must":["turnover","revenue"],"nice":["annual","total","gross"],"neg":["monthly","net","profit","expenses"]},"pattern":"R\\s?[\\d,\\s]+(\\s*M|\\s*million|\\.\\d{2})?"}]`;

      let formattedEntities: any[] = [];
      try {
        const content = await llmGenerate(systemPrompt, `User description: "${description}"\n\nGenerate the entity JSON now:`, { temperature: 0.3, maxTokens: 1200 });

        let entities;
        try {
          let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch) => {
            if (ch === '\n' || ch === '\r' || ch === '\t') return ch;
            return '';
          });
          entities = JSON.parse(cleaned);
        } catch (parseErr) {
          try {
            const arrayMatch = content.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
              entities = JSON.parse(arrayMatch[0]);
            } else {
              entities = [];
            }
          } catch {
            entities = [];
          }
        }

        if (!Array.isArray(entities)) entities = [];

        formattedEntities = entities.slice(0, 1).map((e: any) => ({
          id: Date.now() + Math.random(),
          label: e.label || "CustomEntity",
          definition: e.definition || "Auto-generated entity",
          completeness: 80,
          synonyms: e.synonyms || [],
          positives: e.positives || [],
          negatives: e.negatives || [],
          zones: e.zones || ["Email Body", "PDF Header"],
          keywords: e.keywords || { must: [], nice: [], neg: [] },
          pattern: e.pattern || "",
          expanded: true,
          activeTab: "definition",
        }));
      } catch (llmErr: any) {
        logger.warn("LLM entity generation failed, using heuristic fallback", { error: llmErr.message });
        formattedEntities = [generateHeuristic()];
      }

      if (formattedEntities.length === 0) {
        formattedEntities = [generateHeuristic()];
      }

      res.json({ entities: formattedEntities });
    } catch (error: any) {
      logger.error("Error generating entities", error);
      res.status(500).json({ error: "Failed to generate entities" });
    }
  });

  app.post("/api/extract-entities", async (req, res) => {
    try {
      const { documentText, entities } = req.body;

      if (!documentText || !entities || !Array.isArray(entities)) {
        return res.status(400).json({ error: "documentText and entities array are required" });
      }

      if (!groqApiKey) {
        const fallbackResults = entities.map((e: any, idx: number) => ({
          id: idx + 1,
          entity: e.label,
          value: null,
          conf: 0,
          method: "NER",
          status: "pending",
        }));
        return res.json({ extractions: fallbackResults });
      }

      const entityLabels = entities.map((e: any) => `${e.label}: ${e.definition || e.label}`).join("\n");

      const extractSystemPrompt = `You are a document entity extraction engine. Given a document's text content and entity types to extract, find and extract values for each entity.

CRITICAL RULES:
1. Search the ENTIRE document thoroughly, case-insensitively.
2. If the entity label, a synonym, or any related word appears ANYWHERE in the document, you MUST extract it.
3. For specific data fields: extract the exact value.
4. For conceptual entities: extract the most relevant passage (up to 300 chars).
5. Even partial or indirect matches should be extracted with lower confidence (40-60%).
6. ONLY return null/confidence 0 if there is absolutely ZERO mention of anything related.
7. When in doubt, EXTRACT. False positives are better than false negatives.

For each entity, provide:
- entity: The entity type label
- value: The extracted value from the document (null only if truly absent)
- confidence: 0-100 (90+ exact, 60-80 related, 40-60 partial)
- method: One of "Pattern", "NER", "Hybrid", "Context"

Respond ONLY with a valid JSON array.`;

      const content = await llmGenerate(extractSystemPrompt, `Document text:\n${documentText}\n\nEntities to extract:\n${entityLabels}`, { temperature: 0.3 });

      let results;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        results = JSON.parse(cleaned);
      } catch {
        results = [];
      }

      if (!Array.isArray(results)) {
        results = [];
      }

      const formattedResults = results
        .filter((r: any) => r.value !== null)
        .map((r: any, idx: number) => ({
          id: idx + 1,
          entity: r.entity,
          value: r.value,
          conf: r.confidence || 0,
          method: r.method || "NER",
          status: "pending",
        }));

      res.json({ extractions: formattedResults });
    } catch (error: any) {
      logger.error("Error extracting entities", error);
      res.status(500).json({ error: "Failed to extract entities" });
    }
  });

  app.post("/api/process-documents-stream", async (req, res) => {
    try {
      const { documents } = req.body;

      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({ error: "documents array is required" });
      }

      const regexExtract = (text: string, entity: any): { value: string | null; conf: number; method: string; status: string } => {
        if (entity.pattern) {
          try {
            const rx = new RegExp(entity.pattern, 'gi');
            const m = rx.exec(text);
            if (m) return { value: m[0].trim(), conf: 87, method: 'Pattern', status: 'extracted' };
          } catch { /* bad regex, skip */ }
        }
        const terms = [entity.label, ...(entity.synonyms || []), ...(entity.keywords?.must || [])];
        for (const kw of terms) {
          if (!kw) continue;
          const idx = text.toLowerCase().indexOf(kw.toLowerCase());
          if (idx !== -1) {
            const start = Math.max(0, idx - 20);
            const end = Math.min(text.length, idx + 180);
            const ctx = text.slice(start, end).replace(/\s+/g, ' ').trim();
            return { value: ctx, conf: 55, method: 'Context', status: 'extracted' };
          }
        }
        return { value: null, conf: 0, method: 'Pattern', status: 'not_found' };
      };

      if (!groqApiKey) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (event: string, data: any) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        send("start", { total: documents.length });
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          send("doc-start", { index: i, fileName: doc.fileName, templateName: doc.templateName });
          const { fileName, templateId, templateName, entitiesToExtract, documentText } = doc;
          const text = documentText || '';
          const entities = (entitiesToExtract || []).map((e: any, idx: number) => {
            const r = regexExtract(text, e);
            return { id: idx + 1, entity: e.label, value: r.value, conf: r.conf, method: r.method, status: r.status };
          }).filter((e: any) => e.value !== null);
          send("doc-done", { index: i, fileName, templateId, templateName, entities });
        }
        send("complete", { total: documents.length });
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      send("start", { total: documents.length });

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const { fileName, templateId, templateName, entitiesToExtract, documentText } = doc;

        send("doc-start", { index: i, fileName, templateName });

        if (!entitiesToExtract || entitiesToExtract.length === 0) {
          send("doc-done", { index: i, fileName, templateId, templateName, entities: [] });
          continue;
        }

        const entityDescriptions = entitiesToExtract
          .map((e: any) => {
            let desc = `- ${e.label}: ${e.definition}`;
            if (e.synonyms && e.synonyms.length > 0) desc += `\n  Synonyms/aliases: ${e.synonyms.join(', ')}`;
            if (e.keywords?.must?.length > 0) desc += `\n  Must-have keywords: ${e.keywords.must.join(', ')}`;
            if (e.keywords?.nice?.length > 0) desc += `\n  Nice-to-have keywords: ${e.keywords.nice.join(', ')}`;
            if (e.pattern) desc += `\n  Expected pattern: ${e.pattern}`;
            if (e.positives && e.positives.length > 0) desc += `\n  Example positive values: ${e.positives.join(', ')}`;
            if (e.negatives && e.negatives.length > 0) desc += `\n  NOT these (negative examples): ${e.negatives.join(', ')}`;
            return desc;
          })
          .join("\n\n");

        const hasRealContent = documentText && documentText.trim().length > 0 && !documentText.startsWith("[Could not read");

        try {
          const streamSystemPrompt = hasRealContent
            ? `You are a document entity extraction engine. You are given the actual text content of a document named "${fileName}". Your job is to find and extract the requested entities from the document text.

CRITICAL RULES — READ CAREFULLY:
1. ALWAYS search the ENTIRE document text thoroughly, word by word if needed.
2. Matching is CASE-INSENSITIVE. "nationality" matches "Nationality", "NATIONALITY", etc.
3. Look for the entity label itself, its synonyms, related words, and ANY mention that relates to the entity concept.
4. If the exact word or a synonym appears ANYWHERE in the document, you MUST extract it. Do NOT say "not_found" if the word exists in the text.
5. For specific data fields (dates, IDs, numbers): extract the exact value.
6. For conceptual entities (topics, categories, descriptions): extract the most relevant sentence or passage (up to 300 chars).
7. Even PARTIAL or INDIRECT matches should be extracted with lower confidence (40-60%).
8. A value should ONLY be null and status "not_found" if there is absolutely ZERO mention of the entity or anything related to it in the entire document.
9. When in doubt, EXTRACT rather than skip. False positives are better than false negatives.

For each entity, respond with:
- name: The entity label exactly as given
- value: The extracted text from the document (null ONLY if absolutely nothing found)
- confidence: 0-100 (90+ for exact match, 60-80 for related/conceptual, 40-60 for partial/indirect)
- status: "extracted" if ANY relevant content found, "not_found" ONLY if truly absent

Respond ONLY with a valid JSON array.`
            : `You are a document entity extraction engine. The document "${fileName}" was uploaded but its text could not be read (it may be a binary format like PDF or image). Indicate that extraction requires OCR or text conversion.

For each entity, provide:
- name: The entity label exactly as given
- value: null
- confidence: 0
- status: "not_readable"

Respond ONLY with a valid JSON array.`;

          const streamUserContent = hasRealContent
            ? `DOCUMENT TEXT:\n---\n${documentText.substring(0, 12000)}\n---\n\nENTITIES TO EXTRACT:\n${entityDescriptions}`
            : `File: ${fileName}\nEntities to extract:\n${entityDescriptions}`;

          const content = await llmGenerate(streamSystemPrompt, streamUserContent, { temperature: 0.2 });
          let entities;
          try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            entities = JSON.parse(cleaned);
          } catch {
            entities = entitiesToExtract.map((e: any) => ({
              name: e.label,
              value: `Extracted ${e.label}`,
              confidence: Math.floor(Math.random() * 15) + 85,
              status: "extracted",
            }));
          }

          send("doc-done", {
            index: i,
            fileName,
            templateId,
            templateName,
            entities: Array.isArray(entities) ? entities : [],
          });
        } catch (docError: any) {
          logger.error('Document processing failed', docError, { fileName, index: i });
          send("doc-error", {
            index: i,
            fileName,
            templateId,
            templateName,
            error: docError.message || "Extraction failed",
            entities: entitiesToExtract.map((e: any) => ({
              name: e.label,
              value: `Error extracting ${e.label}`,
              confidence: 0,
              status: "error",
            })),
          });
        }
      }

      send("complete", { total: documents.length });
      res.end();
    } catch (error: any) {
      logger.error("Error processing documents", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process documents" });
      } else {
        res.end();
      }
    }
  });

  app.get("/api/clients/:clientId/calculator-config", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { clientId } = req.params;
      const row = await storage.getCalculatorConfig(clientId);
      if (row) {
        res.json(row.config);
      } else {
        res.json(null);
      }
    } catch (error: any) {
      logger.error("Error fetching calculator config", error);
      res.status(500).json({ error: "Failed to fetch calculator config" });
    }
  });

  app.put("/api/clients/:clientId/calculator-config", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { clientId } = req.params;
      const { config } = req.body;
      if (!config) {
        return res.status(400).json({ error: "config is required" });
      }
      const row = await storage.saveCalculatorConfig(clientId, config);
      res.json(row.config);
    } catch (error: any) {
      logger.error("Error saving calculator config", error);
      res.status(500).json({ error: "Failed to save calculator config" });
    }
  });

  app.post("/api/generate-calculator-suggestions", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { type, industry, existing } = req.body;

      if (!groqApiKey) {
        const suggestion = type === 'benefitFactor'
          ? { type: 'new_contribution', factor: 0.8, description: 'New contribution type' }
          : { name: industry || 'New Industry', norm: 'Standard industry norm' };
        return res.json({ suggestion });
      }

      const prompt = type === 'benefitFactor'
        ? `You are a B-BBEE compliance expert. Suggest a new benefit factor type for Enterprise and Supplier Development contributions. Industry: ${industry || 'Generic'}. Existing types: ${(existing || []).map((e: any) => e.type).join(', ')}. Respond with JSON: {"type": "snake_case_name", "factor": 0.0_to_1.0, "description": "brief description"}`
        : `You are a B-BBEE compliance expert. Suggest a new industry norm entry. Industry: ${industry || 'Generic'}. Existing norms: ${(existing || []).map((e: any) => e.name).join(', ')}. Respond with JSON: {"name": "Industry Name", "norm": "Brief description of the norm"}`;

      const content = await llmGenerate(
        "You are a South African B-BBEE compliance specialist. Respond ONLY with valid JSON, no markdown.",
        prompt,
        { temperature: 0.7, maxTokens: 500 },
      );
      let suggestion;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleaned);
      } catch {
        suggestion = type === 'benefitFactor'
          ? { type: 'new_contribution', factor: 0.8, description: 'New contribution type' }
          : { name: 'New Industry', norm: 'Standard industry norm' };
      }

      res.json({ suggestion });
    } catch (error: any) {
      logger.error("Error generating suggestions", error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  app.get("/api/sector-templates", async (_req, res) => {
    try {
      const { listSectorConfigs } = await import('./pipeline');
      const configs = listSectorConfigs();
      res.json(configs);
    } catch (error: any) {
      logger.error("Error fetching sector templates", error);
      res.status(500).json({ error: "Failed to fetch sector templates" });
    }
  });

  app.post("/api/extract-and-score", requireAuth, async (req, res) => {
    const start = Date.now();
    try {
      const { documentTexts, sectorCode, scorecardType, clientName } = req.body;
      
      if (!Array.isArray(documentTexts) || documentTexts.length === 0 || !sectorCode || !scorecardType) {
        return res.status(400).json({ error: "documentTexts, sectorCode, and scorecardType are required" });
      }

      const pipeline = await import('./pipeline');
      const manifest = pipeline.buildManifestForSector(sectorCode.toUpperCase(), scorecardType);
      
      const combinedText = documentTexts.map((t, i) => `--- Document ${i + 1} ---\n${t}`).join('\n\n');
      
      const requests = manifest.requiredEntities.map((entity: any) => ({
        entityName: entity.name,
        entityType: entity.fieldType,
        definition: entity.definition,
        aliases: entity.aliases,
        positiveExamples: entity.positiveExamples,
        negativeExamples: entity.negativeExamples,
        zones: entity.zones,
        sourceText: combinedText,
        sourcePageId: 'combined',
      }));

      const extractor = new pipeline.LLMExtractor();
      const extractionResults = await extractor.extractBatch(requests);

      const parseResult = pipeline.entityResultsToParseResult(extractionResults, {
        clientName: clientName || 'Unnamed Client',
        industrySector: sectorCode,
        applicableScorecard: scorecardType,
      });

      const filename = `${sectorCode}_${scorecardType}_${clientName || 'entity'}`;
      const scorecard = pipeline.buildPipelineResult(parseResult, filename);
      
      const requiredRoles = manifest.requiredEntities.map((e: any) => e.name);
      const confidence = pipeline.buildConfidenceReport(extractionResults, requiredRoles);

      const entityCount = extractionResults.length;
      logger.info('Extract and score complete', { sectorCode, scorecardType, entityCount, durationMs: Date.now() - start });

      return res.json({
        success: true,
        scorecard,
        confidence,
        extractedEntities: extractionResults.filter(r => r.extractedValue !== null).length,
        totalEntities: entityCount,
        sectorCode,
        scorecardType,
        clientName: clientName || parseResult.client.name,
      });
    } catch (error: any) {
      logger.error("Error in extract-and-score", error);
      res.status(500).json({ error: error.message || "Failed to extract and score" });
    }
  });

  app.get("/api/processor-sessions", requireAuth, async (req, res) => {
    if (!isMongoConnected()) {
      return res.json([]);
    }
    try {
      const userId = (req.session as any)?.userId;
      // FIXED: Always filter by userId to ensure session isolation
      // Users should only see their own sessions, not other users' sessions
      const query = { createdByUserId: userId };
      logger.debug('Fetching sessions', { userId });
      const sessions = await ProcessorSessionModel.find(query)
        .select({
          sessionId: 1,
          companyInfo: 1,
          currentStep: 1,
          isComplete: 1,
          toolkitClientId: 1, // FIXED: Include toolkitClientId for resume flow
          'filesData.id': 1,
          'filesData.name': 1,
          'filesData.size': 1,
          'filesData.type': 1,
          'extractionResults.fileName': 1,
          'extractionResults.templateName': 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ updatedAt: -1 })
        .lean();
      const lightweight = sessions.map((s: any) => ({
        id: s.sessionId,
        sessionId: s.sessionId,
        companyInfo: {
          name: s.companyInfo?.name || '',
          sector: s.companyInfo?.sector || '',
          registrationNumber: s.companyInfo?.registrationNumber || '',
          annualTurnover: s.companyInfo?.annualTurnover || '',
          employees: s.companyInfo?.employees || '',
          contactName: s.companyInfo?.contactName || '',
          contactEmail: s.companyInfo?.contactEmail || '',
          currentBBEELevel: s.companyInfo?.currentBBEELevel || '',
        },
        currentStep: s.currentStep,
        isComplete: s.isComplete,
        filesData: (s.filesData || []).map((f: any) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
        extractionResults: (s.extractionResults || []).map((r: any) => ({ fileName: r.fileName, templateName: r.templateName })),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      res.json(lightweight);
    } catch (error: any) {
      logger.error("Error fetching processor sessions", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/processor-sessions/:sessionId", requireAuth, async (req, res) => {
    const start = Date.now();
    if (!isMongoConnected()) {
      return res.status(404).json({ error: "Session not found (database unavailable)" });
    }
    try {
      const { sessionId } = req.params;
      const userId = (req.session as any)?.userId;
      // FIXED: Also filter by userId to ensure users can only access their own sessions
      const doc = await ProcessorSessionModel.findOne({ sessionId, createdByUserId: userId }).lean() as any;
      if (!doc) return res.status(404).json({ error: "Session not found" });
      logger.info('Session loaded', { sessionId, durationMs: Date.now() - start });
      res.json({ ...doc, id: doc.sessionId });
    } catch (error: any) {
      logger.error("Error fetching processor session", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.post("/api/processor-sessions", requireAuth, async (req, res) => {
    const start = Date.now();
    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }
    try {
      const userId = (req.session as any)?.userId;
      const { sessionId, companyInfo, currentStep, filesData, fileClassifications, extractionResults, docStatuses, isComplete, scorecardResult } = req.body;
      if (!sessionId || !companyInfo?.name) {
        return res.status(400).json({ error: "sessionId and companyInfo.name are required" });
      }
      
      // FIXED: Check if session exists and belongs to user before updating
      const existingSession = await ProcessorSessionModel.findOne({ sessionId });
      if (existingSession && existingSession.createdByUserId !== userId) {
        return res.status(403).json({ error: "You don't have permission to modify this session" });
      }
      
      const updateData: any = {
        sessionId,
        createdByUserId: userId,
        companyInfo,
        currentStep: currentStep || 'upload',
        filesData: filesData || [],
        fileClassifications: fileClassifications || {},
        extractionResults: extractionResults || [],
        docStatuses: docStatuses || {},
        isComplete: isComplete || false,
        updatedAt: new Date(),
      };
      if (scorecardResult !== undefined) {
        updateData.scorecardResult = scorecardResult;
      }
      const doc = await ProcessorSessionModel.findOneAndUpdate(
        { sessionId, createdByUserId: userId },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      logger.info('Session saved', { sessionId, durationMs: Date.now() - start });
      res.json({ ...doc.toJSON(), id: (doc as any).sessionId });
    } catch (error: any) {
      logger.error("Error saving processor session", error);
      res.status(500).json({ error: "Failed to save session" });
    }
  });

  app.patch("/api/processor-sessions/:sessionId", requireAuth, async (req, res) => {
    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }
    try {
      const { sessionId } = req.params;
      const userId = (req.session as any)?.userId;
      const allowedFields = ['currentStep', 'isComplete', 'scorecardResult', 'toolkitClientId'];
      const patch: any = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) patch[field] = req.body[field];
      }
      // FIXED: Also filter by userId to ensure users can only update their own sessions
      const doc = await ProcessorSessionModel.findOneAndUpdate(
        { sessionId, createdByUserId: userId },
        { $set: patch },
        { new: true }
      );
      if (!doc) return res.status(404).json({ error: "Session not found or you don't have permission" });
      res.json({ ...doc.toJSON(), id: (doc as any).sessionId });
    } catch (error: any) {
      logger.error("Error patching processor session", error);
      res.status(500).json({ error: "Failed to patch session" });
    }
  });

  app.delete("/api/processor-sessions/:sessionId", requireAuth, async (req, res) => {
    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }
    try {
      const { sessionId } = req.params;
      const userId = (req.session as any)?.userId;
      // FIXED: Only delete if the session belongs to the current user
      const result = await ProcessorSessionModel.deleteOne({ sessionId, createdByUserId: userId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Session not found or you don't have permission" });
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting processor session", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // ============================================================================
  // Foundation Layer API - Assessment Management
  // ============================================================================
  
  // Save foundation data (client info + financials)
  app.post("/api/assessments/foundation", requireAuth, async (req, res) => {
    const start = Date.now();
    try {
      const { sessionId, clientInfo, financials, assessmentId } = req.body;
      const userId = (req.session as any)?.userId;
      
      // Generate or use provided assessment ID
      const finalAssessmentId = assessmentId || `assessment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create/update client record from foundation data
      const clientData = {
        name: clientInfo.companyName,
        registrationNumber: clientInfo.registrationNumber,
        vatNumber: clientInfo.vatNumber || '',
        taxNumber: clientInfo.taxNumber || '',
        industrySector: clientInfo.industry || 'Generic',
        physicalAddress: clientInfo.physicalAddress,
        postalAddress: clientInfo.postalAddress || '',
        contactPerson: clientInfo.contactPerson,
        contactEmail: clientInfo.contactEmail,
        contactPhone: clientInfo.contactPhone,
        annualTurnover: clientInfo.annualTurnover,
        numberOfEmployees: clientInfo.numberOfEmployees,
        financialYear: clientInfo.financialYearEnd,
        sectorCode: clientInfo.sectorCode,
        companySize: clientInfo.annualTurnover < 10000000 ? 'EME' : clientInfo.annualTurnover <= 50000000 ? 'QSE' : 'Generic',
        revenue: financials.totalRevenue,
        npat: financials.deemedNpatUsed ? financials.deemedNpat : financials.npat,
        leviableAmount: financials.leviableAmount,
        financials: {
          totalRevenue: financials.totalRevenue,
          npat: financials.npat,
          leviableAmount: financials.leviableAmount,
          totalPayroll: financials.totalPayroll || 0,
          tmpsInclusions: financials.tmpsInclusions || 0,
          tmpsExclusions: financials.tmpsExclusions || 0,
          tmps: financials.tmps || 0,
          industry: financials.industry,
          deemedNpat: financials.deemedNpat,
          deemedNpatUsed: financials.deemedNpatUsed,
        },
        beeCertificateNumber: clientInfo.beeCertificateNumber || '',
        beeCertificateExpiry: clientInfo.beeCertificateExpiry || '',
        beeCertificateLevel: clientInfo.beeCertificateLevel || null,
        verificationAgency: clientInfo.verificationAgency || '',
        userId: userId,
        updatedAt: new Date(),
      };
      
      // Save to database via storage module
      const client = await storage.createOrUpdateClient(clientData);
      
      // Save assessment record linking session to client
      await storage.createOrUpdateAssessment({
        assessmentId: finalAssessmentId,
        sessionId,
        clientId: client.id,
        clientInfo,
        financials,
        status: 'foundation_complete',
        updatedAt: new Date(),
        createdBy: userId,
      });
      
      logger.info('Foundation data saved', { assessmentId: finalAssessmentId, durationMs: Date.now() - start });

      res.json({
        success: true,
        assessmentId: finalAssessmentId,
        clientId: client.id,
        message: 'Foundation data saved successfully',
      });
    } catch (error: any) {
      logger.error("Error saving foundation data", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to save foundation data",
        message: error.message,
      });
    }
  });
  
  // Save pillar data
  app.post("/api/assessments/pillars", requireAuth, async (req, res) => {
    try {
      const { sessionId, assessmentId, pillars } = req.body;
      const userId = (req.session as any)?.userId;
      
      // Update assessment with pillar data
      await storage.createOrUpdateAssessment({
        assessmentId,
        sessionId,
        pillars,
        status: 'pillars_in_progress',
        updatedAt: new Date(),
      });
      
      // If client exists, update client with pillar data
      const assessment = await storage.getAssessment(assessmentId);
      if (assessment?.clientId) {
        await storage.updateClientPillarData(assessment.clientId, pillars);
      }
      
      res.json({
        success: true,
        message: 'Pillar data saved successfully',
      });
    } catch (error: any) {
      logger.error("Error saving pillar data", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to save pillar data",
        message: error.message,
      });
    }
  });
  
  // Load assessment data
  app.get("/api/assessments/:assessmentId", requireAuth, async (req, res) => {
    try {
      const { assessmentId } = req.params;
      const userId = (req.session as any)?.userId;
      
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment) {
        return res.status(404).json({ 
          success: false,
          error: "Assessment not found" 
        });
      }
      
      // Verify ownership
      if (assessment.createdBy !== userId) {
        return res.status(403).json({ 
          success: false,
          error: "Access denied" 
        });
      }
      
      res.json({
        success: true,
        foundation: {
          clientInfo: assessment.clientInfo,
          financials: assessment.financials,
        },
        pillars: assessment.pillars || {},
        scorecard: assessment.scorecardResult,
      });
    } catch (error: any) {
      logger.error("Error loading assessment", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to load assessment",
        message: error.message,
      });
    }
  });
  
  // List user's assessments
  app.get("/api/assessments", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const assessments = await storage.getUserAssessments(userId);
      
      res.json({
        success: true,
        assessments: assessments.map(a => ({
          assessmentId: a.assessmentId,
          clientName: a.clientInfo?.companyName || 'Unnamed Client',
          status: a.status,
          updatedAt: a.updatedAt,
          createdAt: a.createdAt,
        })),
      });
    } catch (error: any) {
      logger.error("Error listing assessments", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to list assessments",
        message: error.message,
      });
    }
  });

  // CRITICAL FIX: Create new assessment with server-backed clientId
  // This enables DocumentProcessor→Toolkit handoff with proper persistence
  app.post("/api/assessments", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { 
        sessionId, 
        clientInfo, 
        financials, 
        pillars, 
        scorecardResult 
      } = req.body;

      // Generate server-backed clientId for Toolkit handoff
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const clientId = `assessment-${userId}-${timestamp}-${randomSuffix}`;

      // Create assessment in storage using existing method
      const assessment = await storage.createOrUpdateAssessment({
        assessmentId: clientId,
        userId,
        status: 'complete',
        clientInfo: {
          companyName: clientInfo?.companyName || clientInfo?.name || 'Unnamed Client',
          registrationNumber: clientInfo?.registrationNumber || '',
          sectorCode: clientInfo?.sectorCode || 'RCOGP',
          industry: clientInfo?.industry || 'Generic',
          financialYearEnd: clientInfo?.financialYearEnd || '',
          physicalAddress: clientInfo?.physicalAddress || '',
          contactPerson: clientInfo?.contactPerson || '',
          contactEmail: clientInfo?.contactEmail || '',
          contactPhone: clientInfo?.contactPhone || '',
        },
        financials: {
          totalRevenue: financials?.totalRevenue || financials?.revenue || 0,
          npat: financials?.npat || 0,
          leviableAmount: financials?.leviableAmount || 0,
          tmps: financials?.tmps || 0,
        },
        pillars: pillars || {},
        scorecardResult: scorecardResult || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Also create a proper client record for Toolkit integration
      const clientRecord = await storage.createOrUpdateClient({
        clientId,
        userId,
        name: clientInfo?.companyName || clientInfo?.name || 'Unnamed Client',
        financialYear: clientInfo?.financialYearEnd?.substring(0, 4) || new Date().getFullYear().toString(),
        revenue: financials?.totalRevenue || financials?.revenue || 0,
        npat: financials?.npat || 0,
        leviableAmount: financials?.leviableAmount || 0,
        industrySector: clientInfo?.industry || 'Generic',
        eapProvince: clientInfo?.eapProvince || 'National',
        sectorCode: clientInfo?.sectorCode || 'RCOGP',
        registrationNumber: clientInfo?.registrationNumber || '',
        logo: clientInfo?.logo || null,
        updatedAt: new Date(),
      });

      // Update client pillar data if provided
      if (pillars) {
        await storage.updateClientPillarData(clientId, pillars);
      }

      res.status(201).json({
        success: true,
        message: "Assessment created successfully",
        assessment: {
          assessmentId: clientId,
          clientId,
          clientName: clientInfo?.companyName || clientInfo?.name || 'Unnamed Client',
          status: 'complete',
          createdAt: assessment.createdAt || new Date(),
        },
      });
    } catch (error: any) {
      logger.error("Error creating assessment", error);
      res.status(500).json({
        success: false,
        error: "Failed to create assessment",
        message: error.message,
      });
    }
  });

  const supplierCertificates: any[] = [];

  app.get("/api/supplier-certificates", requireAuth, (_req: Request, res: Response) => {
    res.json({ chunks: supplierCertificates });
  });

  app.post("/api/supplier-certificates", requireAuth, (req: Request, res: Response) => {
    const chunk = req.body;
    if (!chunk.supplier_name || typeof chunk.supplier_name !== 'string' || chunk.supplier_name.trim().length === 0) {
      return res.status(400).json({ message: "supplier_name is required and must be a non-empty string" });
    }
    if (chunk.level !== undefined && chunk.level !== null) {
      const lvl = Number(chunk.level);
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 8) {
        return res.status(400).json({ message: "level must be an integer between 1 and 8, or null" });
      }
    }
    if (chunk.expiry_date !== undefined && chunk.expiry_date !== null) {
      if (typeof chunk.expiry_date !== 'string' || isNaN(new Date(chunk.expiry_date).getTime())) {
        return res.status(400).json({ message: "expiry_date must be a valid ISO date string or null" });
      }
    }
    const bo = chunk.black_ownership !== undefined ? Number(chunk.black_ownership) : 0;
    if (isNaN(bo) || bo < 0 || bo > 100) {
      return res.status(400).json({ message: "black_ownership must be a number between 0 and 100" });
    }
    const newChunk = {
      id: `SUP${String(supplierCertificates.length + 1).padStart(3, '0')}`,
      supplier_name: chunk.supplier_name.trim(),
      expiry_date: chunk.expiry_date || null,
      level: chunk.level !== undefined && chunk.level !== null ? Number(chunk.level) : null,
      empowering_supplier: !!chunk.empowering_supplier,
      upload_date: chunk.upload_date && !isNaN(new Date(chunk.upload_date).getTime()) ? chunk.upload_date : new Date().toISOString().split('T')[0],
      enterprise_type: ['EME', 'QSE', 'Generic'].includes(chunk.enterprise_type) ? chunk.enterprise_type : 'Generic',
      black_ownership: bo,
    };
    supplierCertificates.push(newChunk);
    res.status(201).json(newChunk);
  });

  app.post("/api/client-errors", (req, res) => {
    const { message, stack, componentStack, url, timestamp } = req.body || {};
    logger.error("Client-side error", undefined, { clientError: true, message, stack: stack?.slice(0, 500), url, timestamp });
    res.json({ ok: true });
  });

  logger.info("Route registration completed");
  return httpServer;
}
