/**
 * @vitest-environment jsdom
 *
 * "Add documents" from inside a workbook section (C1): the reader is told
 * which pillar to look for, and only that pillar's sections are written —
 * what belongs elsewhere stays with its document and says where it belongs.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EsgDocumentUploadStart from "../EsgDocumentUploadStart";
import { esgUploadFocus } from "@/lib/esg/esgSectionElements";
import type { EsgInjectionResult } from "../esgParserInjection";

const calls: Array<{ url: string; files: string[]; focus: string | null }> = [];
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

/** A city power bill: one electricity figure for one site and month — an Environmental data cell. */
const ELECTRICITY = {
  grid: "esg_monthly_rows",
  cells: { "monthly.measure": "energy.electricity_kwh", "monthly.site": "ALDER", "monthly.period_end": "2025-07-31", "monthly.value": 111 },
  sourceFiles: ["city-power-oct.pdf"],
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files =
        body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];
      const focus = body instanceof FormData ? (body.get("focus_elements") as string | null) : null;
      calls.push({ url, files, focus });

      if (url.includes("/api/parser/esg/document-types")) return json({ data: { elements: [] } });
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } });
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
        const result = {
          status: "resolved",
          domain: "esg",
          documents: files.map((file_name) => ({ file_name })),
          ai_entities: {
            domain: "esg",
            extractions: files.map((sourceFile) => ({
              documentId: `doc:${sourceFile}`,
              sourceFile,
              element: "GHG_ENERGY",
              values: [{ field: "site_name", value: "ALDER", sourceFile }],
            })),
            calculator: { rows: [ELECTRICITY] },
          },
        };
        return { ok: true, status: 200, body: streamBody(sse("result", result)), json: async () => ({}) };
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      return json({});
    }) as unknown as typeof fetch,
  );
}

const named = (fragment: string) => calls.filter((c) => c.url.includes(fragment));

beforeEach(() => {
  calls.length = 0;
  quoteSeq = 0;
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  stubServer();
});

afterEach(() => vi.unstubAllGlobals());

/** Upload the bill, read it, and continue — returning what the workbook would be given. */
async function readAndContinue(ui: Parameters<typeof render>[0], onComplete: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup();
  render(ui);
  await user.upload(
    await screen.findByTestId("esg-docs-file-input"),
    new File(["%PDF a"], "city-power-oct.pdf", { type: "application/pdf" }),
  );
  const read = await screen.findByTestId("esg-button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
  const proceed = await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });
  await waitFor(() => expect(proceed).not.toBeDisabled());
  await user.click(proceed);
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  return (onComplete.mock.calls[0]![0] as { injection: EsgInjectionResult }).injection;
}

describe("EsgDocumentUploadStart — documents added from inside a section", () => {
  it("says what the focus means before anything is read", async () => {
    render(
      <EsgDocumentUploadStart
        companyId="company-1"
        companyName="Example Trading"
        onComplete={vi.fn(async () => {})}
        focus={esgUploadFocus("fleet", "Fleet register")}
      />,
    );
    const banner = await screen.findByTestId("esg-upload-focus");
    expect(banner).toHaveTextContent("Adding documents to Fleet register");
    expect(banner).toHaveTextContent("Environmental data");
  });

  it("tells the reader the section's element, and writes nothing outside the section", async () => {
    const onComplete = vi.fn(async () => {});
    const injection = await readAndContinue(
      <EsgDocumentUploadStart
        companyId="company-1"
        companyName="Example Trading"
        onComplete={onComplete}
        focus={esgUploadFocus("waste", "Waste register")}
      />,
      onComplete,
    );

    // A lone element is the hint for every file the person did not file themselves.
    expect(JSON.parse(named("/resolve-case-files-stream")[0]!.focus!)).toEqual({ "city-power-oct.pdf": "WASTE" });
    // The bill's electricity belongs in Environmental data — held back, not written,
    // and the review says so.
    expect(injection.patches["e-data"]).toBeUndefined();
    expect(injection.outsideFocus).toEqual([{ sectionId: "e-data", figures: 1 }]);
    expect(screen.getByTestId("esg-outside-focus")).toHaveTextContent("1 figure for Environmental data");
  });

  it("writes the pillar's own sections, and leaves the reader's classifier alone for a mixed pillar", async () => {
    const onComplete = vi.fn(async () => {});
    const injection = await readAndContinue(
      <EsgDocumentUploadStart
        companyId="company-1"
        companyName="Example Trading"
        onComplete={onComplete}
        focus={esgUploadFocus("e-data", "Environmental data")}
      />,
      onComplete,
    );

    expect(named("/resolve-case-files-stream")[0]!.focus).toBeNull();
    expect(injection.patches["e-data"]?.cells).toMatchObject({ s2_C14: 111 });
    expect(injection.outsideFocus).toEqual([]);
    expect(screen.queryByTestId("esg-outside-focus")).not.toBeInTheDocument();
  });

  it("sends no focus at all from the whole-workbook upload", async () => {
    const onComplete = vi.fn(async () => {});
    await readAndContinue(
      <EsgDocumentUploadStart companyId="company-1" companyName="Example Trading" onComplete={onComplete} />,
      onComplete,
    );
    expect(screen.queryByTestId("esg-upload-focus")).not.toBeInTheDocument();
    expect(named("/resolve-case-files-stream")[0]!.focus).toBeNull();
  });
});

describe("EsgDocumentUploadStart — the new-company resume snapshot", () => {
  it("is kept for the create flow, where there is no company yet", async () => {
    const onComplete = vi.fn(async () => {});
    await readAndContinue(<EsgDocumentUploadStart companyId="" onComplete={onComplete} />, onComplete);
    expect(sessionStorage.getItem("okiru-esg-create-flow-v1")).not.toBeNull();
  });

  it("is never written from an existing company's workbook — it would offer that company's documents back as a new company", async () => {
    const onComplete = vi.fn(async () => {});
    await readAndContinue(
      <EsgDocumentUploadStart companyId="company-1" companyName="Example Trading" onComplete={onComplete} />,
      onComplete,
    );
    expect(sessionStorage.getItem("okiru-esg-create-flow-v1")).toBeNull();
  });
});
