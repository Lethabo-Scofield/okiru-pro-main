import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="h-10 w-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
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

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/hub", { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (user && !isLoading) return null;

  return <>{children}</>;
}
