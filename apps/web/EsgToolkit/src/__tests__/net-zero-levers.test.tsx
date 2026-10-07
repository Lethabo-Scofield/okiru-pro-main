// @vitest-environment jsdom
/**
 * D5 — the company's own net-zero plan: reduction levers can be entered, and
 * the roadmap says whose pathway it is drawing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  cellsWithLevers,
  leversFromCells,
  MAX_LEVERS,
  NetZeroLeversEditor,
} from "../components/NetZeroLeversEditor";
import { computeNetZeroRoadmap } from "../lib/calculators/netZero";
import EsgNetZero from "../pages/EsgNetZero";
import { useEsgStore } from "../lib/esgStore";

afterEach(() => cleanup());

const FLEET = { lever: "Fleet renewal", action: "Replace 20 trucks with Euro VI", target: "-15% diesel", timeline: "2027", owner: "Fleet manager" };
const SOLAR = { lever: "Rooftop solar", action: "500 kWp at the main depot", target: "-8% grid", timeline: "2026", owner: "Facilities" };

describe("lever cells", () => {
  it("writes the columns the roadmap reads, so a saved lever is a lever on the roadmap", () => {
    const cells = cellsWithLevers({}, [FLEET, SOLAR]);
    expect(cells).toMatchObject({ A20: "Fleet renewal", B20: "Replace 20 trucks with Euro VI", D20: "-15% diesel", E20: "2027", F20: "Fleet manager", A21: "Rooftop solar" });
    const roadmap = computeNetZeroRoadmap({ companyId: "x", sections: { netzero: { cells } }, updatedAt: "" } as never);
    expect(roadmap.levers).toEqual([FLEET, SOLAR]);
    expect(leversFromCells(cells)).toEqual([FLEET, SOLAR]);
  });

  it("removes a deleted lever, keeps every other cell, and drops a lever with no name", () => {
    const before = { ...cellsWithLevers({}, [FLEET, SOLAR]), C20: "kept", Z1: "other" };
    const after = cellsWithLevers(before, [SOLAR, { ...FLEET, lever: "  " }]);
    expect(after.A20).toBe("Rooftop solar");
    expect(after.A21).toBeUndefined();
    expect(after.F21).toBeUndefined();
    expect(after).toMatchObject({ C20: "kept", Z1: "other" });
  });

  it("holds no more than the roadmap's eight rows", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...FLEET, lever: `L${i}` }));
    const cells = cellsWithLevers({}, many);
    expect(leversFromCells(cells)).toHaveLength(MAX_LEVERS);
    expect(cells.A28).toBeUndefined();
  });
});

describe("NetZeroLeversEditor", () => {
  it("adds, edits and saves the company's levers", async () => {
    const onSave = vi.fn(async () => {});
    render(<NetZeroLeversEditor cells={cellsWithLevers({}, [FLEET])} locked={false} onSave={onSave} />);
    expect(screen.getByLabelText("Lever 1 lever")).toHaveValue("Fleet renewal");

    fireEvent.click(screen.getByTestId("esg-nz-lever-add"));
    fireEvent.change(screen.getByLabelText("Lever 2 lever"), { target: { value: "Rooftop solar" } });
    fireEvent.change(screen.getByLabelText("Lever 2 owner"), { target: { value: "Facilities" } });
    fireEvent.click(screen.getByTestId("esg-nz-lever-save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).toMatchObject({ A20: "Fleet renewal", A21: "Rooftop solar", F21: "Facilities" });
    expect(await screen.findByTestId("esg-nz-lever-message")).toHaveTextContent("Levers saved.");
  });

  it("keeps the edits and says so when the save fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("save failed");
    });
    render(<NetZeroLeversEditor cells={{}} locked={false} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("esg-nz-lever-add"));
    fireEvent.change(screen.getByLabelText("Lever 1 lever"), { target: { value: "Fleet renewal" } });
    fireEvent.click(screen.getByTestId("esg-nz-lever-save"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not saved/);
    expect(screen.getByLabelText("Lever 1 lever")).toHaveValue("Fleet renewal");
  });

  it("is read-only on a submitted workbook", () => {
    render(<NetZeroLeversEditor cells={cellsWithLevers({}, [FLEET])} locked onSave={async () => {}} />);
    expect(screen.getByLabelText("Lever 1 lever")).toBeDisabled();
    expect(screen.getByTestId("esg-nz-lever-add")).toBeDisabled();
    expect(screen.getByText(/submitted/)).toBeInTheDocument();
  });
});

describe("EsgNetZero — whose pathway this is", () => {
  const seed = (setup: Record<string, unknown>, assumptions: Record<string, unknown>) =>
    useEsgStore.setState({
      companyId: "co1",
      submittedAt: null,
      workbook: {
        companyId: "co1",
        sections: {
          "company-reporting-setup": { cells: setup },
          assumptions: { cells: assumptions },
          "e-data": { cells: { B90: 1000 } },
        },
        updatedAt: "2026-10-07T00:00:00.000Z",
      },
    } as never);

  it("names the company's own base year and target year when both are set", () => {
    seed({ baselineYear: 2023 }, { B107: 2045 });
    render(<EsgNetZero />);
    expect(screen.getByTestId("esg-nz-pathway")).toHaveTextContent("from its base year, 2023, to net zero in 2045");
  });

  it("says plainly when the milestones are not the company's pathway, and where to fix it", () => {
    seed({}, {});
    render(<EsgNetZero />);
    const notice = screen.getByTestId("esg-nz-pathway");
    expect(notice).toHaveTextContent(/not the company's pathway yet/);
    expect(notice).toHaveTextContent(/both are still to be set/);
    expect(screen.getByRole("link", { name: "Set the base year" }).getAttribute("href")).toContain("section=company-reporting-setup");
    expect(screen.getByRole("link", { name: "Set the net-zero target year" }).getAttribute("href")).toContain("section=assumptions");
  });
});
