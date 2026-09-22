/**
 * The session endpoint has to answer the same question requireAuth asks.
 *
 * It did not, and the gap locked a real user out of the product while telling
 * her she was signed in. Sessions created before the second factor was enforced
 * carry a userId and no otpVerified flag. `/api/auth/me` had no gate, so the
 * app restored the session, rendered the hub, listed nothing, and answered
 * every click with a 403 — eight attempts at "Create free scorecard" in ten
 * minutes, each one reported to her as "Server error".
 *
 * These tests pin the invariant rather than the incident: whatever gate guards
 * the product must also guard the endpoint that decides whether you are in it.
 * Drift between the two is invisible from either side alone.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROUTES = fs.readFileSync(
  path.resolve(__dirname, "../routes.ts"),
  "utf8",
);

/** The body of a named express handler, so the two gates can be compared. */
function handlerBody(marker: string, lines = 60): string {
  const at = ROUTES.indexOf(marker);
  expect(at, `could not find ${marker}`).toBeGreaterThan(-1);
  return ROUTES.slice(at).split("\n").slice(0, lines).join("\n");
}

const TWO_FACTOR_GATE =
  /\(user\.twofaEnabled \|\| twoFactorRequiredFor\(user\)\)\s*&&\s*\(req\.session as any\)\.otpVerified !== true/;

describe("the second-factor gate", () => {
  it("guards every authenticated route, through requireAuth", () => {
    const body = handlerBody("export async function requireAuth");
    expect(body).toMatch(TWO_FACTOR_GATE);
    expect(body).toMatch(/requires2FA: true/);
  });

  /**
   * The one that was missing. Without it the client cannot tell a usable
   * session from a half-authenticated one, because the only endpoint it asks
   * says yes while every other endpoint says no.
   */
  it("also guards /api/auth/me, so a half-verified session cannot look signed in", () => {
    const body = handlerBody('app.get("/api/auth/me"');
    expect(body).toMatch(TWO_FACTOR_GATE);
    expect(body).toMatch(/requires2FA: true/);
  });

  it("answers with 403 and a machine-readable flag, not a bare error", () => {
    const body = handlerBody('app.get("/api/auth/me"');
    // The client branches on requires2FA to send the user back to verification;
    // a 401 would read as "wrong password" and a plain 403 as "not allowed".
    expect(body).toMatch(/status\(403\)[\s\S]{0,200}requires2FA: true/);
  });

  /**
   * The demo identity holds no client data and has no mailbox, so enforcing a
   * second factor on it would lock the offline demo out of itself.
   */
  it("keeps letting the offline demo identity through", () => {
    const body = handlerBody("export async function requireAuth");
    const demoReturn = body.indexOf("return next();");
    const gate = body.search(TWO_FACTOR_GATE);
    expect(demoReturn).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(demoReturn);
  });
});
