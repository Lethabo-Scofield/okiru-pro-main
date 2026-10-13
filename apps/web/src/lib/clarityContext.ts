/**
 * Labels Microsoft Clarity sessions so recordings and heatmaps can be filtered
 * by product (B-BBEE / ESG) and by signed-in user.
 *
 * Clarity itself is loaded by the server only when CLARITY_PROJECT_ID is set
 * (server/clarity.ts); with it absent `window.clarity` never exists and this
 * is a no-op. Only the opaque internal user id is sent — never a name or an
 * email — and Clarity hashes it before storing.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export type ClarityProduct = "esg" | "bbbee" | "platform";

/** Which product a route belongs to, for filtering recordings. */
export function productForPath(path: string): ClarityProduct {
  if (/^\/esg(\/|$)/.test(path)) return "esg";
  if (/^\/(bbbee|create-scorecard|toolkit|information-request|builder)(\/|$)/.test(path)) return "bbbee";
  return "platform";
}

export function useClarityContext(): void {
  const [location] = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const role = user?.role ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.clarity !== "function") return;
    if (userId) window.clarity("identify", userId);
    window.clarity("set", "signedIn", userId ? "yes" : "no");
    if (role) window.clarity("set", "role", role);
  }, [userId, role]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.clarity !== "function") return;
    window.clarity("set", "product", productForPath(location));
  }, [location]);
}
