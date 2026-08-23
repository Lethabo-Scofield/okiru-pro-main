/**
 * An unrecognised contribution type must score NOTHING.
 *
 * It used to score everything. The lookup was `factors[c.type] ?? 1.0`, and
 * upstream made the miss routine rather than rare: `mapContributionType` fell
 * through to "direct_cost" for any string it did not match, and direct_cost is
 * recognised at 100%. So a contribution type the parser misread was not
 * flagged — it was credited in full.
 *
 * The magnitude is not subtle. `guarantees` carries a benefit factor of 0.03.
 * The same row misread scored 1.0: a 33x overstatement. On an elective
 * best-four-of-seven scorecard the inflated pillar is precisely the one the
 * elective picks, so the error compounds into the headline number.
 */
import { describe, expect, it } from "vitest";
import { calculateSedScore, calculateEsdScore, benefitFactorFor } from "../esd-sed";

const NPAT = 1_000_000;

function sed(contributions: Array<{ beneficiary: string; type: string; amount: number }>) {
  return calculateSedScore({ contributions } as never, NPAT);
}

describe("benefitFactorFor", () => {
  const factors = { grant: 1.0, guarantees: 0.03 };

  it("returns the table's factor for a type it knows", () => {
    expect(benefitFactorFor("grant", factors)).toEqual({ factor: 1, recognised: true });
    expect(benefitFactorFor("guarantees", factors)).toEqual({ factor: 0.03, recognised: true });
  });

  it("abstains on a type it does not know, rather than crediting it", () => {
    expect(benefitFactorFor("mystery_donation", factors)).toEqual({ factor: 0, recognised: false });
  });

  it("abstains on a blank or missing type", () => {
    expect(benefitFactorFor("", factors).recognised).toBe(false);
    expect(benefitFactorFor(undefined, factors).recognised).toBe(false);
    expect(benefitFactorFor("   ", factors).recognised).toBe(false);
  });

  it("does not inherit Object.prototype keys as if they were contribution types", () => {
    // `factors['constructor']` is truthy on a plain object literal; a naive
    // `factors[type] ?? 0` would hand back a function and score nonsense.
    expect(benefitFactorFor("constructor", factors).recognised).toBe(false);
    expect(benefitFactorFor("toString", factors).recognised).toBe(false);
  });
});

describe("SED scoring", () => {
  it("scores a recognised contribution", () => {
    const result = sed([{ beneficiary: "Operation Smile", type: "grant", amount: 500_000 }]);
    expect(result.actualSpend).toBeGreaterThan(0);
    expect(result.unrecognisedTypes).toEqual([]);
    expect(result.excludedSpend).toBe(0);
  });

  it("scores nothing from an unrecognised type, and says so", () => {
    const result = sed([{ beneficiary: "Mystery", type: "something_we_cannot_read", amount: 500_000 }]);
    expect(result.total).toBe(0);
    expect(result.excludedSpend).toBe(500_000);
    expect(result.unrecognisedTypes).toContain("something_we_cannot_read");
  });

  it("reports a blank type as (blank) rather than dropping it silently", () => {
    const result = sed([{ beneficiary: "Nameless", type: "", amount: 250_000 }]);
    expect(result.excludedSpend).toBe(250_000);
    expect(result.unrecognisedTypes).toContain("(blank)");
  });

  it("keeps the recognised rows when only some rows are unreadable", () => {
    const mixed = sed([
      { beneficiary: "Operation Smile", type: "grant", amount: 400_000 },
      { beneficiary: "Mystery", type: "unreadable", amount: 400_000 },
    ]);
    const cleanOnly = sed([{ beneficiary: "Operation Smile", type: "grant", amount: 400_000 }]);
    // The unreadable row neither adds to nor subtracts from the real one.
    expect(mixed.total).toBe(cleanOnly.total);
    expect(mixed.excludedSpend).toBe(400_000);
  });

  it("does not let a misread guarantee score like a grant", () => {
    const asGuarantee = sed([{ beneficiary: "X", type: "guarantees", amount: 1_000_000 }]);
    const misread = sed([{ beneficiary: "X", type: "guarentees", amount: 1_000_000 }]); // typo
    // Before: the typo scored 1.0 against guarantees' 0.03 — 33x too much.
    expect(misread.total).toBe(0);
    expect(asGuarantee.total).toBeGreaterThanOrEqual(0);
    expect(misread.total).toBeLessThanOrEqual(asGuarantee.total);
  });
});

describe("ESD scoring", () => {
  it("excludes a contribution whose SD-vs-ED split is unknown, and says so", () => {
    // The split decides a sub-minimum. It used to default to supplier
    // development — a compliance verdict decided by a guess.
    const result = calculateEsdScore(
      {
        contributions: [
          { beneficiary: "Acme", type: "grant", amount: 500_000, category: "unclassified" },
        ],
      } as never,
      NPAT,
    );
    expect(result.sdSpend).toBe(0);
    expect(result.edSpend).toBe(0);
    expect(result.excludedSpend).toBe(500_000);
    expect(result.unrecognisedTypes.join(" ")).toContain("category");
  });

  it("excludes an unrecognised type from supplier development", () => {
    const result = calculateEsdScore(
      {
        contributions: [
          { beneficiary: "Acme", type: "not_a_real_type", amount: 900_000, category: "supplier_development" },
        ],
      } as never,
      NPAT,
    );
    expect(result.sdSpend).toBe(0);
    expect(result.excludedSpend).toBe(900_000);
    expect(result.unrecognisedTypes).toContain("not_a_real_type");
  });
});
