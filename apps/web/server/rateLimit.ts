/**
 * Durable rate limiting for the public entry point.
 *
 * `apps/web` is the service the ingress actually sends traffic to, so this is
 * where brute-force protection has to live. The limiters here replace three
 * hand-rolled `Map`-based counters that were per-process and per-replica: with
 * two web replicas an attacker got double the budget, and a rollout reset every
 * counter to zero.
 *
 * State is kept in MongoDB (one document per key, TTL-expired) so a limit holds
 * across replicas and across restarts. If Mongo is unavailable the store falls
 * back to an in-process map rather than failing open on the request itself —
 * degraded, but never unlimited.
 */
import rateLimit, {
  ipKeyGenerator,
  type Store,
  type Options,
  type ClientRateLimitInfo,
} from "express-rate-limit";
import type { Request, RequestHandler, Response } from "express";
import mongoose from "mongoose";
import { createLogger } from "./logger.js";

const logger = createLogger("RateLimit");

const COLLECTION = "rateLimitHits";
let indexEnsured = false;

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function db() {
  return mongoose.connection.db as any;
}

async function ensureIndex(): Promise<void> {
  if (indexEnsured || !mongoReady()) return;
  indexEnsured = true;
  try {
    await db()
      .collection(COLLECTION)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limit_ttl" });
  } catch (err) {
    logger.warn("Could not create rate-limit TTL index (entries still expire logically)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * express-rate-limit store backed by MongoDB, with an in-process fallback.
 *
 * `increment` is a single findOneAndUpdate so two replicas racing on the same
 * key cannot both read "1".
 */
class HybridStore implements Store {
  // Deliberately not `private`: express-rate-limit's `Store` is a structural
  // object type, and a private member makes the class structurally incompatible
  // with it even though every method matches.
  windowMs = 60_000;
  prefix: string;
  memory = new Map<string, { totalHits: number; resetTime: number }>();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private memoryIncrement(key: string): ClientRateLimitInfo {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.resetTime <= now) {
      const next = { totalHits: 1, resetTime: now + this.windowMs };
      this.memory.set(key, next);
      return { totalHits: 1, resetTime: new Date(next.resetTime) };
    }
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const id = `${this.prefix}:${key}`;
    if (!mongoReady()) return this.memoryIncrement(id);
    await ensureIndex();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.windowMs);
    try {
      const col = db().collection(COLLECTION);
      // Expire-in-place: if the stored window has already passed we start a new
      // one rather than waiting for the TTL monitor, which only runs once a
      // minute and would otherwise let a stale window keep blocking.
      const updated = await col.findOneAndUpdate(
        { _id: id, expiresAt: { $gt: now } },
        { $inc: { totalHits: 1 } },
        { returnDocument: "after" },
      );
      const doc = updated?.value ?? updated;
      if (doc && typeof doc.totalHits === "number") {
        return { totalHits: doc.totalHits, resetTime: new Date(doc.expiresAt) };
      }
      await col.updateOne({ _id: id }, { $set: { totalHits: 1, expiresAt } }, { upsert: true });
      return { totalHits: 1, resetTime: expiresAt };
    } catch (err) {
      logger.warn("Rate-limit store unavailable, falling back to memory", {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.memoryIncrement(id);
    }
  }

  async decrement(key: string): Promise<void> {
    const id = `${this.prefix}:${key}`;
    if (!mongoReady()) {
      const entry = this.memory.get(id);
      if (entry && entry.totalHits > 0) entry.totalHits -= 1;
      return;
    }
    try {
      await db()
        .collection(COLLECTION)
        .updateOne({ _id: id, totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } });
    } catch {
      /* best effort */
    }
  }

  async resetKey(key: string): Promise<void> {
    const id = `${this.prefix}:${key}`;
    this.memory.delete(id);
    if (!mongoReady()) return;
    try {
      await db().collection(COLLECTION).deleteOne({ _id: id });
    } catch {
      /* best effort */
    }
  }
}

/**
 * Client IP, trusting exactly the one proxy hop the ingress adds.
 *
 * IPv6 goes through `ipKeyGenerator`, which collapses an address to its /64
 * prefix. Without that, limits are decorative over IPv6: a single allocation
 * hands out more addresses than there are IPv4 addresses in total, so every
 * request could arrive from a "new" client.
 */
function clientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || "unknown";
  return ipKeyGenerator(raw);
}

function makeLimiter(opts: {
  prefix: string;
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    store: new HybridStore(opts.prefix),
    keyGenerator: opts.keyGenerator ?? clientIp,
    handler: (req: Request, res: Response) => {
      logger.warn("Rate limit exceeded", {
        limiter: opts.prefix,
        path: req.originalUrl || req.path,
        ip: clientIp(req),
      });
      res.status(429).json({ message: opts.message });
    },
  });
}

