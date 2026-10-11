/**
 * @vitest-environment jsdom
 *
 * Adding past the document limit adds nothing, so the batch already staged
 * keeps its price. The read bar used to lose the quote and say "we couldn't
 * work out the cost", blaming pricing for what was the file limit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files = body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];
      if (url.includes("/api/parser/document-types")) return json(CATALOG);
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } }, 201);
      if (url.includes("/api/parser/quote-files")) {
        return json({
          data: {
            quoteId: "q-1",
            paymentRequired: true,
            expiresAt: "2026-10-07T00:00:00Z",
            totals: { isUpperBound: false },
            files: files.map((filename) => ({ filename, requiresOcr: false, tokens: { input: 100 }, structure: { pages: 2, sheets: null, rows: null } })),
          },
        });
      }
      if (url.includes("/api/tokens/quote/")) {
        return json({
          tokens: 250,
          balance: 3_000,
          balanceAfter: 2_750,
          sufficient: true,
          shortfall: 0,
          alreadyAuthorized: false,
          files: files.map((filename) => ({ filename, tokens: 250, effort: "standard" })),
          effortRules: [],
        });
      }
      return json({});
    }) as unknown as typeof fetch,
  );
});

describe("DocumentUploadStart — the document limit", () => {
  it("names the limit and keeps the staged batch's price, instead of saying the cost could not be worked out", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    const input = await screen.findByTestId("docs-file-input");
    await user.upload(input, new File(["%PDF a"], "register.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByTestId("read-bar-price")).toHaveTextContent("tokens"));

    const tooMany = Array.from({ length: 100 }, (_, i) => new File([`%PDF ${i}`], `extra-${i}.pdf`, { type: "application/pdf" }));
    await user.upload(input, tooMany);

    expect(await screen.findByTestId("parse-error")).toHaveTextContent("You can upload up to 100 documents at once. Remove 1 and try again.");
    const price = screen.getByTestId("read-bar-price");
    expect(price).not.toHaveTextContent("couldn't work out the cost");
    expect(price).toHaveTextContent("tokens");
    expect(screen.queryByTestId("button-retry-quote-inline")).not.toBeInTheDocument();
  });
});
