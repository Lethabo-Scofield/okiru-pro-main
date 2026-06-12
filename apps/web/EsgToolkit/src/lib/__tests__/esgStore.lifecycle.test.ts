import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEsgStore } from "../esgStore";

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

describe("useEsgStore save lifecycle", () => {
  it("skips reload within 60s guard when workbook already loaded", async () => {
    const wb = {
      companyId: "co-1",
      sections: { "e-data": { cells: { L19: 1 } } },
      updatedAt: new Date().toISOString(),
    };
    useEsgStore.setState({
      companyId: "co-1",
      workbook: wb,
      workbookLoadedAt: Date.now(),
    });

    await useEsgStore.getState().load("co-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("optimistic update keeps edited cell after simulated section save", async () => {
    const initial = {
      companyId: "co-1",
      sections: {
        "e-data": { cells: { L19: 100 } },
        "s-data": { cells: { L12: 0 } },
      },
      updatedAt: new Date().toISOString(),
    };
    useEsgStore.setState({ companyId: "co-1", workbook: initial });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, updatedAt: new Date().toISOString() }),
    });

    await useEsgStore.getState().updateSectionCells("e-data", { L19: 999, _months_C_K: 9 });

    const wb = useEsgStore.getState().workbook;
    expect(wb?.sections?.["e-data"]?.cells?.L19).toBe(999);
    expect(wb?.sections?.["s-data"]?.cells?.L12).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/section/e-data"),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
