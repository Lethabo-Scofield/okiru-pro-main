/**
 * "Total Procurement Spend" is a legitimate TMPS caption.
 *
 * Making the bare "total procurement" synonym whole-label-only (so the Imports
 * sheet's "Total Procurement Expenditure from foreign suppliers" stopped being
 * read as TMPS) also stopped this caption matching by containment. The figure
 * was lost, and with no TMPS the sync fell back to the supplier-schedule total.
 * The foreign / imports / excluded / pre-exclusions guard must still hold.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractBeeGatheringBuffer } from "../excelImport";

function gathering(financeRows: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["Measured Entity Name:", "Acme Trading"], ["Industry Sector:", "Generic"]]),
    "Instructions",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["FINANCIAL INFORMATION", "Year 0"], ["Turnover", 98_765_432.1], ...financeRows]),
    "Finance",
  );
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Shareholder", "Black Voting Rights"], ["A Owner", 1]]), "Ownership");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Name", "Race", "Gender"], ["A Person", "African", "Female"]]), "Employment Equity");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("extractBeeGatheringBuffer — the 'Total Procurement Spend' caption", () => {
  it("reads TMPS stated under 'Total Procurement Spend', as a real match", () => {
    for (const caption of ["Total Procurement Spend", "Total Procurement Spend (R)", "Total procurement spend for the period"]) {
      const result = extractBeeGatheringBuffer(gathering([[caption, 1_234_567.89]]));
      expect(result.data.totalProcurement, caption).toBeCloseTo(1_234_567.89, 2);
      // Not a near-miss spelling match: "low" loses to any other reading.
      expect(result.fieldConfidences.totalProcurement, caption).not.toBe("low");
    }
  });

  it("still never reads foreign or pre-exclusions procurement as TMPS", () => {
    for (const caption of [
      "Total Procurement Spend from foreign suppliers",
      "Total Procurement Spend on imports",
      "Total Procurement Spend before exclusions",
      "TMPS Inclusions",
      "Total Procurement Spend with B-BBEE compliant suppliers",
    ]) {
      const result = extractBeeGatheringBuffer(gathering([[caption, 7_654_321]]));
      expect(result.data.totalProcurement, caption).toBeUndefined();
    }
  });
});
