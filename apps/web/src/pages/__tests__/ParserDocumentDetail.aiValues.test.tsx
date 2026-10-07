/**
 * @vitest-environment jsdom
 *
 * The library shows the whole read, not the rule layer alone: every value the
 * AI model and the agent read, which reader read it, where in the document
 * and the words it was read from — and each can be corrected like a rule
 * field, filed as a review event under the value's own key. A run stored
 * before the library kept AI values still renders as it did.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import ParserDocumentDetail from "../ParserDocumentDetail";

const patches: Array<Record<string, unknown>> = [];

const DOCUMENT = {
  id: "doc-1", filename: "afs.pdf", fileType: "application/pdf", fileSize: 10, uploadedAt: "2026-10-08T10:00:00Z",
  entityId: null, status: "review_required", documentType: "AFS", overallConfidence: 0.7, extractedFieldCount: 4,
  problemFieldCount: 0, reviewRequired: true, missingFields: [], lowConfidenceFields: [], latestRunId: "run-1", lastRunAt: null,
};

const AI_VALUES = [
  {
    key: "ai.afs.npat", field: "npat", value: 1200, layer: "agent", confidence: null, documentId: "afs", documentName: "Annual financial statements",
    element: "FINANCIALS", sourceFile: "afs.pdf", page: 3, cell: null, quote: "Net profit after tax 1 200", grounded: null,
  },
  {
    key: "ai.afs.revenue", field: "revenue", value: 98000, layer: "ai", confidence: null, documentId: "afs", documentName: "Annual financial statements",
    element: "FINANCIALS", sourceFile: "afs.pdf", page: null, cell: null, quote: null, grounded: false,
  },
  {
    key: "ai.sheet_table__skills.learners", field: "learners", value: [{ learner_name: "Learner A", cost: 10 }, { learner_name: "Learner B", cost: 20 }],
    layer: "ai", confidence: null, documentId: "sheet_table__skills", documentName: "Skills register", element: "SKILLS",
    sourceFile: "afs.pdf › Skills", page: null, cell: "B4", quote: null, grounded: true, rowCount: 340,
  },
];

let run: Record<string, any>;
let rereadGate: (() => void) | null = null;

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["%PDF"]) });

function freshRun(withAi = true) {
  return {
    runId: "run-1", status: "review_required", documentType: "AFS", overallConfidence: 0.7, missingFields: [],
    lowConfidenceFields: [], warnings: [], errors: [], reviewReasons: [], requiresHumanReview: true,
    parserOutput: { extracted_fields: { bee_level: { normalized_value: 4, raw_value: "Level 4", confidence: 0.9 } } },
    ...(withAi ? { aiValues: AI_VALUES, aiValueCount: AI_VALUES.length, signed: true } : {}),
    reviewHistory: [] as unknown[],
  };
}

beforeEach(() => {
  patches.length = 0;
  run = freshRun();
  rereadGate = null;
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        patches.push(body);
        for (const [fieldKey, correctedValue] of Object.entries(body.fields ?? {})) {
          const originalValue = AI_VALUES.find((value) => value.key === fieldKey)?.value ?? null;
          run.reviewHistory = [...run.reviewHistory, { fieldKey, originalValue, correctedValue, approvalState: "corrected" }];
        }
        return json({ document: DOCUMENT, reviewHistory: run.reviewHistory });
      }
      if (url.endsWith("/reread/quote")) return json({ quoteId: "quote_r1" }, 201);
      if (url.includes("/api/tokens/quote/")) return json({ tokens: 300, balance: 9_000, sufficient: true, shortfall: 0 });
      if (url.endsWith("/api/tokens/authorize")) return json({ balance: 8_700 });
      if (url.endsWith("/reread")) {
        await new Promise<void>((resolve) => { rereadGate = resolve; });
        return json({ document: DOCUMENT, run: { runId: "run-2" } }, 201);
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      if (url.endsWith("/runs")) return json({ runs: [] });
      if (url.endsWith("/download")) return json({});
      if (url.includes("/api/clients")) return json([]);
      return json({ document: DOCUMENT, latestRun: run });
    }) as unknown as typeof fetch,
  );
});

describe("ParserDocumentDetail — what the AI and the agent read", () => {
  it("lists every AI and agent value with its reader, citation and the words it was read from", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    const section = await screen.findByTestId("ai-values");
    expect(section).toHaveTextContent("3 read · 1 by the agent");

    const npat = screen.getByTestId("ai-value-row-ai.afs.npat");
    expect(within(npat).getByTestId("layer-agent")).toHaveTextContent("Agent");
    expect(within(npat).getByTestId("field-ai.afs.npat-edit")).toHaveTextContent("1200");
    expect(screen.getByTestId("ai-value-ai.afs.npat-citation")).toHaveTextContent("Page 3");
    expect(screen.getByTestId("ai-value-ai.afs.npat-quote")).toHaveTextContent("Net profit after tax 1 200");

    const revenue = screen.getByTestId("ai-value-row-ai.afs.revenue");
    expect(within(revenue).getByTestId("layer-ai")).toHaveTextContent("AI");
    expect(screen.getByTestId("ai-value-ai.afs.revenue-ungrounded")).toBeInTheDocument();

    // A register: its row count, the sheet and cell it was read at, its first rows.
    expect(screen.getByTestId("ai-value-ai.sheet_table__skills.learners-rows")).toHaveTextContent("340 rows");
    expect(screen.getByTestId("ai-value-ai.sheet_table__skills.learners-citation")).toHaveTextContent("Sheet Skills, cell B4");
    expect(screen.getByTestId("ai-value-ai.sheet_table__skills.learners-rows")).toHaveTextContent("Learner A");

    // The rule layer is still there, labelled as the rules' reading.
    expect(within(screen.getByTestId("field-row-bee_level")).getByTestId("layer-rule")).toHaveTextContent("Rules");
  });

  it("corrects an AI value in place, filed under its own key, and keeps what the agent read on show", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("field-ai.afs.npat-edit"));
    fireEvent.change(screen.getByTestId("field-ai.afs.npat-input"), { target: { value: "1250" } });
    fireEvent.click(screen.getByTestId("field-ai.afs.npat-save"));

    await waitFor(() => expect(screen.getByTestId("field-ai.afs.npat-corrected")).toHaveTextContent("the agent read “1200”"));
    expect(patches).toEqual([{ fields: { "ai.afs.npat": "1250" } }]);
    expect(screen.getByTestId("field-ai.afs.npat-edit")).toHaveTextContent("1250");
    expect(screen.getByTestId("ai-values")).toHaveTextContent("1 checked by your team");
    // It is the AI value's correction, not a new rule-layer field.
    expect(screen.queryByTestId("field-row-ai.afs.npat")).not.toBeInTheDocument();
    expect(screen.getByTestId("document-notice")).toHaveTextContent("Saved Npat.");
  });

  it("renders a run stored before AI values were kept, as it always did", async () => {
    run = freshRun(false);
    render(<ParserDocumentDetail id="doc-1" />);
    expect(await screen.findByTestId("field-row-bee_level")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-values")).not.toBeInTheDocument();
  });

  it("shows the paid read under way — the whole read, with a running clock — instead of a stuck spinner", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("document-read-fresh"));
    fireEvent.click(await screen.findByTestId("document-fresh-read-confirm"));

    const progress = await screen.findByTestId("document-reading-progress");
    expect(progress).toHaveTextContent("rules, AI and agent");
    expect(progress).toHaveTextContent(/0:0\d/);
    expect(screen.queryByTestId("document-fresh-read-price")).not.toBeInTheDocument();

    await waitFor(() => expect(rereadGate).not.toBeNull());
    rereadGate!();
    await waitFor(() => expect(screen.queryByTestId("document-reading-progress")).not.toBeInTheDocument());
    expect(screen.getByTestId("document-notice")).toHaveTextContent("Read again from scratch.");
  });
});
