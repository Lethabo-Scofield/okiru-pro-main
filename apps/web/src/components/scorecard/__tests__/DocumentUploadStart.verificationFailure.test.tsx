/**
 * @vitest-environment jsdom
 *
 * The claim-vs-evidence checks are a report, never a gate. If they throw on a
 * read nobody foresaw, Build must still save the reconciled sections (without
 * a report) instead of failing on every click. (Invented company.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";

vi.mock("../../../../../api/pipeline/verification/index.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    verifyClaims: () => {
      throw new Error("unforeseen read shape");
    },
  };
});

import { DocumentUploadStart } from "../DocumentUploadStart";
import { writeFlowSnapshot } from "../flowSnapshot";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG })) as unknown as typeof fetch);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("DocumentUploadStart — a verification failure never blocks Build", () => {
  it("saves the sections without a report when the checks throw", async () => {
    writeFlowSnapshot({
      savedAt: "2026-10-06T11:31:00.000Z",
      companyName: "Kestrel Haulage (Pty) Ltd",
      sector: "RCOGP",
      subSector: "",
      size: "Generic",
      yearEnd: "2025-02-28",
      fileNames: ["Gathering.xlsx"],
      filedBatchByFile: {},
      documentIds: [],
      parserCase: ({
        ai_entities: {
          extractions: [{
            documentId: "sheet_table__sed",
            sourceFile: "Gathering.xlsx › SED",
            element: "SED",
            values: [{ field: "beneficiary_rows", value: [
              { beneficiary_name: "Riverside Creche", contribution_value: 12000, date_of_contribution: "2024-06-10", contribution_type: "Grant" },
            ] }],
          }],
        },
      }) as never,
    });
    const onCreate = vi.fn(async () => undefined);
    render(<DocumentUploadStart onCreate={onCreate} creating={false} />);

    const build = await screen.findByTestId("button-create-from-documents");
    await waitFor(() => expect(build).not.toBeDisabled());
    fireEvent.click(build);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    const [, sections, extras] = onCreate.mock.calls[0] as unknown as [
      string,
      Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>,
      { verification?: unknown },
    ];
    expect(extras.verification).toBeUndefined();
    expect(sections["company-information"]?.meta?._verification).toBeUndefined();
    expect((sections.sed?.rows ?? []).length).toBeGreaterThan(0);
  });
});
