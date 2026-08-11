/**
 * The reasoning layer's contract: everything it proposes is evidence-grounded,
 * everything ambiguous becomes a human decision, and nothing is ever guessed.
 */
import { describe, expect, it } from "vitest";
import { buildExtractionReview, genderFromSaId } from "../extractionReview";
import type { WorkbookSectionsInput } from "@/components/workbook/workbookValidation";

/** Independent Luhn check-digit builder so ID fixtures don't use the code under test. */
function saId(prefix12: string): string {
  for (let check = 0; check <= 9; check++) {
    const id = prefix12 + String(check);
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      let d = Number(id[12 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error("unreachable");
}

const MALE_ID = saId("560830511208");   // SSSS = 5112 ≥ 5000 → male
const FEMALE_ID = saId("880101043208"); // SSSS = 0432 < 5000 → female

describe("genderFromSaId", () => {
  it("reads gender from digits 7–10 of a checksum-valid ID", () => {
    expect(genderFromSaId(MALE_ID)).toBe("Male");
    expect(genderFromSaId(FEMALE_ID)).toBe("Female");
  });

  it("refuses invalid checksums and malformed IDs — a typo never derives anything", () => {
    const corrupted = MALE_ID.slice(0, 12) + String((Number(MALE_ID[12]) + 1) % 10);
    expect(genderFromSaId(corrupted)).toBeNull();
    expect(genderFromSaId("12345")).toBeNull();
    expect(genderFromSaId("")).toBeNull();
    expect(genderFromSaId(undefined)).toBeNull();
  });
});

function sections(over: Partial<WorkbookSectionsInput>): WorkbookSectionsInput {
  return {
    "company-information": { meta: { companyName: "T", industrySector: "TRANSPORT", scorecardType: "QSE" } },
    ...over,
  } as WorkbookSectionsInput;
}

describe("buildExtractionReview", () => {
  it("surfaces the Naidoo conflict: same ID, different race across sections", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [{ _id: "o1", shareholderName: "V Naidoo", idNumber: MALE_ID, race: "African", gender: "Male", numberOfShares: 100, _sourceFiles: ["reg.pdf"] }] },
      "management-control": { rows: [{ _id: "m1", name: "V", surname: "Naidoo", idNumber: MALE_ID, race: "Indian", gender: "Male", occupationalLevel: "Top Management", designation: "Executive Director", _sourceFiles: ["mc.xlsx"] }] },
    }));

    const conflict = review.conflicts.find((c) => /different race/.test(c.statement));
    expect(conflict).toBeDefined();
    expect(conflict!.sides.map((s) => s.value).sort()).toEqual(["African", "Indian"]);
  });

  it("suggests a grounded cross-section fill and never a guess", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [{ _id: "o1", shareholderName: "V Naidoo", idNumber: MALE_ID, race: "Indian", gender: "Male", numberOfShares: 100, _sourceFiles: ["reg.pdf"] }] },
      "skills-development": { rows: [{ _id: "s1", learnerName: "V Naidoo", idNumber: MALE_ID, programName: "P", categoryCode: "B", totalCost: 100, _sourceFiles: ["sk.xlsx"] }] },
    }));

    const raceFill = review.suggestions.find((s) => s.column === "race" && s.section === "skills-development");
    expect(raceFill).toBeDefined();
    expect(raceFill!.value).toBe("Indian");
    expect(raceFill!.basis).toContain("Same ID number");
  });

  it("derives gender from the ID itself when nothing else states it", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [{ _id: "o1", shareholderName: "N Dlamini", idNumber: FEMALE_ID, race: "African", numberOfShares: 100, _sourceFiles: ["reg.pdf"] }] },
    }));

    const genderFill = review.suggestions.find((s) => s.column === "gender");
    expect(genderFill).toBeDefined();
    expect(genderFill!.value).toBe("Female");
    expect(genderFill!.basis).toContain("SA ID numbers encode gender");
  });

  it("flags black-women points sitting on a row whose stated gender contradicts them", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [{ _id: "o1", shareholderName: "V Naidoo", race: "Indian", gender: "Male", numberOfShares: 100, blackWomenOwnership: 0.3, _sourceFiles: ["own.pdf"] }] },
    }));

    const phantom = review.conflicts.find((c) => /black-women ownership/.test(c.statement));
    expect(phantom).toBeDefined();
    expect(phantom!.statement).toContain('stated gender is "Male"');
  });

  it("groups missing required fields into one decision with the column's own options", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      _id: `sed${i}`,
      beneficiaryName: `Beneficiary ${i}`,
      amount: 100,
      descriptionOfSpend: "d",
      percentBenefitingBlack: 100,
      _sourceFiles: ["sed.xlsm"],
    }));
    const review = buildExtractionReview(sections({ sed: { rows } }));

    const decision = review.decisions.find((d) => d.column === "contributionType");
    expect(decision).toBeDefined();
    expect(decision!.rows).toHaveLength(5);
    expect(decision!.statement).toContain("5 rows");
    expect(decision!.options && decision!.options.length).toBeTruthy();
  });

  it("reports shareholdings that do not sum to 100%", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [
        { _id: "o1", shareholderName: "A", race: "African", gender: "Male", numberOfShares: 60, _sourceFiles: ["r.pdf"] },
        { _id: "o2", shareholderName: "B", race: "African", gender: "Female", numberOfShares: 25, _sourceFiles: ["r.pdf"] },
      ] },
    }));

    const sum = review.conflicts.find((c) => /add up to 85%/.test(c.statement));
    expect(sum).toBeDefined();
  });

  it("stays quiet on a manual workbook (no provenance) — the modal has nothing to explain", () => {
    const review = buildExtractionReview(sections({
      ownership: { rows: [{ _id: "o1", shareholderName: "A", race: "African", gender: "Male", numberOfShares: 100 }] },
    }));
    expect(review.extracted.every((s) => s.aiRowCount === 0)).toBe(true);
  });
});

