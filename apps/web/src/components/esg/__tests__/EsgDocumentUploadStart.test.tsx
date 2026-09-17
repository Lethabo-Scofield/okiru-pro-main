/**
 * @vitest-environment jsdom
 *
 * The ESG bulk upload has to behave exactly like the B-BBEE one in the places
 * that cost people money or trust:
 *
 *   - it prices against the ESG parser endpoints, not the B-BBEE ones;
 *   - nothing is read before tokens are authorised, and a 402 says how short
 *     you are rather than failing vaguely;
 *   - "Done adding" always leaves a visible way forward, even when pricing
 *     failed (the dead end the B-BBEE flow had to be fixed for);
 *   - and — the one that is specific to ESG — a value the mapping layer cannot
 *     place EXACTLY is listed and explained, instead of being written to a
 *     plausible-looking cell or implying a workbook was filled in.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EsgDocumentUploadStart from "../EsgDocumentUploadStart";

/** Exactly what `GET /api/parser/esg/document-types` returns (`ok(...)` wrapped). */
const DOC_TYPES = {
  success: true,
  error: null,
  data: {
    domain: "esg",
    elements: [
      {
        element: "GHG_ENERGY",
        documentCount: 1,
        documents: [
          {
            id: "ghg_energy__municipal_electricity_bill",
            name: "Municipal electricity bill",
            aliases: ["municipal account"],
            whatTheAuditorTests: "Confirms Scope 2 grid electricity per site.",
            exampleOfGoodData: "35,332 kWh",
            expectedFields: ["site_name", "electricity_kwh"],
          },
        ],
      },
    ],
    totalDocuments: 1,
  },
};

const QUOTE = {
  quoteId: "q-esg-1",
  currency: "ZAR",
  model: "test",
  files: [
    {
      filename: "city-power-oct.pdf",
      detectedDocumentType: "Municipal electricity bill",
      kind: "pdf",
      requiresOcr: false,
      tokens: { basis: "text", input: 4200, band: null },
      structure: { pages: 3, sheets: null, rows: null },
      pricing: { extractionCents: 40, isUpperBound: false },
      reasons: [],
    },
  ],
  totals: {
    predictedInputTokens: 4200,
    predictedOutputTokens: 900,
    azureCents: 0,
    totalCents: 40,
    isUpperBound: false,
  },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  notes: [],
  paymentRequired: true,
};

/** One SSE frame, exactly as the parser emits it. */
function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * The ESG `result` payload, in the parser's OWN shape.
 *
 * Note what is NOT here: `documents_detected`. The ESG routes report the file
 * list as `documents: [{file_name}]` and leave the verdict to be derived from
 * the extractions. A client that assumed the B-BBEE key would archive nothing
 * and show every file as "Quoted" forever, silently — hence this fixture.
 */
const RESULT_CASE = {
  status: "resolved",
  case_id: "esg-case-1",
  domain: "esg",
  documents: [{ file_name: "city-power-oct.pdf" }],
  ai_entities: {
    domain: "esg",
    extractions: [
      {
        documentId: "ghg_energy__municipal_electricity_bill",
        documentName: "Municipal electricity bill / utility statement",
        sourceFile: "city-power-oct.pdf",
        element: "GHG_ENERGY",
        values: [
          {
            field: "site_name",
            value: "ISANDO",
            sourceFile: "city-power-oct.pdf",
            sourceDocumentId: "ghg_energy__municipal_electricity_bill",
          },
          {
            field: "electricity_kwh",
            value: 35332,
            sourceFile: "city-power-oct.pdf",
            sourceDocumentId: "ghg_energy__municipal_electricity_bill",
          },
        ],
        missingFields: ["max_demand_kva"],
        unexpectedFields: [],
        exceptions: ["Billing period ends 31 Oct 2025, one day outside the reporting period."],
      },
    ],
    /*
     * The parser's own calculator mapping, as it arrives on the wire: matrix
     * field names already turned into allowlisted keys.
     *
     * This bill states a site and a figure but NO billing period, which is the
     * realistic worst case for the electricity grid — the environmental sheet
     * records kWh per site per MONTH, so without a period there is no cell to
     * put 35,332 in, and the flow has to say so rather than pick a month.
     */
    calculator: {
      payload: { "energy.site_name": "ISANDO", "energy.electricity_kwh": 35332 },
      entries: [
        {
          key: "energy.site_name",
          value: "ISANDO",
          sourceField: "site_name",
          sourceFiles: ["city-power-oct.pdf"],
          agreementCount: 1,
        },
        {
          key: "energy.electricity_kwh",
          value: 35332,
          sourceField: "electricity_kwh",
          sourceFiles: ["city-power-oct.pdf"],
          agreementCount: 1,
        },
      ],
      rows: [],
      unmapped: [],
      needsReview: [],
    },
  },
  esg_entities: null,
};

