/**
 * Supplier ownership columns and training registers, end to end on the web side.
 *
 * - A procurement schedule's supplier black / black-woman ownership must reach
 *   the procurement grid in percent (36.59, not 0.3659), because those columns
 *   decide the 51% black-owned and 30% black-woman-owned lines.
 * - A training register is one row per learner PER COURSE. Merging rows by the
 *   learner's name folded a 28-entry register into 11 rows and moved one
 *   course's cost onto another course's row.
 *
 * All names, IDs and amounts are synthetic.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyDeclaredOwnershipFlags, targetForField } from "../parserFieldBridge";
import { DERIVED_FROM_FLAG_KEY, parserExtractionsToWorkbook, type ParserExtraction } from "../parserToWorkbook";
import { reconcileEntity } from "../reconciliation/reconcileEntity";
import { normalizeExcelBuffer } from "../workbookExcelNormalizer";
import type { WorkbookSections } from "../reconciliation/types";

describe("supplier ownership fields", () => {
  it("map onto the procurement grid, never onto the measured entity's ownership", () => {
    expect(targetForField("supplier_black_ownership_percentage", "ESD")).toEqual({ section: "procurement", column: "currentBlackOwnership" });
    expect(targetForField("supplier_black_women_ownership_percentage", "ESD")).toEqual({ section: "procurement", column: "currentBlackFemaleOwnership" });
    expect(targetForField("black_ownership_percentage", "ESD")?.section).toBe("ownership");
  });

  it("a Yes flag stands in for an unstated percentage at exactly the floor it declares", () => {
    expect(applyDeclaredOwnershipFlags({ supplier_name: "Gamma", is_51_black_owned: "Yes", is_30_black_woman_owned: "yes" }))
      .toEqual({ supplier_name: "Gamma", supplier_black_ownership_percentage: 51, supplier_black_women_ownership_percentage: 30 });
    // A stated percentage stands; the flag adds nothing.
    expect(applyDeclaredOwnershipFlags({ supplier_black_ownership_percentage: "75%", is_51_black_owned: "Yes" }))
      .toEqual({ supplier_black_ownership_percentage: "75%" });
    // "No" states nothing and fills nothing.
    expect(applyDeclaredOwnershipFlags({ supplier_name: "Alpha", is_51_black_owned: "No", is_30_black_woman_owned: "" }))
      .toEqual({ supplier_name: "Alpha" });
  });

  it("a schedule's supplier rows land with their ownership in percent, and the flags are not reported as unmapped", () => {
    const result = parserExtractionsToWorkbook([{
      documentId: "sheet_table__esd",
      sourceFile: "pp.xlsm › Procurement",
      element: "ESD",
      values: [{
        field: "supplier_rows",
        value: [
          { supplier_name: "Alpha Tyres", claimed_spend_ex_vat: 120000, supplier_black_ownership_percentage: "36.59%", supplier_black_women_ownership_percentage: "16.78%", is_51_black_owned: "No" },
          { supplier_name: "Gamma Spares", claimed_spend_ex_vat: 8000, is_51_black_owned: "Yes" },
        ],
      }],
    } as ParserExtraction]);

    const rows = result.rows.procurement!;
    const alpha = rows.find((r) => r.supplierName === "Alpha Tyres")!;
    expect(alpha.currentBlackOwnership).toBe(36.59);
    expect(alpha.currentBlackFemaleOwnership).toBe(16.78);
    const gamma = rows.find((r) => r.supplierName === "Gamma Spares")!;
    expect(gamma.currentBlackOwnership).toBe(51);
    expect(gamma.currentBlackFemaleOwnership).toBeUndefined();
    expect(result.coverage.unmapped).not.toContain("is_51_black_owned");
  });

  describe("a percentage filled from a Yes flag says so", () => {
    const schedule = (rows: Array<Record<string, unknown>>, sourceFile = "pp.xlsm › Procurement"): ParserExtraction => ({
      documentId: "sheet_table__esd",
      sourceFile,
      element: "ESD",
      values: [{ field: "supplier_rows", value: rows }],
    } as ParserExtraction);

    it("marks the derived cell on the row, and leaves a stated one unmarked", () => {
      const result = parserExtractionsToWorkbook([schedule([
        { supplier_name: "Alpha Tyres", claimed_spend_ex_vat: 120000, supplier_black_ownership_percentage: "36.59%", is_51_black_owned: "No" },
        { supplier_name: "Gamma Spares", claimed_spend_ex_vat: 8000, is_51_black_owned: "Yes", is_30_black_woman_owned: "Yes" },
      ])]);
      const rows = result.rows.procurement!;
      const gamma = rows.find((r) => r.supplierName === "Gamma Spares")!;
      expect(gamma.currentBlackOwnership).toBe(51);
      expect(gamma[DERIVED_FROM_FLAG_KEY]).toEqual({
        currentBlackOwnership: expect.stringMatching(/51% or more black owned/),
        currentBlackFemaleOwnership: expect.stringMatching(/30% or more black woman owned/),
      });
      expect(rows.find((r) => r.supplierName === "Alpha Tyres")![DERIVED_FROM_FLAG_KEY]).toBeUndefined();
      // And the user is told, in the findings the upload shows.
      const finding = result.reconciliation.find((f) => f.column === "currentBlackOwnership" && /Gamma Spares/.test(f.message));
      expect(finding?.message).toMatch(/not a percentage the supplier stated/);
    });

    it("a percentage another document states replaces the one derived from the flag", () => {
      const result = parserExtractionsToWorkbook([
        schedule([{ supplier_name: "Gamma Spares", claimed_spend_ex_vat: 8000, is_51_black_owned: "Yes" }]),
        schedule([{ supplier_name: "Gamma Spares", supplier_black_ownership_percentage: "75%" }], "Gamma certificate.pdf"),
      ]);
      const gamma = result.rows.procurement!.filter((r) => r.supplierName === "Gamma Spares");
      expect(gamma).toHaveLength(1);
      expect(gamma[0].currentBlackOwnership).toBe(75);
      expect(gamma[0][DERIVED_FROM_FLAG_KEY]).toBeUndefined();
      expect(result.reconciliation.some((f) => f.column === "currentBlackOwnership" && /Gamma Spares/.test(f.message))).toBe(false);
    });
  });

  it("the Excel normalizer reads a percent-formatted ownership column as 36.59, and maps \"Black Woman Ownership (%)\"", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Supplier Name", "Supplier Classification", "Expenditure (excluding VAT)", "Black Ownership (%)", "Black Woman Ownership (%)"],
      ["Alpha Tyres", "QSE", 120000, 0.3659, 0.1678],
      ["Beta Diesel", "Generic", 450000, 0.008, 0],
    ]);
    for (const address of ["D2", "E2", "D3", "E3"]) (sheet[address] as XLSX.CellObject).z = "0.00%";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Procurement");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

    const rows = normalizeExcelBuffer(buffer).sections.procurement?.rows ?? [];
    const alpha = rows.find((r) => r.supplierName === "Alpha Tyres")!;
    expect(alpha.currentBlackOwnership).toBeCloseTo(36.59, 6);
    expect(alpha.currentBlackFemaleOwnership).toBeCloseTo(16.78, 6);
    // 0.8% stays the fraction it is: rescaled to 0.8 it would read as 80%.
    expect(rows.find((r) => r.supplierName === "Beta Diesel")!.currentBlackOwnership).toBe(0.008);
  });
});

/** 28 training entries: 9 learners across 5 courses, as a real register lists them. */
function trainingRegister(): Array<Record<string, unknown>> {
  const learners: Record<string, string> = {
    "Lindiwe Dube": "9001010000001", "Sipho Zulu": "9001010000002", "Ravi Pillay": "9001010000003",
    "Andile Nkosi": "9001010000004", "Piet Mokoena": "9001010000005", "Tumi Sello": "9001010000006",
    "Kabelo Mothibi": "9001010000007", "Wilson Khoza": "9001010000008", "Evans Maseko": "9001010000009",
  };
  const courses: Array<{ program: string; date: string; cost: number; on: string[] }> = [
    { program: "Food Safety Basics", date: "2023-05-09", cost: 3150, on: ["Lindiwe Dube", "Sipho Zulu", "Ravi Pillay"] },
    { program: "Mobile Elevating platform operator", date: "2024-03-12", cost: 28400, on: ["Andile Nkosi", "Piet Mokoena", "Ravi Pillay", "Sipho Zulu", "Tumi Sello"] },
    { program: "Working at Heights Training", date: "2024-03-12", cost: 0, on: ["Ravi Pillay", "Wilson Khoza", "Evans Maseko"] },
    { program: "Scaffold Erection and Dismantling Training", date: "2024-06-20", cost: 0, on: ["Ravi Pillay", "Evans Maseko", "Wilson Khoza", "Kabelo Mothibi", "Andile Nkosi", "Piet Mokoena", "Tumi Sello", "Sipho Zulu", "Lindiwe Dube"] },
    { program: "Reach Truck Training", date: "2024-06-20", cost: 1980, on: ["Ravi Pillay", "Evans Maseko", "Wilson Khoza", "Kabelo Mothibi", "Andile Nkosi", "Piet Mokoena", "Lindiwe Dube", "Sipho Zulu"] },
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const course of courses) {
    course.on.forEach((name, i) => {
      rows.push({
        learner_name: name, id_number: learners[name], race: "African", gender: "Male",
        program_name: course.program, start_date: course.date,
        ...(i === 0 && course.cost ? { total_cost: course.cost } : {}),
      });
    });
  }
  return rows;
}

