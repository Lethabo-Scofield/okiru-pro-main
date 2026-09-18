/**
 * Skills Development spend targets.
 *
 * This file also held `parseSkillsBulkUploadBuffer`, a bulk-upload parser that
 * looked for headings — "Training Program Name *", "Learner Name *", "Course
 * Cost" — belonging to a template the product never offered to download. Every
 * real information-gathering workbook writes them differently ("Training
 * Course", "Learner Name & Surname", "Direct Expenditure for Period (Excl
 * VAT)"), so it answered every real upload with "Could not find required
 * Program / Learner columns". Bulk upload now goes through the same reader as
 * the workbook's own import; see `Toolkit/src/components/bulk`.
 */
import { normalizeSpendFraction } from "@toolkit/lib/calculators/shared";

/**
 * Pure helper extracted from `SkillsDevelopment.tsx` so the
 * `targetSpend = leviableAmount * overallTargetPct` and
 * `bursaryTarget = leviableAmount * bursaryTargetPct` formulas (used by the
 * Skills KPI cards) are unit-testable. Mirrors the in-component derivation
 * at sections.ts lines around 191–194:
 *
 *   const overallTargetPct = sc?.overallSpendPercent ?? sc?.overallTarget ?? 0.035;
 *   const targetSpend       = leviableAmount * overallTargetPct;
 *   const bursaryTarget     = leviableAmount * bursaryTargetPct;
 */
export function computeSkillsTargets(input: {
  leviableAmount: number;
  overallTargetPct?: number;
  bursaryTargetPct?: number;
}): { targetSpend: number; bursaryTarget: number; overallTargetPct: number; bursaryTargetPct: number } {
  const leviable = Number.isFinite(input.leviableAmount) ? Math.max(0, input.leviableAmount) : 0;
  const overallTargetPct = normalizeSpendFraction(input.overallTargetPct, 0.035);
  const bursaryTargetPct = normalizeSpendFraction(input.bursaryTargetPct, 0.025);
  return {
    targetSpend: leviable * overallTargetPct,
    bursaryTarget: leviable * bursaryTargetPct,
    overallTargetPct,
    bursaryTargetPct,
  };
}
