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
