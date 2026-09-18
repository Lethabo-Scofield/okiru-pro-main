// @vitest-environment jsdom
/**
 * What the library shows when there is nothing in it.
 *
 * The complaint was about how these two pages look, and the cause was the same
 * on both: a company with no documents still rendered a full dashboard. Three
 * stat tiles reading zero, stretched across the width of a monitor, three
 * filter controls narrowing an empty list, and a card whose largest element
 * was the number 0.
 *
 * None of that is a styling problem. It is a page showing the furniture of
 * data it does not have. So these tests are about what is ABSENT: counts only
 * once there is something to count, filters only once there is a list to
 * filter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import ParserDocumentLibrary from "../ParserDocumentLibrary";
import { CompanyDocumentLibrary } from "../CompanyDocumentLibrary";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Companies from /api/clients, document counts from /api/parser-documents. */
function routeCompanyIndex(companies: unknown[], totals: Record<string, number> = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/clients")) return Promise.resolve(json(companies));
    const entity = /entityId=([^&]+)/.exec(url)?.[1];
    const key = entity ? decodeURIComponent(entity) : "unassigned";
    const failing = /status=(review_required|failed)/.test(url);
    return Promise.resolve(
      json({ pagination: { page: 1, limit: 1, total: failing ? 0 : (totals[key] ?? 0), pages: 1 } }),
    );
  });
}

describe("the company index", () => {
  it("says what it is reporting before the cards do", async () => {
    routeCompanyIndex(
      [
        { clientId: "C-1", name: "Acme Trading", product: "bbbee" },
        { clientId: "C-2", name: "Beta Logistics", product: "bbbee" },
      ],
      { "C-1": 4, "C-2": 2 },
    );

    render(<ParserDocumentLibrary />);

    // "2 companies · 6 documents filed" — the total nobody should have to add
    // up across a grid.
    expect(await screen.findByText(/companies/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/documents filed/)).toBeInTheDocument());
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  /**
   * A row of large zeroes is a page shouting that it has nothing. The count
   * only takes the eye once there is one.
   */
  it("does not put a big zero on a company with nothing filed", async () => {
    routeCompanyIndex([{ clientId: "C-1", name: "Acme Trading", product: "bbbee" }]);

    render(<ParserDocumentLibrary />);

    const card = within(await screen.findByTestId("library-company-C-1"));
    expect(card.getByText("Nothing filed yet")).toBeInTheDocument();
    // Checked inside the card, not the page: the summary line above it does say
    // "0 documents filed", and that sentence is the honest place for the zero.
    expect(card.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the count and the all-clear once documents exist", async () => {
    routeCompanyIndex([{ clientId: "C-1", name: "Acme Trading", product: "bbbee" }], { "C-1": 7 });

    render(<ParserDocumentLibrary />);

    const card = within(await screen.findByTestId("library-company-C-1"));
    await waitFor(() => expect(card.getByText("7")).toBeInTheDocument());
    expect(card.getByText("All read")).toBeInTheDocument();
    expect(card.queryByText("Nothing filed yet")).not.toBeInTheDocument();
  });
});

/** One company's library: the page behind the "Example" screenshot. */
function routeCompanyLibrary(total: number, documents: unknown[] = []) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/clients/")) {
      return Promise.resolve(json({ clientId: "C-1", name: "Example", product: "bbbee" }));
    }
    return Promise.resolve(
      json({
        documents,
        documentTypes: ["Certificate", "Payroll"],
        pagination: { page: 1, limit: 25, total, pages: Math.max(1, Math.ceil(total / 25)) },
      }),
    );
  });
}

describe("one company's library", () => {
  it("shows no counts and no filters when nothing is filed", async () => {
    routeCompanyLibrary(0);

    render(<CompanyDocumentLibrary companyId="C-1" product="bbbee" />);

    expect(await screen.findByText(/Nothing filed for Example yet/)).toBeInTheDocument();
    expect(screen.queryByText("filed here")).not.toBeInTheDocument();
    expect(screen.queryByTestId("company-docs-search")).not.toBeInTheDocument();
  });

  /** An empty state that only describes the emptiness leaves nowhere to go. */
  it("offers the way to add some", async () => {
    routeCompanyLibrary(0);

    render(<CompanyDocumentLibrary companyId="C-1" product="bbbee" />);

    expect(await screen.findByTestId("company-docs-empty-upload")).toBeInTheDocument();
  });

  it("brings the counts and the filters back once there are documents", async () => {
    routeCompanyLibrary(3, [
      {
        id: "d1",
        filename: "certificate.pdf",
        fileSize: 20_480,
        documentType: "Certificate",
        status: "passed",
        overallConfidence: 0.92,
        extractedFieldCount: 12,
        problemFieldCount: 0,
        uploadedAt: "2026-09-01T08:00:00.000Z",
      },
    ]);

    render(<CompanyDocumentLibrary companyId="C-1" product="bbbee" />);

    expect(await screen.findByText("filed here")).toBeInTheDocument();
    expect(screen.getByTestId("company-docs-search")).toBeInTheDocument();
    expect(screen.getByText("certificate.pdf")).toBeInTheDocument();
  });

  /**
   * "No documents match those filters" and "nothing has ever been filed here"
   * call for opposite actions, and the old page said the second in both cases.
   */
  it("tells a filtered empty list apart from an empty company", async () => {
    routeCompanyLibrary(2, []);

    render(<CompanyDocumentLibrary companyId="C-1" product="bbbee" />);

    await screen.findByTestId("company-docs-search");
    await userEvent.type(screen.getByTestId("company-docs-search"), "nothing-matches-this");

    expect(await screen.findByText(/No documents match those filters/)).toBeInTheDocument();
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });
});
