/**
 * @vitest-environment jsdom
 *
 * The ESG document step after the read, as a person meets it:
 *  - a paid read is never thrown away in one click — the way back asks first,
 *    and in the create flow it says what it does ("Start again");
 *  - the read is kept for the create flow the moment it lands, not on Continue;
 *  - the summary counts documents in the review's own words;
 *  - a document that could not be read stays named after another round;
 *  - while new documents wait, the earlier summary folds and Continue is not
 *    the main button;
 *  - Continue hands over each upload's library id by name (for previews later);
 *  - a read handed back (`resume`) is shown again, never an empty drop zone.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EsgDocumentUploadStart from "../EsgDocumentUploadStart";
import type { EsgParserCaseLike } from "../esgParserInjection";

const calls: Array<{ url: string; files: string[] }> = [];
let quoteSeq = 0;

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

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** A scan the parser cannot read; a bill with a note that needs a person; anything else read cleanly. */
function caseFor(files: string[]): EsgParserCaseLike {
  const readable = files.filter((f) => !f.endsWith(".png"));
  return {
    status: "resolved",
    domain: "esg",
    documents: files.map((file_name) => ({ file_name })),
    ai_entities: {
      extractions: readable.map((sourceFile) => ({
        documentId: `doc:${sourceFile}`,
        sourceFile,
        element: "GHG_ENERGY",
        values: [{ field: "site_name", value: "Site A", sourceFile }],
        ...(sourceFile.startsWith("bill") ? { exceptions: ["The supply address names no site in the pack."] } : {}),
      })),
      calculator: {
        rows: readable.map((file, i) => ({
          grid: "esg_monthly_rows",
          cells: { "monthly.measure": "energy.electricity_kwh", "monthly.site": "Site A", "monthly.period_end": `2025-0${7 + i}-28`, "monthly.value": 100 + i },
          sourceFiles: [file],
        })),
      },
    },
  } as unknown as EsgParserCaseLike;
}

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files =
        body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];
      calls.push({ url, files });
      if (url.includes("/api/parser/esg/document-types")) return json({ data: { elements: [] } });
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `lib-${files[0]}` } });
      if (url.includes("/api/parser-documents/") && url.endsWith("/runs")) return json({});
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
      if (url.includes("/api/tokens/authorize")) return json({ balance: 4880 });
      if (url.includes("/api/parser/esg/resolve-case-files-stream")) {
        const events = [
          ...files.map((fileName) =>
            fileName.endsWith(".png") ? sse("doc-error", { fileName, message: "No readable text" }) : sse("doc-done", { fileName }),
          ),
          sse("result", caseFor(files)),
        ].join("");
        return { ok: true, status: 200, body: streamBody(events), json: async () => ({}) };
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      return json({});
    }) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  calls.length = 0;
  quoteSeq = 0;
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  stubServer();
});

afterEach(() => vi.unstubAllGlobals());

const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" });
const png = (name: string) => new File(["png"], name, { type: "image/png" });

async function readFromBar(user: ReturnType<typeof userEvent.setup>) {
  const read = await screen.findByTestId("esg-button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
}

async function readOnce(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  await user.upload(await screen.findByTestId("esg-docs-file-input"), files);
  await readFromBar(user);
  await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });
  await waitFor(() => expect(screen.getByTestId("esg-button-continue-to-workbook")).not.toBeDisabled());
}

