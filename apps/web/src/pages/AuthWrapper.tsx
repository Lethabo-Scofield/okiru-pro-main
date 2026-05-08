import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import Onboarding from "@/pages/Onboarding";
import { useAuth } from "@toolkit/lib/auth";
import { Button } from "@toolkit/components/ui/button";
import {
  AUTH_JUST_COMPLETED_KEY,
  ONBOARDING_VISIBLE_KEY,
  PENDING_TEAM_INVITE_KEY,
  readSessionFlag,
  setOnboardingFlowVisible,
  clearOnboardingFlowVisible,
} from "@toolkit/lib/authFlowFlags";
import { AUTH_ENTRY_SITE } from "@/lib/authRoutes";
import { useEffect, useState } from "react";
import { fetchOnboardingStatus } from "@/lib/onboardingStatus";
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
    entryFromSite: params.get("entry") === AUTH_ENTRY_SITE,
    /** Explicit continue to company profile (from interim screen or deep links). */
    resumeOnboarding: params.get("resumeOnboarding") === "1",
  };
}

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [gate, setGate] = useState<
    "anon" | "checking" | "company" | "leaving" | "signedInContinue"
  >("anon");
  /** Ensures we re-open onboarding after "Continue" even if the router omits `?` from location deps. */
  const [userChoseContinueProfile, setUserChoseContinueProfile] = useState(false);

  const { defaultMode, redirectTo, entryFromSite, resumeOnboarding } = readAuthQuery();

  useEffect(() => {
    if (!user) {
      setUserChoseContinueProfile(false);
      setGate("anon");
      return;
    }
    setGate("checking");
    let cancelled = false;

    const q = readAuthQuery();
    const rTo = q.redirectTo;
    const fromSite = q.entryFromSite;
    const resume = q.resumeOnboarding || userChoseContinueProfile;

    (async () => {
      try {
        const status = await fetchOnboardingStatus();
        if (cancelled) return;
        if (status === "onboarded") {
          if (readSessionFlag(PENDING_TEAM_INVITE_KEY)) {
            setOnboardingFlowVisible();
            setGate("company");
            return;
          }
          clearOnboardingFlowVisible();
          setGate("leaving");
          navigate(rTo || "/hub", { replace: true });
          return;
        }

        const authJustCompleted = readSessionFlag(AUTH_JUST_COMPLETED_KEY);
        const onboardingVisible = readSessionFlag(ONBOARDING_VISIBLE_KEY);
        const fromGatedDestination = Boolean(rTo);

        // Company form only when signup/gated flow explicitly requires it — not because `mode=register`
        // is still on the URL while already logged in (Get started would trap users like Login did).
        const forceCompanyProfile =
          authJustCompleted || fromGatedDestination || onboardingVisible || resume;

        const marketingSiteIncomplete =
          fromSite &&
          !resume &&
          !fromGatedDestination &&
          !authJustCompleted &&
          !onboardingVisible;

        if (forceCompanyProfile) {
          try {
            sessionStorage.removeItem(AUTH_JUST_COMPLETED_KEY);
          } catch {
            /* empty */
          }
          setOnboardingFlowVisible();
          setGate("company");
          return;
        }

        if (marketingSiteIncomplete) {
          setGate("signedInContinue");
          return;
        }

        navigate("/", { replace: true });
      } catch {
        if (cancelled) return;
        if (readSessionFlag(ONBOARDING_VISIBLE_KEY) || readSessionFlag(AUTH_JUST_COMPLETED_KEY)) {
          try {
            sessionStorage.removeItem(AUTH_JUST_COMPLETED_KEY);
          } catch {
            /* empty */
          }
          setOnboardingFlowVisible();
          setGate("company");
        } else {
          navigate("/", { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, navigate, redirectTo, entryFromSite, resumeOnboarding, userChoseContinueProfile]);

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

  if (gate === "signedInContinue") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <p className="text-center text-muted-foreground max-w-md mb-2">
          You&apos;re signed in as <span className="text-foreground font-medium">{user.username}</span>.
        </p>
        <p className="text-center text-sm text-muted-foreground max-w-md mb-8">
          Finish your company profile to use the hub and apps, sign out to use another account, or go back home.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => {
              setUserChoseContinueProfile(true);
              navigate("/auth?entry=site&resumeOnboarding=1", { replace: true });
            }}
          >
            Continue company profile
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={async () => {
              await logout();
              const p = new URLSearchParams();
              p.set("entry", AUTH_ENTRY_SITE);
              navigate(`/auth?${p.toString()}`, { replace: true });
            }}
          >
            Sign out
          </Button>
          <Button size="lg" variant="ghost" onClick={() => navigate("/", { replace: true })}>
            Home
          </Button>
        </div>
      </div>
    );
  }

  if (gate === "company") {
    return (
      <Onboarding
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
