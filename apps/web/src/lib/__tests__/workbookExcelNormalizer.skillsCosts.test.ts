/**
 * A learner's age is not their salary cost.
 *
 * From 18 Sep 2026 (f4f2871f) the Skills register's "Age" column was read as
 * Salary Cost — "age" is a letter run inside Salary Cost's alias "Wages" — and
 * the real "Salary Cost (category B,C,D only)" column fell through to Total
 * Cost. Skills dropped 2–5 points on 13 of the 16 reference workbooks
 * (Kgodiso: salary cost R814,836 read as R7,710, the learners' ages summed).
 * The header layout below is the reference template's own.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer } from "../workbookExcelNormalizer";
import { mapHeaderToKey } from "../workbookGridParse";
import { headerIsWordsOfAlias } from "../columnMatch";
import { SKILLS_COLUMNS } from "@/components/workbook/sections";

const HEADERS = [
  "Training Program Name *", "Category *", "Training Provider", "Learner Name *", "ID Number", "Gender *", "Race *",
  "Disabled?", "Foreign?", "Age", "Employed?", "Completed?", "Absorbed?", "Course Cost", "Travel Cost",
  "Accommodation Cost", "Catering Cost", "Stationery Cost", "Training Facility Cost",
  "Salary Cost (category B,C,D only)", "Other Costs", "Start Date (format: dd/mm/yyyy)", "End Date (format: dd/mm/yyyy)",
];
const ROW = [
  "Generic Management Learnership", "C", "Okiru Skills Academy", "Andile Sibeko", "7203269994086", "Male", "African",
  "No", "No", 53, "Yes", "Yes", "No", 45774, 1831, 2289, 1373, 915, 2746, 11444, 0, "15/01/2025", "30/11/2025",
];

function buffer(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Skills Development"], HEADERS, ROW]), "Skills Development");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("the Skills register's cost columns", () => {
  it("reads Salary Cost from the salary column, and the learner's age as nothing it scores", () => {
    const { sections } = normalizeExcelBuffer(buffer());
    const row = (sections["skills-development"]?.rows ?? [])[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(Number(row.salaryCost)).toBe(11444);
    expect(Number(row.courseCost)).toBe(45774);
    expect(Number(row.otherCosts ?? 0)).toBe(0);
    // Total Cost is the sum the calculator derives, never a column read by accident.
    expect(row.totalCost === undefined || row.totalCost === "" || Number(row.totalCost) !== 11444).toBe(true);
  });

  it("pasting an Age column into the grid does not read it as Salary Cost either", () => {
    expect(mapHeaderToKey("Age", SKILLS_COLUMNS)).not.toBe("salaryCost");
  });

  it("matches a header inside an alias only as whole words", () => {
    expect(headerIsWordsOfAlias("Age", "Wages")).toBe(false);
    expect(headerIsWordsOfAlias("Course", "Course Cost")).toBe(true);
    expect(headerIsWordsOfAlias("Facility Cost", "Training Facility Cost")).toBe(true);
  });
});
