/**
 * The downloaded workbook carries the monthly figures entered in the app —
 * at their E_Data cells, and every one of them on Monthly_Figures by the
 * workbook's own sites and months.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";
import { eDataSheetRefsFromCells } from "../esgSheetStructure";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

describe("E_Data monthly figures in the export", () => {
  it("translates grid cells to sheet cells, and keeps what does not fit", () => {
    const { sheet, overflow } = eDataSheetRefsFromCells({
      s1a_C14: 6140,
      s2_K18: 100,
      s2_src_0: "City Power",
      s1a_C19: 77, // a sixth site
      water_L14: 9, // a tenth month
    });
    expect(sheet).toEqual({ C14: 6140, K45: 100, N41: "City Power" });
    expect(overflow.map((o) => `${o.prefix}:${o.rowIndex}:${o.column}`).sort()).toEqual(["s1a:5:C", "water:0:L"]);
  });

  it("writes them into the downloaded workbook", () => {
    const wb = {
      companyId: "co",
      updatedAt: "",
      sections: {
        "e-data": { cells: { eSites: "ALDER\nBKT", eFirstMonth: "Jul-25", eMonthCount: 12, s1a_C14: 6140, s1a_N15: 40 } },
      },
    } as unknown as EsgWorkbookData;
    const book = XLSX.read(buildEsgWorkbookXlsx(wb));

    expect(book.Sheets.E_Data.C14?.v).toBe(6140);
    const figures = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Monthly_Figures, { header: 1 });
    expect(figures[0]).toEqual(["Scope 1A - road-freight fleet diesel (litres)"]);
    expect(figures[1]?.slice(0, 3)).toEqual(["Site", "Jul-25", "Aug-25"]);
    expect(figures[2]?.[0]).toBe("ALDER");
    expect(figures[2]?.[1]).toBe(6140);
    // BKT's twelfth month (column N) — no cell for it on the v1.7 sheet.
    expect(figures[3]?.[0]).toBe("BKT");
    expect(figures[3]?.[12]).toBe(40);
  });
});
