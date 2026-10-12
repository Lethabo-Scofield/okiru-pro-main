/**
 * @vitest-environment jsdom
 *
 * Step 3 of the ESG create flow, for the documents route:
 *  - it counts uploads, not the sheets a workbook was read as;
 *  - its "Review each document" previews every document from its library copy;
 *  - the review takes the width, the name form keeps its column;
 *  - Back shows the read again (never an empty drop zone one click from
 *    discarding it);
 *  - the document placements' full record (every cell's source, every
 *    disputed cell) is written with the figures.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeEsgFlowSnapshot } from "../esgFlowSnapshot";
import type { EsgInjectionResult, EsgParserCaseLike } from "../esgParserInjection";

const { uploadProps } = vi.hoisted(() => ({ uploadProps: vi.fn() }));

vi.mock("@/styles/esg-glass.css", () => ({ default: "" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/UserAccountMenu", () => ({ UserAccountMenu: () => null }));
vi.mock("../EsgDocumentUploadStart", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    uploadProps(props);
    return <div data-testid="stub-upload" />;
  },
}));

import EsgCreateFlow from "../EsgCreateFlow";

const parserCase = {
  documents: [{ file_name: "Book.xlsx" }, { file_name: "bill.pdf" }],
  ai_entities: {
    extractions: [
      { documentId: "esg.fuel_fills", sourceFile: "Book.xlsx › Fills", element: "FLEET", values: [{ field: "diesel_litres", value: 800 }] },
      { documentId: "esg.fleet_register", sourceFile: "Book.xlsx › Vehicles", element: "FLEET", values: [{ field: "total_vehicles", value: 4 }] },
      { documentId: "esg.electricity_bill", sourceFile: "bill.pdf", element: "GHG_ENERGY", values: [{ field: "electricity_kwh", value: 2140 }] },
    ],
  },
} as unknown as EsgParserCaseLike;

const injection: EsgInjectionResult = {
  implemented: true,
  patches: { "e-data": { cells: { s1a_C14: 800, s1a_D14: 425 } } },
  placed: [{ sectionId: "e-data", cellRef: "s1a_C14", field: "diesel_litres", value: 800, sourceFile: "Book.xlsx › Fills", documentId: "esg.fuel_fills" }],
  unplaced: [],
  conflicts: [{ sectionId: "e-data", cellRef: "s1a_E14", label: "Fleet diesel", candidates: [{ value: 405, sources: ["Book.xlsx › Fills"] }, { value: 410, sources: ["card.pdf"] }] }],
  valuesRead: 3,
  figuresPlaced: 2,
  cellSources: { "e-data!s1a_C14": ["Book.xlsx › Fills"], "e-data!s1a_D14": ["Book.xlsx › Fills"] },
};

const calls: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  calls.length = 0;
  uploadProps.mockClear();
  sessionStorage.clear();
  localStorage.clear();
  window.history.pushState({}, "", "/esg");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith("/api/clients")) return new Response(JSON.stringify({ clientId: "c-1" }), { status: 200 });
      if (url.includes("/download")) return new Response(new Blob(["%PDF"]), { status: 200, headers: { "Content-Type": "application/pdf" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch,
  );
  writeEsgFlowSnapshot({
    savedAt: "2025-10-06T09:00:00.000Z",
    entityName: "Example Co",
    nameSource: "documents",
    work: {
      route: "documents",
      patches: injection.patches,
      injection,
      parserCase,
      documentIds: ["lib-book", "lib-bill"],
      documentIdsByName: { "Book.xlsx": "lib-book", "bill.pdf": "lib-bill" },
      excel: null,
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ESG create — step 3 on the documents route", () => {
  it("counts uploads, not the sheets a workbook was read as", () => {
    render(<EsgCreateFlow />);
    expect(screen.getByTestId("esg-review-documents-summary")).toHaveTextContent("2 figures from 2 documents");
  });

  it("previews each document from its library copy, in a review wider than the form", async () => {
    const user = userEvent.setup();
    render(<EsgCreateFlow />);
    await user.click(screen.getByTestId("esg-review-documents-toggle"));
    const review = await screen.findByTestId("document-review");
    // The review sits outside the name form's column, so it alone takes the width.
    expect(screen.getByTestId("esg-create-review-documents")).toContainElement(review);
    expect(screen.getByTestId("esg-review-create").closest(".max-w-2xl")).not.toBeNull();
    expect(screen.getByTestId("esg-create-review-documents").closest(".max-w-2xl")).toBeNull();
    // A sheet's values are listed under the workbook it came from, and it previews.
    await user.click(within(review).getByTestId("review-doc-Book.xlsx"));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/parser-documents/lib-book/download"))).toBe(true));
  });

  it("Back shows the read again, ready to continue", async () => {
    const user = userEvent.setup();
    render(<EsgCreateFlow />);
    await user.click(screen.getByTestId("esg-review-back"));
    expect(screen.getByTestId("stub-upload")).toBeInTheDocument();
    const props = uploadProps.mock.calls.at(-1)![0] as { resume?: { parserCase: unknown; documentIdsByName?: Record<string, string> } };
    expect(props.resume?.parserCase).toEqual(parserCase);
    expect(props.resume?.documentIdsByName).toEqual({ "Book.xlsx": "lib-book", "bill.pdf": "lib-bill" });
  });

  it("writes every cell's source and every disputed cell with the figures", async () => {
    const user = userEvent.setup();
    render(<EsgCreateFlow />);
    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/import"))).toBe(true));
    const write = calls.find((c) => c.url.includes("/import"))!.body as { sections: Record<string, { cells: Record<string, string> }> };
    const provenance = write.sections.provenance.cells;
    expect(Object.keys(provenance).sort()).toEqual(["e-data!s1a_C14", "e-data!s1a_D14", "e-data!s1a_E14"]);
    expect(JSON.parse(provenance["e-data!s1a_E14"])).toMatchObject({ k: "conflict" });
  });
});
