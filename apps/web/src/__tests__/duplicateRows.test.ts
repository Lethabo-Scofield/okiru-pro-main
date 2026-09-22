/**
 * Finding the same record twice, and not inventing one.
 *
 * Both failures are silent and they pull opposite ways. Missing a duplicate
 * inflates the score in the company's favour — the direction an agency looks
 * hardest at. Collapsing something that was never a duplicate deletes real
 * spend, and nothing on screen says it happened.
 */
import { describe, expect, it } from "vitest";
import { describeDuplicates, findDuplicates, mergeByAmount } from "../lib/duplicateRows";

interface Row extends Record<string, unknown> {
  name: string;
  spend?: number;
}

const byName = { identityOf: (r: Row) => r.name, labelOf: (r: Row) => r.name };

describe("finding duplicates in one upload", () => {
  it("finds nothing in a clean sheet", () => {
    const report = findDuplicates<Row>([{ name: "Alpha" }, { name: "Beta" }], byName);
    expect(report.groups).toEqual([]);
    expect(report.extraRows).toBe(0);
    expect(report.deduped).toHaveLength(2);
  });

  it("groups rows that share an identity and counts the extras", () => {
    const report = findDuplicates<Row>(
      [{ name: "Alpha" }, { name: "Beta" }, { name: "Alpha" }, { name: "Alpha" }],
      byName,
    );

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].rows).toHaveLength(3);
    expect(report.extraRows).toBe(2);
  });

  /** Row numbers are how someone checks this against their own spreadsheet. */
  it("says which rows, as a person counts them", () => {
    const report = findDuplicates<Row>(
      [{ name: "Alpha" }, { name: "Beta" }, { name: "Alpha" }],
      byName,
    );
    expect(report.groups[0].positions).toEqual([1, 3]);
  });

  it("ignores casing and stray spacing, which is where duplicates hide", () => {
    const report = findDuplicates<Row>(
      [{ name: "Bolt & Nut Co" }, { name: "  bolt & nut co " }],
      byName,
    );
    expect(report.groups).toHaveLength(1);
  });

  /**
   * Two rows with nothing identifying are not each other. Grouping them would
   * delete a row because both happened to be incomplete.
   */
  it("never groups rows with no identity", () => {
    const report = findDuplicates<Row>([{ name: "" }, { name: "   " }, { name: "" }], byName);
    expect(report.groups).toEqual([]);
    expect(report.deduped).toHaveLength(3);
  });

  it("keeps the first of each group when collapsing", () => {
    const report = findDuplicates<Row>(
      [{ name: "Alpha", spend: 100 }, { name: "Alpha", spend: 999 }],
      byName,
    );
    expect(report.deduped).toHaveLength(1);
    expect(report.deduped[0].spend).toBe(100);
  });

  it("holds the original order", () => {
    const report = findDuplicates<Row>(
      [{ name: "Charlie" }, { name: "Alpha" }, { name: "Charlie" }, { name: "Beta" }],
      byName,
    );
    expect(report.deduped.map((r) => r.name)).toEqual(["Charlie", "Alpha", "Beta"]);
  });
});

describe("folding money rows", () => {
  /**
   * A supplier on two lines is usually two invoices. Dropping the second would
   * take real spend out of TMPS, which lowers the score on data that was
   * correct — the opposite mistake to missing the duplicate entirely.
   */
  it("adds the amounts rather than discarding the second row", () => {
    const report = findDuplicates<Row>(
      [
        { name: "Bolt & Nut Co", spend: 120_000 },
        { name: "Cape Fasteners", spend: 40_000 },
        { name: "Bolt & Nut Co", spend: 80_000 },
      ],
      { ...byName, merge: mergeByAmount<Row>("spend") },
    );

    expect(report.deduped).toHaveLength(2);
    expect(report.deduped.find((r) => r.name === "Bolt & Nut Co")?.spend).toBe(200_000);
    expect(report.deduped.find((r) => r.name === "Cape Fasteners")?.spend).toBe(40_000);
  });

  it("adds across three or more lines for the same counterparty", () => {
    const report = findDuplicates<Row>(
      [
        { name: "Alpha", spend: 10 },
        { name: "Alpha", spend: 20 },
        { name: "Alpha", spend: 30 },
      ],
      { ...byName, merge: mergeByAmount<Row>("spend") },
    );
    expect(report.deduped).toHaveLength(1);
    expect(report.deduped[0].spend).toBe(60);
  });

  it("leaves the total alone when an amount is missing", () => {
    const report = findDuplicates<Row>(
      [{ name: "Alpha", spend: 100 }, { name: "Alpha" }],
      { ...byName, merge: mergeByAmount<Row>("spend") },
    );
    expect(report.deduped[0].spend).toBe(100);
  });

  /** Folding must not reach back into the caller's rows. */
  it("does not mutate the rows it was given", () => {
    const rows: Row[] = [{ name: "Alpha", spend: 10 }, { name: "Alpha", spend: 20 }];
    findDuplicates<Row>(rows, { ...byName, merge: mergeByAmount<Row>("spend") });
    expect(rows[0].spend).toBe(10);
  });
});

describe("saying it in a way someone can act on", () => {
  it("names the records and how many times each appears", () => {
    const report = findDuplicates<Row>(
      [{ name: "Alpha" }, { name: "Alpha" }, { name: "Beta" }, { name: "Beta" }, { name: "Beta" }],
      byName,
    );
    const message = describeDuplicates(report, "suppliers");

    expect(message).toContain("Alpha (×2)");
    expect(message).toContain("Beta (×3)");
    expect(message).toContain("3 extra rows");
  });

  it("stops listing after a few and says how many are left", () => {
    const rows: Row[] = [];
    for (const name of ["A", "B", "C", "D", "E", "F"]) rows.push({ name }, { name });
    const message = describeDuplicates(findDuplicates<Row>(rows, byName), "suppliers", 2);

    expect(message).toContain("and 4 more");
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(describeDuplicates(findDuplicates<Row>([{ name: "Alpha" }], byName), "suppliers")).toBe("");
  });

  it("uses the singular for one record and one row", () => {
    const report = findDuplicates<Row>([{ name: "Alpha" }, { name: "Alpha" }], byName);
    const message = describeDuplicates(report, "suppliers");
    expect(message).toContain("1 record appears");
    expect(message).toContain("1 extra row");
  });
});

describe("compound identities", () => {
  interface Contribution extends Record<string, unknown> {
    beneficiary: string;
    amount: number;
  }

  const byBeneficiaryAndAmount = {
    identityOf: (c: Contribution) => `${c.beneficiary}|${c.amount}`,
    labelOf: (c: Contribution) => c.beneficiary,
  };

  it("treats two different amounts to one beneficiary as two contributions", () => {
    const report = findDuplicates<Contribution>(
      [
        { beneficiary: "Rural Schools Trust", amount: 180_000 },
        { beneficiary: "Rural Schools Trust", amount: 64_000 },
      ],
      byBeneficiaryAndAmount,
    );
    expect(report.groups).toEqual([]);
  });

  /**
   * Identical beneficiary AND identical amount is worth flagging — it is the
   * shape of a double-capture — but it can also be two equal monthly payments,
   * which is why this reports rather than decides.
   */
  it("flags the same beneficiary for the same amount", () => {
    const report = findDuplicates<Contribution>(
      [
        { beneficiary: "Rural Schools Trust", amount: 180_000 },
        { beneficiary: "Rural Schools Trust", amount: 180_000 },
      ],
      byBeneficiaryAndAmount,
    );
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].label).toBe("Rural Schools Trust");
  });
});
