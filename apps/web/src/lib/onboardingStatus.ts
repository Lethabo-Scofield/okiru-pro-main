/**
 * Company onboarding is stored in Mongo (GET /api/onboarding/me).
 * We only treat the user as "onboarded" when the response is JSON with a non-empty companyName.
 * Prefer 200 + `{ profile: null }` when incomplete (avoids misleading browser 404 logs); legacy 404 is still accepted.
 * A bare 200 (e.g. HTML fallback) must NOT skip onboarding.
 *
 * WHY "unauthenticated" IS ITS OWN ANSWER
 *
 * A signed-out caller and a signed-in caller with no company profile both used
 * to collapse into "needs-onboarding", so an expired or host-mismatched session
 * put the user on the onboarding screen where every action 401s — it reads as
 * "I can't get past onboarding" when the real state is "I am not signed in".
 * That is exactly what happened when okiru.pro's DNS moved: the session cookie
 * was bound to the previous host, so the browser stopped sending it.
 *
 * The retries below still exist for the genuine race right after Set-Cookie,
 * so a 401 is only reported as `unauthenticated` once every attempt has seen
 * one — never on the first.
 */

const ATTEMPTS = 6;
const BASE_DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isCompleteOnboardingProfile(profile: unknown): profile is { companyName: string } {
  if (!profile || typeof profile !== "object") return false;
  const name = (profile as { companyName?: unknown }).companyName;
  return typeof name === "string" && name.trim().length > 0;
}

export type OnboardingGateResult =
  | { status: "unauthenticated" }
  | { status: "needs-onboarding" }
  | { status: "onboarded"; profile: Record<string, unknown> | null };

/**
 * Call after auth: reliable onboarding vs hub routing (retries help right after Set-Cookie).
 */
export async function checkOnboardingGate(): Promise<OnboardingGateResult> {
  // Only meaningful if EVERY attempt was rejected for auth: one 401 during the
  // Set-Cookie race says nothing, six in a row says the session is not valid.
  let everyAttemptUnauthorized = true;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch("/api/onboarding/me", { credentials: "include" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (res.status === 404) {
        return { status: "needs-onboarding" };
      }

      if (res.status === 200 && ct.includes("application/json")) {
        // Handles both completed profiles and `{ profile: null }` for not-started onboarding.
        const data = (await res.json().catch(() => null)) as { profile?: unknown } | null;
        const profile = data?.profile;
        if (isCompleteOnboardingProfile(profile)) {
          return { status: "onboarded", profile: profile as Record<string, unknown> };
        }
        return { status: "needs-onboarding" };
      }

      // 401/403 → the session is missing or rejected. 5xx and non-JSON 200 are
      // something else entirely, so they must not be reported as signed-out.
      if (res.status !== 401 && res.status !== 403) {
        everyAttemptUnauthorized = false;
      }
    } catch {
      /* network — not an auth answer */
      everyAttemptUnauthorized = false;
    }
    await delay(BASE_DELAY_MS * (attempt + 1));
  }

  return everyAttemptUnauthorized ? { status: "unauthenticated" } : { status: "needs-onboarding" };
}

export async function fetchOnboardingStatus(): Promise<
  "onboarded" | "needs-onboarding" | "unauthenticated"
> {
  const r = await checkOnboardingGate();
  return r.status;
}
