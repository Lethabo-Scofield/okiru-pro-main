/**
 * Regression — Employment Equity / Management occupational-level synonyms.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer } from "../workbookExcelNormalizer";
import { OCC_LEVEL_MAP, SECTIONS } from "@/components/workbook/sections";
import { validateWorkbook } from "@/components/workbook/workbookValidation";

function makeBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("OCC_LEVEL_MAP — direct map assertions", () => {
  // Sourced from sections.ts OCC_LEVEL_MAP (May 2026 — Task #2).
  it.each([
    ["juniormanager", "Junior Management"],
    ["juniormanagement", "Junior Management"],
    ["middlemanager", "Middle Management"],
    ["middlemanagement", "Middle Management"],
    ["seniormanager", "Senior Management"],
    ["seniormanagement", "Senior Management"],
    ["topmanager", "Top Management"],
    ["topmanagement", "Top Management"],
    ["semiskilled", "Semi-Skilled"],
    ["unskilled", "Unskilled"],
  ])("OCC_LEVEL_MAP[%s] -> %s", (key, canonical) => {
    expect(OCC_LEVEL_MAP[key]).toBe(canonical);
  });
});

describe("Excel upload — occupational level normalisation", () => {
  it("normalises occupational levels in the Employees sheet", async () => {
    const buf = makeBuffer({
      Employees: [
        ["First Name", "Surname", "Race", "Gender", "Occupational Level"],
        ["Alex", "Smith", "African", "Male", "Junior Manager"],
        ["Bea", "Jones", "African", "Female", "Middle Management"],
        ["Cara", "Khan", "Indian", "Female", "Senior Manager"],
        ["Dan", "Patel", "Coloured", "Male", "Semi-Skilled"],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    const employees = out.sections["employees"].rows;
    expect(employees.map((r) => r.occupationalLevel)).toEqual([
      "Junior Management",
      "Middle Management",
      "Senior Management",
      "Semi-Skilled",
    ]);
  });

  it("normalises occupational levels in the Management Control sheet", async () => {
    const buf = makeBuffer({
      "Management Control": [
        ["First Name", "Surname", "Race", "Gender", "Designation", "Occupational Level", "Voting Rights"],
        ["Eve", "Naidoo", "African", "Female", "Executive Director", "Top Manager", 50],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    const mgmt = out.sections["management-control"].rows;
    expect(mgmt[0].occupationalLevel).toBe("Top Management");
  });

  it("leaves invalid level text on the row but validateWorkbook flags it as an invalid option", async () => {
    const buf = makeBuffer({
      Employees: [
        ["First Name", "Surname", "Race", "Gender", "Occupational Level"],
        ["Frank", "Doe", "White", "Male", "Garbage Level"],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    // Normalizer is non-destructive — bad input survives verbatim.
    expect(out.sections["employees"].rows[0].occupationalLevel).toBe("Garbage Level");

    // Pin the column option-set contract.
    const employees = SECTIONS.find((s) => s.key === "employees")!;
    const occCol = employees.columns!.find((c) => c.key === "occupationalLevel")!;
    expect(occCol.type).toBe("select");
    expect(occCol.options).toBeDefined();
    expect(occCol.options).not.toContain("Garbage Level");

    // validateWorkbook now surfaces invalid select values at the
    // import-preview surface (Task #18 area 2 — invalid occupational level
    // must appear in validationIssues).
    const issues = validateWorkbook(out.sections, { strictSelectOptions: true });
    const occIssues = issues.filter(
      (i) => i.sectionKey === "employees" && i.field === "occupationalLevel",
    );
    expect(occIssues.length).toBeGreaterThan(0);
    expect(occIssues[0].message).toMatch(/Not an allowed option/);
    // The error message lists the allowed options so users can self-correct.
    for (const opt of occCol.options!) {
      expect(occIssues[0].message).toContain(opt);
    }
  });

  it("validateWorkbook does NOT flag legal values (Top Management, Semi-Skilled, etc.)", async () => {
    const buf = makeBuffer({
      Employees: [
        ["First Name", "Surname", "Race", "Gender", "Occupational Level"],
        ["A", "B", "African", "Male", "Top Management"],
        ["C", "D", "African", "Female", "Semi-Skilled"],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    const issues = validateWorkbook(out.sections, { strictSelectOptions: true }).filter(
      (i) => i.sectionKey === "employees" && i.field === "occupationalLevel",
    );
    expect(issues.length).toBe(0);
  });
});
