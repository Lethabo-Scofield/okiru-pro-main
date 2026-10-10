/**
 * Claim-vs-evidence verification (see ./types.ts for the design and rules).
 *
 * One module for both scoring copies: the web imports it from here the same
 * way it imports apps/api/pipeline/sectorConfig, so the Toolkit store, the
 * create flow, the end-to-end harness and /api/calculate all run the same
 * checks and apply the same overlay.
 *
 *   const report = verifyClaims({ sections, evidence, period });
 *   const claimed = applyOverlayToSections(sections, report, 'claimed');
 *   const totals = scoreBothWays(sections, report, score);
 */
import { ALL_CHECKS, buildContext } from './checks.js';
import { periodFromYearEnd } from './evidence.js';
import { applyOverlayToSections } from './overlay.js';
import type { CheckStatus, NeedsYouChoice, VerificationInput, VerificationReport, VerificationSections } from './types.js';

export * from './types.js';
export { applyOverlayToSections, applyOverlayToPillars, type OverlayBasis, type PillarOverlayOptions } from './overlay.js';
export { periodFromYearEnd } from './evidence.js';

/** Where a workbook keeps its verification report: a reserved key in the company-information meta. */
export const VERIFICATION_META_KEY = '_verification';

export function verifyClaims(input: VerificationInput): VerificationReport {
  const companyMeta = input.sections['company-information']?.meta ?? {};
  const period = input.period ?? periodFromYearEnd(companyMeta.financialYearEnd ?? companyMeta.yearEnd);
  const ctx = buildContext(input.sections, input.evidence, period);
  const checks = ALL_CHECKS.flatMap((run) => run(ctx));
  const counts: Record<CheckStatus, number> = { pass: 0, flag: 0, 'needs-you': 0, unproven: 0, 'out-of-period': 0 };
  for (const c of checks) counts[c.status] += 1;
  return { version: 1, period, checks, counts };
}

export interface BothTotals {
  claimed: number;
  evidenced: number;
  /**
   * Each needs-you item: the total CLAIMED would become with each answer.
   * `changesScore` false means the documents disagree but the answer moves
   * no point — reported, never blocking.
   */
  needsYou: Array<{ checkId: string; subject: string; changesScore: boolean; choices: Array<{ value: unknown; held: boolean; total: number }> }>;
}

/**
 * CLAIMED and EVIDENCED from the SAME scorer, plus what each needs-you answer
 * would do to CLAIMED. `score` is whatever scores sections for the caller
 * (the harness uses the Toolkit calculators; the api its pipeline).
 */
export function scoreBothWays(
  sections: VerificationSections,
  report: VerificationReport,
  score: (sections: VerificationSections) => number,
): BothTotals {
  const claimed = score(applyOverlayToSections(sections, report, 'claimed'));
  const evidenced = score(applyOverlayToSections(sections, report, 'evidenced'));
  const needsYou = report.checks
    .filter((c) => c.status === 'needs-you' && c.choices?.length)
    .map((c) => {
      const choices = (c.choices as NeedsYouChoice[]).map((choice) => ({
        value: choice.value,
        held: choice.held,
        total: choice.held ? claimed : score(applyOverlayToSections(sections, report, 'claimed', [choice])),
      }));
      const changesScore = choices.some((x) => Math.abs(x.total - claimed) > 0.005);
      return { checkId: c.id, subject: c.subject, changesScore, choices };
    });
  return { claimed, evidenced, needsYou };
}

/**
 * A copy of the report small enough to keep on the workbook: the evidence
 * values are kept (they are what the user checks), long free text is cut.
 */
export function compactReport(report: VerificationReport): VerificationReport {
  const cut = (v: unknown) => (typeof v === 'string' && v.length > 200 ? `${v.slice(0, 197)}...` : v);
  return {
    ...report,
    checks: report.checks.map((c) => ({
      ...c,
      claim: { ...c.claim, value: cut(c.claim.value) },
      evidence: c.evidence.map((e) => ({ ...e, value: cut(e.value) })),
    })),
  };
}
