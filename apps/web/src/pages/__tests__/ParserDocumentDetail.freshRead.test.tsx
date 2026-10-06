/**
 * @vitest-environment jsdom
 *
 * Reading a library document again from scratch is priced, confirmed, paid,
 * read and settled — in that order — and nothing is charged before the user
 * confirms. "Re-read" of an unchanged file stays free (the stored reading).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import ParserDocumentDetail from "../ParserDocumentDetail";

const calls: Array<{ method: string; url: string }> = [];
let settlement: Record<string, unknown> = { state: "settled", refundedTokens: 0 };

const DOCUMENT = {
  id: "doc-1", filename: "afs.pdf", fileType: "application/pdf", fileSize: 10, uploadedAt: "2026-10-06T10:00:00Z",
  entityId: null, status: "review_required", documentType: "AFS", overallConfidence: 0.5, extractedFieldCount: 0,
  problemFieldCount: 0, reviewRequired: true, missingFields: [], lowConfidenceFields: [], latestRunId: "run-1", lastRunAt: null,
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["%PDF"]) });

beforeEach(() => {
  calls.length = 0;
  settlement = { state: "settled", refundedTokens: 0 };
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (url.endsWith("/reread/quote")) return json({ quoteId: "quote_r1" }, 201);
      if (url.includes("/api/tokens/quote/")) return json({ tokens: 300, balance: 9_000, sufficient: true, shortfall: 0 });
      if (url.endsWith("/api/tokens/authorize")) return json({ balance: 8_700 });
      if (url.endsWith("/reread")) return json({ document: DOCUMENT, run: { runId: "run-2" } }, 201);
      if (url.includes("/settle-outcome")) return json(settlement);
      if (url.endsWith("/runs")) return json({ runs: [] });
      if (url.endsWith("/download")) return json({});
      if (url.includes("/api/clients")) return json([]);
      return json({ document: DOCUMENT, latestRun: null });
    }) as unknown as typeof fetch,
  );
});

const posts = () => calls.filter((c) => c.method === "POST").map((c) => c.url.replace(/^.*\/api\//, ""));

describe("ParserDocumentDetail — reading again from scratch is paid", () => {
  it("prices first, charges only on confirm, then reads and settles", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("document-read-fresh"));

    expect(await screen.findByTestId("document-fresh-read-price")).toHaveTextContent("costs 300 tokens");
    // Priced, not paid: nothing has touched the wallet yet.
    expect(posts()).toEqual(["parser-documents/doc-1/reread/quote"]);

    fireEvent.click(screen.getByTestId("document-fresh-read-confirm"));
    await waitFor(() => expect(screen.getByTestId("document-notice")).toHaveTextContent("Read again from scratch."));
    expect(posts()).toEqual([
      "parser-documents/doc-1/reread/quote",
      "tokens/authorize",
      "parser-documents/doc-1/reread",
      "tokens/runs/quote_r1/settle-outcome",
    ]);
  });

  it("says when a read that delivered nothing was refunded", async () => {
    settlement = { state: "settled", refundedTokens: 300 };
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("document-read-fresh"));
    fireEvent.click(await screen.findByTestId("document-fresh-read-confirm"));
    await waitFor(() => expect(screen.getByTestId("document-notice")).toHaveTextContent("300 tokens were returned to your balance."));
  });

  it("cancelling a price charges nothing", async () => {
    render(<ParserDocumentDetail id="doc-1" />);
    fireEvent.click(await screen.findByTestId("document-read-fresh"));
    await screen.findByTestId("document-fresh-read-price");
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("document-fresh-read-price")).not.toBeInTheDocument();
    expect(posts()).toEqual(["parser-documents/doc-1/reread/quote"]);
  });
});
