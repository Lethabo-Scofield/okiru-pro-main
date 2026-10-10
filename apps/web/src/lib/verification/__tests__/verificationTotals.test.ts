/**
 * CLAIMED and EVIDENCED on the score page come from the live store's own
 * calculator. An unproven black executive stops counting as black — he is
 * not removed — so EVIDENCED can only fall: removing him would have left a
 * black woman at Senior as the only "top manager" and RAISED the score.
 * (Invented company.)
 */
import { describe, expect, it } from "vitest";
import { scoreWithVerification, useBbeeStore } from "@toolkit/lib/store";
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/transport-qse";
import { verificationTotals } from "../verificationTotals";
import type { VerificationReport } from "../../../../../api/pipeline/verification/index.js";

function state() {
  const base = useBbeeStore.getState();
  return {
    ...base,
    client: { ...base.client, sectorCode: "TRANSPORT", scorecardType: "QSE", companySize: "QSE" },
    calculatorConfig: TRANSPORT_QSE_CALCULATOR_CONFIG,
    management: {
      ...base.management,
      employees: [
        { id: "e1", name: "Sipho Ndlovu", race: "African", gender: "Male", designation: "Executive Director", isDisabled: false },
        { id: "e2", name: "Lerato Khumalo", race: "African", gender: "Female", designation: "Senior", isDisabled: false },
      ],
    },
  };
}

const report: VerificationReport = {
  version: 1,
  period: null,
  counts: { pass: 0, flag: 0, "needs-you": 1, unproven: 1, "out-of-period": 0 },
  checks: [
    {
      id: "people.payroll:management-control:e1", kind: "people.payroll", section: "management-control", rowId: "e1",
      subject: "Sipho Ndlovu", status: "unproven", rule: "excluded-from-evidenced", claim: { value: "Sipho Ndlovu" }, evidence: [],
      statement: "not on the payroll", ops: [{ kind: "notBlack", basis: "evidenced", section: "management-control", rowId: "e1" }],
    },
    {
      id: "management.band:management-control:e2:occupationalLevel", kind: "management.band", section: "management-control", rowId: "e2",
      subject: "Lerato Khumalo", status: "needs-you", rule: "lower-until-answered", claim: { column: "occupationalLevel", value: "Senior Management" },
      evidence: [], statement: "two versions disagree", ops: [],
      choices: [
        { value: "Senior Management", sources: ["v2"], held: true, ops: [{ kind: "set", basis: "alternative", section: "management-control", rowId: "e2", column: "occupationalLevel", value: "Senior Management" }] },
        { value: "Other Executive Management", sources: ["v1"], held: false, ops: [{ kind: "set", basis: "alternative", section: "management-control", rowId: "e2", column: "occupationalLevel", value: "Other Executive Management" }] },
      ],
    },
  ],
};

describe("verificationTotals", () => {
  it("scores EVIDENCED below CLAIMED with the store's calculator, and each needs-you answer", () => {
    const s = state();
    const claimedCard = scoreWithVerification(s as never, { ...report, checks: [] }, "claimed")!;
    const totals = verificationTotals({ ...s, scorecard: claimedCard } as never, report);
    expect(totals.claimed).toBe(claimedCard.total.score);
    expect(totals.evidenced).not.toBeNull();
    expect(totals.evidenced!).toBeLessThan(totals.claimed);
    const [held, other] = totals.answers[report.checks[1].id];
    expect(held.total).toBe(totals.claimed);
    // Other Executive Management makes her top management: the black-women bonus.
    expect(other.total!).toBeGreaterThan(totals.claimed);
  });
});