function streamBody(frames: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= frames.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(frames[index++]) };
        },
      };
    },
  };
}

interface StubOptions {
  quoteOk?: boolean;
  tokenCost?: Record<string, unknown> | null;
  authorizeStatus?: number;
  authorizeBody?: Record<string, unknown>;
  frames?: string[];
}

function stubFetch(options: StubOptions = {}) {
  const {
    quoteOk = true,
    tokenCost = {
      quoteId: "q-esg-1",
      tokens: 120,
      balance: 5000,
      balanceAfter: 4880,
      sufficient: true,
      shortfall: 0,
      alreadyAuthorized: false,
    },
    authorizeStatus = 200,
    authorizeBody = { balance: 4880 },
    frames = [
      sse("doc-start", { fileName: "city-power-oct.pdf" }),
      sse("doc-done", { fileName: "city-power-oct.pdf" }),
      sse("resolving", { total: 1 }),
      sse("resolve-progress", { done: 1, total: 1 }),
      sse("result", RESULT_CASE),
      sse("complete", {}),
    ],
  } = options;

  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);

    if (url.includes("/api/parser/esg/document-types")) {
      return { ok: true, status: 200, json: async () => DOC_TYPES };
    }
    if (url.includes("/api/parser-documents/") && url.endsWith("/runs")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.includes("/api/parser-documents/upload")) {
      return { ok: true, status: 200, json: async () => ({ document: { id: "doc-1" } }) };
    }
    if (url.includes("/api/parser/esg/quote-files")) {
      return quoteOk
        ? { ok: true, status: 200, json: async () => QUOTE }
        : { ok: false, status: 500, json: async () => ({}) };
    }
    if (url.includes("/api/tokens/quote/")) {
      return tokenCost
        ? { ok: true, status: 200, json: async () => tokenCost }
        : { ok: false, status: 404, json: async () => ({}) };
    }
    if (url.includes("/api/tokens/authorize")) {
      return {
        ok: authorizeStatus === 200,
        status: authorizeStatus,
        json: async () => authorizeBody,
      };
    }
    if (url.includes("/api/parser/esg/resolve-case-files-stream")) {
      return { ok: true, status: 200, body: streamBody(frames), json: async () => ({}) };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return { calls, fetchMock };
}

type CompleteArg = { injection: { implemented: boolean; patches: unknown; valuesRead: number } };

function renderUpload(onComplete = vi.fn(async (_result: CompleteArg) => {})) {
  render(
    <EsgDocumentUploadStart
      companyId="company-1"
      companyName="Lake Trading"
      onComplete={onComplete}
    />,
  );
  return onComplete;
}

