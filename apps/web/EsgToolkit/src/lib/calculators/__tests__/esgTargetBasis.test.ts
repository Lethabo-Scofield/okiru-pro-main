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
import { scoreEnvironmental } from "../environmental";
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
    // This fixture records no incidents and does not say whether it tracks
    // them, so the incident-investigation indicator is excluded too (Q14).
    // The denominator is the divisor less exactly what left it.
    const removed = s.excluded.reduce((a, x) => a + x.maxPoints, 0);
    expect(s.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR - removed);
    expect(s.excluded.map((x) => x.key)).toContain("d20");
  });

  it("leaves parity mode alone — the spreadsheet has no notion of a basis", () => {
    const s = scoreSocial(wb({}), { mode: "workbook-parity" });
    expect(s.excluded).toHaveLength(0);
    expect(s.scoringDenominator).toBe(ESG_D9_PILLAR_DIVISOR);
    expect(s.rows.d5).toBeGreaterThan(0);
  });
});

/**
 * D5 — the same ruling for Environmental: "For E the company needs to
 * determine their own targets." The scorer used to fall back to a 10% annual
 * cut, 20% renewable, 5% EV and 75% diversion whenever the company had set
 * nothing.
 */
describe("Environmental targets follow the declared basis (D5)", () => {
  /** Data that would score under every E target: a reduction, solar, EVs, diversion. */
  const E_DATA = {
    "e-data": { B90: 1000, B92: 500_000, L46: 400_000, L50: 100_000, L80: 400_000, L81: 100_000 },
    fleet: { B28: 10, H28: 2 },
    waste: { B16: 0.8 },
  };
  const ewb = (assumptions: Record<string, unknown>): EsgWorkbookData =>
    ({
      companyId: "e",
      sections: {
        assumptions: { cells: { B9: 0.5, ...assumptions } },
        ...Object.fromEntries(Object.entries(E_DATA).map(([k, cells]) => [k, { cells }])),
      },
      updatedAt: "2026-10-07T00:00:00.000Z",
    }) as unknown as EsgWorkbookData;
  const TARGET_KEYS = ["d6", "d7", "d12", "d13", "d17", "d19"];
  const excludedKeys = (assumptions: Record<string, unknown>) =>
    scoreEnvironmental(ewb(assumptions)).excluded.map((x) => x.key);

  it("excludes every target-based indicator until the company declares a basis — and says why", () => {
    const e = scoreEnvironmental(ewb({}));
    for (const key of TARGET_KEYS) {
      const x = e.excluded.find((y) => y.key === key);
      expect(x?.reason, key).toContain("has not declared how its targets are set");
      expect(e.rows[key as keyof typeof e.rows], key).toBe(0);
    }
  });

  it("scores against the company's own stated target, and only that", () => {
    const e = scoreEnvironmental(ewb({ _targetBasis: OWN, B43: 0.05, B48: 0.75 }));
    // B43 drives the emissions AND the energy reduction; B48 the diversion.
    expect(e.excluded.map((x) => x.key)).not.toContain("d12");
    expect(e.rows.d12).toBeGreaterThan(0);
    expect(e.rows.d19).toBeGreaterThan(0);
    // B44 (renewables) and B46 (EVs) were not set, so those leave the total —
    // the sector's 20% and 5% are never put in their place.
    for (const key of ["d7", "d13", "d17"]) {
      expect(e.excluded.find((x) => x.key === key)?.reason, key).toContain("has not set one for");
    }
  });

  it("reads a B-BBEE election as 'own' for E — B-BBEE sets no environmental targets", () => {
    const stated = scoreEnvironmental(ewb({ _targetBasis: BBBEE, B48: 0.9 }));
    // 0.8 against the company's 0.9 earns part of the 5, not the full 5 the sector's 0.75 would give.
    expect(stated.rows.d19).toBeGreaterThan(0);
    expect(stated.rows.d19).toBeLessThan(5);
    const unset = scoreEnvironmental(ewb({ _targetBasis: BBBEE })).excluded.find((x) => x.key === "d19");
    expect(unset?.reason).toContain("B-BBEE sets no environmental targets");
    // ...and the company can resolve it, so the breakdown offers to.
    expect(unset?.reason).toMatch(/has not set one for/);
  });

  it("reports but does not score a company that tracks the trend", () => {
    expect(excludedKeys({ _targetBasis: TREND, B43: 0.05, B48: 0.75 })).toEqual(expect.arrayContaining(TARGET_KEYS));
  });

  it("takes the excluded points out of the denominator too, and leaves parity mode alone", () => {
    const e = scoreEnvironmental(ewb({}));
    const removed = e.excluded.reduce((a, x) => a + x.maxPoints, 0);
    expect(removed).toBeGreaterThan(0);
    const parity = scoreEnvironmental(ewb({}), { mode: "workbook-parity" });
    expect(parity.excluded).toHaveLength(0);
    expect(parity.rows.d19).toBeGreaterThan(0); // the workbook's own 0.75
  });
});
