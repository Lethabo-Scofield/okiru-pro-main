/**
 * @vitest-environment jsdom
 *
 * The panel's job is not just to offer a download — it is to show the client
 * how what they captured becomes what the report says, before they open the
 * report. So these tests check the traceability strip carries real figures
 * from the spine, and that the sign-off gate is stated on screen rather than
 * only inside the generated file.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("still offers the report format when the workbook is blank", () => {
    render(<EsgReportExportPanel workbook={null} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("esg-report-export-empty")).toBeTruthy();
    // The templates are the format, not the data, so they are always available.
    expect(screen.getByTestId("button-esg-export-docx")).toBeTruthy();
    expect(screen.getByTestId("button-esg-export-pptx")).toBeTruthy();
    // …but there is nothing to trace yet.
    expect(screen.queryByTestId("esg-report-translation")).toBeNull();
  });

  it("offers Word and PowerPoint once there is something to disclose", () => {
    render(<EsgReportExportPanel workbook={golden()} companyName="SG Consumer" companyId="sg-consumer" />);
    expect(screen.getByTestId("button-esg-export-docx")).toBeTruthy();
    expect(screen.getByTestId("button-esg-export-pptx")).toBeTruthy();
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

describe("the download", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const clickDocx = async () => {
    render(<EsgReportExportPanel workbook={golden()} companyName="SG Consumer" companyId="sg-consumer" />);
    fireEvent.click(screen.getByTestId("button-esg-export-docx"));
  };

  it("refuses a response that is the SPA page rather than the document", async () => {
    // The server answers every unknown path with 200 text/html, so an absent
    // asset arrives looking like a success. Without the magic-number check the
    // client gets an HTML file named .docx and only finds out when Word fails.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html></html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" },
    })));
    await clickDocx();
    await waitFor(() => {
      expect(screen.getByTestId("esg-report-export-error").textContent)
        .toContain("returned a web page instead of the document");
    });
  });

  it("accepts a real OOXML package", async () => {
    // "PK" — the zip header every .docx and .pptx opens with.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(zip, {
      status: 200,
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    })));
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    await clickDocx();
    await waitFor(() => {
      expect(screen.queryByTestId("esg-report-export-error")).toBeNull();
    });
  });
});