describe("a training register keeps one row per learner per course", () => {
  it("the register really is 28 entries", () => {
    expect(trainingRegister()).toHaveLength(28);
  });

  it("all 28 survive the parser-to-workbook link, each cost on the course that states it", () => {
    const result = parserExtractionsToWorkbook([{
      documentId: "sheet_table__skills_development",
      sourceFile: "sed.xlsm › Skills Development",
      element: "SKILLS_DEVELOPMENT",
      values: [{ field: "learner_rows", value: trainingRegister() }],
    } as ParserExtraction]);

    const rows = result.rows["skills-development"]!;
    expect(rows).toHaveLength(28);
    expect(new Set(rows.map((r) => `${r.learnerName}|${r.programName}`)).size).toBe(28);
    const firstAid = rows.find((r) => r.learnerName === "Lindiwe Dube" && r.programName === "Food Safety Basics")!;
    expect(firstAid.totalCost).toBe(3150);
    expect(firstAid.startDate).toBe("2023-05-09");
    // Lindiwe's Rigging row states no cost and must not borrow Food Safety's.
    expect(rows.find((r) => r.learnerName === "Lindiwe Dube" && /Scaffold/.test(String(r.programName)))!.totalCost).toBeUndefined();
    const total = rows.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
    expect(total).toBe(3150 + 28400 + 1980);
  });

  it("all 28 survive reconciliation, which merges only a true duplicate (same learner, course and date)", () => {
    const toRow = (r: Record<string, unknown>, i: number) => ({
      _id: `t${i}`, learnerName: r.learner_name, idNumber: r.id_number, race: r.race, gender: r.gender,
      programName: r.program_name, startDate: r.start_date, ...(r.total_cost ? { totalCost: r.total_cost } : {}),
    });
    const register = trainingRegister().map(toRow);
    const duplicate = { ...register[0], _id: "dup" };
    const sections: WorkbookSections = {
      "company-information": { meta: { companyName: "Acme Haulage" } },
      "skills-development": { rows: [...register, duplicate] },
    };
    const res = reconcileEntity(sections);
    const rows = res.sections["skills-development"]!.rows!;
    expect(rows).toHaveLength(28);
    expect(res.summary.trainingProgrammeCount).toBe(28);
    const total = rows.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
    expect(total).toBe(3150 + 28400 + 1980);
  });

  it("a same-course namesake that states a different cost is a second entry, not folded in", () => {
    const sections: WorkbookSections = {
      "skills-development": {
        rows: [
          { _id: "a", learnerName: "Ravi Pillay", programName: "Reach Truck Training", startDate: "2024-06-20", totalCost: 1980 },
          { _id: "b", learnerName: "Ravi Pillay", programName: "Reach Truck Training", startDate: "2024-06-20", totalCost: 39120 },
        ],
      },
    };
    expect(reconcileEntity(sections).sections["skills-development"]!.rows).toHaveLength(2);
  });

  it("the same entry from two sources merges again when the copies differ only in how they are written", () => {
    const sections: WorkbookSections = {
      "skills-development": {
        rows: [
          { _id: "a", learnerName: "Lindiwe Dube", idNumber: "9001010000001", programName: "Food Safety Basics", startDate: "2023-05-09", totalCost: 3150, _sourceFiles: ["register.xlsm"] },
          // The same entry as an invoice states it: cost with a currency and
          // cents, the course hyphenated and lower-cased, no date.
          { _id: "b", learnerName: "Lindiwe Dube", idNumber: "9001010000001", programName: "Food-Safety basics", totalCost: "R3,150.00", _sourceFiles: ["invoice.pdf"] },
          // And once more with a one-letter slip in the course name.
          { _id: "c", learnerName: "Lindiwe Dube", idNumber: "9001010000001", programName: "Food Safety Basis", startDate: "2023-05-09", _sourceFiles: ["attendance.pdf"] },
        ],
      },
    };
    const rows = reconcileEntity(sections).sections["skills-development"]!.rows!;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].totalCost)).toBe(3150);
    expect(rows[0].startDate).toBe("2023-05-09");
    // One training spend, counted once.
    expect(rows.reduce((sum, r) => sum + (Number(String(r.totalCost).replace(/[R,\s]/g, "")) || 0), 0)).toBe(3150);
  });

  it("genuinely different entries stay apart: another learner, another course, another date", () => {
    const base = { learnerName: "Lindiwe Dube", idNumber: "9001010000001", programName: "Food Safety Basics", startDate: "2023-05-09", totalCost: 3150 };
    const sections: WorkbookSections = {
      "skills-development": {
        rows: [
          { _id: "a", ...base },
          { _id: "b", ...base, learnerName: "Sipho Zulu", idNumber: "9001010000002" },
          { _id: "c", ...base, programName: "Reach Truck Training" },
          { _id: "d", ...base, startDate: "2025-03-10" },
        ],
      },
    };
    expect(reconcileEntity(sections).sections["skills-development"]!.rows).toHaveLength(4);
  });

  it("courses that differ only by a number are different courses, never merged as a typo", () => {
    const base = { learnerName: "Lindiwe Dube", idNumber: "9001010000001", startDate: "2023-05-09", totalCost: 3150 };
    for (const [one, two] of [
      ["Food Safety Level 1", "Food Safety Level 2"],
      ["Spreadsheet Module 1", "Spreadsheet Module 2"],
      ["Spreadsheet Module 1.2", "Spreadsheet Module 12"],
      ["Learnership NQF 4", "Learnership NQF 5"],
    ]) {
      const dated: WorkbookSections = { "skills-development": { rows: [{ _id: "a", ...base, programName: one }, { _id: "b", ...base, programName: two }] } };
      expect(reconcileEntity(dated).sections["skills-development"]!.rows, `${one} / ${two}`).toHaveLength(2);
      const undated: WorkbookSections = {
        "skills-development": { rows: [{ _id: "a", ...base, startDate: "", programName: one }, { _id: "b", ...base, startDate: "", programName: two }] },
      };
      expect(reconcileEntity(undated).sections["skills-development"]!.rows, `${one} / ${two} undated`).toHaveLength(2);
    }
    // A one-letter slip in a long name is still the same course.
    const slip: WorkbookSections = {
      "skills-development": { rows: [{ _id: "a", ...base, programName: "Food Safety Basics" }, { _id: "b", ...base, programName: "Food Safety Basic" }] },
    };
    expect(reconcileEntity(slip).sections["skills-development"]!.rows).toHaveLength(1);
  });
});
