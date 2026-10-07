/**
 * TMPS left blank ON PURPOSE must say why, in the workbook itself.
 *
 * The Finance-sheet reader reports "TMPS cell holds #REF!" when the stated
 * TMPS formula is broken and reads nothing from it. That finding used to live
 * only on the upload screen, so by the time the workbook was synced the server
 * saw an ordinary blank — and filled it with the supplier sum, the very figure
 * the finding promised had not been computed. The injector now files it under
 * a reserved meta key the server projection reads.
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook, toWorkbookSections, type ParserExtraction } from "../parserToWorkbook";
import { META_WITHDRAWN_KEY, tmpsHold } from "../extractionMetaKeys";

const REF_FINDING =
  'TMPS cell holds #REF! in Acme Finance.xlsx: the workbook\'s "Total Measured Procurement Spend" formula is broken, so no TMPS was read from this sheet.';

const brokenFinance: ParserExtraction = {
  documentId: "sheet_financials",
  sourceFile: "Acme Finance.xlsx",
  values: [{ field: "current_year_revenue", value: 12_345_678.9 }],
  exceptions: [REF_FINDING],
};

const statedFinance: ParserExtraction = {
  documentId: "sheet_financials",
  sourceFile: "Acme Finance v2.xlsx",
  values: [{ field: "total_measured_procurement_spend", value: 1_234_567.89 }],
};

const finMetaOf = (extractions: ParserExtraction[]) =>
  (toWorkbookSections(parserExtractionsToWorkbook(extractions))["financial-information"]?.meta ?? {}) as Record<string, unknown>;

describe("a stated TMPS that could not be read", () => {
  it("is filed as withdrawn in the workbook, so nothing computes around it", () => {
    const fin = finMetaOf([brokenFinance]);
    expect(fin.tmps).toBeUndefined();
    expect(fin[META_WITHDRAWN_KEY]).toEqual([
      expect.objectContaining({ column: "tmps", sources: ["Acme Finance.xlsx"] }),
    ]);
    expect(tmpsHold(fin)).toBe("withdrawn");
  });

  it("is not filed when another workbook states TMPS", () => {
    const fin = finMetaOf([brokenFinance, statedFinance]);
    expect(fin.tmps).toBeCloseTo(1_234_567.89, 2);
    expect(fin[META_WITHDRAWN_KEY]).toBeUndefined();
    expect(tmpsHold(fin)).toBeNull();
  });

  it("is not filed for the inclusions cell, which was never TMPS", () => {
    const fin = finMetaOf([{
      ...brokenFinance,
      exceptions: ["TMPS inclusions cell holds #REF! in Acme Finance.xlsx: no inclusions total was read from this sheet."],
    }]);
    expect(fin[META_WITHDRAWN_KEY]).toBeUndefined();
  });
});
