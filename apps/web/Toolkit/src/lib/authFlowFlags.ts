/** Session flags so /auth does not jump straight into company onboarding on cold visits (e.g. typing okiru.pro/auth or restoring a tab). */

export const AUTH_JUST_COMPLETED_KEY = "okiru-auth-just-completed";
export const ONBOARDING_VISIBLE_KEY = "okiru-onboarding-visible";
/** Set after POST /api/onboarding succeeds so the “add teammate” step can finish even after refresh. */
export const PENDING_TEAM_INVITE_KEY = "okiru-pending-team-invite";

export function markAuthSessionJustCompleted() {
  try {
    sessionStorage.setItem(AUTH_JUST_COMPLETED_KEY, "1");
  } catch {
    /* private / disabled storage */
  }
}

export function setOnboardingFlowVisible() {
  try {
    sessionStorage.setItem(ONBOARDING_VISIBLE_KEY, "1");
  } catch {
    /* empty */
  }
}

export function clearOnboardingFlowVisible() {
  try {
    sessionStorage.removeItem(ONBOARDING_VISIBLE_KEY);
  } catch {
    /* empty */
  }
}

export function clearAuthFlowSessionFlags() {
  try {
    sessionStorage.removeItem(AUTH_JUST_COMPLETED_KEY);
    sessionStorage.removeItem(ONBOARDING_VISIBLE_KEY);
    sessionStorage.removeItem(PENDING_TEAM_INVITE_KEY);
  } catch {
    /* empty */
  }
}

export function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
