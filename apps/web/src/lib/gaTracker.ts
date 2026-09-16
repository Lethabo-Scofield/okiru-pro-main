/**
 * Client-side Google Analytics (GA4) page-view tracking for the SPA.
 *
 * The gtag.js snippet in `index.html` fires the initial page_view. Because the
 * app is a single-page application, subsequent wouter route changes do not
 * reload the document, so we send an explicit `page_view` event on each
 * location change. Safe no-op when gtag is unavailable (e.g. blocked/absent).
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

const MEASUREMENT_ID = "G-WF69VTV757";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function usePageViewTracking(): void {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sendActivity = (eventType: "page_view" | "heartbeat", durationSeconds = 0) => {
      fetch("/api/activity/page-view", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: location, eventType, durationSeconds }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const pagePath = location + window.location.search;
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
        send_to: MEASUREMENT_ID,
      });
    }

    // First-party activity tracking for the internal heatmap. Only the route
    // path is sent, never query parameters or page content.
    sendActivity("page_view");
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") sendActivity("heartbeat", 30);
    }, 30_000);

    return () => window.clearInterval(heartbeat);
  }, [location]);
}
