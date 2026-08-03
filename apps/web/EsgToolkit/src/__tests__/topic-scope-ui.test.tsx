// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EsgSidebar } from "../components/layout/EsgSidebar";
import { EsgReportScopePanel } from "../components/EsgReportScopePanel";
import { useEsgStore } from "../lib/esgStore";

const fetchMock = vi.fn();

function seedStore(cells: Record<string, string | number>) {
  useEsgStore.setState({
    companyId: "co-1",
    companyName: "Test Co",
    workbook: {
      companyId: "co-1",
      sections: { assumptions: { cells } },
      updatedAt: new Date().toISOString(),
    },
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

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, updatedAt: new Date().toISOString() }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("sidebar scoping (Part 4)", () => {
  it("framework mode shows every nav destination including the B-BBEE Bridge", () => {
    seedStore({ B6: "Standard" });
    render(<EsgSidebar />);
    expect(screen.getByTestId("esg-nav-bbbee-bridge")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-net-zero")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-e-water")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-governance")).toBeTruthy();
  });

  it("topic mode hides the bridge, deselected topics, and empty pillars; keeps Net-Zero with GHG", () => {
    seedStore({ B6: "Standard", _reportMode: "topic", _selectedTopics: "e-ghg,s-mc" });
    render(<EsgSidebar />);
    expect(screen.queryByTestId("esg-nav-bbbee-bridge")).toBeNull();
    expect(screen.queryByTestId("esg-nav-e-water")).toBeNull();
    expect(screen.queryByTestId("esg-nav-governance")).toBeNull();
    expect(screen.queryByTestId("esg-nav-g-king5")).toBeNull();
    expect(screen.getByTestId("esg-nav-net-zero")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-carbon-tax")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-e-ghg")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-s-mc")).toBeTruthy();
    expect(screen.getByTestId("esg-nav-import")).toBeTruthy();
  });

  it("drops Net-Zero and Carbon Tax when GHG is deselected", () => {
    seedStore({ B6: "Standard", _reportMode: "topic", _selectedTopics: "s-mc" });
    render(<EsgSidebar />);
    expect(screen.queryByTestId("esg-nav-net-zero")).toBeNull();
    expect(screen.queryByTestId("esg-nav-carbon-tax")).toBeNull();
    expect(screen.queryByTestId("esg-nav-environmental")).toBeNull();
  });
});

describe("report scope panel (Part 4)", () => {
  it("framework mode shows the full-scope note and no topic chips", () => {
    seedStore({ B6: "Standard" });
    render(<EsgReportScopePanel />);
    expect(screen.getByTestId("esg-scope-mode-framework")).toBeTruthy();
    expect(screen.queryByTestId("esg-scope-topic-e-ghg")).toBeNull();
    expect(screen.queryByTestId("esg-scope-counter")).toBeNull();
  });

  it("topic mode renders pillar-grouped chips with the live counter", () => {
    seedStore({ B6: "Standard", _reportMode: "topic", _selectedTopics: "e-ghg,s-mc" });
    render(<EsgReportScopePanel />);
    const ghgChip = screen.getByTestId("esg-scope-topic-e-ghg");
    const waterChip = screen.getByTestId("esg-scope-topic-e-water");
    expect(ghgChip.getAttribute("aria-pressed")).toBe("true");
    expect(waterChip.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("esg-scope-counter").textContent).toContain(
      "2 of 15 topics selected",
    );
  });

  it("clicking a chip persists the toggle through the assumptions section", async () => {
    seedStore({ B6: "Standard", _reportMode: "topic", _selectedTopics: "e-ghg,s-mc" });
    render(<EsgReportScopePanel />);
    await userEvent.click(screen.getByTestId("esg-scope-topic-e-water"));
    expect(useEsgStore.getState().getSelectedTopics()).toEqual(["e-ghg", "e-water", "s-mc"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/section/assumptions"),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(screen.getByTestId("esg-scope-counter").textContent).toContain(
      "3 of 15 topics selected",
    );
  });

  it("switching mode back to framework persists via the same mechanism", async () => {
    seedStore({ B6: "Standard", _reportMode: "topic", _selectedTopics: "e-ghg" });
    render(<EsgReportScopePanel />);
    await userEvent.click(screen.getByTestId("esg-scope-mode-framework"));
    expect(useEsgStore.getState().getReportMode()).toBe("framework");
    const cells = useEsgStore.getState().workbook?.sections?.assumptions?.cells;
    expect(cells?.B6).toBe("Standard");
  });
});
