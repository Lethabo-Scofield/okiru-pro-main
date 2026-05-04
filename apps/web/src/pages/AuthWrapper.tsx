import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect, useMemo, useRef } from "react";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const handlingRef = useRef(false);

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
    if (!user || handlingRef.current) return;
    handlingRef.current = true;

    (async () => {
      // Check whether the user has already completed company onboarding.
      // 200 -> profile exists, send them to their original destination.
      // 404 -> not onboarded, send them through onboarding first
      //         (preserving the original redirect target as a query param).
      let onboarded = true;
      try {
        const res = await fetch("/api/onboarding/me", { credentials: "include" });
        if (res.status === 404) onboarded = false;
        else if (!res.ok) onboarded = true; // fail-open: don't block existing users on transient errors
      } catch {
        onboarded = true;
      }

      if (!onboarded) {
        const dest = redirectTo
          ? `/onboarding?redirect=${encodeURIComponent(redirectTo)}`
          : "/onboarding";
        navigate(dest, { replace: true });
      } else {
        navigate(redirectTo || "/hub", { replace: true });
      }
    })();
  }, [user, navigate, redirectTo]);

  if (user) return null;

  return <AuthPage defaultMode={defaultMode as "register" | "login"} />;
}
