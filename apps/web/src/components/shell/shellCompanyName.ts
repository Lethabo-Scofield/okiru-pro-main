/**
 * The company a page is showing, by name, for the bar's trail.
 *
 * The trail is built from the URL, which only knows the company's id — so the
 * ESG workbook showed "HUB › ESG › C-ESG-1 › WORKBOOK" above a page that drew a
 * second trail of its own with the name in it. A page that has loaded its
 * company says its name here; the bar shows it while that company's id is in
 * the path, and the page's own trail can go.
 */
import { useSyncExternalStore } from "react";

let current: { companyId: string; name: string } | null = null;
const listeners = new Set<() => void>();

export function setShellCompanyName(companyId: string, name: string | null | undefined): void {
  const next = companyId && name ? { companyId, name } : null;
  if (current?.companyId === next?.companyId && current?.name === next?.name) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The name to show for the company in `path`, when the page in it has said one. */
export function shellCompanyNameFor(path: string): string | null {
  if (!current) return null;
  const segments = path.split("?")[0].split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  return segments.includes(current.companyId) ? current.name : null;
}

export function useShellCompanyName(path: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => shellCompanyNameFor(path),
    () => null,
  );
}
