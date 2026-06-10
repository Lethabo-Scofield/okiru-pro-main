import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useEsgAccess } from "@/hooks/useEsgAccess";

/** Guards /esg/* surfaces — requires ESG access (all authenticated users). */
export function EsgPreviewRoute({ children }: { children: React.ReactNode }) {
  const { allowed, loading } = useEsgAccess();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !allowed) {
      navigate("/hub", { replace: true });
    }
  }, [allowed, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#636366]" />
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
