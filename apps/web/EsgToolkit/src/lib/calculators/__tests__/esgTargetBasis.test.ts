/**
 * "ESG does not have targets. This means we either allow the client to set
 * their own targets, which could be the EE/B-BBEE targets, or they could want
 * to track employees over time as opposed to meeting targets."
 * — Z. Mnanzana, Q1/Q3/Q4, 14 September 2026.
 *
 * The toolkit graded every company against eight numbers nobody outside the
 * office had approved — 60% black employees, 40 training hours, an injury rate
 * of 2.0, 1% of profit on community spend, 40% local procurement and the rest —
 * applied identically to a bank, a school and a road-freight distributor.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
import { scoreSocial } from "../social";
import { readTargetBasis, resolveTarget } from "../esgTargets";

const OWN = "Company's own targets";
const BBBEE = "B-BBEE / Employment Equity targets";
const TREND = "Trend only — track movement, do not score against targets";

/** A workforce that would score well against the B-BBEE targets. */
const WORKFORCE = {
  ee: { B5: 0.8, B8: 0.05 },
  "s-data": { L5: 10, L6: 10, F5: 4, F6: 4, L12: 100, B49: 5000 },
};

function wb(assumptions: Record<string, unknown>): EsgWorkbookData {
  return deriveEsgSummaryCells({
    companyId: "t",
    sections: {
      assumptions: { cells: { B9: 0.5, ...assumptions } as never },
      ee: { cells: WORKFORCE.ee as never },
      "s-data": { cells: WORKFORCE["s-data"] as never },
    },
    updatedAt: "2026-09-16T00:00:00.000Z",
  });
}

describe("reading the basis", () => {
  it("recognises each declaration the client can make", () => {
    expect(readTargetBasis(wb({ _targetBasis: OWN }))).toBe("own");
    expect(readTargetBasis(wb({ _targetBasis: BBBEE }))).toBe("bbbee");
    expect(readTargetBasis(wb({ _targetBasis: TREND }))).toBe("trend");
  });

  it("treats silence as undeclared, never as a default", () => {
    expect(readTargetBasis(wb({}))).toBe("undeclared");
    expect(readTargetBasis(wb({ _targetBasis: "   " }))).toBe("undeclared");
    // An unrecognised value is not quietly mapped to the nearest option either.
    expect(readTargetBasis(wb({ _targetBasis: "whatever" }))).toBe("undeclared");
  });
});

describe("resolving one target", () => {
  const book = wb({ B50: 0.55 });

  it("uses the B-BBEE number only when the company elected that basis", () => {
    expect(resolveTarget(book, "B50", 0.6, "bbbee")).toBe(0.55);
    expect(resolveTarget(wb({}), "B50", 0.6, "bbbee")).toBe(0.6);
  });

  it("uses the company's own number, and nothing at all when it has not set one", () => {
    expect(resolveTarget(book, "B50", 0.6, "own")).toBe(0.55);
    // No silent fall-back to the B-BBEE figure. That was the defect.
    expect(resolveTarget(wb({}), "B50", 0.6, "own")).toBeNull();
  });

  it("returns nothing on a trend or undeclared basis", () => {
    expect(resolveTarget(book, "B50", 0.6, "trend")).toBeNull();
    expect(resolveTarget(book, "B50", 0.6, "undeclared")).toBeNull();
  });
});

describe("scoring the Social pillar", () => {
  it("scores the target-based indicators when the company elects B-BBEE", () => {
    const s = scoreSocial(wb({ _targetBasis: BBBEE }));
    expect(s.rows.d5).toBeGreaterThan(0);
    const excludedKeys = s.excluded.map((x) => x.key);
    expect(excludedKeys).not.toContain("d5");
  });

  it("scores nothing target-based when the company has not declared a basis", () => {
    const s = scoreSocial(wb({}));
    const excludedKeys = s.excluded.map((x) => x.key);
    for (const key of ["d5", "d6", "d8", "d14", "d17", "d22", "d24"]) {
      expect(excludedKeys, `${key} should be excluded`).toContain(key);
    }
    expect(s.rows.d5).toBe(0);
    // And the points are out of the denominator, not charged to the company.
    expect(s.scoringDenominator).toBeLessThan(ESG_D9_PILLAR_DIVISOR);
    expect(s.excluded.find((x) => x.key === "d5")?.reason).toContain("has not declared");
  });

  it("reports but does not score when the company tracks a trend", () => {
    const s = scoreSocial(wb({ _targetBasis: TREND }));
    expect(s.excluded.map((x) => x.key)).toContain("d5");
    expect(s.excluded.find((x) => x.key === "d5")?.reason).toContain("over time");
  });

  it("excludes only the targets the company left unset on its own basis", () => {
    // It set a black-representation target but no training-hours target.
    const s = scoreSocial(wb({ _targetBasis: OWN, B50: 0.55 }));
    const excludedKeys = s.excluded.map((x) => x.key);
    expect(excludedKeys).not.toContain("d5");
    expect(excludedKeys).toContain("d14");
    expect(s.excluded.find((x) => x.key === "d14")?.reason).toContain("training hours");
  });

  it("keeps mandatory grant recovery out of the total entirely", () => {
    // Not an ESG measure at all (Q5) — a Skills Development mechanic borrowed
    // from B-BBEE — so it is excluded even on the B-BBEE basis.
    const s = scoreSocial(wb({ _targetBasis: BBBEE }));
    const grant = s.excluded.find((x) => x.key === "d15");
    expect(grant).toBeTruthy();
    expect(grant?.reason).toContain("Not an ESG measure");
    expect(s.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR - 5);
  });

  it("leaves parity mode alone — the spreadsheet has no notion of a basis", () => {
    const s = scoreSocial(wb({}), { mode: "workbook-parity" });
    expect(s.excluded).toHaveLength(0);
    expect(s.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
    expect(s.rows.d5).toBeGreaterThan(0);
  });
});