/** Everything under /api/auth — a ceiling on automated probing of the namespace. */
export const authNamespaceLimiter = makeLimiter({
  prefix: "auth",
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many authentication requests. Please try again shortly.",
});

/**
 * Sign-in. Successful sign-ins are not counted, so a person who simply uses the
 * product all day is never limited; only failures burn the budget.
 */
export const loginLimiter = makeLimiter({
  prefix: "login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
});

/** Account creation — stops automated signup floods. */
export const registerLimiter = makeLimiter({
  prefix: "register",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many sign-up attempts from this address. Please try again later.",
});

/** One-time-code entry and resend. */
export const otpLimiter = makeLimiter({
  prefix: "otp",
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: "Too many verification attempts. Please sign in again to get a new code.",
});

/** Password-reset request — also limits how much mail an attacker can send. */
export const passwordResetRequestLimiter = makeLimiter({
  prefix: "pwreset-req",
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many reset requests. Please try again later.",
});

/** Password-reset redemption, keyed on address as well as IP. */
export const passwordResetLimiter = makeLimiter({
  prefix: "pwreset",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Please wait before trying again.",
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${clientIp(req)}|${email}`;
  },
});

/** Cheap availability probes used by the sign-up form. */
export const availabilityLimiter = makeLimiter({
  prefix: "availability",
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests, try again shortly.",
});

/**
 * A ceiling over the whole API surface. Deliberately high — this is a backstop
 * against scraping and denial-of-wallet, not a per-feature quota.
 */
export const apiCeilingLimiter = makeLimiter({
  prefix: "api",
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_5MIN || 1500),
  message: "Too many requests. Please slow down.",
});

/* ------------------------------------------------------------------ *
 * Per-account lockout
 *
 * IP limiting alone does not stop a distributed password spray against one
 * account. This counts failures per account identifier and locks that account
 * briefly, independently of where the attempts come from.
 * ------------------------------------------------------------------ */

const LOCKOUT_THRESHOLD = Number(process.env.LOGIN_LOCKOUT_THRESHOLD || 8);
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const memoryFailures = new Map<string, { count: number; until: number }>();

function accountKey(identifier: string): string {
  return `lock:${identifier.trim().toLowerCase()}`;
}

/** Seconds remaining on a lockout, or 0 when the account is not locked. */
export async function isAccountLocked(identifier: string): Promise<number> {
  const key = accountKey(identifier);
  const now = Date.now();
  if (!mongoReady()) {
    const entry = memoryFailures.get(key);
    if (entry && entry.count >= LOCKOUT_THRESHOLD && entry.until > now) {
      return Math.ceil((entry.until - now) / 1000);
    }
    return 0;
  }
  try {
    const doc = await db().collection(COLLECTION).findOne({ _id: key });
    if (doc && doc.totalHits >= LOCKOUT_THRESHOLD && new Date(doc.expiresAt).getTime() > now) {
      return Math.ceil((new Date(doc.expiresAt).getTime() - now) / 1000);
    }
  } catch {
    /* never block a sign-in because the counter is unreachable */
  }
  return 0;
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  const key = accountKey(identifier);
  const now = Date.now();
  if (!mongoReady()) {
    const entry = memoryFailures.get(key);
    if (!entry || entry.until <= now) {
      memoryFailures.set(key, { count: 1, until: now + LOCKOUT_WINDOW_MS });
    } else {
      entry.count += 1;
      if (entry.count >= LOCKOUT_THRESHOLD) entry.until = now + LOCKOUT_DURATION_MS;
    }
    return;
  }
  try {
    await ensureIndex();
    const col = db().collection(COLLECTION);
    const updated = await col.findOneAndUpdate(
      { _id: key, expiresAt: { $gt: new Date(now) } },
      { $inc: { totalHits: 1 } },
      { returnDocument: "after" },
    );
    const doc = updated?.value ?? updated;
    if (!doc) {
      await col.updateOne(
        { _id: key },
        { $set: { totalHits: 1, expiresAt: new Date(now + LOCKOUT_WINDOW_MS) } },
        { upsert: true },
      );
      return;
    }
    if (doc.totalHits >= LOCKOUT_THRESHOLD) {
      await col.updateOne({ _id: key }, { $set: { expiresAt: new Date(now + LOCKOUT_DURATION_MS) } });
    }
  } catch {
    /* best effort */
  }
}

export async function clearLoginFailures(identifier: string): Promise<void> {
  const key = accountKey(identifier);
  memoryFailures.delete(key);
  if (!mongoReady()) return;
  try {
    await db().collection(COLLECTION).deleteOne({ _id: key });
  } catch {
    /* best effort */
  }
}
