import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect, useMemo, useRef } from "react";

async function checkOnboardingStatus(): Promise<"onboarded" | "needs-onboarding"> {
  // Try up to 3 times with a small backoff: covers the brief window after
  // POST /api/auth/register where the new session cookie may not yet be
  // attached to subsequent fetches in some browsers (esp. SameSite=None).
  // 200 -> profile exists -> "onboarded"
  // 404 -> no profile -> "needs-onboarding"
  // 401/transient -> retry. After all retries, default to "needs-onboarding"
  //   (safer for fresh signups than skipping onboarding).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/onboarding/me", { credentials: "include" });
      if (res.status === 200) return "onboarded";
      if (res.status === 404) return "needs-onboarding";
      // 401 or 5xx -> wait briefly and retry
    } catch {
      // network error -> retry
    }
    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  return "needs-onboarding";
}

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const lastHandledUserRef = useRef<string | null>(null);

  const { defaultMode, redirectTo } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect") || "";
    // Only allow same-origin paths to avoid open-redirect issues
    const safeRedirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : null;
    return {
      defaultMode: params.get("mode") === "register" ? "register" : "login",
      redirectTo: safeRedirect,
    };
  }, []);

  useEffect(() => {
    // Reset the "handled" guard whenever the user changes (e.g., logout then
    // re-register from the same /auth mount), so the redirect always fires
    // for a freshly authenticated user.
    if (!user) {
      lastHandledUserRef.current = null;
      return;
    }
    if (lastHandledUserRef.current === user.id) return;
    lastHandledUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      const status = await checkOnboardingStatus();
      if (cancelled) return;

      if (status === "needs-onboarding") {
        const dest = redirectTo
          ? `/onboarding?redirect=${encodeURIComponent(redirectTo)}`
          : "/onboarding";
        navigate(dest, { replace: true });
      } else {
        navigate(redirectTo || "/hub", { replace: true });
      }
    })();

    return () => { cancelled = true; };
  }, [user, navigate, redirectTo]);

  if (user) return null;

  return <AuthPage defaultMode={defaultMode as "register" | "login"} />;
}
