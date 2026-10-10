/**
 * A designation the upload worked out from a JOB TITLE is a guess; a stated
 * occupational level is evidence. The projection that feeds the calculators
 * must score the evidence. (Invented people.)
 */
import { describe, expect, it } from "vitest";
import type { WorkbookData } from "../workbookRoutes";
import { projectWorkbookToClient } from "../workbookRoutes";

function workbook(row: Record<string, unknown>): WorkbookData {
  return {
    companyId: "c1",
    sections: {
      "company-information": { meta: { industrySector: "Transport", scorecardType: "QSE" } },
      "management-control": { rows: [{ _id: "p1", name: "Lerato", surname: "Khumalo", race: "African", gender: "Female", ...row }] },
    },
  } as unknown as WorkbookData;
}

describe("designation provenance on the workbook projection", () => {
  it("scores a stated level over a designation read from a job title", () => {
    const p = projectWorkbookToClient(workbook({
      designation: "Middle Manager",
      occupationalLevel: "Senior Management",
      _derivedFromFlag: { designation: 'job title "Admin Manager"' },
    }));
    expect(p.employees[0].designation).toBe("Senior");
  });

  it("keeps a STATED designation over the occupational level", () => {
    const p = projectWorkbookToClient(workbook({ designation: "Other Executive Manager", occupationalLevel: "Senior Management" }));
    expect(p.employees[0].designation).toBe("Other Executive Management");
  });
});
