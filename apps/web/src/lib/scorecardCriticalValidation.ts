import type { FoundationData } from "@/components/build/FoundationStep";
import type { BuildPillarsData } from "@/components/build/BuildPillarsStep";

/**
 * Validates revenue/NPAT and (unless pillar scope excludes ownership) ownership entities.
 * Exported for unit tests and reuse by populateAndScore.
 */
export function validateScorecardCriticalInputs(
  foundation: FoundationData,
  pillars: BuildPillarsData,
  pillarScopeFilter?: string[] | null,
): string[] {
  const errors: string[] = [];

  const financials = foundation.financials;
  const hasRevenue = (financials.totalRevenue || 0) > 0;
  const hasNpat = (financials.npat || 0) > 0 || (financials.deemedNpat || 0) > 0;

  if (!hasRevenue) {
    errors.push("Total Revenue is required for scorecard calculation");
  }
  if (!hasNpat) {
    errors.push("NPAT (or Deemed NPAT) is required for scorecard calculation");
  }

  const scoped = Array.isArray(pillarScopeFilter) && pillarScopeFilter.length > 0;
  const scopeNeedsOwnership =
    !scoped ||
    pillarScopeFilter!.includes("ownership") ||
    pillarScopeFilter!.includes("employmentEquity");

  if (!scopeNeedsOwnership) {
    return errors;
  }

  const ownership = pillars.ownership;
  const hasOwnershipData =
    (ownership.shareholders?.length ?? 0) > 0 ||
    (ownership.ownershipScorePoints || 0) > 0 ||
    (ownership.ownershipScorePercent || 0) > 0;

  if (!hasOwnershipData) {
    errors.push("Ownership data is required (at least one ownership entity)");
  }

  return errors;
}
