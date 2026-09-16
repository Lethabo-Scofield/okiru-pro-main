/**
 * "Should not form part of total." — Z. Mnanzana, Q16, 14 September 2026.
 *
 * Scoring an indicator a company cannot possibly satisfy is not neutral: it
 * marks the company down for something it could never have had. These tests
 * hold the two halves of the ruling — the points leave the numerator AND the
 * denominator, and every exclusion is named with a reason rather than quietly
 * moving the total.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgOverallPercent, ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
import { esgIndicatorMaxPoints } from "@/lib/esg/esgScorecardDefinitions";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { scoreSocial } from "../social";
import { scoreGovernance } from "../governance";
import { applicableMaxFor, readDeclaredExclusions } from "../esgApplicability";

function wb(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  const out: EsgWorkbookData["sections"] = {};
  for (const [id, cells] of Object.entries(sections)) {
    out[id] = { cells: cells as EsgWorkbookData["sections"][string]["cells"] };
  }
  return { companyId: "t", sections: out, updatedAt: "2026-09-16T00:00:00.000Z" };
}

describe("a declared exclusion", () => {
  const FOOD_SAFETY = "d27"; // S — supplier food-safety rating
  const reason = "No food or cold-chain activity anywhere in the supply chain.";

  it("is read from the workbook with the company's own reason attached", () => {
    const declared = readDeclaredExclusions(
      wb({ applicability: { [`s:${FOOD_SAFETY}`]: reason } }),
      "social",
    );
    expect(declared).toHaveLength(1);
    expect(declared[0].key).toBe(FOOD_SAFETY);
    expect(declared[0].maxPoints).toBe(esgIndicatorMaxPoints("social", FOOD_SAFETY));
    // The reason is carried through verbatim — a bare "not applicable" is not
    // something a report can print or an assurance provider can test.
    expect(declared[0].reason).toContain(reason);
  });

  it("takes its points out of the denominator, not out of the company's hide", () => {
    const base = scoreSocial(deriveEsgSummaryCells(wb({})));
    const excluded = scoreSocial(
      deriveEsgSummaryCells(wb({ applicability: { [`s:${FOOD_SAFETY}`]: reason } })),
    );
    const points = esgIndicatorMaxPoints("social", FOOD_SAFETY);

    expect(base.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
    expect(excluded.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR - points);
    expect(excluded.excluded.map((x) => x.key)).toEqual([FOOD_SAFETY]);
  });

  it("raises the percentage for a company that could never have earned the points", () => {
    // A company scoring 30 of 100 that was never able to attempt 4 of those
    // points is at 30/96, not 30/100. The arithmetic is the whole ruling.
    const points = esgIndicatorMaxPoints("social", FOOD_SAFETY);
    const withAll = esgOverallPercent(30, 30, 30);
    const withExclusion = esgOverallPercent(30, 30, 30, {
      environmental: ESG_D9_PILLAR_DIVISOR,
      social: ESG_D9_PILLAR_DIVISOR - points,
      governance: ESG_D9_PILLAR_DIVISOR,
    });
    expect(withExclusion).toBeGreaterThan(withAll);
  });

  it("is ignored when no reason is given — silence never moves the denominator", () => {
    const blank = scoreSocial(deriveEsgSummaryCells(wb({ applicability: { [`s:${FOOD_SAFETY}`]: "  " } })));
    expect(blank.excluded).toHaveLength(0);
    expect(blank.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
  });

  it("never applies in parity mode, which reproduces a sheet that has no such concept", () => {
    const parity = scoreSocial(
      deriveEsgSummaryCells(wb({ applicability: { [`s:${FOOD_SAFETY}`]: reason } })),
      { mode: "workbook-parity" },
    );
    expect(parity.excluded).toHaveLength(0);
    expect(parity.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
  });
});

describe("climate disclosure with nothing applicable", () => {
  it("drops the readiness indicator rather than scoring the company zero on it", () => {
    const allNa = deriveEsgSummaryCells(
      wb({
        ifrs: {
          A5: "Board oversight", C5: "N/A",
          A6: "Management role", C6: "N/A",
          A7: "Scenario analysis", C7: "N/A",
        },
      }),
    );
    // Force every requirement inapplicable so nothing is left to assess.
    allNa.sections.ifrs.cells._applicable_count = 0;
    allNa.sections.ifrs.cells._not_applicable_count = 3;

    const g = scoreGovernance(allNa);
    const d9Points = esgIndicatorMaxPoints("governance", "d9");
    expect(g.excluded.map((x) => x.key)).toContain("d9");
    expect(g.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR - d9Points);
    expect(g.excluded.find((x) => x.key === "d9")?.reason).toContain("not applicable");
  });

  it("still scores the indicator when even one requirement applies", () => {
    const some = deriveEsgSummaryCells(
      wb({ ifrs: { A5: "Board oversight", C5: "Disclosed", A6: "Management role", C6: "N/A" } }),
    );
    const g = scoreGovernance(some);
    expect(g.excluded.map((x) => x.key)).not.toContain("d9");
    expect(g.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
  });
});

describe("the denominator arithmetic", () => {
  it("floors at zero rather than going negative", () => {
    expect(applicableMaxFor(10, [{ key: "x", indicator: "x", maxPoints: 40, reason: "r" }])).toBe(0);
  });

  it("drops a pillar with nothing applicable from the average, rather than scoring it 0%", () => {
    // A pillar nobody was required to report is not a pillar scored zero.
    const dropped = esgOverallPercent(50, 50, 0, {
      environmental: 100,
      social: 100,
      governance: 0,
    });
    expect(dropped).toBeCloseTo(0.5, 10);
  });
});
