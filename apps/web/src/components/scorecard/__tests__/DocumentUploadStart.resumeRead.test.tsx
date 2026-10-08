/**
 * @vitest-environment jsdom
 *
 * "There was a network error while loading. I tried again and it said this
 * batch has already been processed, but it didn't take me to the next step."
 *
 * The paid read carries on server-side when the connection drops, and its
 * result is kept. The screen now COLLECTS it — never re-runs it, never charges
 * again — and carries on exactly as if the stream had finished: the signed
 * records are filed, the case is merged, the next step appears.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";
import { resumeTiming } from "@/lib/paidReadResume";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

const calls: Array<{ url: string; method: string }> = [];
const runPosts: Array<{ url: string; body: Record<string, unknown> }> = [];

/** How each scenario's server behaves. */
let authorizeReply: () => { status: number; body: unknown };
let streamReply: () => unknown;
let resultReplies: Array<{ status: number; body: unknown }>;
let settleReply: unknown;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A stream that sends its chunks, then fails the way a dropped connection does. */
function droppingStream(chunks: string[]) {
  const queue = [...chunks];
  return {
    getReader: () => ({
      read: async () => {
        const next = queue.shift();
        if (next !== undefined) return { done: false, value: new TextEncoder().encode(next) };
        throw new TypeError("network error");
      },
    }),
  };
}

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const signed = (filename: string) => ({ filename, payload: `{"typ":"okiru.parser-run","filename":"${filename}"}`, signature: `sig-${filename}` });

const RESULT = {
  case_id: "case-resumed",
  documents_detected: [
    { filename: "register.pdf", document_type: "Share register", status: "passed", parser_output: { filename: "register.pdf", status: "passed" } },
  ],
  documents_needing_review: [],
  ai_entities: { extractions: [{ documentId: "register", sourceFile: "register.pdf", element: "OWNERSHIP", values: [] }] },
  run_attestations: [signed("register.pdf")],
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      calls.push({ url, method: init?.method ?? "GET" });
      const files = body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];

      if (url.includes("/api/parser/document-types")) return json(CATALOG);
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } }, 201);
      if (url.endsWith("/runs")) {
        runPosts.push({ url, body: JSON.parse(String(body)) });
        return json({ run: {} }, 201);
      }
      if (url.includes("/api/parser/quote-files")) {
        const n = calls.filter((c) => c.url.includes("/api/parser/quote-files")).length;
        return json({
          data: {
            quoteId: `q-${n}`,
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
      if (url.includes("/api/tokens/authorize")) {
        const r = authorizeReply();
        return json(r.body, r.status);
      }
      if (url.includes("/api/parser/resolve-case-files-stream")) return { ok: true, status: 200, body: streamReply() };
      if (url.includes("/api/tokens/result/")) {
        const r = resultReplies.length > 1 ? resultReplies.shift()! : resultReplies[0];
        return json(r.body, r.status);
      }
      if (url.includes("/settle-outcome")) return json(settleReply);
      return json({});
    }) as unknown as typeof fetch,
  );
}

const named = (part: string) => calls.filter((c) => c.url.includes(part));

beforeEach(() => {
  calls.length = 0;
  runPosts.length = 0;
  sessionStorage.clear();
  // jsdom has no layout; the phase banner scrolls itself into view.
  Element.prototype.scrollIntoView = vi.fn();
  resumeTiming.intervalMs = 10;
  authorizeReply = () => ({ status: 200, body: { balance: 9_750 } });
  streamReply = () => droppingStream([sse("doc-start", { index: 0, fileName: "register.pdf" })]);
  resultReplies = [{ status: 200, body: { quoteId: "q-1", status: "done", result: RESULT, startedAt: 1, finishedAt: 2, maxRunMs: 7_200_000, serverNow: 3 } }];
  settleReply = { state: "settled", refundedTokens: 0, reason: "Every document produced values." };
  stubServer();
});

