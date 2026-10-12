/**
 * What the review shows for a value: never a spreadsheet error code as if it
 * were a figure, never a bare "6 items", never raw JSON. Invented figures.
 */
import { describe, expect, it } from "vitest";
import { brokenCellText, workbookCellError } from "../workbookCellError";
import { applyReviewEdit, buildDocumentReview, display, listEntries } from "../documentReview";
import { formatParserValue } from "../parserDocuments";
import type { ParserCaseLike } from "../parserWorkbookMap";

describe("workbookCellError", () => {
  it("recognises every spreadsheet error code, whatever the case or spacing", () => {
    for (const code of ["#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NUM!", "#NULL!"]) {
      expect(workbookCellError(code)).toBe(code);
    }
    expect(workbookCellError(" #ref! ")).toBe("#REF!");
    expect(workbookCellError("#div/0!")).toBe("#DIV/0!");
    expect(workbookCellError("#N/A!")).toBe("#N/A");
  });

  it("leaves real values alone", () => {
    expect(workbookCellError("12 500")).toBeNull();
    expect(workbookCellError("#1 Supplier")).toBeNull();
    expect(workbookCellError(12500)).toBeNull();
    expect(workbookCellError(null)).toBeNull();
  });

  it("says the cell is broken, naming the code", () => {
    expect(brokenCellText("#REF!")).toBe("Broken cell in the workbook (#REF!)");
  });
});

describe("display of a list", () => {
  it("shows a short list whole", () => {
    expect(display(["Mar 2025", "Apr 2025"])).toBe("Mar 2025, Apr 2025");
  });

  it("says what a longer list holds, not only how many", () => {
    const months = ["Mar 2024", "Apr 2024", "May 2024", "Jun 2024", "Jul 2024", "Aug 2024", "Sep 2024", "Oct 2024", "Nov 2024", "Dec 2024", "Jan 2025", "Feb 2025"];
    expect(display(months)).toBe("12 entries: Mar 2024, Apr 2024, …");
    expect(display(months)).not.toMatch(/items/);
  });

  it("describes a list of records by their values", () => {
    const lines = [
      { line_item: "Fuel", amount: 12500 },
      { line_item: "Tyres", amount: 4000 },
      { line_item: "Repairs", amount: 900 },
      { line_item: "Insurance", amount: 700 },
    ];
    expect(listEntries(lines)).toEqual(["Fuel · 12,500", "Tyres · 4,000", "Repairs · 900", "Insurance · 700"].map((s) => s.replace(/,/g, " ")));
    expect(display(lines)).toMatch(/^4 entries: Fuel · /);
  });

  it("never shows a record as raw JSON", () => {
    expect(display({ start: "2031-01-15", end: "2031-12-15" })).toBe("2031-01-15 · 2031-12-15");
    expect(formatParserValue({ start: "2031-01-15", end: "2031-12-15" })).toBe("2031-01-15 · 2031-12-15");
    expect(formatParserValue(["Mar 2025", "Apr 2025"])).toBe("Mar 2025, Apr 2025");
  });
});

const FILE = "Gathering.xlsx › Finance";
const parserCase = {
  documents_detected: [{ filename: FILE, document_type: "Audited financial statements", status: "passed", validation: { errors: [], warnings: [], missing_fields: [] } }],
  fields_extracted: {
    [FILE]: {
      total_measured_procurement_spend: { raw_value: "#REF!", normalized_value: "#REF!", confidence: 0.4, source: {} },
      months_submitted: { raw_value: null, normalized_value: ["Mar 2024", "Apr 2024", "May 2024", "Jun 2024"], confidence: 0.9, source: {} },
      revenue: { raw_value: "10 000 000", normalized_value: 10000000, confidence: 0.9, source: {} },
    },
  },
} as unknown as ParserCaseLike;

describe("the review's values", () => {
  // A sheet is listed under its workbook; its values are the workbook's.
  const values = buildDocumentReview({ parserCase, sections: {} }).flatMap((d) => d.values);
  const byLabel = (label: string) => values.find((v) => v.label === label)!;

  it("marks a broken cell, keeping it correctable", () => {
    const tmps = byLabel("Total measured procurement spend");
    expect(tmps.cellError).toBe("#REF!");
    expect(tmps.edit).toEqual({ kind: "field", field: "total_measured_procurement_spend" });
  });

  it("opens a list into its entries instead of offering to retype it", () => {
    const months = byLabel("Months submitted");
    expect(months.value).toBe("4 entries: Mar 2024, Apr 2024, …");
    expect(months.items).toEqual(["Mar 2024", "Apr 2024", "May 2024", "Jun 2024"]);
    expect(months.edit).toBeUndefined();
  });

  it("stores the figure typed over a broken cell as a number", () => {
    const next = applyReviewEdit(parserCase, FILE, { kind: "field", field: "total_measured_procurement_spend" }, "R 1 250 000");
    const field = next.fields_extracted?.[FILE]?.total_measured_procurement_spend as Record<string, unknown>;
    expect(field.normalized_value).toBe(1250000);
    expect(field.parser_value).toBe("#REF!");
  });
});
