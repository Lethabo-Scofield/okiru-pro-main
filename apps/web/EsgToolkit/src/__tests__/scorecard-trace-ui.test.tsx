// @vitest-environment jsdom
/**
 * E3 — click a number to see how it was made. "Actual" is what was measured,
 * not the points again; "Target" is the target, or that there is none; and a
 * row opens onto its trace.
 */
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import golden from "../lib/fixtures/esg-consumer-golden.generated.json";
import { EsgScorecardPage, formatTraceValue } from "../components/EsgScorecardPage";
import { computeEsgScorecard } from "../lib/calculators";
import { useEsgStore } from "../lib/esgStore";
import { SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";

afterEach(() => cleanup());

/** Numbers are written the South African way, as everywhere else in the app. */
const za = (n: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 }).format(n);

function seed(assumptions: Record<string, unknown>) {
  const raw = JSON.parse(JSON.stringify(golden)) as Record<string, Record<string, unknown>>;
  const sections = Object.fromEntries(Object.entries(raw).map(([id, cells]) => [id, { cells }]));
  sections.assumptions = { cells: { ...raw.assumptions, ...assumptions } };
  const workbook = { companyId: "co1", sections, updatedAt: "2026-10-07T00:00:00.000Z" };
  const scorecard = computeEsgScorecard(workbook as never)!;
  useEsgStore.setState({ companyId: "co1", workbook, scorecard } as never);
  render(
    <EsgScorecardPage
      pillar="environmental"
      title="Environmental"
      sheet="E_Scorecard"
      indicators={SCORECARD_INDICATORS.environmental}
      scores={scorecard.environmentalRows}
      totalScore={scorecard.environmental.score}
      maxScore={108}
      accent="#22c55e"
    />,
  );
}

describe("EsgScorecardPage — every number explains itself", () => {
  it("shows the measured value and the target, not the points twice", () => {
    seed({ _targetBasis: "Company's own targets" });
    // Waste diversion: 0.911 measured against the company's own 0.75.
    expect(screen.getByTestId("esg-actual-d19")).toHaveTextContent(`${za(91.1)}%`);
    expect(screen.getByTestId("esg-target-d19")).toHaveTextContent(`${za(75)}%`);
  });

  it("opens a row onto its rule, its target's source and the cells it read", () => {
    seed({ _targetBasis: "Company's own targets" });
    const toggle = screen.getByTestId("esg-trace-toggle-d19");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByTestId("esg-trace-environmental-d19");
    expect(detail).toHaveTextContent(/reaches the target/);
    expect(detail).toHaveTextContent("company's own target (Assumptions!B48)");
    expect(detail).toHaveTextContent("Waste_Register!B16");
  });

  it("says a row was left out, and why, instead of showing a zero", () => {
    seed({});
    expect(screen.getByTestId("esg-target-d19")).toHaveTextContent("Excluded");
    fireEvent.click(screen.getByTestId("esg-trace-toggle-d19"));
    expect(screen.getByTestId("esg-trace-environmental-d19")).toHaveTextContent(/Left out of the total.*has not declared how its targets are set/);
  });
});

describe("formatTraceValue", () => {
  it("writes each unit the way a reader expects", () => {
    expect(formatTraceValue(0.911, "ratio")).toBe(`${za(91.1)}%`);
    expect(formatTraceValue(3.5, "rating")).toBe(`${za(3.5)} / 5`);
    expect(formatTraceValue(2045, "year")).toBe("2045");
    expect(formatTraceValue("Yes", "answer")).toBe("Yes");
    expect(formatTraceValue(null, "kWh")).toBe("—");
  });
});
