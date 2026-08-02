/** Client-side ESG access — keep in sync with apps/web/server/esgAccess.ts */

export type EsgAccessUser = {
  email?: string | null;
  username?: string | null;
  fullName?: string | null;
};

/**
 * No hardcoded default: a baked-in address made the allowlist permanently
 * non-empty, so "empty = open to all" could never hold and enforcement would
 * have locked ESG to one person. The env var is the whole gate.
 */
export const ESG_DEFAULT_ALLOWLIST = [] as const;

function parseAllowlistEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Vite exposes only VITE_* on client; server uses ESG_PREVIEW_ALLOWLIST. */
export function getEsgPreviewAllowlist(): string[] {
  const fromEnv = parseAllowlistEnv(
    typeof import.meta !== "undefined"
      ? (import.meta.env.VITE_ESG_PREVIEW_ALLOWLIST as string | undefined)
      : undefined,
  );
  const merged = new Set<string>([...ESG_DEFAULT_ALLOWLIST, ...fromEnv]);
  return Array.from(merged);
}

function normalizeEmail(user: EsgAccessUser | null | undefined): string {
  return (user?.email || user?.username || "").trim().toLowerCase();
}

/**
 * ESG access: open to every authenticated user UNLESS an allowlist is
 * configured — then only listed emails pass. The allowlist plumbing existed
 * but had ZERO callers, so `VITE_ESG_PREVIEW_ALLOWLIST` silently did nothing
 * while the code implied a gate (fail-open pretense; dead-code audit item 6).
 */
export function canAccessEsgToolkit(user: EsgAccessUser | null | undefined): boolean {
  if (!user) return false;
  const email = normalizeEmail(user);
  if (!email) return false;
  const allowlist = getEsgPreviewAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(email);
}
