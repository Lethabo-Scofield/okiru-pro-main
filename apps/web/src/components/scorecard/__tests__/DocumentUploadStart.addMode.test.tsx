/**
 * @vitest-environment jsdom
 *
 * Adding documents to a company that already exists: its profile is known,
 * Build becomes "Add to the workbook", and its paid read is kept apart from
 * any new-company upload going on in the same tab.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";
import { readFlowSnapshot, writeFlowSnapshot, type FlowSnapshot } from "../flowSnapshot";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };
const EXISTING = {
  id: "C-10001",
  name: "Example Trading 101 (Pty) Ltd",
  sectorCode: "RCOGP",
  scorecardType: "Generic",
  financialYearEnd: "28/02/2026",
};

function snapshot(name: string): FlowSnapshot {
  return {
    savedAt: "2026-10-06T11:31:00.000Z",
    companyName: name,
    sector: "RCOGP",
    subSector: "",
    size: "Generic",
    yearEnd: "2026-02-28",
    fileNames: ["payroll.xlsx"],
    filedBatchByFile: {},
    documentIds: [],
    parserCase: { documents_detected: [{ filename: "payroll.xlsx", document_type: "Payroll", status: "passed" }] },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG })) as unknown as typeof fetch,
  );
});

describe("DocumentUploadStart — adding documents to an existing company", () => {
  it("starts from the company's own profile, and Build adds to its workbook", async () => {
    writeFlowSnapshot(snapshot(EXISTING.name), `add:${EXISTING.id}`);
    const onCreate = vi.fn(async () => undefined);
    render(<DocumentUploadStart onCreate={onCreate} creating={false} existingCompany={EXISTING} />);

    const build = await screen.findByTestId("button-create-from-documents");
    expect(build).toHaveTextContent("to the workbook");
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("2026-02-28");
    await waitFor(() => expect(build).not.toBeDisabled());

    fireEvent.click(build);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // The run belonged to this company; it is gone once added.
    await waitFor(() => expect(readFlowSnapshot(`add:${EXISTING.id}`)).toBeNull());
  });

  it("never restores a new-company upload into an existing company's workbook", async () => {
    writeFlowSnapshot(snapshot("Some Other Company"));
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} existingCompany={EXISTING} />);

    await screen.findByTestId("docs-drop-zone");
    expect(screen.queryByTestId("restored-run-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-create-from-documents")).not.toBeInTheDocument();
    // And the create flow's run is left exactly where it was.
    expect(readFlowSnapshot()?.companyName).toBe("Some Other Company");
  });
});