async function stageAFile() {
  const user = userEvent.setup();
  const input = (await screen.findByTestId("esg-docs-file-input")) as HTMLInputElement;
  await user.upload(
    input,
    new File(["%PDF-1.4 city power"], "city-power-oct.pdf", { type: "application/pdf" }),
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no layout, so scrollIntoView does not exist. The component uses
  // it to carry the user to the phase banner.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EsgDocumentUploadStart — the money-and-trust path", () => {
  it("prices against the ESG parser endpoints and never the B-BBEE ones", async () => {
    const { calls } = stubFetch();
    renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());

    expect(calls).toContain("POST /api/parser/esg/quote-files");
    // The B-BBEE endpoints must not be touched — they price a different matrix.
    expect(calls.some((c) => c.endsWith("/api/parser/quote-files"))).toBe(false);
    expect(calls.some((c) => c.includes("/api/parser/required-documents"))).toBe(false);
    // The file is archived BEFORE any paid work, same as the B-BBEE flow.
    expect(calls).toContain("POST /api/parser-documents/upload");
    // Token pricing goes through the shared wallet, not an ESG-specific path.
    expect(calls.some((c) => c.includes("/api/tokens/quote/q-esg-1"))).toBe(true);

    await user.click(done);
    expect(await screen.findByTestId("esg-payment-summary")).toBeInTheDocument();
  });

  it("reads the documents, and then says plainly that nothing reached the workbook", async () => {
    const { calls } = stubFetch();
    const onComplete = renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);

    await user.click(await screen.findByTestId("esg-button-spend-tokens"));

    // The reveal arrives with the honest account of the read.
    const summary = await screen.findByTestId("esg-extraction-summary", {}, { timeout: 10_000 });
    expect(summary).toHaveTextContent("2 values read");
    // The mapping layer is built, so the "not built yet" banner is gone — but
    // this bill carries no billing period, so neither value has a cell it can
    // go in. The user is told that in the panel, not by discovering an empty
    // workbook later.
    expect(screen.queryByTestId("esg-mapping-not-implemented")).not.toBeInTheDocument();
    // And the real values are listed rather than swallowed.
    expect(screen.getByTestId("esg-unplaced-values")).toHaveTextContent("35332");
    // The extraction's own exception reaches the user — this is the line an
    // assurance provider will ask about.
    expect(screen.getByTestId("esg-extraction-exceptions")).toHaveTextContent(
      /one day outside the reporting period/i,
    );
    // The file's verdict is derived from its extraction, not from a key the
    // ESG parser does not send.
    expect(screen.getByTestId("esg-docs-file-input").closest("div")).toBeTruthy();
    expect(screen.getByText("Read")).toBeInTheDocument();

    // The paid read happened over the ESG stream, and every document got an
    // immutable run record in the shared library.
    expect(calls).toContain("POST /api/tokens/authorize");
    expect(calls).toContain("POST /api/parser/esg/resolve-case-files-stream");
    expect(calls).toContain("POST /api/parser-documents/doc-1/runs");
    // Nothing was written to the workbook, because nothing was mapped.
    expect(calls.some((c) => c.includes("/api/esg/workbook/"))).toBe(false);

    await user.click(screen.getByTestId("esg-button-continue-to-workbook"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const handed = onComplete.mock.calls[0]![0];
    expect(handed.injection.implemented).toBe(true);
    // Still empty, and now for a stated reason rather than a missing layer.
    expect(handed.injection.patches).toEqual({});
    expect(handed.injection.valuesRead).toBe(2);
  });

  it("names the shortfall instead of failing vaguely when tokens run out", async () => {
    stubFetch({
      tokenCost: {
        quoteId: "q-esg-1",
        tokens: 900,
        balance: 120,
        balanceAfter: -780,
        sufficient: false,
        shortfall: 780,
        alreadyAuthorized: false,
      },
    });
    renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);

    const panel = await screen.findByTestId("esg-insufficient-tokens");
    expect(panel).toHaveTextContent("780 tokens short");
    // And the one control that would spend money is off.
    expect(screen.getByTestId("esg-button-spend-tokens")).toBeDisabled();
  });

  it("never leaves a blank screen when pricing fails", async () => {
    stubFetch({ quoteOk: false });
    renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);

    // The staging bar is gone, so something must stand in its place.
    expect(screen.queryByTestId("esg-button-done-staging")).not.toBeInTheDocument();
    expect(await screen.findByTestId("esg-quote-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("esg-button-retry-quote")).toBeInTheDocument();

    await user.click(screen.getByTestId("esg-button-back-to-staging"));
    expect(await screen.findByTestId("esg-button-done-staging")).toBeInTheDocument();
  });

  it("says so when the documents were read but produced nothing", async () => {
    const { calls } = stubFetch({
      frames: [
        sse("doc-start", { fileName: "city-power-oct.pdf" }),
        sse("doc-error", { fileName: "city-power-oct.pdf", message: "unreadable scan" }),
        // `extractEsgCaseEntities` returns null when nothing was extracted, so
        // `ai_entities` is genuinely null here — not an empty object.
        sse("result", {
          status: "failed",
          case_id: "esg-case-2",
          domain: "esg",
          documents: [{ file_name: "city-power-oct.pdf" }],
          ai_entities: null,
          esg_entities: null,
        }),
        sse("complete", {}),
      ],
    });
    renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);
    await user.click(await screen.findByTestId("esg-button-spend-tokens"));

    expect(await screen.findByTestId("esg-zero-extraction", {}, { timeout: 10_000 })).toBeInTheDocument();
    // The specific file that failed is named, so the user replaces one document
    // rather than re-uploading the whole pack.
    expect(await screen.findByTestId("esg-failed-documents")).toHaveTextContent("city-power-oct.pdf");
    // No fabricated count anywhere.
    expect(screen.getByTestId("esg-extraction-summary")).toHaveTextContent("0 values read");
    // The paid read still leaves an archive: a failure that is not recorded is
    // a failure the user cannot show anyone.
    expect(calls).toContain("POST /api/parser-documents/doc-1/runs");
  });

  it("surfaces a stream error rather than spinning forever", async () => {
    stubFetch({
      frames: [
        sse("doc-start", { fileName: "city-power-oct.pdf" }),
        sse("error", { message: "The extraction worker died" }),
      ],
    });
    renderUpload();
    const user = await stageAFile();

    const done = await screen.findByTestId("esg-button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);
    await user.click(await screen.findByTestId("esg-button-spend-tokens"));

    expect(await screen.findByTestId("esg-parse-error", {}, { timeout: 10_000 })).toHaveTextContent(
      "The extraction worker died",
    );
    expect(screen.queryByTestId("esg-extraction-phase")).not.toBeInTheDocument();
  });
});
