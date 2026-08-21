/**
 * A signed-out caller must be reported as `unauthenticated`, not
 * `needs-onboarding`. Collapsing the two put users on the onboarding screen
 * with a dead session, where every action 401s — reported as "cannot get past
 * onboarding" after okiru.pro's DNS moved and the old cookie stopped matching.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { checkOnboardingGate, fetchOnboardingStatus, isCompleteOnboardingProfile } from "../onboardingStatus";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce(r));
  fn.mockResolvedValue(responses[responses.length - 1]);
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Exhausting all six attempts burns 5250ms of real backoff, over vitest's 5s
// default. Tests that go the full distance opt into a longer budget.
const RETRY_EXHAUSTED_MS = 15000;

afterEach(() => vi.unstubAllGlobals());

describe("checkOnboardingGate", () => {
  it("reports a completed profile as onboarded", async () => {
    mockFetch([json({ profile: { companyName: "BrianTest" } })]);
    await expect(checkOnboardingGate()).resolves.toEqual({
      status: "onboarded",
      profile: { companyName: "BrianTest" },
    });
  });

  it("reports a signed-in user with no profile as needs-onboarding", async () => {
    mockFetch([json({ profile: null })]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "needs-onboarding" });
  });

  it("still treats a legacy 404 as needs-onboarding", async () => {
    mockFetch([new Response("", { status: 404 })]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "needs-onboarding" });
  });

  it("reports a persistently rejected session as unauthenticated", async () => {
    const fn = mockFetch([json({ message: "Not authenticated" }, 401)]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "unauthenticated" });
    expect(fn).toHaveBeenCalledTimes(6); // the Set-Cookie race still gets its retries
  }, RETRY_EXHAUSTED_MS);

  it("treats 403 the same as 401", async () => {
    mockFetch([json({ message: "2FA verification required" }, 403)]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "unauthenticated" });
  }, RETRY_EXHAUSTED_MS);

  it("does NOT call a 401 unauthenticated if a later attempt succeeds", async () => {
    // The exact race the retries exist for: cookie not visible on the first call.
    mockFetch([
      json({ message: "Not authenticated" }, 401),
      json({ profile: { companyName: "BrianTest" } }),
    ]);
    await expect(checkOnboardingGate()).resolves.toMatchObject({ status: "onboarded" });
  });

  it("does not report a server error as signed-out", async () => {
    // A 500 is not an auth answer — calling it `unauthenticated` would sign
    // people out on a backend wobble.
    mockFetch([json({ message: "boom" }, 500)]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "needs-onboarding" });
  }, RETRY_EXHAUSTED_MS);

  it("does not report a network failure as signed-out", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fn);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "needs-onboarding" });
  }, RETRY_EXHAUSTED_MS);

  it("never lets an HTML 200 fallback skip onboarding", async () => {
    mockFetch([new Response("<!DOCTYPE html>", { status: 200, headers: { "content-type": "text/html" } })]);
    await expect(checkOnboardingGate()).resolves.toEqual({ status: "needs-onboarding" });
  }, RETRY_EXHAUSTED_MS);
});

describe("fetchOnboardingStatus", () => {
  it("surfaces the unauthenticated status to callers", async () => {
    mockFetch([json({ message: "Not authenticated" }, 401)]);
    await expect(fetchOnboardingStatus()).resolves.toBe("unauthenticated");
  }, RETRY_EXHAUSTED_MS);
});

describe("isCompleteOnboardingProfile", () => {
  it("rejects a blank or missing company name", () => {
    expect(isCompleteOnboardingProfile({ companyName: "  " })).toBe(false);
    expect(isCompleteOnboardingProfile({})).toBe(false);
    expect(isCompleteOnboardingProfile(null)).toBe(false);
    expect(isCompleteOnboardingProfile({ companyName: "Okiru" })).toBe(true);
  });
});
