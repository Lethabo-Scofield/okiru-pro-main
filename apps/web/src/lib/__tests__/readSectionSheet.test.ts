/**
 * The shared per-section sheet reader, against the shapes real workbooks take.
 *
 * Every one of these cases is a way the toolkit's own bulk-upload parsers
 * failed. They read sheet 1 of the file — "Instructions" on every real
 * information-gathering workbook — and took row 1 as the header, so a
 * consultant uploading the file they actually hold got either nothing or a
 * column list of `__EMPTY_1`.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { readSectionSheet } from "@/lib/workbookExcelNormalizer";
import { MC_EE_COLUMNS, SKILLS_COLUMNS } from "@/components/workbook/sections";

/** Build an .xlsx in memory from `{ sheetName: rows }`. */
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

/** The banner rows every hand-built information-gathering sheet opens with. */
const MC_SHEET: unknown[][] = [
  ["", "Measured Entity: Acme Logistics", "", "", "", "Management Control"],
  ["", "Year End: 28 February 2025", "", "", "", "Management Participation"],
  [],
  [],
  ["", "Detail", "", "", "", "Use dropdown", "", "Use dropdown", "Use dropdown"],
  ["", "Name & Surname", "Site", "Emp No", "ID Number", "Designation", "Job Title", "Race", "Gender"],
  [1, "Thandi Mokoena", "", "", "8501015800083", "Senior Manager", "Ops", "African", "Female"],
  [2, "Pieter van Wyk", "", "", "7203126000081", "Middle Manager", "Fleet", "White", "Male"],
  [3, "", "", "", "", "", "", "", ""],
];

const INSTRUCTIONS_SHEET: unknown[][] = [
  ["NEW", "v1.33"],
  ["Complete every grey cell.", ""],
  ["Do not rename the tabs.", ""],
];

describe("readSectionSheet", () => {
  it("skips the Instructions tab and reads the sheet the section belongs to", () => {
    const buf = workbook({ Instructions: INSTRUCTIONS_SHEET, "Management Control": MC_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, { sectionKey: "management-control" });

    expect(read.sheetName).toBe("Management Control");
    expect(read.sheetNames).toEqual(["Instructions", "Management Control"]);
    expect(read.matchingSheetNames).toEqual(["Management Control"]);
  });

  it("finds the header below the banner rows, not at row 1", () => {
    const buf = workbook({ Instructions: INSTRUCTIONS_SHEET, "Management Control": MC_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, { sectionKey: "management-control" });

    // Row 5 (0-indexed), under the entity banner and the "Use dropdown" hints.
    expect(read.headerRowIndex).toBe(5);
    expect(read.headers).toContain("Name & Surname");
    expect(read.rows).toHaveLength(2);
    // A single "Name & Surname" column is split across the grid's two name
    // columns, so anything rebuilding a full name joins them back.
    expect(read.rows[0].name).toBe("Thandi");
    expect(read.rows[0].surname).toBe("Mokoena");
    expect(read.rows[0].race).toBe("African");
    expect(read.rows[0].designation).toBe("Senior Manager");
    // The trailing numbered-but-empty row is not a person.
    expect(read.rows.map((r) => r.name)).not.toContain("");
  });

  it("reports which headers it understood, so the caller can offer to map the rest", () => {
    const buf = workbook({ "Management Control": MC_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, { sectionKey: "management-control" });

    const understood = read.headers.filter((_, i) => read.mappedKeys[i]);
    expect(understood).toContain("Race");
    expect(understood).toContain("Gender");
    // "Site" and "Emp No" are not columns this section has.
    const unmapped = read.headers.filter((h, i) => h && !read.mappedKeys[i]);
    expect(unmapped).toContain("Emp No");
  });

  it("falls back to the sheet whose CONTENT fits when no sheet name matches", () => {
    const buf = workbook({ Instructions: INSTRUCTIONS_SHEET, "Tab 2": MC_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, { sectionKey: "management-control" });

    expect(read.matchingSheetNames).toEqual([]);
    expect(read.sheetName).toBe("Tab 2");
    expect(read.rows).toHaveLength(2);
  });

  it("honours an explicitly chosen sheet over its own guess", () => {
    const buf = workbook({ "Management Control": MC_SHEET, Spare: MC_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, {
      sectionKey: "management-control",
      sheetName: "Spare",
    });

    expect(read.sheetName).toBe("Spare");
    expect(read.rows).toHaveLength(2);
  });

  it("returns no sheet rather than guessing when nothing in the file fits", () => {
    const buf = workbook({ Instructions: INSTRUCTIONS_SHEET });
    const read = readSectionSheet(buf, MC_EE_COLUMNS, { sectionKey: "management-control" });

    expect(read.sheetName).toBeNull();
    expect(read.rows).toEqual([]);
    // The caller still needs the sheet list to ask the user.
    expect(read.sheetNames).toEqual(["Instructions"]);
  });

  it("reads a Skills sheet whose header sits thirteen rows down", () => {
    const skills: unknown[][] = [
      ["Measured Entity: Acme", "", "", "", "", "", "", "Skills Development"],
      ...Array.from({ length: 12 }, () => [] as unknown[]),
      ["Date of Training", "End Date", "Training Course", "Trainer or Service Provider", "Category", "Learner Name & Surname", "ID Number", "Race", "Gender", "Direct Expenditure for Period (Excl VAT)"],
      ["01/03/2025", "30/06/2025", "Forklift Licence", "SafetyCo", "C", "Sipho Dlamini", "9001015800081", "African", "Male", 12500],
    ];
    const buf = workbook({ Instructions: INSTRUCTIONS_SHEET, "Skills Development": skills });
    const read = readSectionSheet(buf, SKILLS_COLUMNS, { sectionKey: "skills-development" });

    expect(read.sheetName).toBe("Skills Development");
    expect(read.headerRowIndex).toBe(13);
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0].learnerName).toBe("Sipho Dlamini");
    expect(read.rows[0].programName).toBe("Forklift Licence");
  });
});

/**
 * The same reader against the real file a consultant holds. Gitignored test
 * data, so this skips wherever the corpus is absent.
 */
const REAL_FILE = path.resolve(
  __dirname,
  "../../../../../docs/Test Data/A_General/BEE Information Gathering File - Thandanani Transport_Updated.xlsx",
);
const HAVE_REAL_FILE = fs.existsSync(REAL_FILE);

describe.skipIf(!HAVE_REAL_FILE)("readSectionSheet — real information-gathering workbook", () => {
  const buffer = () => {
    const b = fs.readFileSync(REAL_FILE);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it("reads the Management Control register", () => {
    const read = readSectionSheet(buffer(), MC_EE_COLUMNS, { sectionKey: "management-control" });
    expect(read.sheetName).toBe("Management Control");
    expect(read.rows.length).toBeGreaterThan(0);
    expect(read.rows.every((r) => String(r.name ?? "").trim() !== "")).toBe(true);
  });

  it("reads the Skills Development register", () => {
    const read = readSectionSheet(buffer(), SKILLS_COLUMNS, { sectionKey: "skills-development" });
    expect(read.sheetName).toBe("Skills Development");
    expect(read.headerRowIndex).toBeGreaterThan(8);
  });
});
