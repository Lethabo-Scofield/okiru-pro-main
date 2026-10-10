/**
 * CLAIMED and EVIDENCED for the score page, from the live Toolkit store's own
 * calculator (scoreWithVerification), plus what each needs-you answer would
 * make CLAIMED. The store's data already IS the claimed data (the create flow
 * saves the claimed sections), so CLAIMED is the live total.
 */
import { scoreWithVerification } from "@toolkit/lib/store";
import type { NeedsYouChoice, VerificationReport } from "../../../../api/pipeline/verification/index.js";

type StoreState = Parameters<typeof scoreWithVerification>[0];

export interface VerificationTotals {
  claimed: number;
  evidenced: number | null;
  /** checkId → the CLAIMED total under each answer, in the report's order. */
  answers: Record<string, Array<{ choice: NeedsYouChoice; total: number | null }>>;
}

const totalOf = (r: { total?: { score?: number } } | null): number | null =>
  r && typeof r.total?.score === "number" ? r.total.score : null;

export function verificationTotals(state: StoreState & { scorecard?: { total?: { score?: number } } }, report: VerificationReport): VerificationTotals {
  const claimed = totalOf(state.scorecard ?? null) ?? 0;
  const evidenced = totalOf(scoreWithVerification(state, report, "evidenced"));
  const answers: VerificationTotals["answers"] = {};
  for (const check of report.checks) {
    if (check.status !== "needs-you" || !check.choices?.length) continue;
    answers[check.id] = check.choices.map((choice) => ({
      choice,
      total: choice.held ? claimed : totalOf(scoreWithVerification(state, report, "claimed", [choice])),
    }));
  }
  return { claimed, evidenced, answers };
}
