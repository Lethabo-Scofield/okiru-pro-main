/**
 * @vitest-environment jsdom
 *
 * What the B-BBEE create flow files into the document library after a read:
 * the parser's signed record for each uploaded file — rule layer and AI/agent
 * values together — carried unopened. A workbook read sheet by sheet is one
 * run, the workbook's (it used to get none). The pre-signing body rides beside
 * a document's record only so an api that predates signing keeps filing runs
 * mid-deploy; AI values never travel outside the signature.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

const runPosts: Array<{ url: string; body: Record<string, unknown> }> = [];
let signRuns = true;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

const signed = (filename: string) => ({ filename, payload: `{"typ":"okiru.parser-run","filename":"${filename}"}`, signature: `sig-${filename}` });

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files = body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];

      if (url.includes("/api/parser/document-types")) return json(CATALOG);
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } }, 201);
      if (url.endsWith("/runs")) {
        runPosts.push({ url, body: JSON.parse(String(body)) });
        return json({ run: {} }, 201);
      }
      if (url.includes("/api/parser/quote-files")) {
        return json({
          data: {
            quoteId: "q-1",
            paymentRequired: true,
            expiresAt: "2026-10-09T00:00:00Z",
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
          case_id: "case-7",
          documents_detected: [
            { filename: "cert.pdf", document_type: "B-BBEE Certificate", status: "passed", parser_output: { filename: "cert.pdf", status: "passed", extracted_fields: {} } },
            // A workbook comes back one document per sheet.
            { filename: "pack.xlsx › Ownership", document_type: "Share register", status: "passed", parser_output: { filename: "pack.xlsx › Ownership", status: "passed" } },
          ],
          documents_needing_review: [],
          ai_entities: { extractions: [] },
          ...(signRuns ? { run_attestations: [signed("cert.pdf"), signed("pack.xlsx")] } : {}),
        };
        return { ok: true, status: 200, body: streamOf(sse("result", result)) };
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      return json({});
    }) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  runPosts.length = 0;
  signRuns = true;
  sessionStorage.clear();
  stubServer();
});

async function uploadAndRead() {
  const user = userEvent.setup();
  render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
  await user.upload(await screen.findByTestId("docs-file-input"), [
    new File(["%PDF cert"], "cert.pdf", { type: "application/pdf" }),
    new File(["PK workbook"], "pack.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  ]);
  const read = await screen.findByTestId("button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
  await screen.findByTestId("button-create-from-documents");
}

describe("DocumentUploadStart — filing the parser's signed runs", () => {
  it("files each upload's signed record — the workbook once, under itself", async () => {
    await uploadAndRead();
    await waitFor(() => expect(runPosts).toHaveLength(2));

    const byDoc = Object.fromEntries(runPosts.map((post) => [decodeURIComponent(post.url.split("/")[3]), post.body]));
    expect(Object.keys(byDoc).sort()).toEqual(["doc-cert.pdf", "doc-pack.xlsx"]);

    // The workbook: its signed record only. It never had a pre-signing body.
    expect(byDoc["doc-pack.xlsx"]).toEqual({ attestation: { payload: signed("pack.xlsx").payload, signature: "sig-pack.xlsx" } });

    // A document: its signed record, with the pre-signing body beside it for an older api.
    expect(byDoc["doc-cert.pdf"].attestation).toEqual({ payload: signed("cert.pdf").payload, signature: "sig-cert.pdf" });
    expect((byDoc["doc-cert.pdf"].parserOutput as { filename: string }).filename).toBe("cert.pdf");
    expect(byDoc["doc-cert.pdf"].caseId).toBe("case-7");

    // AI values travel only inside the signed text.
    for (const post of runPosts) expect(post.body).not.toHaveProperty("aiValues");
    expect(screen.queryByText(/could not be saved to the document library/)).not.toBeInTheDocument();
  });

  it("keeps no copy of the signed records in the saved flow", async () => {
    await uploadAndRead();
    await waitFor(() => expect(runPosts).toHaveLength(2));
    const saved = Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) ?? "").join("\n");
    expect(saved).not.toContain("run_attestations");
    expect(saved).not.toContain("sig-cert.pdf");
  });

  it("says the results were not archived when the parser signed nothing for a workbook", async () => {
    signRuns = false;
    await uploadAndRead();
    // The document still files its pre-signing body (an older api accepts it);
    // the workbook has nothing the library could accept, and the user is told.
    await waitFor(() => expect(runPosts).toHaveLength(1));
    expect(runPosts[0].body).not.toHaveProperty("attestation");
    expect(await screen.findByText(/could not be saved to the document library/)).toBeInTheDocument();
  });
});
