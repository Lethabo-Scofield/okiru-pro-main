/**
 * @vitest-environment jsdom
 *
 * An ESG document in the library reads the way every ESG screen does:
 * "Electricity kWh", "14 820", "31 Jul 2025" — not "Electricity Kwh",
 * "14820", "2025-07-31". A correction still starts from the stored value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ParserDocumentDetail from "../ParserDocumentDetail";

const DOCUMENT = {
  id: "doc-1", filename: "bill.pdf", fileType: "application/pdf", fileSize: 10, uploadedAt: "2025-10-06T10:00:00Z",
  entityId: null, status: "review_required", documentType: "Municipal electricity bill", overallConfidence: 0.8, extractedFieldCount: 2,
  problemFieldCount: 0, reviewRequired: true, missingFields: [], lowConfidenceFields: [], latestRunId: "run-1", lastRunAt: null,
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["%PDF"]) });

function runFor(domain: string) {
  return {
    runId: "run-1", status: "review_required", documentType: "Municipal electricity bill", overallConfidence: 0.8, missingFields: [],
    lowConfidenceFields: [], warnings: [], errors: [], reviewReasons: [], requiresHumanReview: true,
    parserOutput: {
      domain,
      pillar: domain === "esg" ? "GHG_ENERGY" : "",
      extracted_fields: {
        electricity_kwh: { normalized_value: 14820, raw_value: "14 820", confidence: 0.9 },
        billing_period_end: { normalized_value: "2025-07-31", raw_value: "31 Jul 2025", confidence: 0.9 },
      },
    },
    aiValues: [
      { key: "ai.bill.water_kl", field: "water_kl", value: 31800, layer: "ai", confidence: null, documentId: "bill", documentName: "Bill",
        element: "WATER", sourceFile: "bill.pdf", page: 1, cell: null, quote: null, grounded: true },
    ],
    reviewHistory: [] as unknown[],
  };
}

let run: Record<string, unknown>;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/runs")) return json({ runs: [] });
      if (url.endsWith("/download")) return json({});
      if (url.includes("/api/clients")) return json([]);
      return json({ document: DOCUMENT, latestRun: run });
    }) as unknown as typeof fetch,
  );
});

describe("ParserDocumentDetail — an ESG document", () => {
  it("names its fields and writes its values by the ESG rule", async () => {
    run = runFor("esg");
    render(<ParserDocumentDetail id="doc-1" />);
    const kwh = await screen.findByTestId("field-row-electricity_kwh");
    expect(kwh).toHaveTextContent("Electricity kWh");
    expect(within(kwh).getByTestId("field-electricity_kwh-edit")).toHaveTextContent("14 820");
    expect(within(screen.getByTestId("field-row-billing_period_end")).getByTestId("field-billing_period_end-edit")).toHaveTextContent(
      "31 Jul 2025",
    );
    const water = screen.getByTestId("ai-value-row-ai.bill.water_kl");
    expect(water).toHaveTextContent("Water kL");
    expect(within(water).getByTestId("field-ai.bill.water_kl-edit")).toHaveTextContent("31 800");

    // A correction starts from the stored value, not the display.
    fireEvent.click(within(kwh).getByTestId("field-electricity_kwh-edit"));
    expect(screen.getByTestId("field-electricity_kwh-input")).toHaveValue("14820");
  });

  it("leaves a B-BBEE document as it was", async () => {
    run = runFor("bbbee");
    render(<ParserDocumentDetail id="doc-1" />);
    const kwh = await screen.findByTestId("field-row-electricity_kwh");
    expect(kwh).toHaveTextContent("Electricity Kwh");
    expect(within(kwh).getByTestId("field-electricity_kwh-edit")).toHaveTextContent("14820");
  });
});
