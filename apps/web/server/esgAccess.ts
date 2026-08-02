/** Server-side ESG access — mirrors client esgAccess.ts */

export type EsgAccessUser = {
  email?: string | null;
  username?: string | null;
  fullName?: string | null;
};

/** No hardcoded default — see client esgAccess.ts: env var IS the gate. */
export const ESG_DEFAULT_ALLOWLIST = [] as const;

function parseAllowlistEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getEsgPreviewAllowlist(): string[] {
  const fromEnv = parseAllowlistEnv(process.env.ESG_PREVIEW_ALLOWLIST);
  const merged = new Set<string>([...ESG_DEFAULT_ALLOWLIST, ...fromEnv]);
  return Array.from(merged);
}

function normalizeEmail(user: EsgAccessUser | null | undefined): string {
  const email = (user?.email || user?.username || "").trim().toLowerCase();
  return email;
}

/**
 * ESG access: open to every authenticated user UNLESS ESG_PREVIEW_ALLOWLIST
 * is set — then only listed emails pass. The allowlist previously had zero
 * callers (fail-open pretense; dead-code audit item 6).
 */
export function canAccessEsgToolkit(user: EsgAccessUser | null | undefined): boolean {
  if (!user) return false;
  const email = normalizeEmail(user);
  if (!email) return false;
  const allowlist = getEsgPreviewAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(email);
}
