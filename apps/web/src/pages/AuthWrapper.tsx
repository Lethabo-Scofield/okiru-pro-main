import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import Onboarding from "@/pages/Onboarding";
import { useAuth } from "@toolkit/lib/auth";
import {
  AUTH_JUST_COMPLETED_KEY,
  PENDING_TEAM_INVITE_KEY,
  readSessionFlag,
  setOnboardingFlowVisible,
  clearOnboardingFlowVisible,
} from "@toolkit/lib/authFlowFlags";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

function readAuthQuery() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const rawRedirect = params.get("redirect") || "";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : null;
  return {
    defaultMode: (params.get("mode")?.toLowerCase() === "register" ? "register" : "login") as
      | "login"
      | "register",
    redirectTo,
  };
}

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [gate, setGate] = useState<"anon" | "checking" | "team" | "leaving">("anon");

  const { defaultMode, redirectTo } = readAuthQuery();

  useEffect(() => {
    if (!user) {
      setGate("anon");
      return;
    }
    setGate("checking");
    const q = readAuthQuery();
    const rTo = q.redirectTo;
    const isNewAccount = readSessionFlag(AUTH_JUST_COMPLETED_KEY);
    const hasPendingInvite = readSessionFlag(PENDING_TEAM_INVITE_KEY);
    try { sessionStorage.removeItem(AUTH_JUST_COMPLETED_KEY); } catch { /* empty */ }

    if (isNewAccount || hasPendingInvite) {
      setOnboardingFlowVisible();
      setGate("team");
    } else {
      clearOnboardingFlowVisible();
      setGate("leaving");
      navigate(rTo || "/hub", { replace: true });
    }

  }, [user, navigate, redirectTo]);

  if (!user) {
    const q = typeof window !== "undefined" ? window.location.search : "";
    return <AuthPage key={q || "auth"} defaultMode={defaultMode} />;
  }

  if (gate === "anon" || gate === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gate === "team") {
    return (
      <Onboarding
        startAtTeam
        redirectProp={redirectTo}
        onFullyDone={(path) => {
          clearOnboardingFlowVisible();
          try {
            sessionStorage.removeItem(PENDING_TEAM_INVITE_KEY);
          } catch {
            /* empty */
          }
          navigate(path, { replace: true });
        }}
      />
    );
  }

  return null;
}
