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
    if (typeof window === "undefined" || typeof window.gtag !== "function") {
      return;
    }
    const pagePath = location + window.location.search;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
      send_to: MEASUREMENT_ID,
    });
  }, [location]);
}
