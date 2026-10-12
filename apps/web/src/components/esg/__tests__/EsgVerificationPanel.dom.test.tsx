// @vitest-environment jsdom
/**
 * The ESG verification checks reach the review step: built from the placement
 * and the case it came from, shown by status with the documents they read.
 * Invented company and figures.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { buildEsgVerification, EsgVerificationPanel } from "../EsgVerificationPanel";
import type { EsgInjectionResult, EsgParserCaseLike } from "../esgParserInjection";

afterEach(cleanup);

const axes = { depots: ["Depot North", "Depot South"], months: ["Jul-25", "Aug-25", "Sep-25"] };
const DASH = "Acme dashboard.xlsx › Dashboard";
const row = (site: string | null, value: number) => ({
  grid: "esg_monthly_rows",
  cells: { "monthly.measure": "energy.electricity_kwh", ...(site ? { "monthly.site": site } : {}), "monthly.period_end": "2025-07-31", "monthly.value": value },
  sourceFiles: [DASH],
});

const parserCase: EsgParserCaseLike = {
  ai_entities: { calculator: { rows: [row(null, 3), row("Depot North", 1000), row("Depot South", 2000)], entries: [] }, extractions: [] },
};
const injection = {
  implemented: true,
  patches: { "e-data": { cells: { s2_C14: 1000, s2_C15: 2000 } } },
  placed: [],
  unplaced: [
    { field: "ee.headcount_total", value: 321, sourceFile: "Acme EE return 2023.pdf", documentId: "ee", element: "EMPLOYMENT_EQUITY", reason: "Its document covers 2023-09-01 to 2023-11-30.", rejection: "out_of_period" },
  ],
  conflicts: [],
  valuesRead: 4,
  axes,
} as unknown as EsgInjectionResult;

describe("EsgVerificationPanel", () => {
  it("builds the checks from the placement and shows them by status", () => {
    const report = buildEsgVerification(injection, parserCase);
    expect(report.counts.flag).toBeGreaterThan(0);
    expect(report.counts["out-of-period"]).toBe(1);
    render(<EsgVerificationPanel report={report} />);
    expect(screen.getByTestId("esg-verification-panel")).toHaveTextContent("Checked against your documents");
    expect(screen.getByTestId("esg-verification-group-flag")).toBeInTheDocument();
    expect(screen.getByText(/Jul-25 prints 3 kWh against 3 000/)).toBeInTheDocument();
    expect(screen.getByText(/no figure or point is changed/)).toBeInTheDocument();
  });

  it("renders nothing without a report", () => {
    const { container } = render(<EsgVerificationPanel report={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
