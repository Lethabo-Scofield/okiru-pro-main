/**
 * @vitest-environment jsdom
 *
 * The element batches are GUIDANCE, and guidance must never become a gate.
 *
 * The ESG parser endpoints are being built alongside this screen, so the
 * catalogue can be absent, late, or shaped differently from the guess. In every
 * one of those cases the user still has to be able to upload — the whole
 * screen's job — and the checklist must never claim coverage the extraction did
 * not produce.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EsgElementDocumentBatches, {
  esgBatchLabel,
  normaliseEsgDocumentCatalog,
} from "../EsgElementDocumentBatches";

const GROUPED = {
  data: {
    elements: [
      {
        element: "GHG_ENERGY",
        documents: [
          { id: "ghg_energy__bill", name: "Municipal electricity bill", whatTheAuditorTests: "Scope 2." },
        ],
      },
    ],
  },
};

/** The other shape the parser already uses elsewhere for the same idea. */
const FLAT = {
  document_types: [
    { id: "waste__contractor", name: "Waste contractor report", element: "WASTE", description: "Diversion." },
    { id: "water__bill", name: "Municipal water bill", element: "WATER" },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("normaliseEsgDocumentCatalog", () => {
  it("reads the grouped shape", () => {
    expect(normaliseEsgDocumentCatalog(GROUPED)).toEqual([
      {
        element: "GHG_ENERGY",
        documents: [
          { id: "ghg_energy__bill", name: "Municipal electricity bill", hint: "Scope 2." },
        ],
      },
    ]);
  });

  it("reads the flat shape and groups it by element", () => {
    const result = normaliseEsgDocumentCatalog(FLAT);
    expect(result.map((e) => e.element).sort()).toEqual(["WASTE", "WATER"]);
    expect(result.find((e) => e.element === "WATER")?.documents[0]).toEqual({
      id: "water__bill",
      name: "Municipal water bill",
      hint: undefined,
    });
  });

  it("returns nothing rather than guessing when the shape is unrecognised", () => {
    for (const input of [null, undefined, 42, "oops", {}, { totalDocuments: 40 }]) {
      expect(normaliseEsgDocumentCatalog(input)).toEqual([]);
    }
  });
});

describe("EsgElementDocumentBatches", () => {
  it("keeps every element uploadable when the catalogue request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch,
    );
    render(<EsgElementDocumentBatches onPick={vi.fn()} />);

    // The failure is stated...
    expect(await screen.findByTestId("esg-batches-catalog-error")).toHaveTextContent(
      /you can still upload/i,
    );
    // ...and the upload controls are still there for every element.
    expect(screen.getByTestId("esg-batch-upload-files-GHG_ENERGY")).toBeEnabled();
    expect(screen.getByTestId("esg-batch-upload-folder-WASTE")).toBeEnabled();
    expect(screen.getByTestId("esg-batch-HOLISTIC")).toBeInTheDocument();
  });

  it("shows coverage only for documents the parser actually read values from", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => GROUPED })) as unknown as typeof fetch,
    );
    const { rerender } = render(
      <EsgElementDocumentBatches onPick={vi.fn()} satisfiedDocumentIds={[]} />,
    );

    // Before anything is read, nothing claims to be covered.
    await waitFor(() =>
      expect(screen.getByTestId("esg-batch-toggle-GHG_ENERGY")).toHaveTextContent("1 document types"),
    );

    rerender(
      <EsgElementDocumentBatches onPick={vi.fn()} satisfiedDocumentIds={["ghg_energy__bill"]} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("esg-batch-toggle-GHG_ENERGY")).toHaveTextContent(
        "1 of 1 document types covered",
      ),
    );
  });

  it("renders an element the catalogue knows about that this UI has no wording for", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ elements: [{ element: "BIODIVERSITY", documents: [] }] }),
      })) as unknown as typeof fetch,
    );
    render(<EsgElementDocumentBatches onPick={vi.fn()} />);

    expect(await screen.findByTestId("esg-batch-BIODIVERSITY")).toHaveTextContent("Biodiversity");
  });
});

describe("esgBatchLabel", () => {
  it("names known elements, the holistic batch, and unknown codes", () => {
    expect(esgBatchLabel("GHG_ENERGY")).toBe("Energy & emissions");
    expect(esgBatchLabel("HOLISTIC")).toBe("Packs & whole folders");
    expect(esgBatchLabel("BOARD_GOVERNANCE")).toBe("Board & governance");
    expect(esgBatchLabel("SOMETHING_NEW")).toBe("Something new");
  });
});
