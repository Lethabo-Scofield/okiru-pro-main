import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { fetchOnboardingStatus } from "@/lib/onboardingStatus";

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="h-10 w-10 border-2 border-[#636366] border-t-transparent rounded-full animate-spin" />
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
    if (user.role !== "super_admin") {
      navigate("/hub", { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <FullScreenSpinner />;
  if (!user || user.role !== "super_admin") return null;

  return <>{children}</>;
}
