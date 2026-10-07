/**
 * The workbook's Instructions-sheet profile in the create form's terms, and
 * the Excel import reading the same year end through its defined name.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { formFactMismatches, workbookFormFacts } from "../workbookInstructionFacts";
import { extractBeeGatheringBuffer } from "../excelImport";

const profile = (sourceFile: string, sector: string, yearEnd: unknown) => ({
  documentId: "sheet_instructions",
  sourceFile,
  values: [
    { field: "industry_sector", value: sector },
    { field: "financial_year_end", value: yearEnd },
  ],
});

const caseOf = (...extractions: unknown[]) => ({ ai_entities: { extractions } });

describe("workbookFormFacts", () => {
  it("names the sector by the form's code and the year end as ISO", () => {
    expect(workbookFormFacts(caseOf(profile("a.xlsx › Instructions", "Transport", "2026-02-28")))).toEqual({
      sector: "TRANSPORT",
      sectorStated: "Transport",
      yearEnd: "2026-02-28",
      sources: ["a.xlsx › Instructions"],
    });
  });

  it("offers nothing to prefill where two workbooks disagree", () => {
    const facts = workbookFormFacts(caseOf(
      profile("a.xlsx › Instructions", "Transport", "2026-02-28"),
      profile("b.xlsm › Instructions", "Construction", "28/02/2026"),
    ));
    expect(facts.sector).toBeUndefined();
    expect(facts.yearEnd).toBe("2026-02-28"); // the same date, written two ways
  });

  it("reads nothing from other documents or a case without extractions", () => {
    expect(workbookFormFacts(null).sector).toBeUndefined();
    expect(workbookFormFacts(caseOf({ documentId: "sheet_financials", values: [{ field: "industry_sector", value: "Transport" }] })).sector)
      .toBeUndefined();
  });
});

describe("formFactMismatches", () => {
  const facts = workbookFormFacts(caseOf(profile("a.xlsx › Instructions", "Transport", "2026-02-28")));

  it("flags a different choice, and not a blank or an equal one", () => {
    expect(formFactMismatches({ sector: "RCOGP", yearEnd: "2025-06-30" }, facts).map((m) => m.field)).toEqual(["sector", "yearEnd"]);
    expect(formFactMismatches({ sector: "", yearEnd: "" }, facts)).toEqual([]);
    expect(formFactMismatches({ sector: "TRANSPORT", yearEnd: "2026-02-28" }, facts)).toEqual([]);
  });
});

describe("Excel import: the year end through its defined name", () => {
  /**
   * The template names its year-end date cell `YearEnd`, as it names `Sector`.
   * A copy whose caption was moved, reworded or deleted still has the name.
   */
  function gatheringWorkbook(): ArrayBuffer {
    const book = XLSX.utils.book_new();
    const instructions = XLSX.utils.aoa_to_sheet([
      ["", "Measured Entity Name:", "Acme Trading (Pty) Ltd"],
      ["", "Industry Sector:", "Transport"],
      ["", "", ""],
    ]);
    instructions.C3 = { t: "n", v: 46081, z: "dddd, mmmm dd, yyyy" };
    XLSX.utils.book_append_sheet(book, instructions, "Instructions");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Turnover", 1234567.89]]), "Finance");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Shareholder", "Race"]]), "Ownership");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Name", "Race"]]), "Employment Equity");
    book.Workbook = { Names: [{ Name: "YearEnd", Ref: "Instructions!$C$3" }] };
    const out = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return out;
  }

  it("reads the year end as an ISO date with no caption beside it", () => {
    const result = extractBeeGatheringBuffer(gatheringWorkbook());
    expect(result.isBeeGatheringFormat).toBe(true);
    expect(result.data.financialYearEnd).toBe("2026-02-28");
  });
});