describe("EsgDocumentUploadStart — after the read", () => {
  it("never throws a paid read away in one click: the create flow asks, then starts again", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<EsgDocumentUploadStart companyId="" onComplete={vi.fn(async () => {})} onBack={onBack} />);

    // Before anything is read, the way back costs nothing and asks nothing.
    expect(screen.getByTestId("esg-upload-back")).toHaveTextContent("Choose a different way to start");

    await readOnce(user, [pdf("meter.pdf")]);
    // The read is kept for the create flow the moment it lands — not when Continue is pressed.
    expect(sessionStorage.getItem("okiru-esg-create-flow-v1")).toContain("meter.pdf");

    const back = screen.getByTestId("esg-upload-back");
    expect(back).toHaveTextContent("Start again");
    await user.click(back);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("esg-upload-back-confirm")).toHaveTextContent("discard what was read");

    await user.click(screen.getByTestId("esg-upload-back-cancel"));
    expect(screen.queryByTestId("esg-upload-back-confirm")).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(back);
    await user.click(screen.getByTestId("esg-upload-back-confirm-yes"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("inside a workbook, the way back keeps saying where it goes, and still asks", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <EsgDocumentUploadStart companyId="company-1" backLabel="Back to Environmental data" onComplete={vi.fn(async () => {})} onBack={onBack} />,
    );
    expect(screen.getByTestId("esg-upload-back")).toHaveTextContent("Back to Environmental data");
    await readOnce(user, [pdf("meter.pdf")]);
    expect(screen.getByTestId("esg-upload-back")).toHaveTextContent("Back to Environmental data");
    await user.click(screen.getByTestId("esg-upload-back"));
    expect(screen.getByTestId("esg-upload-back-confirm")).toHaveTextContent("Leave without adding these figures?");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("counts documents in the summary the way the review does", async () => {
    const user = userEvent.setup();
    render(<EsgDocumentUploadStart companyId="company-1" onComplete={vi.fn(async () => {})} />);
    await readOnce(user, [pdf("bill-site-b.pdf"), pdf("meter.pdf")]);
    expect(screen.getByTestId("review-counts")).toHaveTextContent("1 needs a look");
    expect(screen.getByTestId("esg-summary-headline")).toHaveTextContent("1 document needs a look");
  });

  it("keeps naming a document that could not be read after another round", async () => {
    const user = userEvent.setup();
    render(<EsgDocumentUploadStart companyId="company-1" onComplete={vi.fn(async () => {})} />);
    await readOnce(user, [png("scan.png"), pdf("meter.pdf")]);
    expect(screen.getByTestId("esg-failed-documents")).toHaveTextContent("scan.png");

    await readOnce(user, [pdf("second-meter.pdf")]);
    expect(screen.getByTestId("esg-failed-documents")).toHaveTextContent("scan.png");
    expect(within(screen.getByTestId("document-review")).getByTestId("review-doc-scan.png")).toBeInTheDocument();
  });

  it("while new documents wait, folds the earlier summary and keeps Continue from looking like the next step", async () => {
    const user = userEvent.setup();
    render(<EsgDocumentUploadStart companyId="company-1" onComplete={vi.fn(async () => {})} />);
    await readOnce(user, [png("scan.png"), pdf("meter.pdf")]);
    const continueButton = screen.getByTestId("esg-button-continue-to-workbook");
    // The read's own step: Continue is the one filled button.
    expect(continueButton.className).toContain("esg-acc-e");

    await user.upload(screen.getByTestId("esg-docs-file-input"), pdf("second-meter.pdf"));
    await screen.findByTestId("esg-read-bar");
    expect(continueButton).toBeDisabled();
    expect(continueButton.className).not.toContain("esg-acc-e");
    expect(screen.getByTestId("esg-continue-helper")).toHaveTextContent("Read the new documents first");
    // The summary is one line now: its notices and coverage wait for the new read.
    const summary = screen.getByTestId("esg-extraction-summary");
    expect(within(summary).queryByTestId("esg-failed-documents")).not.toBeInTheDocument();
    expect(within(summary).queryByTestId("esg-element-coverage")).not.toBeInTheDocument();
    expect(within(summary).getByTestId("esg-summary-headline")).toBeInTheDocument();
  });

  it("hands over each upload's library id by name, so a later step can preview it", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(async (_result: { documentIdsByName?: Record<string, string> }) => {});
    render(<EsgDocumentUploadStart companyId="" onComplete={onComplete} />);
    await readOnce(user, [pdf("meter.pdf")]);
    await user.click(screen.getByTestId("esg-button-continue-to-workbook"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0]![0].documentIdsByName).toEqual({ "meter.pdf": "lib-meter.pdf" });
    expect(sessionStorage.getItem("okiru-esg-create-flow-v1")).toContain("lib-meter.pdf");
  });

  it("shows a read handed back to it — summary, review and Continue — not an empty drop zone", async () => {
    render(
      <EsgDocumentUploadStart
        companyId=""
        onComplete={vi.fn(async () => {})}
        resume={{ parserCase: caseFor(["meter.pdf"]), documentIdsByName: { "meter.pdf": "lib-meter.pdf" } }}
      />,
    );
    expect(await screen.findByTestId("esg-extraction-summary")).toBeInTheDocument();
    expect(within(screen.getByTestId("document-review")).getByTestId("review-doc-meter.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("esg-button-continue-to-workbook")).not.toBeDisabled();
    // Nothing is read or charged again.
    expect(calls.filter((c) => c.url.includes("/resolve-case-files-stream"))).toHaveLength(0);
  });
});
