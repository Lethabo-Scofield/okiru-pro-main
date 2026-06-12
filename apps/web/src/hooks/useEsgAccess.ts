import { useEffect, useState } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { API_BASE } from "@toolkit/lib/config";
import { canAccessEsgToolkit } from "@/lib/esgAccess";

/** Resolves ESG toolkit access — server /api/esg/access with client fallback. */
export function useEsgAccess(): { allowed: boolean; loading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/esg/access`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { allowed?: boolean };
          if (!cancelled) setAllowed(Boolean(data.allowed));
        } else if (!cancelled) {
          setAllowed(canAccessEsgToolkit(user));
        }
      } catch {
        if (!cancelled) setAllowed(canAccessEsgToolkit(user));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { allowed, loading: authLoading || loading };
}
