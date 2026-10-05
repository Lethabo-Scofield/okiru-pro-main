import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { fetchOnboardingStatus } from "@/lib/onboardingStatus";

function FullScreenSpinner() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-white bg-cover bg-center"
      style={{ backgroundImage: "url('/hub-background.png')" }}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <FullScreenSpinner />;
  if (!user) return null;

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setResolved(true);
      return;
    }

    setResolved(false);
    let cancelled = false;
    (async () => {
      const status = await fetchOnboardingStatus();
      if (cancelled) return;
      if (status === "onboarded") {
        navigate("/hub", { replace: true });
        return;
      }
      // Incomplete company profile: keep them on the marketing site (e.g. Back from /auth/onboarding).
      // Hub and /auth still gate completion where needed.
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isLoading, navigate]);

  if (isLoading || (user && !resolved)) {
    return <FullScreenSpinner />;
  }

  return <>{children}</>;
}

/** Redirects to /hub unless the current user's role is super_admin. */
export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!isSuperAdmin(user)) {
      navigate("/hub", { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <FullScreenSpinner />;
  if (!user || !isSuperAdmin(user)) return null;

  return <>{children}</>;
}
