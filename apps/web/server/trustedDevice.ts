/**
 * "Remember this device" for the emailed sign-in code.
 *
 * Production requires a second factor on every account (twoFactorRequiredFor in
 * routes.ts), and since mail was configured in September every sign-in has cost
 * a trip to the inbox — including on the laptop someone signed in from the day
 * before. Sessions already last a week. What people were asking for is not to be
 * challenged again on a browser that has already proved it can read their mail.
 *
 * After a code is verified the browser may be given a signed cookie. A later
 * sign-in from that browser, with the right password, skips the code. The cookie
 * is only ever a second factor: the password is still required, and the cookie
 * names the one account it was issued to.
 *
 * It stops working on:
 *  - expiry (TRUSTED_DEVICE_DAYS, default 30, 0 turns the feature off);
 *  - any change to the stored password hash — the signature covers a
 *    fingerprint of it, so a password reset forgets every remembered device;
 *  - rotation of the session secret the signing key is derived from.
 *
 * Stateless on purpose: nothing to store, nothing to expire server-side.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

export const TRUSTED_DEVICE_COOKIE = "okiru.td";

/** Sent only to the sign-in endpoints, never to the rest of the API. */
export const TRUSTED_DEVICE_COOKIE_PATH = "/api/auth";

const VERSION = "td1";
const MAX_DAYS = 90;

export interface TrustedDeviceAccount {
  id: string;
  /** The stored password hash. Never the password itself. */
  password: string;
}

export function trustedDeviceDays(): number {
  const raw = process.env.TRUSTED_DEVICE_DAYS;
  if (raw === undefined || raw.trim() === "") return 30;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(Math.floor(days), MAX_DAYS);
}

function signingKey(secret: string): Buffer {
  // Domain-separated from the session cookie, which signs with the same secret.
  return createHmac("sha256", secret).update("okiru-trusted-device-v1").digest();
}

function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url");
}

function signature(secret: string, account: TrustedDeviceAccount, expiresAtSec: number): string {
  return createHmac("sha256", signingKey(secret))
    .update(`${VERSION}|${account.id}|${expiresAtSec}|${passwordFingerprint(account.password)}`)
    .digest("base64url");
}

export function issueTrustedDeviceToken(
  account: TrustedDeviceAccount,
  secret: string,
  now: number = Date.now(),
  days: number = trustedDeviceDays(),
): { token: string; maxAgeMs: number } | null {
  if (!secret || !account?.id || !account?.password || days <= 0) return null;
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  const expiresAtSec = Math.floor((now + maxAgeMs) / 1000);
  const token = [
    VERSION,
    Buffer.from(account.id, "utf8").toString("base64url"),
    String(expiresAtSec),
    signature(secret, account, expiresAtSec),
  ].join(".");
  return { token, maxAgeMs };
}

export function verifyTrustedDeviceToken(
  token: string | null | undefined,
  account: TrustedDeviceAccount | null | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token || !secret || !account?.id || !account?.password) return false;
  if (trustedDeviceDays() <= 0) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;

  const issuedTo = Buffer.from(parts[1], "base64url").toString("utf8");
  if (issuedTo !== account.id) return false;

  const expiresAtSec = Number(parts[2]);
  if (!Number.isInteger(expiresAtSec) || expiresAtSec * 1000 <= now) return false;

  const expected = Buffer.from(signature(secret, account, expiresAtSec));
  const given = Buffer.from(parts[3]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** One named cookie from a raw Cookie header. The web server has no cookie parser. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
