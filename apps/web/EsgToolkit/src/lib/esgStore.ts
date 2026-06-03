import { create } from "zustand";
import {
  fetchEsgWorkbook,
  saveEsgWorkbookSection,
  type EsgWorkbookData,
} from "@/lib/esgWorkbookStorage";
import { computeEsgScorecard, type EsgScorecardResult } from "./calculators";

type EsgStoreState = {
  companyId: string;
  companyName: string;
  workbook: EsgWorkbookData | null;
  scorecard: EsgScorecardResult | null;
  submittedAt: string | null;
  loading: boolean;
  saving: string | null;
  load: (companyId: string, companyName?: string) => Promise<void>;
  setCompanyName: (name: string) => void;
  updateSectionCells: (
    sectionId: string,
    cells: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
  recalculate: () => void;
  setSubmittedAt: (iso: string | null) => void;
};

export const useEsgStore = create<EsgStoreState>((set, get) => ({
  companyId: "",
  companyName: "",
  workbook: null,
  scorecard: null,
  submittedAt: null,
  loading: false,
  saving: null,

  async load(companyId, companyName = "") {
    set({ loading: true, companyId, companyName });
    try {
      const wb = await fetchEsgWorkbook(companyId);
      const submittedAt =
        (wb.sections?.assumptions?.cells?.["_submittedAt"] as string) ?? null;
      const scorecard = computeEsgScorecard(wb);
      set({ workbook: wb, scorecard, submittedAt, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setCompanyName(name) {
    set({ companyName: name });
  },

  async updateSectionCells(sectionId, cells) {
    const { companyId, workbook } = get();
    if (!companyId) return;
    set({ saving: sectionId });
    try {
      const next = await saveEsgWorkbookSection(companyId, sectionId, cells);
      const scorecard = computeEsgScorecard(next);
      set({ workbook: next, scorecard, saving: null });
    } catch {
      set({ saving: null });
    }
  },

  recalculate() {
    const { workbook } = get();
    set({ scorecard: computeEsgScorecard(workbook) });
  },

  setSubmittedAt(iso) {
    set({ submittedAt: iso });
  },
}));
