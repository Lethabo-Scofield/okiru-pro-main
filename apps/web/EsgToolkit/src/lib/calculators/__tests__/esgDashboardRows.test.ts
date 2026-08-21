import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { buildSgConsumerGoldenWorkbook } from "../../fixtures/esg-consumer-golden";
import { computeEsgDashboard } from "../dashboard";

/**
 * `dashboard.ts` used to carry its own hand-typed indicator table with different
 * maxima and different labels from `esgScorecardDefinitions.ts` — E summed to
 * 106 instead of 108, S to 93 instead of 100, so the Dashboard and the pillar
 * Scorecard page disagreed about the same indicator. The table is gone; these
 * tests assert the rows are now a pure projection of the ledger.
 */
describe("computeEsgDashboard pillar rows derive from esgScorecardDefinitions", () => {
  // Mirrors production: `computeEsgScorecard` derives the summary cells before
  // handing the workbook to the dashboard.
  const dash = computeEsgDashboard(deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook()));

  const PILLARS = ["environmental", "social", "governance"] as const;

  it.each(PILLARS)("%s rows mirror the ledger's labels, maxima, and order", (pillar) => {
    expect(
      dash.pillarRows[pillar].map((r) => ({ indicator: r.indicator, maxPoints: r.maxPoints })),
    ).toEqual(
      SCORECARD_INDICATORS[pillar].map((d) => ({
        indicator: d.indicator,
        maxPoints: d.maxPoints,
      })),
    );
  });

  it.each(PILLARS)("%s row maxPoints sum to the pillar maximum", (pillar) => {
    const sum = dash.pillarRows[pillar].reduce((acc, r) => acc + r.maxPoints, 0);
    expect(sum).toBe(ESG_PILLAR_MAX[pillar]);
  });

  it("E sums to 108 and S to 100 — the two totals the deleted local table got wrong", () => {
    expect(dash.pillarRows.environmental.reduce((a, r) => a + r.maxPoints, 0)).toBe(108);
    expect(dash.pillarRows.social.reduce((a, r) => a + r.maxPoints, 0)).toBe(100);
    expect(dash.pillarRows.governance.reduce((a, r) => a + r.maxPoints, 0)).toBe(100);
  });

  it("keeps target as the string form of maxPoints and achievementPct consistent", () => {
    for (const pillar of PILLARS) {
      for (const row of dash.pillarRows[pillar]) {
        expect(row.target).toBe(String(row.maxPoints));
        expect(row.achievementPct).toBeCloseTo((row.score / row.maxPoints) * 100, 6);
        expect(row.actual).toBe(row.score.toFixed(1));
      }
    }
  });

  /**
   * The corrected baseline (`docs/esg/ESG_SCORING_DELTA.md`). Was 36 / 33 /
   * 64.8529411765 while `S d18` and `G d25` still handed out points nobody had
   * earned; the maxima projection itself is unchanged.
   */
  it("earned points match the corrected baseline (E=36, S=25, G=59.8529411765)", () => {
    const earned = (pillar: (typeof PILLARS)[number]) =>
      dash.pillarRows[pillar].reduce((a, r) => a + r.score, 0);
    expect(earned("environmental")).toBeCloseTo(36, 6);
    expect(earned("social")).toBeCloseTo(25, 6);
    expect(earned("governance")).toBeCloseTo(59.8529411765, 6);
  });
});
