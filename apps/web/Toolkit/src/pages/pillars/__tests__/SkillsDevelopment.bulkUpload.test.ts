/**
 * Regression — Skills Development bulk upload parser (Task #4).
 *
 * Tests the extracted `parseSkillsBulkUploadBuffer` helper used by
 * `SkillsDevelopment.tsx#handleBulkUpload`. Builds the workbook in-memory
 * via the `xlsx` package to mirror the downloaded Information Request
 * template headers.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSkillsBulkUploadBuffer } from "../bulkUploadParser";

function makeXlsx(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

const TEMPLATE_HEADERS = [
  "Training Program Name *",
  "Category *",
  "Training Provider",
  "Province",
  "Municipality",
  "Learner Name *",
  "ID Number",
  "Gender *",
  "Race *",
  "Disabled?",
  "Foreign?",
  "Age",
  "Employed?",
  "Completed?",
  "Absorbed?",
  "Course Cost",
  "Travel Cost",
  "Accommodation Cost",
  "Catering Cost",
  "Stationery Cost",
  "Training Facility Cost",
  "Salary Cost (category B,C,D only)",
  "Other Costs",
  "Start Date (dd/mm/yyyy)",
  "End Date (dd/mm/yyyy)",
];

describe("parseSkillsBulkUploadBuffer — template headers", () => {
  it("parses valid rows from a template-shaped workbook", () => {
    const buf = makeXlsx({
      "Skills Development": [
        TEMPLATE_HEADERS,
        ["IT Learnership", "B", "UNISA", "Gauteng", "JHB", "Alex Smith", "9001015800087", "Male", "African", "No", "No", 22, "Yes", "Yes", "No", 5000, 1000, 0, 0, 0, 0, 0, 0, "01/02/2025", "30/11/2025"],
        ["IT Bursary", "A", "TUT", "Gauteng", "JHB", "Bea Khan", "8503125800087", "Female", "Indian", "No", "No", 35, "No", "No", "No", 12000, 0, 0, 0, 0, 0, 0, 0, "", ""],
      ],
    });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.error).toBeUndefined();
    expect(out.programs.length).toBe(2);
    expect(out.skipped).toBe(0);
    const [a, b] = out.programs;
    expect(a.programName).toBe("IT Learnership");
    expect(a.categoryCode).toBe("B");
    expect(a.race).toBe("African");
    expect(a.gender).toBe("Male");
    expect(a.isBlack).toBe(true);
    expect(a.isCompleted).toBe(true);
    expect(a.totalCost).toBe(6000);
    expect(b.categoryCode).toBe("A");
    expect(b.isBursary).toBe(true);
    expect(b.race).toBe("Indian");
    expect(b.gender).toBe("Female");
  });

  it("matches headers case- and punctuation-insensitively", () => {
    const buf = makeXlsx({
      "Skills Development": [
        ["training program name", "CATEGORY", "learner name", "Race", "Gender", "Course Cost"],
        ["IT Bootcamp", "c", "Cara K", "African", "F", 3000],
      ],
    });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.programs.length).toBe(1);
    expect(out.programs[0].categoryCode).toBe("C");
    expect(out.programs[0].gender).toBe("Female");
    expect(out.programs[0].race).toBe("African");
  });

  it("normalises Yes/No/True/1 variants", () => {
    const buf = makeXlsx({
      "Skills Development": [
        ["Training Program Name *", "Learner Name *", "Race *", "Gender *", "Disabled?", "Employed?", "Completed?", "Course Cost"],
        ["P1", "L1", "African", "Male", "Yes", "true", "1", 100],
        ["P2", "L2", "African", "Male", "no", "false", "0", 200],
      ],
    });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.programs[0].isDisabled).toBe(true);
    expect(out.programs[0].isEmployed).toBe(true);
    expect(out.programs[0].isCompleted).toBe(true);
    expect(out.programs[1].isDisabled).toBe(false);
    expect(out.programs[1].isEmployed).toBe(false);
    expect(out.programs[1].isCompleted).toBe(false);
  });

  it("skips rows missing program / learner / cost", () => {
    const buf = makeXlsx({
      "Skills Development": [
        ["Training Program Name *", "Learner Name *", "Race *", "Gender *", "Course Cost"],
        ["", "L1", "African", "Male", 100],          // missing program
        ["P2", "", "African", "Male", 100],          // missing learner
        ["P3", "L3", "African", "Male", 0],           // zero cost
        ["P4", "L4", "African", "Male", 500],         // valid
      ],
    });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.programs.length).toBe(1);
    expect(out.skipped).toBe(3);
    expect(out.programs[0].programName).toBe("P4");
  });

  it("returns a clear error string for a garbage workbook without required columns", () => {
    const buf = makeXlsx({
      Random: [
        ["foo", "bar"],
        ["x", "y"],
      ],
    });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.programs.length).toBe(0);
    expect(out.error).toBeTruthy();
    expect(out.error).toMatch(/program|learner|header/i);
  });

  it("returns an error for an empty workbook", () => {
    const buf = makeXlsx({ Skills: [] });
    const out = parseSkillsBulkUploadBuffer(buf);
    expect(out.programs.length).toBe(0);
    expect(out.error).toBeTruthy();
  });
});

describe("computeSkillsTargets — % of payroll formula (Task #18 area 6)", () => {
  it("computes targetSpend = leviableAmount * overallTargetPct (default 3.5%)", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({ leviableAmount: 10_000_000 });
    expect(out.overallTargetPct).toBe(0.035);
    expect(out.targetSpend).toBeCloseTo(350_000, 6);
  });

  it("computes bursaryTarget = leviableAmount * bursaryTargetPct (default 2.5%)", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({ leviableAmount: 10_000_000 });
    expect(out.bursaryTargetPct).toBe(0.025);
    expect(out.bursaryTarget).toBeCloseTo(250_000, 6);
  });

  it("honours sector-specific overrides for overallTargetPct / bursaryTargetPct", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({
      leviableAmount: 8_000_000,
      overallTargetPct: 0.06,
      bursaryTargetPct: 0.0035,
    });
    expect(out.targetSpend).toBeCloseTo(480_000, 6);
    expect(out.bursaryTarget).toBeCloseTo(28_000, 6);
  });

  it("normalizes percent-point overrides (3.5 → 0.035) for KPI cards", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({
      leviableAmount: 10_000_000,
      overallTargetPct: 3.5,
      bursaryTargetPct: 2.5,
    });
    expect(out.overallTargetPct).toBeCloseTo(0.035, 6);
    expect(out.bursaryTargetPct).toBeCloseTo(0.025, 6);
    expect(out.targetSpend).toBeCloseTo(350_000, 6);
    expect(out.bursaryTarget).toBeCloseTo(250_000, 6);
  });

  it("clamps negative / NaN leviableAmount to 0", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    expect(computeSkillsTargets({ leviableAmount: -100 }).targetSpend).toBe(0);
    expect(computeSkillsTargets({ leviableAmount: NaN }).targetSpend).toBe(0);
  });
});
