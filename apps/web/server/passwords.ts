/**
 * Password hashing and strength policy.
 *
 * One place, because the work factor was previously written as a literal at six
 * call sites and had drifted to three different values (8 on sign-up, 10 on
 * reset, 12 in the other service). Everything now goes through `hashPassword`.
 *
 * Existing accounts are upgraded transparently: `verifyPassword` reports when a
 * stored hash was made with a weaker factor, and the sign-in path re-hashes it
 * with the password the person just proved they know. No reset email, no
 * forced change.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * OWASP's 2026 guidance for bcrypt is a work factor of 12 or more. Kept
 * overridable so a constrained environment can lower it deliberately rather
 * than by accident, with a floor that stops it going back to where it was.
 */
export const BCRYPT_COST = Math.max(10, Number(process.env.BCRYPT_COST || 12));

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Passwords seen constantly in credential-stuffing lists, plus the ones this
 * codebase itself has shipped as defaults. Compared case- and digit-normalised
 * so `Passw0rd!` does not slip past `password`.
 */
const BANNED = new Set([
  "password",
  "passw0rd",
  "password1",
  "qwerty",
  "qwertyuiop",
  "letmein",
  "welcome",
  "admin",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "abc123",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "changeme",
  "secret",
  "demo",
  "test",
  "okiru",
  "okiru123",
  "demopass2026",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s");
}

/**
 * The banned list put through the same normalisation as the candidate, so a
 * banned entry that itself contains digits (`demopass2026`) still matches once
 * both sides have been flattened.
 */
const BANNED_NORMALISED = new Set(Array.from(BANNED).map(normalise));

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/**
 * Minimum bar for a password protecting client data. Length does most of the
 * work — a long passphrase beats a short password with a symbol in it — so the
 * character-class requirement only applies below 16 characters.
 */
export function checkPasswordStrength(password: unknown, context: string[] = []): PasswordCheck {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "Password is required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters` };
  }

  const flat = normalise(password);

  if (BANNED_NORMALISED.has(flat)) {
    return { ok: false, message: "That password is too common. Please choose another." };
  }
  for (const banned of Array.from(BANNED_NORMALISED)) {
    if (banned.length >= 6 && flat.includes(banned)) {
      return { ok: false, message: "That password is too common. Please choose another." };
    }
  }

  // A password that is mostly the person's own email or company name is
  // guessable by anyone who knows who they are.
  for (const item of context) {
    if (typeof item !== "string") continue;
    const token = normalise(item.split("@")[0] || "");
    if (token.length >= 4 && flat.includes(token)) {
      return { ok: false, message: "Password must not contain your name, email or company" };
    }
  }

  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: "Password must not be a single repeated character" };
  }

  const sequential = "abcdefghijklmnopqrstuvwxyz";
  const digits = "01234567890";
  for (let i = 0; i + 6 <= sequential.length; i += 1) {
    if (flat.includes(sequential.slice(i, i + 6))) {
      return { ok: false, message: "Password must not be a simple sequence" };
    }
  }
  for (let i = 0; i + 6 <= digits.length; i += 1) {
    if (password.includes(digits.slice(i, i + 6))) {
      return { ok: false, message: "Password must not be a simple sequence" };
    }
  }

  if (password.length < 16) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password))
      .length;
    if (classes < 3) {
      return {
        ok: false,
        message:
          "Use at least three of: lower case, upper case, numbers, symbols — or make it 16+ characters",
      };
    }
  }

  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export interface VerifyResult {
  ok: boolean;
  /** True when the stored hash used a weaker work factor than we now require. */
  needsRehash: boolean;
}

function costOf(hash: string): number {
  const parts = hash.split("$");
  const cost = Number(parts[2]);
  return Number.isFinite(cost) ? cost : 0;
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<VerifyResult> {
  if (!hash) {
    // Still spend the time — otherwise a missing account answers measurably
    // faster than a wrong password and the difference enumerates users.
    await bcrypt.compare(password, "$2a$12$" + "x".repeat(53));
    return { ok: false, needsRehash: false };
  }
  const ok = await bcrypt.compare(password, hash);
  return { ok, needsRehash: ok && costOf(hash) < BCRYPT_COST };
}

/* ------------------------------------------------------------------ *
 * One-time codes
 *
 * OTP and password-reset codes were stored in the user document in clear text,
 * so anyone who could read the database — or a backup of it — could use a live
 * code. They are hashed now. Codes issued before this change still verify
 * against their stored clear-text value until they expire.
 * ------------------------------------------------------------------ */

export function hashOtp(code: string): string {
  const pepper = process.env.SESSION_SECRET || "okiru-otp-pepper";
  return `sha256:${crypto.createHmac("sha256", pepper).update(code.trim()).digest("hex")}`;
}

/** Constant-time comparison that also accepts pre-existing clear-text codes. */
export function verifyOtp(input: unknown, stored: string | null | undefined): boolean {
  if (typeof input !== "string" || !stored) return false;
  const candidate = stored.startsWith("sha256:") ? hashOtp(input) : input.trim();
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
