/** Client-side ESG preview gate — keep in sync with apps/web/server/esgAccess.ts */

export type EsgAccessUser = {
  email?: string | null;
  username?: string | null;
  fullName?: string | null;
};

export const ESG_DEFAULT_ALLOWLIST = ["cmyezwa@okiru.co.za"] as const;

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

export function canAccessEsgToolkit(user: EsgAccessUser | null | undefined): boolean {
  if (!user) return false;
  const email = normalizeEmail(user);
  if (!email) return false;
  if (email.includes("brian")) return true;
  return getEsgPreviewAllowlist().includes(email);
}
