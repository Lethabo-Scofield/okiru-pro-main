import type { FoundationData } from "@/components/build/FoundationStep";
import type { BuildPillarsData } from "@/components/build/BuildPillarsStep";

/**
 * Validates minimum foundation data for scorecard calculation.
 * Pillar sections may be empty — a zero score is valid.
 * Exported for unit tests and reuse by populateAndScore.
 */
export function validateScorecardCriticalInputs(
  foundation: FoundationData,
  _pillars: BuildPillarsData,
  _pillarScopeFilter?: string[] | null,
): string[] {
  const errors: string[] = [];

  const financials = foundation.financials;
  const revenue = financials.totalRevenue;
  const hasRevenue = typeof revenue === "number" && Number.isFinite(revenue);
  const npat = financials.npat;
  const deemedNpat = financials.deemedNpat;
  const hasNpat =
    (typeof npat === "number" && Number.isFinite(npat)) ||
    (typeof deemedNpat === "number" && Number.isFinite(deemedNpat));

  if (!hasRevenue) {
    errors.push("Total Revenue is required for scorecard calculation");
  }
  if (!hasNpat) {
    errors.push("NPAT (or Deemed NPAT) is required for scorecard calculation");
  }

  return errors;
}