describe("item ids survive recomputation", () => {
  // The review is rebuilt from scratch whenever the workbook changes, and the
  // modal remembers applied items by id. Ids used to be a shared running
  // counter, so applying one suggestion renumbered the rest: a different,
  // untouched suggestion inherited the retired id and the modal filtered it out
  // as "already applied". It disappeared without ever being applied.
  const twoBlanks = (): WorkbookSectionsInput => ({
    ownership: {
      rows: [
        { _id: "o1", shareholderName: "A Ndlovu", idNumber: MALE_ID, race: "African", gender: "Male", _sourceFiles: ["reg.pdf"] },
        { _id: "o2", shareholderName: "B Khumalo", idNumber: FEMALE_ID, race: "African", gender: "Female", _sourceFiles: ["reg.pdf"] },
      ],
    },
    "management-control": {
      rows: [
        { _id: "m1", name: "A", surname: "Ndlovu", idNumber: MALE_ID, _sourceFiles: ["ee.pdf"] },
        { _id: "m2", name: "B", surname: "Khumalo", idNumber: FEMALE_ID, _sourceFiles: ["ee.pdf"] },
      ],
    },
  });

  it("gives the same finding the same id every time", () => {
    const a = buildExtractionReview(twoBlanks());
    const b = buildExtractionReview(twoBlanks());
    expect(a.suggestions.map((s) => s.id)).toEqual(b.suggestions.map((s) => s.id));
  });

  it("does not renumber the survivors when one suggestion is applied", () => {
    const before = buildExtractionReview(twoBlanks());
    const raceForM2 = before.suggestions.find((s) => s.rowId === "m2" && s.column === "race");
    expect(raceForM2).toBeDefined();

    // Apply the FIRST row's race, exactly as the modal would.
    const after = twoBlanks();
    const mc = after["management-control"]!.rows as Array<Record<string, unknown>>;
    mc[0].race = "African";

    const reviewAfter = buildExtractionReview(after);
    const stillThere = reviewAfter.suggestions.find((s) => s.id === raceForM2!.id);
    expect(stillThere, "m2's race suggestion must keep its id after m1 was applied").toBeDefined();
    expect(stillThere!.rowId).toBe("m2");
  });

  it("keys a suggestion by the cell it fills, not by discovery order", () => {
    const review = buildExtractionReview(twoBlanks());
    for (const s of review.suggestions) {
      expect(s.id).toContain(s.rowId);
      expect(s.id).toContain(s.column);
    }
  });
});

