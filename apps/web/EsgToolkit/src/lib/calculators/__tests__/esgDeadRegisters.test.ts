/**
 * The three registers the product collected and never read.
 *
 * `ISO_Tracker` (a sixty-row clause assessment), `SAQ_Supplier` (twelve
 * suppliers across seven criteria) and the board's environmental-policy
 * declaration at `G_Data!B27` were all stated data sources for indicators the
 * client workbook left as MANUAL_ZERO — a literal `0` with no formula. Nothing
 * ever replaced them, so thirty points across two pillars were unreachable
 * however well a company performed, while the product went on asking for the
 * evidence that was supposed to earn them.
 *
 * Rules: `docs/esg/ESG_FORMULA_LEDGER.md` §5.1 (E d26–d29) and §5.2
 * (S d26–d27). These tests assert the two things that matter, in opposite
 * directions: filled evidence now scores, and an empty register still scores
 * nothing.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { scoreEnvironmental } from "../environmental";
import { scoreSocial } from "../social";

type Cells = Record<string, string | number | boolean | null>;

function wb(sections: Record<string, Cells>): EsgWorkbookData {
  return {
    companyId: "test",
    sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ASSUMPTIONS: Cells = {
  _targetBasis: "B-BBEE / Employment Equity targets",
  B8: "Standard",
  B9: 0.5, // stance floor
  B58: 0.8, // THR_SUP_HS — an input with no reader until the supplier wiring
};

/** `ISO_Tracker` rows, laid out exactly as the register stores them. */
function isoRows(statuses: Record<string, string>): Cells {
  const clauses = Object.keys(statuses);
  const cells: Cells = { _row_count: clauses.length };
  clauses.forEach((clause, i) => {
    const row = 5 + i; // `ESG_GRID_SECTIONS["iso-tracker"].startRow`
    cells[`B${row}`] = `Requirement for clause ${clause}`;
    cells[`C${row}`] = clause;
    cells[`D${row}`] = statuses[clause];
  });
  return cells;
}

/** `SAQ_Supplier` rows — health & safety is column D, food safety column F. */
function saqRows(ratings: Array<{ hs: string; fs: string }>): Cells {
  const cells: Cells = { _row_count: ratings.length };
  ratings.forEach((r, i) => {
    const row = 5 + i;
    cells[`A${row}`] = `Supplier ${i + 1}`;
    cells[`D${row}`] = r.hs;
    cells[`F${row}`] = r.fs;
  });
  return cells;
}

const E = (sections: Record<string, Cells>) =>
  scoreEnvironmental(deriveEsgSummaryCells(wb({ assumptions: ASSUMPTIONS, ...sections }))).rows;
const S = (sections: Record<string, Cells>) =>
  scoreSocial(deriveEsgSummaryCells(wb({ assumptions: ASSUMPTIONS, ...sections }))).rows;

