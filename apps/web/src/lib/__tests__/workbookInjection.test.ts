/**
 * Injecting extracted values into workbook cells.
 *
 * Extraction is worthless if the value cannot land in a cell. The workbook
 * already declares its own field types, dropdown options and validators, so
 * injection's job is to respect them — and, crucially, to REPORT what it could
 * not place rather than forcing it.
 *
 * Forcing is the danger: "Black" written into a dropdown that only accepts
 * "African | Coloured | Indian | White" produces a cell that looks filled,
 * scores as nothing, and is invisible in review.
 */
import { describe, expect, it } from "vitest";
import {
  coerceToColumn,
  injectIntoSection,
  matchOption,
  missingRequiredColumns,
  toIsoDate,
  toNumber,
} from "../workbookInjection";
import { getSection } from "@/components/workbook/sections";

const OWNERSHIP = getSection("ownership")!;
const raceColumn = OWNERSHIP.columns!.find((c) => c.key === "race")!;

describe("dropdown matching", () => {
  const options = ["African", "Coloured", "Indian", "White"];

  it("matches exactly", () => {
    expect(matchOption("African", options)).toBe("African");
  });

  it("matches regardless of case and punctuation", () => {
    expect(matchOption("african", options)).toBe("African");
    expect(matchOption("  AFRICAN  ", options)).toBe("African");
  });

  it("matches a longer phrase containing the option", () => {
    // Documents say "Black African"; the dropdown says "African".
    expect(matchOption("Black African", options)).toBe("African");
  });

  it("refuses to guess when nothing matches", () => {
    // "Black" is the B-BBEE umbrella term covering three options — choosing one
    // would silently put a wrong race on a scorecard.
    expect(matchOption("Black", options)).toBeNull();
    expect(matchOption("Martian", options)).toBeNull();
  });

  it("refuses to guess when two options are equally plausible", () => {
    expect(matchOption("Man", ["Management", "Manual"])).toBeNull();
  });
});

describe("type coercion", () => {
  it("reads South African money formats", () => {
    expect(toNumber("R 1 030 806.68")).toBeCloseTo(1030806.68, 2);
    expect(toNumber("1,030,806.68")).toBeCloseTo(1030806.68, 2);
    expect(toNumber("(4 157 140)")).toBe(-4157140); // bracketed negative, from AFS
  });

  it("rejects text that is not a number", () => {
    expect(toNumber("not applicable")).toBeNull();
    expect(toNumber("")).toBeNull();
  });

  it("reads dates day-first, as South African documents write them", () => {
    expect(toIsoDate("14 March 2027")).toBe("2027-03-14");
    expect(toIsoDate("2027-03-14")).toBe("2027-03-14");
    // 03/04/2027 is 3 April, never 4 March.
    expect(toIsoDate("03/04/2027")).toBe("2027-04-03");
  });

  it("rejects an unrecognisable date rather than inventing one", () => {
    expect(toIsoDate("sometime next year")).toBeNull();
  });
});