describe("the ID outranks a value copied from another sheet", () => {
  // Digits 7-10 of a checksum-valid SA ID ARE the person's gender. A value
  // copied off another sheet is hearsay next to that. The copy used to win and
  // suppress the ID-derived suggestion for the same cell, so "Apply all" could
  // write a gender into a row whose own ID says the opposite.
  const contradicted = (): WorkbookSectionsInput => ({
    ownership: {
      // MALE_ID, but this sheet claims Female — the sheet is wrong.
      rows: [{ _id: "o1", shareholderName: "A Ndlovu", idNumber: MALE_ID, gender: "Female", _sourceFiles: ["reg.pdf"] }],
    },
    "management-control": {
      // Same person, gender blank — this is the cell that gets filled.
      rows: [{ _id: "m1", name: "A", surname: "Ndlovu", idNumber: MALE_ID, _sourceFiles: ["ee.pdf"] }],
    },
  });

  it("fills the blank from the ID, not from the contradicting sheet", () => {
    const review = buildExtractionReview(contradicted());
    const genderFills = review.suggestions.filter((s) => s.rowId === "m1" && s.column === "gender");
    expect(genderFills).toHaveLength(1);
    expect(genderFills[0].value).toBe("Male");
    expect(genderFills[0].basis).toMatch(/ID number/i);
  });

  it("still raises the contradiction against the sheet that stated it", () => {
    const review = buildExtractionReview(contradicted());
    expect(review.conflicts.some((c) => /contradicts the SA ID/i.test(c.statement))).toBe(true);
  });

  it("copies gender across sections when no ID can settle it", () => {
    // Without a derivable gender the cross-section copy is the best evidence
    // there is, and must still be offered.
    const review = buildExtractionReview({
      ownership: { rows: [{ _id: "o1", shareholderName: "C Mokoena", idNumber: "9999999999999", gender: "Female", _sourceFiles: ["reg.pdf"] }] },
      "management-control": { rows: [{ _id: "m1", name: "C", surname: "Mokoena", idNumber: "9999999999999", _sourceFiles: ["ee.pdf"] }] },
    });
    // 9999999999999 fails Luhn, so nothing is derivable from it and the rows
    // are not even linked — no suggestion, and certainly no invention.
    expect(review.suggestions.filter((s) => s.column === "gender" && s.value === "Male")).toHaveLength(0);
  });
});

describe("which did you mean — entity-level disagreements", () => {
  // Written into section meta at extraction time (parserToWorkbook) and
  // answered here, in the workbook, by someone with the documents open.
  const withConflict = (over: Record<string, unknown> = {}): WorkbookSectionsInput => ({
    ownership: { rows: [{ _id: "o1", shareholderName: "A", idNumber: MALE_ID, _sourceFiles: ["reg.pdf"] }] },
    "financial-information": {
      rows: [],
      meta: {
        _metaConflicts: [
          {
            column: "revenue",
            field: "current_year_revenue",
            candidates: [
              { value: 10826271, sources: ["afs.pdf"] },
              { value: 9500000, sources: ["mgmt-accounts.xlsx"] },
            ],
          },
        ],
        ...over,
      },
    },
  });

  it("asks the question, with each value's documents named", () => {
    const review = buildExtractionReview(withConflict());
    expect(review.choices).toHaveLength(1);
    const choice = review.choices[0];
    expect(choice.column).toBe("revenue");
    expect(choice.options.map((o) => o.value)).toEqual(["10826271", "9500000"]);
    // Without knowing which document said what, the question is unanswerable.
    expect(choice.options[0].sources).toEqual(["afs.pdf"]);
    expect(choice.options[1].sources).toEqual(["mgmt-accounts.xlsx"]);
  });

  it("counts toward the open items so it cannot be missed", () => {
    const review = buildExtractionReview(withConflict());
    expect(review.openItems).toBeGreaterThanOrEqual(1);
  });

  it("stops asking once the figure has been chosen", () => {
    // The handler writes the value and drops the conflict together; either
    // alone would leave the modal contradicting itself.
    const answered = buildExtractionReview(withConflict({ revenue: 10826271 }));
    expect(answered.choices).toHaveLength(0);
  });

  it("ignores a conflict that no longer offers a real choice", () => {
    const review = buildExtractionReview({
      "financial-information": {
        rows: [],
        meta: { _metaConflicts: [{ column: "revenue", field: "r", candidates: [{ value: 1, sources: ["a.pdf"] }] }] },
      },
    });
    expect(review.choices).toHaveLength(0);
  });
});

describe("corroboration is reported as strength", () => {
  const base = (meta: Record<string, unknown>): WorkbookSectionsInput => ({
    ownership: {
      rows: [{ _id: "o1", shareholderName: "A", idNumber: MALE_ID, gender: "Male", race: "African", _sourceFiles: ["reg.pdf"] }],
    },
    "financial-information": { rows: [], meta },
  });
  const agreement = {
    column: "revenue",
    field: "current_year_revenue",
    value: 10826271,
    agreementCount: 3,
    sources: ["afs.pdf", "mgmt.xlsx", "tb.pdf"],
  };

  it("names the figure, the count and the documents", () => {
    const review = buildExtractionReview(base({ revenue: 10826271, _metaCorroboration: [agreement] }));
    expect(review.corroborated).toHaveLength(1);
    expect(review.corroborated[0].agreementCount).toBe(3);
    expect(review.corroborated[0].sources).toHaveLength(3);
  });

  it("adds nothing to the badge — agreement is not a task", () => {
    const without = buildExtractionReview(base({ revenue: 10826271 }));
    const with_ = buildExtractionReview(base({ revenue: 10826271, _metaCorroboration: [agreement] }));
    expect(with_.openItems).toBe(without.openItems);
  });
});
