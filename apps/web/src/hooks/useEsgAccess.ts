import { useEffect, useState } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { API_BASE } from "@toolkit/lib/config";

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
          // Fail CLOSED: the server is the authority on access, so an error
          // response must not fall through to the permissive client check
          // (an empty allowlist there means "open to all").
          setAllowed(false);
        }
      } catch {
        if (!cancelled) setAllowed(false);
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
