import { describe, it, expect } from "vitest";
import { findHeaderRow } from "@/lib/workbookSectionImportExport";

/**
 * Regression coverage for the section-import column-offset bug (production
 * feedback, June 2026): re-importing a sheet that our own export produced — or
 * any sheet with a leading title/blank row — shifted every column down by one,
 * so "Full Name" values landed under "Occupational Level". The section editor
 * now calls findHeaderRow() to trim leading rows so the real header lands at
 * index 0 before normalization.
 */
describe("findHeaderRow", () => {
  it("returns 0 when the first row is already the header", () => {
    const matrix = [
      ["Full Name", "Occupational Level", "Race"],
      ["Thabo M", "Senior Management", "African"],
    ];
    expect(findHeaderRow(matrix)).toBe(0);
  });

  it("skips a single-cell merged title row (our export format)", () => {
    // exportSectionToXlsx writes [sectionLabel, "", "", ...] as row 0, then headers.
    const matrix = [
      ["Management Control & Employment Equity", "", ""],
      ["Full Name", "Occupational Level", "Race"],
      ["Thabo M", "Senior Management", "African"],
    ];
    expect(findHeaderRow(matrix)).toBe(1);
  });

  it("skips multiple leading title/blank rows", () => {
    const matrix = [
      ["Ownership", ""],
      ["", ""],
      ["Shareholder", "% Held"],
      ["Acme Trust", "30"],
    ];
    expect(findHeaderRow(matrix)).toBe(2);
  });

  it("falls back to row 0 when no row has >=2 filled cells", () => {
    const matrix = [["Only one column"], ["value"]];
    expect(findHeaderRow(matrix)).toBe(0);
  });

  it("trimming with findHeaderRow puts the real header at index 0", () => {
    const matrix = [
      ["Employees", "", ""],
      ["Full Name", "Occupational Level", "Race"],
      ["Thabo M", "Senior Management", "African"],
    ];
    const headerIdx = findHeaderRow(matrix);
    const trimmed = headerIdx > 0 ? matrix.slice(headerIdx) : matrix;
    // The header (not the title row) must be first so hasHeaderRow:true aligns columns.
    expect(trimmed[0]).toEqual(["Full Name", "Occupational Level", "Race"]);
    expect(trimmed[1]?.[0]).toBe("Thabo M");
  });
});
