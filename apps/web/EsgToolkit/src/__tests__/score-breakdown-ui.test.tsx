// @vitest-environment jsdom
/**
 * The Score breakdown page renders the structure behind the score: totals,
 * what is still needed (linked to its page), and every indicator.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import EsgScoreBreakdown from "../pages/EsgScoreBreakdown";
import { EsgFleetEmissions } from "../components/EsgFleetEmissions";
import { computeFleetEmissions } from "../lib/calculators/fleetEmissions";
import { useEsgStore } from "../lib/esgStore";

function seed(sections: Record<string, { cells: Record<string, unknown> }>) {
  useEsgStore.setState({
    companyId: "co-1",
    companyName: "Test Co",
    workbook: { companyId: "co-1", sections, updatedAt: new Date().toISOString() } as never,
    scorecard: null,
    submittedAt: null,
    loading: false,
    saving: null,
    workbookLoadedAt: 0,
    touched: {},
    submitAttempted: false,
    validationExpanded: false,
  });
}

beforeEach(() => cleanup());

describe("EsgScoreBreakdown", () => {
  it("shows the totals, what is still needed, and every indicator", () => {
    seed({ "e-data": { cells: { s1a_C14: 1_000 } } });
    render(<EsgScoreBreakdown />);

    expect(screen.getByTestId("esg-breakdown-headline")).toHaveTextContent("Overall ESG");
    expect(screen.getByTestId("esg-breakdown-counts")).toHaveTextContent(/waiting for data/);

    const needed = screen.getByTestId("esg-breakdown-needed");
    // The baseline the reduction indicator waits for, under the page that holds it.
    expect(needed).toHaveTextContent("A Scope 1 + 2 baseline in tCO₂e");
    expect(within(needed).getAllByRole("link", { name: "Open" }).length).toBeGreaterThan(0);

    // Recorded fleet diesel earned d5 in full.
    expect(screen.getByTestId("esg-indicator-environmental-d5")).toHaveTextContent("Full marks");
    expect(screen.getByTestId("esg-breakdown-governance")).toBeInTheDocument();
  });
});

describe("EsgFleetEmissions", () => {
  it("shows each vehicle's method and what is still needed", () => {
    const rows = [
      { reg: "A1", depot: "ALW", gvm: 26_000, monthlyKm: 4_000, monthlyLitres: 1_200 },
      { reg: "A2", depot: "ALW", gvm: 26_000, monthlyKm: 2_000, monthlyLitres: 700 },
      { reg: "A3", depot: "ALW", gvm: 26_000, monthlyKm: 2_000, monthlyLitres: 800 },
      { reg: "A4", depot: "BKT", gvm: 26_000, monthlyKm: 1_000 },
      { reg: "A5", depot: "BKT", gvm: 26_000, monthlyKm: 436_180 },
    ];
    const fleet = computeFleetEmissions({ sections: { fleet: { cells: { _rows: rows } } } } as never);
    render(<EsgFleetEmissions fleet={fleet} />);

    expect(screen.getByTestId("esg-fleet-headline")).toHaveTextContent("4");
    expect(screen.getByTestId("esg-fleet-estimate-note")).toHaveTextContent(/estimated from distance and vehicle size/);
    expect(screen.getAllByTestId("esg-fleet-vehicle")).toHaveLength(5);
    expect(screen.getByTestId("esg-fleet-missing")).toHaveTextContent(/A5.*odometer reading/);
  });
});
