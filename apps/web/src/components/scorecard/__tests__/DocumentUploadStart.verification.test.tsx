/**
 * @vitest-environment jsdom
 *
 * Creating a scorecard from documents checks every claim against the
 * documents read: the report goes to the score page and is kept on the
 * workbook (company-information meta), and the sections saved are the
 * CLAIMED ones. (Invented company.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";
import { writeFlowSnapshot } from "../flowSnapshot";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG })) as unknown as typeof fetch);
});

describe("DocumentUploadStart — claim-vs-evidence verification", () => {
  it("hands the report to the host and keeps it on the workbook", async () => {
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
      parserCase: {
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
      },
    });
    const onCreate = vi.fn(async () => undefined);
    render(<DocumentUploadStart onCreate={onCreate} creating={false} />);

    const build = await screen.findByTestId("button-create-from-documents");
    await waitFor(() => expect(build).not.toBeDisabled());
    fireEvent.click(build);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    const [, sections, extras] = onCreate.mock.calls[0] as unknown as [
      string,
      Record<string, { meta?: Record<string, unknown> }>,
      { verification?: { version: number; checks: Array<{ kind: string; status: string }> } },
    ];
    expect(extras.verification?.version).toBe(1);
    // No proof of payment was read: the contribution is claimed, not evidenced.
    expect(extras.verification?.checks.find((c) => c.kind === "sed.proofOfPayment")?.status).toBe("unproven");
    expect((sections["company-information"]?.meta?._verification as { version?: number })?.version).toBe(1);
  });
});
