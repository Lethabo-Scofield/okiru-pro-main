import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect, useMemo, useRef } from "react";
import { fetchOnboardingStatus } from "@/lib/onboardingStatus";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  /** Marks that post-auth redirect (onboarding vs hub) already ran for this user id. */
  const postAuthHandledForUserIdRef = useRef<string | null>(null);
  /** Avoid overlapping checkOnboardingGate calls when user/context re-renders mid-flight. */
  const gateInFlightRef = useRef(false);

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
    if (!user) {
      postAuthHandledForUserIdRef.current = null;
      gateInFlightRef.current = false;
      return;
    }
    if (postAuthHandledForUserIdRef.current === user.id) return;
    if (gateInFlightRef.current) return;
    gateInFlightRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const status = await fetchOnboardingStatus();
        if (cancelled) return;

        postAuthHandledForUserIdRef.current = user.id;

        if (status === "needs-onboarding") {
          const dest = redirectTo
            ? `/onboarding?redirect=${encodeURIComponent(redirectTo)}`
            : "/onboarding";
          navigate(dest, { replace: true });
        } else {
          navigate(redirectTo || "/hub", { replace: true });
        }
      } finally {
        gateInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, navigate, redirectTo]);

  if (user) return null;

  return <AuthPage defaultMode={defaultMode as "register" | "login"} />;
}
