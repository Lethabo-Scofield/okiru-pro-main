/** Server-side ESG access — mirrors client esgAccess.ts */

export type EsgAccessUser = {
  email?: string | null;
  username?: string | null;
  fullName?: string | null;
};

/** Chengetai Myezwa — committed admin contact in apps/web/server/email.ts */
export const ESG_DEFAULT_ALLOWLIST = ["cmyezwa@okiru.co.za"] as const;

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

/** All authenticated users with an email or username may access the ESG toolkit. */
export function canAccessEsgToolkit(user: EsgAccessUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(normalizeEmail(user));
}
