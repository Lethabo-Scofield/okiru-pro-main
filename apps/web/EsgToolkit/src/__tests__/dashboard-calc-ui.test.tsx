// @vitest-environment jsdom
/**
 * E3 — a dashboard tile opens onto how its number was made.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@toolkit/lib/auth", () => ({ useAuth: () => ({ user: null }) }));

import EsgDashboard from "../pages/EsgDashboard";
import { computeEsgScorecard } from "../lib/calculators";
import { useEsgStore } from "../lib/esgStore";

afterEach(() => cleanup());

describe("EsgDashboard — tiles open their calculation", () => {
  it("opens Scope 1 onto its fuel lines and closes again", () => {
    const workbook = {
      companyId: "co1",
      sections: {
        "e-data": { cells: { s1a_C14: 10_000, s1a_D15: 5_000, s2_C14: 100_000 } },
        "s-data": { cells: { C27: 500_000, D27: 500_000, C29: 1, D29: 1 } },
      },
      updatedAt: "2026-10-07T00:00:00.000Z",
    };
    useEsgStore.setState({
      companyId: "co1",
      companyName: "Test Co",
      workbook,
      scorecard: computeEsgScorecard(workbook as never),
      submittedAt: null,
      load: async () => {},
    } as never);
    render(<EsgDashboard />);

    const tile = screen.getByTestId("esg-kpi-scope1");
    expect(tile.tagName).toBe("BUTTON");
    expect(screen.queryByTestId("esg-kpi-calc")).toBeNull();

    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "true");
    const calc = screen.getByTestId("esg-kpi-calc");
    expect(calc).toHaveTextContent(/How Scope 1 tCO₂e \(YTD\) is worked out/);
    expect(calc).toHaveTextContent(/emission factor/);
    expect(calc).toHaveTextContent("×");

    fireEvent.click(tile);
    expect(screen.queryByTestId("esg-kpi-calc")).toBeNull();
  });
});
