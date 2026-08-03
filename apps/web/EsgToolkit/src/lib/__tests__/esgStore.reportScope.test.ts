import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_ESG_TOPIC_IDS } from "@/lib/esg/esgTopicScope";
import { useEsgStore } from "../esgStore";

const fetchMock = vi.fn();

function okSave() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ok: true, updatedAt: new Date().toISOString() }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useEsgStore.setState({
    companyId: "co-1",
    companyName: "",
    workbook: {
      companyId: "co-1",
      sections: { assumptions: { cells: { B6: "Standard" } } },
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
});

describe("useEsgStore report scope (Part 4)", () => {
  it("defaults to framework mode with every topic selected", () => {
    expect(useEsgStore.getState().getReportMode()).toBe("framework");
    expect(useEsgStore.getState().getSelectedTopics()).toEqual(ALL_ESG_TOPIC_IDS);
  });

  it("persists mode via the assumptions section like stance, preserving other cells", async () => {
    okSave();
    await useEsgStore.getState().setReportMode("topic");

    expect(useEsgStore.getState().getReportMode()).toBe("topic");
    const cells = useEsgStore.getState().workbook?.sections?.assumptions?.cells;
    expect(cells?._reportMode).toBe("topic");
    expect(cells?.B6).toBe("Standard");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/section/assumptions"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("toggleTopic deselects then reselects, round-tripping through the cells CSV", async () => {
    okSave();
    await useEsgStore.getState().toggleTopic("e-water");
    expect(useEsgStore.getState().getSelectedTopics()).toEqual(
      ALL_ESG_TOPIC_IDS.filter((id) => id !== "e-water"),
    );
    const csv = useEsgStore.getState().workbook?.sections?.assumptions?.cells?._selectedTopics;
    expect(typeof csv).toBe("string");
    expect(csv).not.toContain("e-water");

    okSave();
    await useEsgStore.getState().toggleTopic("e-water");
    expect(useEsgStore.getState().getSelectedTopics()).toEqual(ALL_ESG_TOPIC_IDS);
  });
});
