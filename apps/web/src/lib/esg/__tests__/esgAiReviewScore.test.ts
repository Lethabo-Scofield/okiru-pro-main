/**
 * Which fills change the ESG score is measured with the real calculators,
 * one fill at a time. Invented data only.
 */
import { describe, expect, it } from "vitest";
import { esgScoreChangingFills, esgScoreEffect } from "../esgAiReviewScore";
import { buildEsgRuleFills, type EsgFillProposal, type EsgWorkbookLike } from "../esgAiReviewFill";

const wb: EsgWorkbookLike = {
  sections: {
    "e-data": { cells: { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 3 } },
    "g-data": { cells: { B5: 8, B6: 3, B7: 2 } },
    "company-reporting-setup": { cells: {} },
  },
};

const policy: EsgFillProposal = {
  id: "esgfill_g-data-B15",
  section: "g-data",
  cell: "B15",
  key: "g-data!B15",
  sectionLabel: "Governance data",
  cellLabel: "Governance data · Code of ethics in place (Y/N)",
  value: "Yes",
  kind: "read",
  rule: "policy",
  reasoning: "r",
  evidence: [],
  origin: "model",
};

describe("score effect", () => {
  it("lists a governance answer as changing the score, and the entity name as not", () => {
    const entity = buildEsgRuleFills(wb, { companyName: "Heron Logistics" }).proposals;
    expect(entity.map((p) => p.key)).toEqual(["company-reporting-setup!entity"]);
    const changing = esgScoreChangingFills(wb, [...entity, policy]);
    expect(Array.from(changing)).toEqual([policy.id]);
  });

  it("gives the before and after, the overall score as a fraction", () => {
    const { before, after } = esgScoreEffect(wb, [policy]);
    expect(before && after).toBeTruthy();
    expect(after!.governance).toBeGreaterThan(before!.governance);
    expect(after!.overall).toBeGreaterThan(before!.overall);
    expect(after!.overall).toBeLessThanOrEqual(1);
  });
});
