import { describe, it, expect } from "vitest";
import {
  BCRYPT_COST,
  checkPasswordStrength,
  hashOtp,
  hashPassword,
  verifyOtp,
  verifyPassword,
} from "../passwords";

describe("password policy", () => {
  it("requires at least ten characters", () => {
    expect(checkPasswordStrength("Ab3!xyz").ok).toBe(false);
    expect(checkPasswordStrength("Ab3!xyzab").ok).toBe(false);
    expect(checkPasswordStrength("Ab3!xyzabc").ok).toBe(true);
  });

  it("rejects the passwords this codebase itself has shipped", () => {
    // The seeded demo account and the admin reset default. If either of these
    // ever passes again, someone has widened the policy by accident.
    expect(checkPasswordStrength("DemoPass2026!").ok).toBe(false);
    expect(checkPasswordStrength("Okiru123!!").ok).toBe(false);
  });

  it("sees through digit substitution", () => {
    expect(checkPasswordStrength("P4ssw0rd!!").ok).toBe(false);
    expect(checkPasswordStrength("Passw0rd12").ok).toBe(false);
  });

  it("rejects a password built from the person's own details", () => {
    const check = checkPasswordStrength("Thandanani99!", ["ops@thandanani.co.za", "Thandanani"]);
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/name, email or company/i);
  });

  it("accepts a long passphrase without symbol gymnastics", () => {
    expect(checkPasswordStrength("correct horse battery staple").ok).toBe(true);
  });

  it("requires variety below sixteen characters", () => {
    expect(checkPasswordStrength("qwertyuiopas").ok).toBe(false);
    expect(checkPasswordStrength("Rainmaker42").ok).toBe(true);
  });

  it("rejects simple sequences", () => {
    expect(checkPasswordStrength("Xy123456789").ok).toBe(false);
    expect(checkPasswordStrength("abcdefghijAB1").ok).toBe(false);
  });
});

describe("password hashing", { timeout: 60_000 }, () => {
  it("hashes at the current work factor", async () => {
    const hash = await hashPassword("a-real-passphrase-here");
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(12);
    expect(hash.split("$")[2]).toBe(String(BCRYPT_COST).padStart(2, "0"));
  });

  it("verifies and flags a hash made at the old work factor", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    // This is what every account created before the fix looks like.
    const legacy = await bcrypt.hash("a-real-passphrase-here", 8);
    const result = await verifyPassword("a-real-passphrase-here", legacy);
    expect(result.ok).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it("does not flag a current hash", async () => {
    const hash = await hashPassword("a-real-passphrase-here");
    const result = await verifyPassword("a-real-passphrase-here", hash);
    expect(result.ok).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it("rejects a wrong password and a missing hash without throwing", async () => {
    const hash = await hashPassword("a-real-passphrase-here");
    expect((await verifyPassword("wrong", hash)).ok).toBe(false);
    expect((await verifyPassword("anything", null)).ok).toBe(false);
    expect((await verifyPassword("anything", undefined)).ok).toBe(false);
  });
});

describe("one-time codes", () => {
  it("does not store the code itself", () => {
    const stored = hashOtp("123456");
    expect(stored).not.toContain("123456");
    expect(stored.startsWith("sha256:")).toBe(true);
  });

  it("verifies a hashed code", () => {
    expect(verifyOtp("123456", hashOtp("123456"))).toBe(true);
    expect(verifyOtp("123457", hashOtp("123456"))).toBe(false);
    expect(verifyOtp(" 123456 ", hashOtp("123456"))).toBe(true);
  });

  it("still verifies codes issued before hashing, so nobody is locked out mid-flight", () => {
    expect(verifyOtp("123456", "123456")).toBe(true);
    expect(verifyOtp("999999", "123456")).toBe(false);
  });

  it("rejects non-string and empty input", () => {
    expect(verifyOtp(undefined, hashOtp("123456"))).toBe(false);
    expect(verifyOtp(123456 as unknown as string, hashOtp("123456"))).toBe(false);
    expect(verifyOtp("123456", null)).toBe(false);
  });
});