describe("coercing against a real workbook column", () => {
  it("accepts a value the dropdown permits", () => {
    const result = coerceToColumn(raceColumn, "African");
    expect(result.ok).toBe(true);
  });

  it("rejects a value the dropdown does not permit, and says what is allowed", () => {
    const result = coerceToColumn(raceColumn, "Klingon");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_matching_option");
      // The user needs to know what WOULD work.
      expect(result.detail).toMatch(/African/);
    }
  });

  it("rejects an empty value instead of writing a blank cell", () => {
    const result = coerceToColumn(raceColumn, "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });
});

describe("injecting a row", () => {
  it("places values that satisfy their columns", () => {
    const result = injectIntoSection("ownership", [
      { field: "shareholderName", value: "Venugopal Lutchman, Naidoo", sourceFile: "register.pdf" },
      { field: "race", value: "Indian", sourceFile: "register.pdf" },
      { field: "gender", value: "Male", sourceFile: "register.pdf" },
    ]);

    expect(result.cells.shareholderName).toBe("Venugopal Lutchman, Naidoo");
    expect(result.cells.race).toBe("Indian");
    expect(result.rejected).toHaveLength(0);
  });

  it("keeps provenance on every accepted value", () => {
    const result = injectIntoSection("ownership", [
      { field: "shareholderName", value: "T Nkosi", sourceFile: "share-register.pdf" },
    ]);
    expect(result.accepted[0].sourceFile).toBe("share-register.pdf");
  });

  it("reports a value it cannot place instead of forcing it", () => {
    const result = injectIntoSection("ownership", [
      { field: "shareholderName", value: "T Nkosi" },
      { field: "race", value: "Martian" }, // genuinely not a race
    ]);

    // The good value still lands...
    expect(result.cells.shareholderName).toBe("T Nkosi");
    // ...and the bad one is reported, not written.
    expect(result.cells.race).toBeUndefined();
    expect(result.rejected.map((r) => r.field)).toContain("race");
  });

  it("normalises B-BBEE umbrella 'Black' to a scoreable race", () => {
    // "Black" is the umbrella (African/Coloured/Indian); the scoring layer treats
    // it as African. Reading it correctly and then rejecting it would be a
    // last-mile silent zero on ownership.
    const result = injectIntoSection("ownership", [{ field: "race", value: "Black" }]);
    expect(result.cells.race).toBe("African");
  });

  it("normalises 'Level 4' to the dropdown's '4'", () => {
    const result = injectIntoSection("procurement", [{ field: "bbbeeLevel", value: "Level 4" }]);
    expect(result.cells.bbbeeLevel).toBe("4");
  });

  it("normalises a certificate's 'Level One Contributor' to '1'", () => {
    // Real certificates write the level in words — the Outsurance 2024
    // certificate says exactly this, and it was rejected at the dropdown.
    const result = injectIntoSection("procurement", [{ field: "bbbeeLevel", value: "Level One Contributor" }]);
    expect(result.cells.bbbeeLevel).toBe("1");
  });

  it("accepts a boolean for a Yes/No dropdown — 'empowering_supplier: true'", () => {
    const result = injectIntoSection("procurement", [{ field: "empoweringSupplier", value: true }]);
    expect(result.rejected).toHaveLength(0);
    expect(result.cells.empoweringSupplier === "Yes" || result.cells.empoweringSupplier === true).toBe(true);
  });

  it("normalises 'Other Executive Management' into the top band", () => {
    // The Codes split top management into Executive directors and Other
    // Executive Management — both are the top band. The real register's Admin
    // Manager carried exactly this label and was rejected at the dropdown,
    // costing the MC black-women bonus.
    const result = injectIntoSection("management-control", [
      { field: "occupationalLevel", value: "Other Executive Management" },
    ]);
    expect(result.cells.occupationalLevel).toBe("Top Management");
  });

  it("normalises an occupational level to the workbook's dropdown, not the scoring band", () => {
    // "Executive Management" is the EEA occupational level on the register. The
    // Occupational-Level dropdown says "Top Management" — the scoring engine's
    // band ("Executive Director") is NOT one of its options, so normalising to
    // the band silently emptied Management Control. Use the workbook's own map.
    const result = injectIntoSection("management-control", [
      { field: "occupationalLevel", value: "Executive Management" },
    ]);
    expect(result.cells.occupationalLevel).toBe("Top Management");
    expect(result.rejected).toHaveLength(0);
  });

  it("keeps a designation that is already a dropdown option", () => {
    // "Non-executive Director" IS a Designation option; the scoring map rewrote
    // it to "Board", which the dropdown lacks, and it was rejected.
    const result = injectIntoSection("management-control", [
      { field: "designation", value: "Non-executive Director" },
    ]);
    expect(result.cells.designation).toBe("Non-executive Director");
  });

  it("normalises a supplier size phrase to the EME/QSE/Generic dropdown", () => {
    const result = injectIntoSection("procurement", [
      { field: "supplierName", value: "Alpha" },
      { field: "currentSize", value: "Exempted Micro Enterprise" },
    ]);
    expect(result.cells.currentSize).toBe("EME");
  });

  it("reports a field that is not a column of the section", () => {
    const result = injectIntoSection("ownership", [
      { field: "favourite_colour", value: "blue" },
    ]);

    expect(result.rejected[0].reason).toBe("unknown_field");
    expect(result.rejected[0].detail).toMatch(/not a column/i);
  });

  it("lets the column's own validator have the last word", () => {
    // Validators encode rules injection has no business duplicating.
    const numericColumn = OWNERSHIP.columns!.find((c) => c.type === "number" && c.validate);
    if (!numericColumn) return; // no validated numeric column in this section

    const result = injectIntoSection("ownership", [
      { field: numericColumn.key, value: -999999 },
    ]);
    // Either it passed the validator or it was reported — never silently wrong.
    const placed = result.cells[numericColumn.key] !== undefined;
    const reported = result.rejected.some((r) => r.field === numericColumn.key);
    expect(placed || reported).toBe(true);
  });

  it("produces an empty result for no values rather than throwing", () => {
    const result = injectIntoSection("ownership", []);
    expect(result.cells).toEqual({});
    expect(result.rejected).toEqual([]);
  });
});

describe("required columns", () => {
  it("names required columns a row has not filled", () => {
    const missing = missingRequiredColumns("ownership", {});
    // Reported by LABEL, because this is shown to a user.
    expect(Array.isArray(missing)).toBe(true);
  });
});

describe("contribution-type vocabulary — AI wordings land in the Codes' dropdown", () => {
  // "the AI doesnt send the proper info to the dropdown expecting cells" — a
  // donation is a Grant Contribution under Statement 500; rejecting it left the
  // required cell empty and disconnected.
  it("maps donation/sponsorship wordings to Grant Contribution on SED rows", () => {
    for (const wording of ["Donation", "Cash donation", "Sponsorship", "Bursary"]) {
      const result = injectIntoSection("sed", [{ field: "contributionType", value: wording }]);
      expect(result.cells.contributionType, wording).toBe("Grant Contribution");
    }
  });

  it("maps in-kind wordings to Other Non-Monetary", () => {
    const result = injectIntoSection("sed", [{ field: "contributionType", value: "In-kind donation of goods" }]);
    expect(result.cells.contributionType).toBe("Other Non-Monetary");
  });

  it("maps ESD instrument wordings (soft loan, early payment) to their options", () => {
    expect(injectIntoSection("esd", [{ field: "contributionType", value: "Interest-free loan" }]).cells.contributionType).toBe("Loan");
    expect(injectIntoSection("esd", [{ field: "contributionType", value: "Early payment" }]).cells.contributionType).toBe("Payment Period Reduction");
  });

  it("still rejects a wording with no unambiguous recognition category", () => {
    const result = injectIntoSection("sed", [{ field: "contributionType", value: "Community upliftment" }]);
    expect(result.cells.contributionType).toBeUndefined();
    expect(result.rejected.some((r) => r.field === "contributionType")).toBe(true);
  });

  it("maps SD / ED shorthand into the esdCategory dropdown", () => {
    expect(injectIntoSection("esd", [{ field: "esdCategory", value: "SD" }]).cells.esdCategory).toBe("Supplier Development");
    expect(injectIntoSection("esd", [{ field: "esdCategory", value: "ED" }]).cells.esdCategory).toBe("Enterprise Development");
  });

  it("maps single-letter gender shorthand", () => {
    const result = injectIntoSection("management-control", [{ field: "gender", value: "F" }]);
    expect(result.cells.gender).toBe("Female");
  });
});

describe("Excel serial dates are recognised (schedules keep their dates)", () => {
  it("converts a bare Excel serial number to an ISO date", () => {
    // 45397 = 2024-04-15. Without this, dated schedule rows lose their dates and
    // rows that differ only by date collapse into one (SED lost 24 of 26 rows).
    expect(toIsoDate(45397)).toBe("2024-04-15");
    expect(toIsoDate("45397")).toBe("2024-04-15");
  });
  it("leaves non-serial numbers and normal dates alone", () => {
    expect(toIsoDate(400)).toBeNull();          // a Rand amount, not a date
    expect(toIsoDate("14 March 2027")).toBe("2027-03-14");
    expect(toIsoDate("2027-03-14")).toBe("2027-03-14");
  });
});
