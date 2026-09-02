/**
 * The Management Control mapper reads JOB TITLES, not just band names.
 *
 * Motivation, measured: the first placement-telemetry row from a real pack
 * had 63 unplaced values, 45 of them a designation like "Code 14 Driver" or
 * "Admin Manager" rejected as "not one of: Executive Director, …". Every one
 * was a good employee row.
 */
import { describe, expect, it } from "vitest";
import { classifyJobTitle } from "../jobTitleBands";
import { injectIntoSection } from "../workbookInjection";

describe("classifyJobTitle — titles land in the band the kind of work defines", () => {
  it.each([
    ["Code 14 Driver", "Semi-skilled", "Semi-Skilled"],
    ["Code 14 Driver/ Panelbeater", "Semi-skilled", "Semi-Skilled"],
    ["General worker/ Drivers assistant", "Unskilled", "Unskilled"],
    ["General Worker / Driver's Assistant", "Unskilled", "Unskilled"],
    ["Operations Manager", "Middle Manager", "Middle Management"],
    ["Admin Manager", "Middle Manager", "Middle Management"],
    ["Adminstration Management ", "Middle Manager", "Middle Management"],
    ["Senior Operations Manager", "Senior Manager", "Senior Management"],
    ["Junior Manager", "Junior Manager", "Junior Management"],
    ["Member", "Executive Director", "Top Management"],
    ["Managing Director", "Executive Director", "Top Management"],
    ["Non-Executive Director", "Non-executive Director", "Top Management"],
    ["General Manager", "Other Executive Manager", "Top Management"],
  ])("%s → designation %s / level %s", (title, designation, level) => {
    const bands = classifyJobTitle(title);
    expect(bands.designation).toBe(designation);
    expect(bands.occupationalLevel).toBe(level);
  });

  it.each([["Administrator"], ["Supervisor"], ["Panelbeater"], ["Bookkeeper"], ["Diesel Mechanic"]])(
    "%s is Skilled — a level, never a designation the dropdown lacks",
    (title) => {
      const bands = classifyJobTitle(title);
      expect(bands.designation).toBeNull();
      expect(bands.occupationalLevel).toBe("Skilled");
    },
  );

  it("names nothing for a title with no band-bearing word — never the nearest", () => {
    expect(classifyJobTitle("Ubuntu")).toEqual({ designation: null, occupationalLevel: null, matched: "" });
    expect(classifyJobTitle("")).toEqual({ designation: null, occupationalLevel: null, matched: "" });
  });
});

describe("injectIntoSection — people rows are reconciled before cells are judged", () => {
  it("files a driver as Semi-skilled and states the level, instead of rejecting the title", () => {
    const result = injectIntoSection("management-control", [
      { field: "name", value: "Sipho Ndlovu" },
      { field: "designation", value: "Code 14 Driver" },
    ]);
    expect(result.rejected.filter((r) => r.field === "designation")).toHaveLength(0);
    expect(result.cells.designation).toBe("Semi-skilled");
    expect(result.cells.occupationalLevel).toBe("Semi-Skilled");
  });

  it("files a skilled-technical title under Occupational Level with no designation rejection", () => {
    const result = injectIntoSection("management-control", [
      { field: "name", value: "Thandi Mbeki" },
      { field: "designation", value: "Administrator" },
    ]);
    expect(result.rejected.filter((r) => r.field === "designation")).toHaveLength(0);
    expect(result.cells.designation).toBeUndefined();
    expect(result.cells.occupationalLevel).toBe("Skilled");
  });

  it("does not overwrite a level the row already states", () => {
    const result = injectIntoSection("management-control", [
      { field: "designation", value: "Operations Manager" },
      { field: "occupationalLevel", value: "Senior Management" },
    ]);
    expect(result.cells.designation).toBe("Middle Manager");
    expect(result.cells.occupationalLevel).toBe("Senior Management");
  });

  it("reads gender from a valid SA ID when the register coded it as a number", () => {
    // Digits 7–10 = 5000+ → male.
    const result = injectIntoSection("management-control", [
      { field: "idNumber", value: "8001015009087" },
      { field: "gender", value: "1" },
    ]);
    expect(result.cells.gender).toBe("Male");
    expect(result.rejected.filter((r) => r.field === "gender")).toHaveLength(0);
  });

  it("still rejects a coded gender when there is no ID to read it from", () => {
    const result = injectIntoSection("management-control", [{ field: "gender", value: "1" }]);
    expect(result.cells.gender).toBeUndefined();
    expect(result.rejected.some((r) => r.field === "gender")).toBe(true);
  });

  it("still rejects a title nobody can band", () => {
    const result = injectIntoSection("management-control", [{ field: "designation", value: "Ubuntu" }]);
    expect(result.rejected.some((r) => r.field === "designation")).toBe(true);
  });
});

describe("normalisers — the small misses that padded the unplaced list", () => {
  it('"Category G" is the skills category G', () => {
    const result = injectIntoSection("skills-development", [{ field: "categoryCode", value: "Category G" }]);
    expect(result.cells.categoryCode).toBe("G");
  });

  it("a month with one typo is still that month", () => {
    const result = injectIntoSection("esd", [{ field: "dateOfTransaction", value: "        31  Ocober 2024" }]);
    expect(result.cells.dateOfTransaction).toBe("2024-10-31");
  });
});
