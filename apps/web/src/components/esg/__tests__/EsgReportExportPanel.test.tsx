/**
 * @vitest-environment jsdom
 *
 * The panel's job is not just to offer a download — it is to show the client
 * how what they captured becomes what the report says, before they open the
 * report. So these tests check the traceability strip carries real figures
 * from the spine, and that the sign-off gate is stated on screen rather than
 * only inside the generated file.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { buildGoldenSections } from "../../../../server/esgGoldenFixture";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { EsgReportExportPanel } from "../EsgReportExportPanel";

function golden(): EsgWorkbookData {
  return {
    companyId: "sg-consumer",
    sections: buildGoldenSections() as EsgWorkbookData["sections"],
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("the export panel", () => {
  it("asks for data instead of offering an empty pack when the workbook is blank", () => {
    render(<EsgReportExportPanel workbook={null} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("esg-report-export-empty")).toBeTruthy();
    expect(screen.queryByTestId("button-esg-export-docx")).toBeNull();
  });

  it("offers both formats once there is something to disclose", () => {
    render(<EsgReportExportPanel workbook={golden()} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("button-esg-export-docx")).toBeTruthy();
    expect(screen.getByTestId("button-esg-export-pdf")).toBeTruthy();
  });

  it("shows the captured → scored → disclosed chain with real figures", () => {
    render(<EsgReportExportPanel workbook={golden()} companyName="SG Consumer" companyId="sg-consumer" />);
    const strip = screen.getByTestId("esg-report-translation");
    expect(within(strip).getByText(/evidence blocks across the workbook/)).toBeTruthy();
    expect(within(strip).getByText(/populated cells/)).toBeTruthy();
    expect(within(strip).getByText(/Scope 1\+2 [\d,.]+ tCO₂e/)).toBeTruthy();
    expect(within(strip).getByText(/of \d+ metrics reported/)).toBeTruthy();
    expect(within(strip).getByText(/reasoned omissions, each with a gap and an action/)).toBeTruthy();
  });

  it("states the sign-off gate on screen while the report is unsigned", () => {
    render(<EsgReportExportPanel workbook={golden()} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("esg-report-state").textContent).toContain("DRAFT");
    expect(screen.getByTestId("esg-report-signoff-gate").textContent).toContain("no override");
  });

  it("clears the gate once a named officer and a date are recorded", () => {
    const wb = golden();
    wb.sections.assumptions = {
      cells: {
        ...(wb.sections.assumptions?.cells ?? {}),
        _signOffName: "A Ndlovu",
        _signOffRole: "Company Secretary",
        _signOffDate: "2026-09-09",
      },
    } as EsgWorkbookData["sections"][string];
    render(<EsgReportExportPanel workbook={wb} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("esg-report-state").textContent).toContain("FINAL");
    expect(screen.queryByTestId("esg-report-signoff-gate")).toBeNull();
  });
});
