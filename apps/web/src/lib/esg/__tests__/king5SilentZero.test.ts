/**
 * A blank King IV weight is not a weight of zero.
 *
 * `syncDerivedFields` read `Number(r.weight) || 0`, so a principle marked
 * "Applied" with an untyped weight contributed NOTHING to `King5_Scorecard!E21`
 * — a fully completed register could score zero, with nothing said. It is the
 * mirror image of the generous default: same defect class (an unrecognised
 * input silently resolved to a number), opposite direction.
 *
 * The workbook says what a blank means: `G_Scorecard!C5 = King5!E21 / 170 * 25`
 * and 170 is 17 principles x 10, so the standard weight of a principle is 10.
 */
import { describe, it, expect } from "vitest";
import { writeEsgGridCells, type EsgGridRow } from "@/lib/esg/esgGridRows";

const row = (overrides: Partial<EsgGridRow>): EsgGridRow =>
  ({ _id: `r${Math.round(overrides.num as number ?? 1)}`, ...overrides } as EsgGridRow);

/** E21 for a register of `count` principles all at `status`, weights as given. */
function e21(rows: EsgGridRow[]): number {
  const cells = writeEsgGridCells("king5", rows);
  return Number(cells.E21);
}

describe("a blank weight means the standard weight, not nothing", () => {
  it("scores an Applied principle whose weight was never typed", () => {
    expect(e21([row({ num: 1, principle: "Leadership", status: "Applied" })])).toBe(10);
  });

  it("is what the old code got wrong", () => {
    // `Number(undefined) || 0` === 0, so (10 * 0) / 10 === 0.
    const legacyWeight = Number(undefined) || 0;
    expect(legacyWeight).toBe(0);
    expect(e21([row({ num: 1, principle: "Leadership", status: "Applied" })])).toBeGreaterThan(0);
  });

  it("scores a full 17-principle register at the workbook's 170", () => {
    const rows = Array.from({ length: 17 }, (_, i) =>
      row({ num: i + 1, principle: `Principle ${i + 1}`, status: "Applied" }),
    );
    expect(e21(rows)).toBe(170);
  });

  it("treats a blank string the same as an absent value", () => {
    expect(e21([row({ num: 1, principle: "P", status: "Applied", weight: "" })])).toBe(10);
  });
});

describe("a weight that WAS typed is still honoured", () => {
  it("uses the typed weight over the standard one", () => {
    expect(e21([row({ num: 1, principle: "P", status: "Applied", weight: 5 })])).toBe(5);
  });

  it("honours a deliberate zero — the principle is out of scope", () => {
    // An explicit 0 is a statement, and must not be overwritten by the default.
    expect(e21([row({ num: 1, principle: "P", status: "Applied", weight: 0 })])).toBe(0);
  });

  it("keeps the status ladder intact", () => {
    expect(e21([row({ num: 1, principle: "P", status: "Applied" })])).toBe(10);
    expect(e21([row({ num: 1, principle: "P", status: "Explained" })])).toBe(7);
    expect(e21([row({ num: 1, principle: "P", status: "Partially Applied" })])).toBe(5);
  });

  it("scores an unfilled principle at nothing — absent status IS absent evidence", () => {
    expect(e21([row({ num: 1, principle: "P", status: "" })])).toBe(0);
  });
});
