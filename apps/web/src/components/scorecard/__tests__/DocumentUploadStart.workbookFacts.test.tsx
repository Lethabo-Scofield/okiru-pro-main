/**
 * @vitest-environment jsdom
 *
 * A gathering workbook states the sector and the financial year end on its
 * Instructions sheet, and the parser now reads them (`sheet_instructions`).
 * The workbook fills a field the user left empty. Where the form already holds
 * something else (picked before the read, or restored from an earlier run),
 * Build waits for the user to decide: the workbook's value is one click away,
 * and keeping their own is a second, explicit click.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("never builds on a sector or year end that differs from the workbook without a decision", async () => {
    // A value restored from an earlier run's snapshot (or picked before the
    // read) used to win silently, under one amber line: a Transport pack was
    // built as RCOGP with a year end twenty months out.
    restoreRun({ sector: "RCOGP", size: "Generic", yearEnd: "2025-06-30" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    const sectorNote = await screen.findByTestId("workbook-mismatch-sector");
    expect(sectorNote).toHaveTextContent(/sector is Transport/);
    expect(screen.getByTestId("workbook-mismatch-yearEnd")).toHaveTextContent(/2026-02-28/);
    expect(screen.getByTestId("workbook-mismatch-yearEnd")).toHaveTextContent(/2025-06-30/);
    // Nothing is changed behind the user's back, and nothing is built either.
    expect((screen.getByTestId("sector-select-build") as HTMLSelectElement).value).toBe("RCOGP");
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("2025-06-30");
    expect(screen.getByTestId("button-create-from-documents")).toBeDisabled();
  });

  it("takes the workbook's value in one click per field", async () => {
    restoreRun({ sector: "RCOGP", size: "QSE", yearEnd: "2025-06-30" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    fireEvent.click(await screen.findByTestId("workbook-mismatch-sector-use-workbook"));
    fireEvent.click(screen.getByTestId("workbook-mismatch-yearEnd-use-workbook"));

    expect((screen.getByTestId("sector-select-build") as HTMLSelectElement).value).toBe("TRANSPORT");
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("2026-02-28");
    expect(screen.queryByTestId("workbook-mismatch-sector")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("button-create-from-documents")).not.toBeDisabled());
  });

  it("builds on the user's own value only once they say to keep it", async () => {
    restoreRun({ sector: "RCOGP", size: "Generic", yearEnd: "2026-02-28" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    fireEvent.click(await screen.findByTestId("workbook-mismatch-sector-keep-mine"));

    expect((screen.getByTestId("sector-select-build") as HTMLSelectElement).value).toBe("RCOGP");
    expect(screen.getByTestId("workbook-mismatch-sector")).toHaveTextContent(/keeping yours/i);
    await waitFor(() => expect(screen.getByTestId("button-create-from-documents")).not.toBeDisabled());
  });

  it("stays silent when the user's value is the workbook's", async () => {
    restoreRun({ sector: "TRANSPORT", yearEnd: "2026-02-28" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    await screen.findByTestId("build-bar");
    expect(screen.queryByTestId("workbook-mismatch-sector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workbook-mismatch-yearEnd")).not.toBeInTheDocument();
  });
});
