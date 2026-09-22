/**
 * A sheet may declare a size it does not have.
 *
 * `!ref` is the file's own `<dimension>` element, reproduced verbatim by
 * SheetJS, and nothing in the format obliges it to be honest. The importer used
 * to walk that rectangle cell by cell, so a 2.4 KB upload claiming
 * `A1:XFD1048576` while holding one cell cost ~17.2 billion iterations —
 * 27 seconds measured for a 1,000-row slice of it, hours for the sheet. That
 * loop runs synchronously inside `POST /api/esg/workbook/:companyId/import`,
 * which is the Node event loop, so the upload took the whole web server down
 * with it: every product, every tenant.
 *
 * These two tests are the load-bearing part of the fix. The first would have
 * run for hours before it; the second holds the honest case to the same answer,
 * so the speed-up cannot be paid for in lost cells.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";

/** A minimal, valid .xlsx whose declared dimension is whatever we say it is. */
async function craftWorkbook(declaredDimension: string, rowsXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip
    .folder("_rels")!
    .file(
      ".rels",
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    );
  const xl = zip.folder("xl")!;
  xl.file(
    "workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="E_Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  xl.folder("_rels")!.file(
    "workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  xl.folder("worksheets")!.file(
    "sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${declaredDimension}"/><sheetData>${rowsXml}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

const ROWS = `<row r="7"><c r="B7"><v>42</v></c></row><row r="9"><c r="C9"><v>7</v></c><c r="D9" t="inlineStr"><is><t>ok</t></is></c></row>`;

describe("parseEsgWorkbookXlsx — a sheet that lies about its dimension", () => {
  it("reads a sheet claiming the whole Excel grid in milliseconds, not hours", async () => {
    const buf = await craftWorkbook("A1:XFD1048576", ROWS);

    // Guard the premise: SheetJS really does hand us back the declared
    // rectangle rather than one measured from the cells.
    expect(XLSX.read(buf, { type: "buffer" }).Sheets.E_Data!["!ref"]).toBe("A1:XFD1048576");

    const startedAt = Date.now();
    const preview = parseEsgWorkbookXlsx(buf);
    const elapsedMs = Date.now() - startedAt;

    // The old loop needed ~27 seconds for one thousandth of this rectangle.
    expect(elapsedMs).toBeLessThan(2_000);
    expect(preview.sections["e-data"]?.cells.B7).toBe(42);
  });

  it("returns exactly the same cells whether the dimension is honest or inflated", async () => {
    const honest = await craftWorkbook("B7:D9", ROWS);
    const inflated = await craftWorkbook("A1:XFD1048576", ROWS);

    const fromHonest = parseEsgWorkbookXlsx(honest).sections["e-data"]?.cells;
    const fromInflated = parseEsgWorkbookXlsx(inflated).sections["e-data"]?.cells;

    expect(fromHonest).toMatchObject({ B7: 42, C9: 7, D9: "ok" });
    expect(fromInflated).toEqual(fromHonest);
  });
});
