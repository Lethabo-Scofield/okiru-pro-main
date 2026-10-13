/**
 * "Remember this device" lets a browser stand in for the emailed code. These
 * pin what must make it stop standing in: another account, expiry, tampering,
 * a password change, and the feature being switched off.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  issueTrustedDeviceToken,
  readCookie,
  trustedDeviceDays,
  verifyTrustedDeviceToken,
} from "../trustedDevice";

const SECRET = "test-session-secret";
const alice = { id: "user-alice", password: "$2a$12$aliceHashAliceHashAliceHash" };
const bob = { id: "user-bob", password: "$2a$12$bobHashBobHashBobHashBobHas" };
const NOW = Date.UTC(2026, 9, 6, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  delete process.env.TRUSTED_DEVICE_DAYS;
});

describe("trusted device token", () => {
  it("is accepted for the account it was issued to, within its lifetime", () => {
    const issued = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    expect(issued.maxAgeMs).toBe(30 * DAY);
    expect(verifyTrustedDeviceToken(issued.token, alice, SECRET, NOW + 29 * DAY)).toBe(true);
  });

  it("is refused for any other account", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    expect(verifyTrustedDeviceToken(token, bob, SECRET, NOW)).toBe(false);
    // Swapping the account id inside the token does not help: the signature covers it.
    const parts = token.split(".");
    parts[1] = Buffer.from(bob.id).toString("base64url");
    expect(verifyTrustedDeviceToken(parts.join("."), bob, SECRET, NOW)).toBe(false);
  });

  it("expires", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    expect(verifyTrustedDeviceToken(token, alice, SECRET, NOW + 30 * DAY + 1000)).toBe(false);
  });

  it("cannot have its expiry extended", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 1)!;
    const parts = token.split(".");
    parts[2] = String(Number(parts[2]) + 365 * 24 * 3600);
    expect(verifyTrustedDeviceToken(parts.join("."), alice, SECRET, NOW + 2 * DAY)).toBe(false);
  });

  it("stops working when the password changes — a reset forgets every device", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    const afterReset = { ...alice, password: "$2a$12$aNewHashAfterThePasswordReset" };
    expect(verifyTrustedDeviceToken(token, afterReset, SECRET, NOW)).toBe(false);
  });

  it("stops working when the signing secret rotates", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    expect(verifyTrustedDeviceToken(token, alice, "rotated-secret", NOW)).toBe(false);
  });

  it("refuses malformed input without throwing", () => {
    for (const junk of ["", "td1", "td1.a.b", "td2.YQ.9999999999.sig", "td1.%%%.1.x", "td1.YQ.notanumber.sig"]) {
      expect(verifyTrustedDeviceToken(junk, alice, SECRET, NOW)).toBe(false);
    }
    expect(verifyTrustedDeviceToken(null, alice, SECRET, NOW)).toBe(false);
    expect(verifyTrustedDeviceToken("x", null, SECRET, NOW)).toBe(false);
  });

  it("is never issued or honoured without a secret", () => {
    expect(issueTrustedDeviceToken(alice, "", NOW, 30)).toBeNull();
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    expect(verifyTrustedDeviceToken(token, alice, "", NOW)).toBe(false);
  });

  it("is switched off by TRUSTED_DEVICE_DAYS=0, including for cookies already handed out", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 30)!;
    process.env.TRUSTED_DEVICE_DAYS = "0";
    expect(trustedDeviceDays()).toBe(0);
    expect(issueTrustedDeviceToken(alice, SECRET, NOW)).toBeNull();
    expect(verifyTrustedDeviceToken(token, alice, SECRET, NOW)).toBe(false);
  });

  it("honours a shortened lifetime for cookies already handed out", () => {
    const { token } = issueTrustedDeviceToken(alice, SECRET, NOW, 90)!;
    process.env.TRUSTED_DEVICE_DAYS = "1";
    expect(verifyTrustedDeviceToken(token, alice, SECRET, NOW + 60 * DAY)).toBe(false);
    expect(verifyTrustedDeviceToken(token, alice, SECRET, NOW)).toBe(false);
    const fresh = issueTrustedDeviceToken(alice, SECRET, NOW)!;
    expect(verifyTrustedDeviceToken(fresh.token, alice, SECRET, NOW)).toBe(true);
  });

  it("defaults to 30 days and caps configuration at 90", () => {
    expect(trustedDeviceDays()).toBe(30);
    process.env.TRUSTED_DEVICE_DAYS = "365";
    expect(trustedDeviceDays()).toBe(90);
    process.env.TRUSTED_DEVICE_DAYS = "nonsense";
    expect(trustedDeviceDays()).toBe(0);
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    const header = "okiru.web.sid=s%3Aabc; okiru.td=td1.dXNlcg.123.sig; theme=dark";
    expect(readCookie(header, "okiru.td")).toBe("td1.dXNlcg.123.sig");
    expect(readCookie(header, "okiru.web.sid")).toBe("s:abc");
  });

  it("does not match a cookie whose name only ends with the one asked for", () => {
    expect(readCookie("xokiru.td=evil", "okiru.td")).toBeNull();
  });

  it("returns null when absent or undecodable", () => {
    expect(readCookie(undefined, "okiru.td")).toBeNull();
    expect(readCookie("theme=dark", "okiru.td")).toBeNull();
    expect(readCookie("okiru.td=%E0%A4%A", "okiru.td")).toBeNull();
  });
});
