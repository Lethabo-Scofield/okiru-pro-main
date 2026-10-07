/**
 * A sheet's declared size is checked against the cells it holds before
 * anything reads rows (`sheetBounds.ts`).
 *
 * The files here are built by hand, because SheetJS's own writer walks the
 * declared rectangle too — writing the attack with it would hang the test the
 * way reading it used to hang the server.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { boundWorkbookSheets, sheetBoundsLosses, SHEET_AREA_CAP, WORKBOOK_AREA_CAP } from "../sheetBounds";
import { parseEsgWorkbookXlsx } from "../esg/esgWorkbookImport";

type CraftedSheet = { name: string; dimension: string; cells: Record<string, number | string> };

/** A minimal, valid .xlsx whose sheets declare whatever dimension we say. */
async function craft(sheets: CraftedSheet[]): Promise<Buffer> {
  const zip = new JSZip();
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`,
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
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  xl.folder("_rels")!.file(
    "workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );
  sheets.forEach((s, i) => {
    const byRow = new Map<number, string[]>();
    for (const [ref, v] of Object.entries(s.cells)) {
      const row = XLSX.utils.decode_cell(ref).r + 1;
      const xml =
        typeof v === "number"
          ? `<c r="${ref}"><v>${v}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
      byRow.set(row, [...(byRow.get(row) ?? []), xml]);
    }
    const rowsXml = [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([r, cells]) => `<row r="${r}">${cells.join("")}</row>`)
      .join("");
    xl.folder("worksheets")!.file(
      `sheet${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${s.dimension}"/><sheetData>${rowsXml}</sheetData></worksheet>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

const open = async (sheets: CraftedSheet[]) => XLSX.read(await craft(sheets), { type: "buffer" });
const areaOf = (ref: string | undefined) => {
  if (!ref) return 0;
  const x = XLSX.utils.decode_range(ref);
  return (x.e.r - x.s.r + 1) * (x.e.c - x.s.c + 1);
};

describe("boundWorkbookSheets", () => {
  it("leaves an honest sheet exactly as it is", async () => {
    const book = await open([{ name: "Data", dimension: "A1:D9", cells: { A1: "x", D9: 4 } }]);
    expect(boundWorkbookSheets(book)).toEqual([]);
    expect(book.Sheets.Data!["!ref"]).toBe("A1:D9");
  });

  it("leaves a sheet that claims nothing alone — no reader walks it", () => {
    // Four real client files carry empty tabs like this (a diesel report's Sheet1..9).
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, {}, "Empty");
    expect(boundWorkbookSheets(book)).toEqual([]);
    expect(book.Sheets.Empty!["!ref"]).toBeUndefined();
  });

  it("holds an unreadable claim to its cells rather than trusting it", () => {
    // Row 0 does not exist, so the claim fails to decode — yet a reader handed
    // it would walk from row -1 to ten million.
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, { A1: { t: "n", v: 5 }, C4: { t: "s", v: "x" }, "!ref": "A0:XFD9999999" }, "Odd");
    boundWorkbookSheets(book);
    expect(book.Sheets.Odd!["!ref"]).toBe("A1:C4");
  });

  it("cuts a claim of the whole grid down to its cells, keeping row 1 where it was", async () => {
    const book = await open([{ name: "E_Data", dimension: "A1:XFD1048576", cells: { B7: 42, C9: 7, D9: "ok" } }]);
    // The premise: SheetJS really does hand back the claim.
    expect(book.Sheets.E_Data!["!ref"]).toBe("A1:XFD1048576");

    const startedAt = Date.now();
    const notes = boundWorkbookSheets(book);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.E_Data!, { header: 1, defval: "" });
    expect(Date.now() - startedAt).toBeLessThan(1_000);

    expect(book.Sheets.E_Data!["!ref"]).toBe("A1:D9");
    expect(rows[6]?.[1]).toBe(42); // B7, by position, as every reader counts it
    expect(notes).toEqual([{ sheet: "E_Data", declared: "A1:XFD1048576", kept: "A1:D9", droppedCells: 0 }]);
    expect(sheetBoundsLosses(notes)).toEqual([]);
  });

  it("reads Okiru's own whole-column template claim as the block it fills", async () => {
    // "Empower - Slides MC" in the B-BBEE Toolkit templates: B1:AQ1048576, 570 values.
    const book = await open([{ name: "Slides", dimension: "B1:AQ1048576", cells: { B1: "Title", AQ50: 3 } }]);
    boundWorkbookSheets(book);
    expect(book.Sheets.Slides!["!ref"]).toBe("B1:AQ50");
  });

  it("keeps a bounded block of cells spread across the whole grid, and says what it left out", async () => {
    const book = await open([{ name: "Bomb", dimension: "A1:XFD1048576", cells: { A1: "kept", XFD1048576: 1 } }]);
    const notes = boundWorkbookSheets(book);
    const ref = book.Sheets.Bomb!["!ref"];
    expect(areaOf(ref)).toBeLessThanOrEqual(SHEET_AREA_CAP);
    expect(XLSX.utils.decode_range(ref!).s).toEqual({ r: 0, c: 0 });
    expect(notes[0]?.droppedCells).toBe(1);
    expect(sheetBoundsLosses(notes)).toEqual([expect.stringContaining("Sheet Bomb: only A1:")]);
  });

  it("holds the whole workbook to a budget, so many modest claims cannot add up to one huge one", async () => {
    // Each sheet stays under the per-sheet limit; together they would not.
    const modest = "A1:BZ60000"; // 78 columns x 60,000 rows = 4.68 million cells each
    expect(areaOf(modest)).toBeLessThanOrEqual(SHEET_AREA_CAP);
    const book = await open(
      Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, dimension: modest, cells: { A1: i, B2: "x" } })),
    );
    const notes = boundWorkbookSheets(book);
    const total = book.SheetNames.reduce((sum, n) => sum + areaOf(book.Sheets[n]!["!ref"]), 0);
    expect(total).toBeLessThanOrEqual(WORKBOOK_AREA_CAP);
    // Nothing was lost: each sheet is held to its two cells.
    expect(book.Sheets.S3!["!ref"]).toBe("A1:B2");
    expect(sheetBoundsLosses(notes)).toEqual([]);
  });

  it("spends the budget in order when the cells themselves exceed it", async () => {
    const corners = { A1: "first", XFD1048576: 1 };
    const book = await open(
      Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, dimension: "A1:XFD1048576", cells: corners })),
    );
    boundWorkbookSheets(book);
    const total = book.SheetNames.reduce((sum, n) => sum + areaOf(book.Sheets[n]!["!ref"]), 0);
    expect(total).toBeLessThanOrEqual(WORKBOOK_AREA_CAP);
    expect(book.Sheets.S0!["!ref"]).toBeDefined();
  });
});

describe("the ESG workbook import, given a sheet that lies about its size", () => {
  it("answers in milliseconds with the same cells an honest file gives", async () => {
    const cells = { B7: 42, C9: 7, D9: "ok" };
    const startedAt = Date.now();
    const inflated = parseEsgWorkbookXlsx(await craft([{ name: "E_Data", dimension: "A1:XFD1048576", cells }]));
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    const honest = parseEsgWorkbookXlsx(await craft([{ name: "E_Data", dimension: "B7:D9", cells }]));
    expect(honest.sections["e-data"]?.cells).toMatchObject({ B7: 42, C9: 7, D9: "ok" });
    expect(inflated.sections["e-data"]?.cells).toEqual(honest.sections["e-data"]?.cells);
  });
});
