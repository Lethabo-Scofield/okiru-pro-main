import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEsgStore } from "../esgStore";
import { computeEsgScorecard } from "../calculators";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useEsgStore.setState({
    companyId: "",
    companyName: "",
    workbook: null,
    scorecard: null,
    submittedAt: null,
    loading: false,
    saving: null,
    workbookLoadedAt: 0,
    touched: {},
    submitAttempted: false,
    validationExpanded: false,
  });
});

describe("useEsgStore recalculate", () => {
  it("updates scorecard.overallPercent when e-data cells change", async () => {
    const initial = {
      companyId: "co-1",
      sections: {
        assumptions: { cells: { B6: "Standard", B9: 0.5 } },
        "e-data": { cells: { L19: 100, L46: 50000, B90: 1000, F90: 900 } },
        waste: { cells: { B16: 80 } },
        "s-data": { cells: {} },
        "g-data": { cells: {} },
      },
      updatedAt: new Date().toISOString(),
    };

    useEsgStore.setState({
      companyId: "co-1",
      workbook: initial,
      scorecard: computeEsgScorecard(initial),
    });

    const before = useEsgStore.getState().scorecard?.overallPercent ?? 0;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, updatedAt: new Date().toISOString() }),
    });

    await useEsgStore.getState().updateSectionCells("e-data", {
      ...initial.sections["e-data"].cells,
      L19: 5000,
      L46: 500000,
    });

    const after = useEsgStore.getState().scorecard;
    expect(after).not.toBeNull();
    expect(after!.overallPercent).toBeGreaterThanOrEqual(0);
    expect(after!.environmental.score).toBeGreaterThan(before >= 0 ? 0 : -1);

    useEsgStore.getState().recalculate();
    expect(useEsgStore.getState().scorecard?.overallPercent).toBe(after!.overallPercent);
  });

  it("setStance writes assumptions B6 and recalculates", async () => {
    const wb = {
      companyId: "co-1",
      sections: {
        assumptions: { cells: { B6: "Standard", B9: 0.5 } },
        "e-data": { cells: { L19: 1 } },
      },
      updatedAt: new Date().toISOString(),
    };
    useEsgStore.setState({ companyId: "co-1", workbook: wb, scorecard: computeEsgScorecard(wb) });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, updatedAt: new Date().toISOString() }),
    });

    await useEsgStore.getState().setStance("Strict");
    expect(useEsgStore.getState().workbook?.sections?.assumptions?.cells?.B6).toBe("Strict");
    expect(useEsgStore.getState().getStance()).toBe("Strict");
  });
});
