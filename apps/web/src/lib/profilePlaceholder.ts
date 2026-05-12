/**
 * Placeholder company name when the user skips onboarding (API + web must stay in sync).
 * @see apps/api/src/routes/onboarding.ts ONBOARDING_SKIPPED_COMPANY_NAME
 */
export function isSkippedCompanyProfileName(name: string | null | undefined): boolean {
  if (!name || typeof name !== "string") return false;
  return /skipped/i.test(name) || name.trimStart().startsWith("—");
}
