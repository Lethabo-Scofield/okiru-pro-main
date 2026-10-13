/**
 * @vitest-environment jsdom
 *
 * "Let's say a user forgot to add a document. What then?"
 *
 * After a read, "Add more documents" accepted the file and then nothing could
 * price or read it — every gate keyed off "has anything been read yet". Now a
 * forgotten document is priced, charged, read and merged on its own: the files
 * already read are never quoted, charged or sent to the parser again.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

/** Every call the flow makes, with the file names it carried. */
const calls: Array<{ url: string; files: string[] }> = [];
let quoteSeq = 0;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A one-chunk streamed body, the way the parser's SSE endpoint answers. */
function streamOf(text: string) {
  let sent = false;
  return {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true, value: undefined };
        sent = true;
        return { done: false, value: new TextEncoder().encode(text) };
      },
    }),
  };
}

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files =
        body instanceof FormData
          ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name)
          : [];
      calls.push({ url, files });

      if (url.includes("/api/parser/document-types")) return json(CATALOG);
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } }, 201);
      if (url.includes("/api/parser/quote-files")) {
        quoteSeq += 1;
        return json({
          data: {
            quoteId: `q-${quoteSeq}`,
            paymentRequired: true,
            expiresAt: "2026-10-07T00:00:00Z",
            totals: { isUpperBound: false },
            files: files.map((filename) => ({ filename, requiresOcr: false, tokens: { input: 100 }, structure: { pages: 1 } })),
          },
        });
      }
      if (url.includes("/api/tokens/quote/")) {
        return json({ tokens: 250, balance: 10_000, balanceAfter: 9_750, sufficient: true, shortfall: 0, alreadyAuthorized: false, files: [] });
      }
      if (url.includes("/api/tokens/authorize")) return json({ balance: 9_750 });
      if (url.includes("/api/parser/resolve-case-files-stream")) {
        const result = {
          case_id: "case",
          documents_detected: files.map((filename) => ({ filename, document_type: "Share register", status: "passed" })),
          ai_entities: { extractions: files.map((filename) => ({ documentId: filename, sourceFile: filename, element: "OWNERSHIP", values: [] })) },
        };
        return { ok: true, status: 200, body: streamOf(sse("result", result)) };
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      return json({});
    }) as unknown as typeof fetch,
  );
}

const named = (prefix: string) => calls.filter((c) => c.url.includes(prefix));

beforeEach(() => {
  calls.length = 0;
  quoteSeq = 0;
  sessionStorage.clear();
  stubServer();
});

async function readFromBar(user: ReturnType<typeof userEvent.setup>) {
  const read = await screen.findByTestId("button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
}

describe("DocumentUploadStart — adding a forgotten document after the read", () => {
  it("reads from the bar in one click — no separate checkout page", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "shareholders.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(screen.getByTestId("read-bar-price")).toHaveTextContent("250 tokens"));
    await readFromBar(user);

    await waitFor(() => expect(named("/resolve-case-files-stream")).toHaveLength(1));
    expect(named("/api/tokens/authorize")).toHaveLength(1);
    expect(screen.queryByTestId("payment-summary")).not.toBeInTheDocument();
  });

  it("prices, charges and reads ONLY the new file, and keeps what was read before", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    const input = await screen.findByTestId("docs-file-input");

    await user.upload(input, new File(["%PDF a"], "shareholders.pdf", { type: "application/pdf" }));
    await readFromBar(user);
    await screen.findByTestId("button-create-from-documents");

    // The forgotten one.
    await user.upload(screen.getByTestId("docs-file-input"), new File(["%PDF b"], "payroll.pdf", { type: "application/pdf" }));
    const bar = await screen.findByTestId("read-bar");
    expect(bar).toHaveTextContent("1 new document ready to read");
    expect(bar).toHaveTextContent("Documents already read are not charged again.");

    await waitFor(() => expect(named("/api/parser/quote-files")).toHaveLength(2));
    expect(named("/api/parser/quote-files")[1].files).toEqual(["payroll.pdf"]);

    await readFromBar(user);
    await waitFor(() => expect(named("/resolve-case-files-stream")).toHaveLength(2));
    expect(named("/resolve-case-files-stream")[1].files).toEqual(["payroll.pdf"]);

    // Each paid round is its own charge and its own settlement.
    expect(named("/api/tokens/authorize")).toHaveLength(2);
    await waitFor(() => expect(named("/settle-outcome").map((c) => c.url)).toEqual([
      "/api/tokens/runs/q-1/settle-outcome",
      "/api/tokens/runs/q-2/settle-outcome",
    ]));

    // Both documents stand, and a read document can no longer be removed.
    await screen.findByTestId("button-create-from-documents");
    expect(screen.getAllByText("shareholders.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("payroll.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("remove-shareholders.pdf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-payroll.pdf")).not.toBeInTheDocument();
  });

  it("will not build while a document that was added has not been read", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "shareholders.pdf", { type: "application/pdf" }));
    await readFromBar(user);
    await screen.findByTestId("button-create-from-documents");

    await user.upload(screen.getByTestId("docs-file-input"), new File(["%PDF b"], "payroll.pdf", { type: "application/pdf" }));
    expect(await screen.findByTestId("docs-unread-hint")).toHaveTextContent("not been read yet");
    expect(screen.getByTestId("button-create-from-documents")).toBeDisabled();

    // Removing the unread one is allowed, and does not throw away the paid read.
    await user.click(screen.getByTestId("remove-payroll.pdf"));
    expect(screen.queryByTestId("docs-unread-hint")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("document-upload-start")).getAllByText("shareholders.pdf").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("payroll.pdf")).toHaveLength(0);
    expect(screen.getByTestId("button-create-from-documents")).toBeInTheDocument();
  });
});
