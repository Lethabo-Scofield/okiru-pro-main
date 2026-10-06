/**
 * @vitest-environment jsdom
 *
 * Fact-checking a document ends in a fix, not a dead end: a value the parser
 * read can be corrected and a field it could not find can be filled in, on the
 * document's own page. Each is saved as a correction beside the parser's
 * reading, and the page says which values a person checked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import ParserDocumentDetail from "../ParserDocumentDetail";

const patches: unknown[] = [];

const DOCUMENT = {
  id: "doc-1", filename: "certificate.pdf", fileType: "application/pdf", fileSize: 10, uploadedAt: "2026-10-06T10:00:00Z",
  entityId: null, status: "review_required", documentType: "B-BBEE Certificate", overallConfidence: 0.7, extractedFieldCount: 1,
  problemFieldCount: 1, reviewRequired: true, missingFields: ["expiry_date"], lowConfidenceFields: [], latestRunId: "run-1", lastRunAt: null,
};
const RUN = {
  runId: "run-1", status: "review_required", documentType: "B-BBEE Certificate", missingFields: ["expiry_date"],
  lowConfidenceFields: [], warnings: [], errors: [], reviewReasons: [], requiresHumanReview: true,
  parserOutput: { extracted_fields: { bee_level: { normalized_value: 4, raw_value: "Level 4", confidence: 0.6 } } },
  reviewHistory: [] as unknown[],
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["%PDF"]) });

beforeEach(() => {
  patches.length = 0;
  RUN.reviewHistory = [];
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        const body = JSON.parse(String(init?.body));
        patches.push(body);
        for (const [fieldKey, correctedValue] of Object.entries(body.fields ?? {})) {
          const originalValue = fieldKey === "bee_level" ? 4 : null;
          RUN.reviewHistory = [...RUN.reviewHistory, { fieldKey, originalValue, correctedValue, approvalState: "corrected" }];
        }
        return json({ document: DOCUMENT, reviewHistory: RUN.reviewHistory });
      }
      if (url.endsWith("/runs")) return json({ runs: [] });
      if (url.endsWith("/download")) return json({});
      if (url.includes("/api/clients")) return json([]);
      return json({ document: DOCUMENT, latestRun: RUN });
    }) as unknown as typeof fetch,
  );
});

describe("ParserDocumentDetail — correcting and filling in values", () => {
  it("corrects a value the parser read, and keeps what it read on show", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("field-bee_level-edit"));
    fireEvent.change(screen.getByTestId("field-bee_level-input"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("field-bee_level-save"));

    await waitFor(() => expect(screen.getByTestId("field-bee_level-corrected")).toHaveTextContent("the parser read “4”"));
    expect(patches).toEqual([{ fields: { bee_level: "2" } }]);
    expect(screen.getByTestId("field-bee_level-edit")).toHaveTextContent("2");
  });

  it("fills in a field the parser could not find, which then counts as read", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("field-expiry_date-add"));
    fireEvent.change(screen.getByTestId("field-expiry_date-input"), { target: { value: "2026-12-31" } });
    fireEvent.keyDown(screen.getByTestId("field-expiry_date-input"), { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("field-row-expiry_date")).toBeInTheDocument());
    expect(screen.queryByTestId("missing-row-expiry_date")).not.toBeInTheDocument();
    expect(screen.getByTestId("field-expiry_date-corrected")).toHaveTextContent("the parser did not find this");
    expect(patches).toEqual([{ fields: { expiry_date: "2026-12-31" } }]);
  });
});
