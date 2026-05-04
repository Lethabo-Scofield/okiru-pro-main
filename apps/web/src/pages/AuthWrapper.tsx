import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect, useMemo } from "react";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

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
    if (user) {
      navigate(redirectTo || "/hub", { replace: true });
    }
  }, [user, navigate, redirectTo]);

  return <AuthPage defaultMode={defaultMode as "register" | "login"} />;
}
