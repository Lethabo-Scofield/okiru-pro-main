/**
 * @vitest-environment jsdom
 *
 * The ESG side of a paid read whose connection drops: the run reads on
 * server-side and its result is kept, so the screen COLLECTS it — never re-runs
 * it, never charges again — and carries on as if the stream had finished.
 * The "add documents" round is the same path, so it is covered here too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EsgDocumentUploadStart from "../EsgDocumentUploadStart";
import { resumeTiming } from "@/lib/paidReadResume";

const calls: Array<{ url: string; files: string[] }> = [];
const runPosts: Array<{ url: string; body: Record<string, unknown> }> = [];
let quoteSeq = 0;

let authorizeReplies: Array<{ status: number; body: unknown }>;
let streamReplies: Array<() => unknown>;
let resultReplies: Array<{ status: number; body: unknown }>;
let settleReply: unknown;

const sse = (event: string, payload: unknown) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

function streamBody(text: string) {
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

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const signed = (filename: string) => ({ filename, payload: `{"typ":"okiru.parser-run","filename":"${filename}"}`, signature: `sig-${filename}` });

const resultFor = (file: string) => ({
  status: "resolved",
  domain: "esg",
  documents: [{ file_name: file }],
  ai_entities: {
    domain: "esg",
    extractions: [{ documentId: `doc:${file}`, sourceFile: file, element: "GHG_ENERGY", values: [{ field: "site_name", value: "INVENTED SITE", sourceFile: file }] }],
  },
  run_attestations: [signed(file)],
});

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files = body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];
      calls.push({ url, files });

      if (url.includes("/api/parser/esg/document-types")) return json({ data: { elements: [] } });
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } });
      if (url.includes("/api/parser-documents/") && url.endsWith("/runs")) {
        runPosts.push({ url, body: JSON.parse(String(body)) });
        return json({});
      }
      if (url.includes("/api/parser/esg/quote-files")) {
        quoteSeq += 1;
        return json({
          quoteId: `q-${quoteSeq}`,
          paymentRequired: true,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          totals: { isUpperBound: false },
          files: files.map((filename) => ({ filename, requiresOcr: false, tokens: { input: 100 }, structure: { pages: 1 } })),
        });
      }
      if (url.includes("/api/tokens/quote/")) {
        return json({ tokens: 120, balance: 5000, balanceAfter: 4880, sufficient: true, shortfall: 0, alreadyAuthorized: false });
      }
      if (url.includes("/api/tokens/authorize")) {
        const r = authorizeReplies.length > 1 ? authorizeReplies.shift()! : authorizeReplies[0];
        return json(r.body, r.status);
      }
      if (url.includes("/api/parser/esg/resolve-case-files-stream")) {
        const next = streamReplies.length > 1 ? streamReplies.shift()! : streamReplies[0];
        return { ok: true, status: 200, body: next(), json: async () => ({}) };
      }
      if (url.includes("/api/tokens/result/")) {
        const r = resultReplies.length > 1 ? resultReplies.shift()! : resultReplies[0];
        return json(r.body, r.status);
      }
      if (url.includes("/settle-outcome")) return json(settleReply);
      return json({});
    }) as unknown as typeof fetch,
  );
}

const named = (fragment: string) => calls.filter((c) => c.url.includes(fragment));

beforeEach(() => {
  calls.length = 0;
  runPosts.length = 0;
  quoteSeq = 0;
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  resumeTiming.intervalMs = 10;
  authorizeReplies = [{ status: 200, body: { balance: 4880 } }];
  streamReplies = [() => droppingStream([sse("doc-start", { index: 0, fileName: "city-power-oct.pdf" })])];
  resultReplies = [{ status: 200, body: { status: "done", result: resultFor("city-power-oct.pdf"), startedAt: 1, finishedAt: 2, maxRunMs: 7_200_000, serverNow: 3 } }];
  settleReply = { state: "settled", refundedTokens: 0, reason: "Every document produced values." };
  stubServer();
});

afterEach(() => {
  resumeTiming.intervalMs = 5_000;
  vi.unstubAllGlobals();
});

async function uploadAndRead(name = "city-power-oct.pdf") {
  const user = userEvent.setup();
  render(<EsgDocumentUploadStart companyId="company-1" companyName="Invented Co" onComplete={vi.fn(async () => {})} />);
  await user.upload(await screen.findByTestId("esg-docs-file-input"), new File(["%PDF a"], name, { type: "application/pdf" }));
  const read = await screen.findByTestId("esg-button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
  return user;
}

describe("EsgDocumentUploadStart — a paid read whose connection drops", () => {
  it("collects the read after the stream drops and carries on to the workbook step", async () => {
    await uploadAndRead();
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });

    expect(named("/api/tokens/result/q-1")).toHaveLength(1);
    await waitFor(() => expect(runPosts).toHaveLength(1));
    expect(runPosts[0].body).toEqual({ attestation: { payload: signed("city-power-oct.pdf").payload, signature: "sig-city-power-oct.pdf" } });
    expect(named("/api/tokens/authorize")).toHaveLength(1);
    expect(named("/resolve-case-files-stream")).toHaveLength(1);
    await waitFor(() => expect(named("/settle-outcome").map((c) => c.url)).toEqual(["/api/tokens/runs/q-1/settle-outcome"]));
    expect(sessionStorage.getItem("okiru-esg-pending-read-v1:company-1")).toBeNull();
  });

  it("says the read carried on while it is still running, and polls until it is done", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    resultReplies = [
      { status: 200, body: { status: "running", result: null, startedAt: 1, maxRunMs: 7_200_000, serverNow: 2 } },
      { status: 200, body: { status: "done", result: resultFor("city-power-oct.pdf") } },
    ];
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/api/tokens/result/") && resultReplies.length === 1) await held;
      return original(input as never, init);
    });

    await uploadAndRead();
    expect(await screen.findByTestId("esg-read-resume-notice")).toHaveTextContent(
      "Still reading your documents — your connection dropped but the read carried on",
    );
    release();
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });
    expect(named("/api/tokens/result/q-1").length).toBeGreaterThanOrEqual(2);
  });

  it("collects instead of re-running when a retry is told the batch was already processed", async () => {
    authorizeReplies = [{ status: 409, body: { message: "This batch has already been processed.", code: "QUOTE_ALREADY_USED" } }];
    await uploadAndRead();
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });
    expect(named("/resolve-case-files-stream")).toHaveLength(0);
    await waitFor(() => expect(runPosts).toHaveLength(1));
  });

  it("says when the read failed, that the tokens came back, and offers to upload again", async () => {
    resultReplies = [{ status: 200, body: { status: "failed", result: null, reason: "model unavailable" } }];
    settleReply = { state: "settled", refundedTokens: 120, reason: "The run failed, so every token was returned." };
    const user = await uploadAndRead();

    const lost = await screen.findByTestId("esg-read-lost", {}, { timeout: 10_000 });
    expect(lost).toHaveTextContent("the read did not finish (model unavailable)");
    expect(lost).toHaveTextContent("120 tokens were returned to your balance.");
    expect(screen.queryByTestId("esg-button-continue-to-workbook")).not.toBeInTheDocument();
    expect(named("/resolve-case-files-stream")).toHaveLength(1);

    await user.click(screen.getByTestId("esg-button-read-upload-again"));
    await waitFor(() => expect(named("/api/parser/esg/quote-files")).toHaveLength(2));
  });

  it("an add-documents round that drops is collected and merged with the first read", async () => {
    // Round one streams normally; round two drops and is collected.
    streamReplies = [
      () => streamBody(sse("result", resultFor("city-power-oct.pdf"))),
      () => droppingStream([sse("doc-start", { index: 0, fileName: "diesel-oct.pdf" })]),
    ];
    resultReplies = [{ status: 200, body: { status: "done", result: resultFor("diesel-oct.pdf") } }];
    const user = await uploadAndRead();
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });

    await user.upload(screen.getByTestId("esg-docs-file-input"), new File(["%PDF b"], "diesel-oct.pdf", { type: "application/pdf" }));
    const read = await screen.findByTestId("esg-button-read-now");
    await waitFor(() => expect(read).not.toBeDisabled());
    await user.click(read);

    await waitFor(() => expect(named("/api/tokens/result/q-2")).toHaveLength(1));
    await waitFor(() => expect(runPosts.map((p) => p.url)).toEqual([
      "/api/parser-documents/doc-city-power-oct.pdf/runs",
      "/api/parser-documents/doc-diesel-oct.pdf/runs",
    ]));
    expect(await screen.findByTestId("esg-button-continue-to-workbook")).not.toBeDisabled();
    expect(named("/resolve-case-files-stream")).toHaveLength(2);
    expect(named("/api/tokens/authorize")).toHaveLength(2);
  });
});
