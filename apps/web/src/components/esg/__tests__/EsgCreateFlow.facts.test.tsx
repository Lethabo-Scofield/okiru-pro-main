/**
 * @vitest-environment jsdom
 *
 * The create review's facts: the reporting year and sites the figures are
 * placed on, the boundary, and last year's figures as a baseline — proposed
 * from the documents, confirmed by the person, written with the figures.
 *
 * The flow used to place a new company's figures on axes nobody saw: two
 * years of dashboards became a 24-month "year", the period was never written,
 * and neither were the months of actual data. Invented company throughout.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { CASE } = vi.hoisted(() => {
  const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const fact = (site: string, periodEnd: string, value: number, source: string) => ({
    grid: "esg_monthly_rows",
    cells: { "monthly.measure": "energy.electricity_kwh", "monthly.site": site, "monthly.period_end": periodEnd, "monthly.value": value },
    sourceFiles: [source],
  });
  const lastYear = "Acme dashboard 2024-2025.xlsx › Energy";
  const thisYear = "Acme dashboard 2025-2026.xlsx › Energy";
  const rows = [];
  for (let m = 0; m < 12; m += 1) rows.push(fact("Acme Retail - Depot North", monthEnd(2024, 7 + m), 1000, lastYear));
  for (let m = 0; m < 9; m += 1) {
    rows.push(fact("Acme Retail - Depot North", monthEnd(2025, 7 + m), 2000, thisYear));
    rows.push(fact("Acme Retail - East London", monthEnd(2025, 7 + m), 500, thisYear));
  }
  return {
    CASE: {
      status: "resolved",
      documents: [{ file_name: "Acme dashboard 2024-2025.xlsx" }, { file_name: "Acme dashboard 2025-2026.xlsx" }],
      ai_entities: {
        fields: { entity_name: { value: "Acme Retail (Pty) Ltd" } },
        extractions: [
          { sourceFile: lastYear, values: [{ field: "esg_monthly_rows", value: [1], sourceFile: lastYear }] },
          { sourceFile: thisYear, values: [{ field: "esg_monthly_rows", value: [1], sourceFile: thisYear }] },
          {
            sourceFile: "Acme safety register.xlsx",
            element: "HEALTH_SAFETY",
            values: [
              { field: "reporting_period_start", value: "1 July 2025" },
              { field: "reporting_period_end", value: "30 June 2026" },
            ],
          },
        ],
        calculator: { rows, entries: [] },
      },
    },
  };
});

vi.mock("@/styles/esg-glass.css", () => ({ default: "" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/UserAccountMenu", () => ({ UserAccountMenu: () => null }));
vi.mock("@/components/AppNavBack", () => ({ AppNavBack: () => null }));

/** The uploader hands over exactly what it would: the case, placed with no workbook. */
vi.mock("../EsgDocumentUploadStart", async () => {
  const { applyEsgParserResult } = await import("../esgParserInjection");
  return {
    __esModule: true,
    default: (props: { onComplete: (result: { injection: unknown; parserCase: unknown }) => void }) => (
      <button
        type="button"
        data-testid="stub-finish-upload"
        onClick={() => props.onComplete({ injection: applyEsgParserResult(CASE as never, { workbook: null }), parserCase: CASE })}
      >
        finish
      </button>
    ),
  };
});

import EsgCreateFlow from "../EsgCreateFlow";

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(calls: FetchCall[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/api/clients")) return new Response(JSON.stringify({ clientId: "c-9" }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
}

const importBody = (calls: FetchCall[]) => {
  const call = calls.find((c) => c.url.includes("/api/esg/workbook/c-9/import"));
  return call?.init?.body ? JSON.parse(String(call.init.body)) : null;
};

beforeEach(() => {
  window.history.pushState({}, "", "/esg");
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

async function reachReview() {
  const user = userEvent.setup();
  render(<EsgCreateFlow />);
  await user.click(screen.getByTestId("esg-start-upload"));
  await user.click(screen.getByTestId("stub-finish-upload"));
  await screen.findByTestId("esg-review-facts");
  return user;
}

describe("the create review shows the year and sites the figures go on", () => {
  it("proposes the stated year with what states it, and the sites the registers name", async () => {
    mockFetch([]);
    await reachReview();
    expect(screen.getByTestId("esg-review-year-select")).toHaveValue("Jul-25");
    expect(screen.getByTestId("esg-review-year-source")).toHaveTextContent("Stated by 2 documents");
    expect(screen.getByTestId("esg-review-year-source")).toHaveTextContent("9 of its months have figures");
    expect(screen.getByTestId("esg-review-year-others")).toHaveTextContent("July 2024 to June 2025");
    expect(screen.getByTestId("esg-review-sites-input")).toHaveValue("DEPOT NORTH\nEAST LONDON");
    expect(screen.getByTestId("esg-review-prior-year")).toHaveTextContent("12 000 kWh");
  });

  it("writes the period, the months of data, the boundary and — when taken — the baseline", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls);
    const user = await reachReview();
    await user.selectOptions(screen.getByTestId("esg-review-boundary"), "Operational control");
    await user.click(screen.getByTestId("esg-review-baseline-toggle"));
    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(importBody(calls)).not.toBeNull());
    const sections = importBody(calls).sections;
    expect(sections["company-reporting-setup"].cells).toMatchObject({
      period: "July 2025 to June 2026",
      boundary: "Operational control",
      entity: "Acme Retail (Pty) Ltd",
    });
    expect(sections.assumptions.cells.B111).toBe(9);
    expect(sections["e-data"].cells).toMatchObject({ eFirstMonth: "Jul-25", eMonthCount: 12, s2_C14: 2000, s2_C15: 500, B92: 12000 });
    // Last year's figures are not in this year's grid.
    expect(Object.values(sections["e-data"].cells)).not.toContain(1000);
  });

  it("re-places the figures on the year the person chooses instead", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls);
    const user = await reachReview();
    await user.selectOptions(screen.getByTestId("esg-review-year-select"), "Jul-24");
    expect(screen.getByTestId("esg-review-year-source")).toHaveTextContent("You changed this");
    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(importBody(calls)).not.toBeNull());
    const cells = importBody(calls).sections["e-data"].cells;
    expect(cells).toMatchObject({ eFirstMonth: "Jul-24", s2_C14: 1000 });
    expect(importBody(calls).sections["company-reporting-setup"].cells.period).toBe("July 2024 to June 2025");
  });

  it("writes no baseline the person did not take", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls);
    const user = await reachReview();
    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(importBody(calls)).not.toBeNull());
    const cells = importBody(calls).sections["e-data"].cells;
    expect(cells.B92).toBeUndefined();
    expect(cells.B90).toBeUndefined();
  });
});
