/**
 * A header row pasted into the Skills grid resolves the way the Excel import
 * resolves it.
 *
 * The paste path mapped each header on its own, to the FIRST column whose name
 * the header contained: "Salary Cost (category B,C,D only)" contains "category",
 * Category is declared before Salary Cost, so a pasted register wrote every
 * learner's salary cost over their learning category. Both paths now share
 * columnMatch.resolveHeaderKeys: exact names first, each column claimed once,
 * and a header named by its own words before its parenthesised qualifier.
 * The header layout below is the reference template's own.
 */
import { describe, expect, it } from "vitest";
import { matrixToRowsByPosition, mapHeaderToKey } from "../workbookGridParse";
import { resolveHeaderKeys } from "../columnMatch";
import { MC_EE_COLUMNS, SKILLS_COLUMNS } from "@/components/workbook/sections";

const HEADERS = [
  "Training Program Name *", "Category *", "Training Provider", "Learner Name *", "ID Number", "Gender *", "Race *",
  "Disabled?", "Foreign?", "Age", "Employed?", "Completed?", "Absorbed?", "Course Cost", "Travel Cost",
  "Accommodation Cost", "Catering Cost", "Stationery Cost", "Training Facility Cost",
  "Salary Cost (category B,C,D only)", "Other Costs", "Start Date (format: dd/mm/yyyy)", "End Date (format: dd/mm/yyyy)",
];

const KEYS = [
  "programName", "categoryCode", "trainingProvider", "learnerName", "idNumber", "gender", "race",
  "isDisabled", "isForeign", null, "employed", "completed", "absorbed", "courseCost", "travelCost",
  "accommodationCost", "cateringCost", "stationeryCost", "trainingFacilityCost",
  "salaryCost", "otherCosts", "startDate", "endDate",
];

// Pasted cells are text. Disabled is "Yes" so a stray write over it would show.
const ROW = [
  "Generic Management Learnership", "C", "Okiru Skills Academy", "Andile Sibeko", "7203269994086", "Male", "African",
  "Yes", "No", "53", "Yes", "Yes", "No", "45774", "1831", "2289", "1373", "915", "2746", "11444", "0",
  "15/01/2025", "30/11/2025",
];

describe("a Skills header row pasted into the grid", () => {
  it("resolves every template header to its own column, and Age to none", () => {
    expect(resolveHeaderKeys(HEADERS, SKILLS_COLUMNS)).toEqual(KEYS);
  });

  it("reads the salary column as Salary Cost, not Category, even with no Category header beside it", () => {
    expect(mapHeaderToKey("Salary Cost (category B,C,D only)", SKILLS_COLUMNS)).toBe("salaryCost");
    expect(resolveHeaderKeys(["Course Cost", "Salary Cost (category B,C,D only)", "Other Costs"], SKILLS_COLUMNS))
      .toEqual(["courseCost", "salaryCost", "otherCosts"]);
  });

  it("does not pick the longer name inside a header: the register reads \"Name & Surname\" as Name and splits it", () => {
    expect(resolveHeaderKeys(["Name & Surname"], MC_EE_COLUMNS)).toEqual(["name"]);
  });

  it("puts each pasted value in its own column", () => {
    const [row] = matrixToRowsByPosition([HEADERS, ROW], SKILLS_COLUMNS, 0, 0, true);
    expect(row).toBeDefined();
    expect(row.categoryCode).toBe("C");
    expect(row.salaryCost).toBe(11444);
    expect(row.courseCost).toBe(45774);
    expect(row.trainingFacilityCost).toBe(2746);
    expect(row.otherCosts).toBe(0);
    // Age names no column. It used to fall back to its position, which is Disabled.
    expect(row.isDisabled).toBe(true);
    expect(Object.values(row)).not.toContain("53");
    expect(row.totalCost).toBe("");
  });
});