afterEach(() => {
  resumeTiming.intervalMs = 5_000;
});

async function uploadAndRead() {
  const user = userEvent.setup();
  render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
  await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF register"], "register.pdf", { type: "application/pdf" }));
  const read = await screen.findByTestId("button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
  return user;
}

describe("DocumentUploadStart — a paid read whose connection drops", () => {
  it("collects the read after the stream drops and carries on to the next step", async () => {
    await uploadAndRead();

    await screen.findByTestId("button-create-from-documents");
    // Collected, filed exactly as a finished stream files it — the signed record.
    expect(named("/api/tokens/result/q-1")).toHaveLength(1);
    await waitFor(() => expect(runPosts).toHaveLength(1));
    expect(runPosts[0].url).toBe("/api/parser-documents/doc-register.pdf/runs");
    expect(runPosts[0].body.attestation).toEqual({ payload: signed("register.pdf").payload, signature: "sig-register.pdf" });
    // One charge, one run.
    expect(named("/api/tokens/authorize")).toHaveLength(1);
    expect(named("/resolve-case-files-stream")).toHaveLength(1);
    await waitFor(() => expect(named("/settle-outcome").map((c) => c.url)).toEqual(["/api/tokens/runs/q-1/settle-outcome"]));
    expect(screen.queryByTestId("read-lost")).not.toBeInTheDocument();
    // Landed: nothing left to collect on a reload.
    expect(sessionStorage.getItem("okiru-create-scorecard-pending-read-v1")).toBeNull();
    expect(sessionStorage.getItem("okiru-create-scorecard-flow-v1")).toContain("case-resumed");
  });

  it("says the read carried on while it is still running, then finishes when it is done", async () => {
    resultReplies = [
      { status: 200, body: { status: "running", result: null, startedAt: 1, maxRunMs: 7_200_000, serverNow: 2 } },
      { status: 200, body: { status: "running", result: null, startedAt: 1, maxRunMs: 7_200_000, serverNow: 2 } },
      { status: 200, body: { status: "done", result: RESULT } },
    ];
    // Hold the third answer until the notice has been seen.
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/api/tokens/result/") && resultReplies.length === 1) await held;
      return original(input as never, init);
    });

    await uploadAndRead();
    expect(await screen.findByTestId("read-resume-notice")).toHaveTextContent(
      "Still reading your documents — your connection dropped but the read carried on",
    );
    release();
    await screen.findByTestId("button-create-from-documents");
    expect(named("/api/tokens/result/q-1").length).toBeGreaterThanOrEqual(3);
    expect(named("/resolve-case-files-stream")).toHaveLength(1);
  });

  it("collects instead of re-running when a retry is told the batch was already processed", async () => {
    authorizeReply = () => ({ status: 409, body: { message: "This batch has already been processed.", code: "QUOTE_ALREADY_USED", quoteId: "q-1" } });
    await uploadAndRead();

    await screen.findByTestId("button-create-from-documents");
    expect(named("/resolve-case-files-stream")).toHaveLength(0);
    expect(named("/api/tokens/result/q-1")).toHaveLength(1);
    await waitFor(() => expect(runPosts).toHaveLength(1));
    expect(screen.queryByText("This batch has already been processed.")).not.toBeInTheDocument();
  });

  it("says plainly when the read failed, whether the tokens come back, and offers to upload again", async () => {
    resultReplies = [{ status: 200, body: { status: "failed", result: null, reason: "the model was unavailable" } }];
    settleReply = {
      state: "settled",
      refundedTokens: 0,
      reason: "This kind of run does not report what it read, so it is not refunded automatically.",
    };
    const user = await uploadAndRead();

    const lost = await screen.findByTestId("read-lost");
    expect(lost).toHaveTextContent("the read did not finish (the model was unavailable)");
    expect(lost).toHaveTextContent("Your tokens were not refunded: This kind of run does not report what it read");
    expect(screen.queryByTestId("button-create-from-documents")).not.toBeInTheDocument();
    // Never a second run on the spent quote.
    expect(named("/resolve-case-files-stream")).toHaveLength(1);
    expect(named("/api/tokens/authorize")).toHaveLength(1);

    const quotesBefore = named("/api/parser/quote-files").length;
    await user.click(screen.getByTestId("button-read-upload-again"));
    await waitFor(() => expect(named("/api/parser/quote-files").length).toBe(quotesBefore + 1));
    expect(screen.queryByTestId("read-lost")).not.toBeInTheDocument();
  });

  it("names a refund when the settlement returned the tokens", async () => {
    resultReplies = [{ status: 404, body: { message: "No read is on record for this batch.", code: "RUN_NOT_FOUND" } }];
    settleReply = { state: "settled", refundedTokens: 250, reason: "The run stopped without finishing, so every token was returned." };
    await uploadAndRead();
    const lost = await screen.findByTestId("read-lost");
    expect(lost).toHaveTextContent("no finished read is on record for this batch");
    expect(lost).toHaveTextContent("250 tokens were returned to your balance.");
  });

  it("an add-documents round that drops is collected and merged with the first read", async () => {
    const payroll = {
      case_id: "case-round-2",
      documents_detected: [{ filename: "payroll.pdf", document_type: "Payroll", status: "passed", parser_output: { filename: "payroll.pdf", status: "passed" } }],
      documents_needing_review: [],
      ai_entities: { extractions: [] },
      run_attestations: [signed("payroll.pdf")],
    };
    let round = 0;
    streamReply = () => {
      round += 1;
      if (round === 1) {
        let sent = false;
        return {
          getReader: () => ({
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(sse("result", RESULT)) };
            },
          }),
        };
      }
      return droppingStream([sse("doc-start", { index: 0, fileName: "payroll.pdf" })]);
    };
    resultReplies = [{ status: 200, body: { status: "done", result: payroll } }];

    const user = await uploadAndRead();
    await screen.findByTestId("button-create-from-documents");
    await user.upload(screen.getByTestId("docs-file-input"), new File(["%PDF payroll"], "payroll.pdf", { type: "application/pdf" }));
    const read = await screen.findByTestId("button-read-now");
    await waitFor(() => expect(read).not.toBeDisabled());
    await user.click(read);

    await waitFor(() => expect(named("/api/tokens/result/q-2")).toHaveLength(1));
    await waitFor(() => expect(runPosts.map((p) => p.url)).toEqual([
      "/api/parser-documents/doc-register.pdf/runs",
      "/api/parser-documents/doc-payroll.pdf/runs",
    ]));
    await waitFor(() => expect(screen.queryByTestId("docs-unread-hint")).not.toBeInTheDocument());
    expect(named("/resolve-case-files-stream")).toHaveLength(2);
    expect(named("/api/tokens/authorize")).toHaveLength(2);
    expect(named("/api/tokens/result/q-1")).toHaveLength(0);
  });

  it("collects a read that was in flight when the page was reloaded", async () => {
    sessionStorage.setItem(
      "okiru-create-scorecard-pending-read-v1",
      JSON.stringify({ quoteId: "q-9", startedAt: "2026-10-08T08:00:00Z", fileNames: ["register.pdf"], documentIdsByName: { "register.pdf": "doc-register.pdf" } }),
    );
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    await screen.findByTestId("restored-run-banner");
    expect(named("/api/tokens/result/q-9")).toHaveLength(1);
    await waitFor(() => expect(runPosts).toHaveLength(1));
    expect(runPosts[0].url).toBe("/api/parser-documents/doc-register.pdf/runs");
    expect(named("/api/tokens/authorize")).toHaveLength(0);
    expect(named("/resolve-case-files-stream")).toHaveLength(0);
    expect(sessionStorage.getItem("okiru-create-scorecard-pending-read-v1")).toBeNull();
  });
});