describe("ISO_Tracker — E d26–d29 (20 points that could not be earned)", () => {
  const FULLY_COMPLIANT = isoRows({
    "5.2": "Fully Compliant",
    "6.1.2": "Fully Compliant",
    "6.1.3": "Fully Compliant",
    "10": "Fully Compliant",
  });

  it("awards nothing at all when the register is empty", () => {
    const rows = E({ "iso-tracker": {}, "g-data": { B21: "Yes", B27: "Yes" } });
    expect([rows.d26, rows.d27, rows.d28, rows.d29]).toEqual([0, 0, 0, 0]);
  });

  /*
   * Certification is the one row that is NOT a sliding scale. ISO 14001 has
   * three real states — certified, in progress, neither — so the points follow
   * the tracker's own Fully / Partially / Gap vocabulary, gated on an EMS
   * existing BESIDES the claim itself (CDP's sequential bands: fail the lower
   * rung and the one above it is blocked).
   */
  it("awards the full 8 only for an achieved certification", () => {
    expect(E({ "iso-tracker": FULLY_COMPLIANT }).d26).toBeCloseTo(8, 6);
  });

  it("scores a certification genuinely in progress at the partial rate", () => {
    // `Partially Compliant` is 3 of 5 → 8 × 3/5 = 4.8.
    const inProgress = isoRows({ "10": "Partially Compliant", "6.1.2": "Fully Compliant" });
    expect(E({ "iso-tracker": inProgress }).d26).toBeCloseTo(4.8, 6);
  });

  it("blocks a certificate with no management system behind it", () => {
    // A lone certification row is a claim that vouches for itself. The old
    // blend paid up to 4 points for precisely this, and a gate measured
    // against the whole EMS — which the claim is part of — would never fire.
    expect(E({ "iso-tracker": isoRows({ "10": "Fully Compliant" }) }).d26).toBe(0);
    // Add one real clause behind it and the certificate counts.
    expect(
      E({ "iso-tracker": isoRows({ "10": "Fully Compliant", "6.1.2": "Fully Compliant" }) }).d26,
    ).toBeCloseTo(8, 6);
  });

  it("pays nothing for a certification the tracker records as a gap", () => {
    expect(E({ "iso-tracker": isoRows({ "10": "Gap", "6.1.2": "Fully Compliant" }) }).d26).toBe(0);
  });

  it("scores the aspects register from clause 6.1.2, partial for partial", () => {
    expect(E({ "iso-tracker": FULLY_COMPLIANT }).d27).toBeCloseTo(4, 6);
    // `Partially Compliant` is 3 of 5 → 4 × 3/5 = 2.4.
    expect(E({ "iso-tracker": isoRows({ "6.1.2": "Partially Compliant" }) }).d27).toBeCloseTo(
      2.4,
      6,
    );
  });

  it("takes the STRICTER of the board declaration and the clause-5.2 audit", () => {
    // Board says Yes (F27 = 5) but the audit says partial (3) → 3/5 × 4 = 2.4.
    const strict = E({
      "iso-tracker": isoRows({ "5.2": "Partially Compliant" }),
      "g-data": { B27: "Yes" },
    });
    expect(strict.d28).toBeCloseTo(2.4, 6);

    // Both agree → the full 4.
    const both = E({
      "iso-tracker": isoRows({ "5.2": "Fully Compliant" }),
      "g-data": { B27: "Yes" },
    });
    expect(both.d28).toBeCloseTo(4, 6);

    // The audit is clean but the board never approved a policy → nothing.
    expect(E({ "iso-tracker": isoRows({ "5.2": "Fully Compliant" }) }).d28).toBe(0);
  });

  it("gates the legal register on the governance risk register being live", () => {
    const iso = isoRows({ "6.1.3": "Fully Compliant" });
    expect(E({ "iso-tracker": iso }).d29).toBe(0); // no risk register
    expect(E({ "iso-tracker": iso, "g-data": { B21: "Yes" } }).d29).toBeCloseTo(4, 6);
  });

  it("excludes a Not Applicable clause instead of paying it full marks", () => {
    // The sheet's own formula scores `Not Applicable` 5 of 5, which makes
    // marking a clause inapplicable the cheapest way to raise a score.
    expect(E({ "iso-tracker": isoRows({ "6.1.2": "Not Applicable" }) }).d27).toBe(0);
  });

  it("follows the clause when a register is reordered", () => {
    // The ledger cites `ISO_Tracker!E10`, but the row is user-editable: what
    // identifies the aspects register is its clause, not its position.
    const reordered = isoRows({ "9.1": "Gap", "5.2": "Gap", "6.1.2": "Fully Compliant" });
    expect(E({ "iso-tracker": reordered }).d27).toBeCloseTo(4, 6);
  });
});

describe("SAQ_Supplier — S d26/d27 (10 points that could not be earned)", () => {
  it("awards nothing when no supplier has been assessed", () => {
    const rows = S({ saq: {} });
    expect([rows.d26, rows.d27]).toEqual([0, 0]);
  });

  it("scores the mean rating against THR_SUP_HS", () => {
    // All 5s → 5/5 = 1.0 ≥ 0.8 → full marks on both criteria.
    const perfect = S({ saq: saqRows([{ hs: "5", fs: "5" }, { hs: "5", fs: "5" }]) });
    expect(perfect.d26).toBeCloseTo(5, 6);
    expect(perfect.d27).toBeCloseTo(5, 6);
  });

  it("gives partial credit inside the stance band", () => {
    // All 3s → 0.6: under the 0.8 target but above 0.8 × 0.5, so banded.
    expect(S({ saq: saqRows([{ hs: "3", fs: "3" }]) }).d26).toBeCloseTo((5 * 0.6) / 0.8, 6);
  });

  it("ignores N/A rather than counting it as a zero", () => {
    // One supplier rated 5, one not assessed. The mean is 5, not 2.5.
    const withNa = S({ saq: saqRows([{ hs: "5", fs: "5" }, { hs: "N/A", fs: "N/A" }]) });
    expect(withNa.d26).toBeCloseTo(5, 6);
  });

  it("keeps the two criteria independent", () => {
    const mixed = S({ saq: saqRows([{ hs: "5", fs: "2" }]) });
    expect(mixed.d26).toBeCloseTo(5, 6);
    expect(mixed.d27).toBeLessThan(5);
  });
});

describe("workbook parity is untouched", () => {
  it("keeps every newly-wired indicator at the workbook's literal zero", () => {
    const derived = deriveEsgSummaryCells(
      wb({
        assumptions: ASSUMPTIONS,
        "iso-tracker": isoRows({
          "5.2": "Fully Compliant",
          "6.1.2": "Fully Compliant",
          "6.1.3": "Fully Compliant",
          "10": "Fully Compliant",
        }),
        saq: saqRows([{ hs: "5", fs: "5" }]),
        "g-data": { B21: "Yes", B27: "Yes" },
      }),
    );

    const e = scoreEnvironmental(derived, { mode: "workbook-parity" }).rows;
    expect([e.d26, e.d27, e.d28, e.d29]).toEqual([0, 0, 0, 0]);

    const s = scoreSocial(derived, { mode: "workbook-parity" }).rows;
    expect([s.d26, s.d27]).toEqual([0, 0]);
  });
});
