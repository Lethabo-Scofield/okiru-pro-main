import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

describe("parseEsgWorkbookXlsx", () => {
  it("parses exported golden workbook into sections", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const buf = buildEsgWorkbookXlsx(wb);
    const preview = parseEsgWorkbookXlsx(buf);
    expect(Object.keys(preview.sections).length).toBeGreaterThanOrEqual(5);
    expect(preview.sections.assumptions?.cells).toBeDefined();
  });

  it("parses v1.7 fixture when present", () => {
    // Six levels up: __tests__ → esg → lib → src → web → apps → repo root.
    // This was five, which resolved to apps/docs/… — the ENOENT was then
    // swallowed by the catch below, so the test passed while asserting nothing.
    const path = resolve(
      import.meta.dirname,
      "../../../../../../docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx",
    );
    if (!existsSync(path)) {
      // Genuinely absent (e.g. a checkout without the docs fixtures) — skip.
      return;
    }
    // Present but unreadable/unparseable is a real failure, not a skip:
    // no try/catch here on purpose.
    const preview = parseEsgWorkbookXlsx(readFileSync(path));
    expect(Object.keys(preview.sections).length).toBeGreaterThan(0);
    expect(preview.sections.assumptions?.cells).toBeDefined();
  });

  /**
   * `unmatchedSheets` is the only thing standing between "your spreadsheet is
   * shaped differently" and a silently empty import. The import matches sheets
   * by NAME against a fixed table, so an unrecognised sheet contributes nothing
   * and, without this, says nothing either. Both the failure toast and the
   * review panel render this list, so it has to distinguish three cases.
   */
  describe("unmatchedSheets", () => {
    const wbWith = (sheets: Record<string, unknown[][]>) => {
      const book = XLSX.utils.book_new();
      for (const [name, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
      }
      return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    };

    it("names sheets it could not place, and imports the ones it could", () => {
      const preview = parseEsgWorkbookXlsx(wbWith({
        E_Data: [["Diesel", 1234]],
        "Client Sector Data": [["anything", 1]],
        "Site List": [["depot", "JHB"]],
      }));

      expect(preview.sections["e-data"]).toBeDefined();
      expect(preview.unmatchedSheets).toEqual(["Client Sector Data", "Site List"]);
    });

    it("does NOT report computed sheets as unmatched — they are skipped on purpose", () => {
      // Scorecards, the dashboard and the glossary are OUTPUTS. Listing them as
      // "left out because they do not match" would tell the user to go fix
      // something that is working exactly as intended.
      const preview = parseEsgWorkbookXlsx(wbWith({
        E_Data: [["Diesel", 1234]],
        E_Scorecard: [["score", 36]],
        ESG_Dashboard: [["overall", 0.44]],
        Glossary: [["term", "definition"]],
        Validation: [["check", "pass"]],
      }));

      expect(preview.sections["e-data"]).toBeDefined();
      expect(preview.unmatchedSheets).toEqual([]);
    });

    it("reports every sheet when a foreign workbook matches nothing", () => {
      // The case that matters: a client sends their own ESG spreadsheet. The
      // import cannot use it, and the UI needs the names to say why.
      const preview = parseEsgWorkbookXlsx(wbWith({
        "Carbon 2026": [["scope 1", 100]],
        Employees: [["headcount", 426]],
      }));

      expect(Object.keys(preview.sections)).toEqual([]);
      expect(preview.unmatchedSheets).toEqual(["Carbon 2026", "Employees"]);
    });
  });
});
