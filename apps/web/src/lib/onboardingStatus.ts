/**
 * Company onboarding is stored in Mongo (GET /api/onboarding/me).
 * We only treat the user as "onboarded" when the response is JSON with a non-empty companyName.
 * Prefer 200 + `{ profile: null }` when incomplete (avoids misleading browser 404 logs); legacy 404 is still accepted.
 * A bare 200 (e.g. HTML fallback) must NOT skip onboarding.
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
  | { status: "needs-onboarding" }
  | { status: "onboarded"; profile: Record<string, unknown> | null };

/**
 * Call after auth: reliable onboarding vs hub routing (retries help right after Set-Cookie).
 */
export async function checkOnboardingGate(): Promise<OnboardingGateResult> {
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

      // 401/403/5xx/non-JSON 200 → retry (session cookie may not be visible yet)
    } catch {
      /* network */
    }
    await delay(BASE_DELAY_MS * (attempt + 1));
  }

  return { status: "needs-onboarding" };
}

export async function fetchOnboardingStatus(): Promise<"onboarded" | "needs-onboarding"> {
  const r = await checkOnboardingGate();
  return r.status;
}
