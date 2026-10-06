/**
 * @vitest-environment jsdom
 *
 * The ESG side of "a user forgot to add a document": after the read, a new
 * file is priced, charged and read ON ITS OWN, merged into what was read
 * before, and the files already read are never sent or charged again.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EsgDocumentUploadStart from "../EsgDocumentUploadStart";

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

/** One site × month figure per file, as the parser's dashboard readers emit them. */
const MONTHLY_FIGURE: Record<string, Array<Record<string, unknown>>> = {
  "city-power-oct.pdf": [{
    grid: "esg_monthly_rows",
    cells: { "monthly.measure": "energy.electricity_kwh", "monthly.site": "BLOEM", "monthly.period_end": "2025-07-31", "monthly.value": 111 },
    sourceFiles: ["city-power-oct.pdf"],
  }],
  "diesel-oct.pdf": [{
    grid: "esg_monthly_rows",
    cells: { "monthly.measure": "fleet.diesel_litres", "monthly.site": "DBN", "monthly.period_end": "2025-08-31", "monthly.value": 222 },
    sourceFiles: ["diesel-oct.pdf"],
  }],
};

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
              values: [{ field: "site_name", value: "ISANDO", sourceFile }],
            })),
            // Each round's own monthly figure — the half the workbook is filled from.
            calculator: { rows: files.flatMap((file) => MONTHLY_FIGURE[file] ?? []) },
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

async function readFromBar(user: ReturnType<typeof userEvent.setup>) {
  const read = await screen.findByTestId("esg-button-read-now");
  await waitFor(() => expect(read).not.toBeDisabled());
  await user.click(read);
}

describe("EsgDocumentUploadStart — adding a forgotten document after the read", () => {
  it("reads only the new file, keeps the first one, and settles each paid round", async () => {
    const user = userEvent.setup();
    render(<EsgDocumentUploadStart companyId="company-1" companyName="Lake Trading" onComplete={vi.fn(async () => {})} />);

    await user.upload(await screen.findByTestId("esg-docs-file-input"), new File(["%PDF a"], "city-power-oct.pdf", { type: "application/pdf" }));
    await readFromBar(user);
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });

    await user.upload(screen.getByTestId("esg-docs-file-input"), new File(["%PDF b"], "diesel-oct.pdf", { type: "application/pdf" }));
    expect(await screen.findByTestId("esg-read-bar")).toHaveTextContent("1 new document ready to read");
    expect(screen.getByTestId("esg-button-continue-to-workbook")).toBeDisabled();
    expect(screen.getByTestId("esg-unread-hint")).toHaveTextContent("not been read yet");

    await waitFor(() => expect(named("/api/parser/esg/quote-files")).toHaveLength(2));
    expect(named("/api/parser/esg/quote-files")[1].files).toEqual(["diesel-oct.pdf"]);

    await readFromBar(user);
    await waitFor(() => expect(named("/resolve-case-files-stream")).toHaveLength(2));
    expect(named("/resolve-case-files-stream")[1].files).toEqual(["diesel-oct.pdf"]);
    expect(named("/api/tokens/authorize")).toHaveLength(2);
    await waitFor(() =>
      expect(named("/settle-outcome").map((c) => c.url)).toEqual([
        "/api/tokens/runs/q-1/settle-outcome",
        "/api/tokens/runs/q-2/settle-outcome",
      ]),
    );

    // Both stand, neither can be removed, and the way on is open again.
    await waitFor(() => expect(screen.getByTestId("esg-button-continue-to-workbook")).not.toBeDisabled());
    expect(screen.queryByTestId("esg-remove-city-power-oct.pdf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-remove-diesel-oct.pdf")).not.toBeInTheDocument();
    expect(screen.getAllByText("Read").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the first round's figures in the workbook after a document is added", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(async (_result: { injection: { patches: Record<string, { cells: Record<string, unknown> }> } }) => {});
    render(<EsgDocumentUploadStart companyId="company-1" companyName="Lake Trading" onComplete={onComplete} />);

    await user.upload(await screen.findByTestId("esg-docs-file-input"), new File(["%PDF a"], "city-power-oct.pdf", { type: "application/pdf" }));
    await readFromBar(user);
    await screen.findByTestId("esg-button-continue-to-workbook", {}, { timeout: 10_000 });

    await user.upload(screen.getByTestId("esg-docs-file-input"), new File(["%PDF b"], "diesel-oct.pdf", { type: "application/pdf" }));
    await readFromBar(user);
    await waitFor(() => expect(named("/settle-outcome")).toHaveLength(2));

    const proceed = screen.getByTestId("esg-button-continue-to-workbook");
    await waitFor(() => expect(proceed).not.toBeDisabled());
    await user.click(proceed);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Round one's electricity AND round two's diesel — the second read used to
    // replace the first's calculator, and round one's figures left the workbook.
    expect(onComplete.mock.calls[0]![0].injection.patches["e-data"].cells).toMatchObject({ s2_C14: 111, s1a_D16: 222 });
  });
});
