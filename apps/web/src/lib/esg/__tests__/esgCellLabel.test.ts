/**
 * A disputed cell is named the way a person knows it, never by the mapper's
 * log line ("fleet.diesel_litres (e-data s1a_D15)").
 */
import { describe, expect, it } from "vitest";
import { esgCellLabel, esgConflictLabel } from "../esgCellLabel";

const AXES = { depots: ["Site A", "Site B"], months: ["Jul-25", "Aug-25", "Sep-25"] };

describe("esgCellLabel", () => {
  it("names a monthly cell by its grid, its site and its month", () => {
    expect(esgCellLabel("e-data", "s1a_D15", AXES)).toBe("Fleet diesel · Site B · Aug-25");
    expect(esgCellLabel("e-data", "s2_C14", AXES)).toBe("Electricity · Site A · Jul-25");
  });

  it("names a field-level dispute by the figure", () => {
    expect(esgCellLabel("", "fleet.diesel_litres")).toBe("Diesel litres");
  });
});

describe("esgConflictLabel", () => {
  it("keeps a label that is already words", () => {
    expect(esgConflictLabel({ sectionId: "e-data", cellRef: "s1a_C14", label: "Site A diesel (Mar 2026)" }, AXES)).toBe(
      "Site A diesel (Mar 2026)",
    );
  });

  it("replaces the mapper's own log line with the cell's name", () => {
    expect(
      esgConflictLabel({ sectionId: "e-data", cellRef: "s1a_D15", label: "fleet.diesel_litres (e-data s1a_D15)" }, AXES),
    ).toBe("Fleet diesel · Site B · Aug-25");
    expect(
      esgConflictLabel({ sectionId: "", cellRef: "fleet.diesel_litres", label: "fleet.diesel_litres — your documents disagree" }),
    ).toBe("Diesel litres");
  });
});
