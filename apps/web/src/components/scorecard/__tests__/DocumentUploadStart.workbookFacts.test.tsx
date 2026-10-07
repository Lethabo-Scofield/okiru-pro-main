/**
 * @vitest-environment jsdom
 *
 * A gathering workbook states the sector and the financial year end on its
 * Instructions sheet, and the parser now reads them (`sheet_instructions`).
 * The form is still where they are decided: the workbook fills a field the
 * user left empty, never one the user set, and a difference is shown rather
 * than resolved either way.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";
import { writeFlowSnapshot, type FlowSnapshot } from "../flowSnapshot";

const CATALOG = {
  sector_options: [
    { code: "Generic", label: "Generic (RCOGP)" },
    { code: "TRANSPORT", label: "Transport" },
  ],
  required_groups: [],
};

/** What the parser returns for a workbook whose Instructions sheet states a profile. */
const CASE_WITH_INSTRUCTIONS = {
  ai_entities: {
    extractions: [
      {
        documentId: "sheet_instructions",
        sourceFile: "Acme Gathering.xlsx › Instructions",
        values: [
          { field: "measured_entity_name", value: "Acme Trading (Pty) Ltd" },
          { field: "industry_sector", value: "Transport" },
          { field: "financial_year_end", value: "2026-02-28" },
          { field: "applicable_code", value: "Revised Codes" },
        ],
      },
    ],
  },
};

function restoreRun(overrides: Partial<FlowSnapshot> = {}) {
  writeFlowSnapshot({
    savedAt: "2026-10-07T09:00:00.000Z",
    companyName: "Acme Trading (Pty) Ltd",
    sector: "",
    subSector: "",
    size: "QSE",
    fileNames: ["Acme Gathering.xlsx"],
    filedBatchByFile: {},
    documentIds: [],
    // The flow snapshot types the deterministic case; the AI extractions ride along untyped.
    parserCase: CASE_WITH_INSTRUCTIONS as unknown as FlowSnapshot["parserCase"],
    ...overrides,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG })) as unknown as typeof fetch,
  );
});

describe("DocumentUploadStart — the workbook's sector and year end", () => {
  it("fills an empty sector and year end from the workbook, with nothing to flag", async () => {
    restoreRun();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    await waitFor(() =>
      expect((screen.getByTestId("sector-select-build") as HTMLSelectElement).value).toBe("TRANSPORT"),
    );
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("2026-02-28");
    expect(screen.queryByTestId("workbook-mismatch-sector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workbook-mismatch-yearEnd")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("button-create-from-documents")).not.toBeDisabled());
  });

  it("never overwrites what the user chose, and says where the workbook differs", async () => {
    restoreRun({ sector: "RCOGP", size: "Generic", yearEnd: "2025-06-30" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    const sectorNote = await screen.findByTestId("workbook-mismatch-sector");
    expect(sectorNote).toHaveTextContent(/sector is Transport/);
    expect(screen.getByTestId("workbook-mismatch-yearEnd")).toHaveTextContent(/2026-02-28; you entered 2025-06-30/);
    expect((screen.getByTestId("sector-select-build") as HTMLSelectElement).value).toBe("RCOGP");
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("2025-06-30");
  });

  it("stays silent when the user's value is the workbook's", async () => {
    restoreRun({ sector: "TRANSPORT", yearEnd: "2026-02-28" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    await screen.findByTestId("build-bar");
    expect(screen.queryByTestId("workbook-mismatch-sector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workbook-mismatch-yearEnd")).not.toBeInTheDocument();
  });
});
