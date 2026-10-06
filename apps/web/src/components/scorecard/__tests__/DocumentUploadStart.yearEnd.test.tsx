/**
 * @vitest-environment jsdom
 *
 * A full evidence pack scored 0 (Silver Lake Trading 447, 6 Oct 2026). The
 * documents never supply a financial year-end — the B-BBEE parser does not
 * read one — and the workbook refuses to calculate without it, because every
 * dated pillar is measured over the twelve months ending on it. This flow is
 * the only place the year end can come from, so it must ask, require it, and
 * hand it to the workbook it creates.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";
import { writeFlowSnapshot, type FlowSnapshot } from "../flowSnapshot";

const CATALOG = {
  sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }],
  required_groups: [],
};

/** A paid extraction restored from the session — the reveal renders from it alone. */
function restoreRun(overrides: Partial<FlowSnapshot> = {}) {
  writeFlowSnapshot({
    savedAt: "2026-10-06T11:31:00.000Z",
    companyName: "Silver Lake Trading 447 (Pty) Ltd",
    sector: "RCOGP",
    subSector: "",
    size: "Generic",
    fileNames: ["1 SLT_Infor 13Nov2025.xlsx"],
    filedBatchByFile: {},
    documentIds: [],
    parserCase: {},
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

describe("DocumentUploadStart — financial year-end", () => {
  it("will not build the scorecard until a year end is given, and says why", async () => {
    restoreRun();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    const build = await screen.findByTestId("button-create-from-documents");
    // Name, sector and size are all set — the year end is the only thing missing.
    expect((screen.getByTestId("docs-year-end") as HTMLInputElement).value).toBe("");
    expect(build).toBeDisabled();
    expect(screen.getByTestId("docs-year-end-hint")).toHaveTextContent(/cannot be calculated without it/);

    fireEvent.change(screen.getByTestId("docs-year-end"), { target: { value: "2026-02-28" } });

    await waitFor(() => expect(build).not.toBeDisabled());
    expect(screen.queryByTestId("docs-year-end-hint")).not.toBeInTheDocument();
  });

  it("stamps the year end into the workbook it creates, where submit looks for it", async () => {
    restoreRun();
    const onCreate = vi.fn(async () => undefined);
    render(<DocumentUploadStart onCreate={onCreate} creating={false} />);

    fireEvent.change(await screen.findByTestId("docs-year-end"), { target: { value: "2026-02-28" } });
    const build = screen.getByTestId("button-create-from-documents");
    await waitFor(() => expect(build).not.toBeDisabled());
    fireEvent.click(build);

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const [, sections] = onCreate.mock.calls[0] as unknown as [
      string,
      Record<string, { meta?: Record<string, unknown> }>,
    ];
    expect(sections["company-information"]?.meta?.financialYearEnd).toBe("2026-02-28");
  });

  it("keeps the year end with a restored run, so coming back does not ask again", async () => {
    restoreRun({ yearEnd: "2026-02-28" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    const input = (await screen.findByTestId("docs-year-end")) as HTMLInputElement;
    expect(input.value).toBe("2026-02-28");
    expect(screen.getByTestId("button-create-from-documents")).not.toBeDisabled();
  });

  it("rejects a date that does not exist rather than creating with it", async () => {
    restoreRun({ yearEnd: "2026-02-31" });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    expect(await screen.findByTestId("button-create-from-documents")).toBeDisabled();
  });
});
