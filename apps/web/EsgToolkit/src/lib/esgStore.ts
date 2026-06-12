import { create } from "zustand";
import {
  fetchEsgWorkbook,
  saveEsgWorkbookSection,
  type EsgWorkbookData,
} from "@/lib/esgWorkbookStorage";
import { computeEsgScorecard, type EsgScorecardResult } from "./calculators";
import type { EsgTouchedState } from "@/lib/esg/esgValidationRules";
import { API_BASE } from "@toolkit/lib/config";

type LoadOptions = { force?: boolean };

export type EsgStanceLabel = "Lean" | "Standard" | "Strict";

type EsgStoreState = {
  companyId: string;
  companyName: string;
  workbook: EsgWorkbookData | null;
  scorecard: EsgScorecardResult | null;
  submittedAt: string | null;
  loading: boolean;
  saving: string | null;
  workbookLoadedAt: number;
  touched: EsgTouchedState;
  submitAttempted: boolean;
  validationExpanded: boolean;
  load: (companyId: string, companyName?: string, options?: LoadOptions) => Promise<void>;
  setCompanyName: (name: string) => void;
  updateSectionCells: (
    sectionId: string,
    cells: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
  recalculate: () => void;
  getStance: () => EsgStanceLabel;
  setStance: (stance: EsgStanceLabel) => Promise<void>;
  setSubmittedAt: (iso: string | null) => void;
  markTouched: (sectionId: string, fieldRef: string) => void;
  resetTouched: (sectionId?: string) => void;
  isTouched: (sectionId: string, fieldRef: string) => boolean;
  setSubmitAttempted: (v: boolean) => void;
  setValidationExpanded: (v: boolean) => void;
  seedDemo: (companyId: string) => Promise<void>;
};

const LOAD_GUARD_MS = 60_000;

export const useEsgStore = create<EsgStoreState>((set, get) => ({
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

  async load(companyId, companyName = "", options = {}) {
    const state = get();
    if (
      !options.force &&
      state.companyId === companyId &&
      state.workbook &&
      Date.now() - state.workbookLoadedAt < LOAD_GUARD_MS
    ) {
      if (companyName) set({ companyName });
      return;
    }
    set({ loading: true, companyId, companyName: companyName || state.companyName });
    try {
      const wb = await fetchEsgWorkbook(companyId);
      const submittedAt =
        (wb.sections?.assumptions?.cells?.["_submittedAt"] as string) ?? null;
      const scorecard = computeEsgScorecard(wb);
      set({
        workbook: wb,
        scorecard,
        submittedAt,
        loading: false,
        workbookLoadedAt: Date.now(),
      });
    } catch {
      set({ loading: false });
    }
  },

  setCompanyName(name) {
    set({ companyName: name });
  },

  async updateSectionCells(sectionId, cells) {
    const { companyId, workbook } = get();
    if (!companyId || !workbook) return;
    const optimistic: EsgWorkbookData = {
      ...workbook,
      sections: {
        ...workbook.sections,
        [sectionId]: { cells },
      },
      updatedAt: new Date().toISOString(),
    };
    set({
      saving: sectionId,
      workbook: optimistic,
      scorecard: computeEsgScorecard(optimistic),
    });
    try {
      const next = await saveEsgWorkbookSection(companyId, sectionId, cells, optimistic);
      const scorecard = computeEsgScorecard(next);
      set({ workbook: next, scorecard, saving: null, workbookLoadedAt: Date.now() });
    } catch {
      set({ saving: null });
      throw new Error("save failed");
    }
  },

  recalculate() {
    const { workbook } = get();
    set({ scorecard: computeEsgScorecard(workbook) });
  },

  getStance() {
    const raw = get().workbook?.sections?.assumptions?.cells?.B6;
    const v = String(raw ?? "Standard");
    if (v === "Lean" || v === "Strict") return v;
    return "Standard";
  },

  async setStance(stance) {
    const { workbook, companyId } = get();
    if (!workbook || !companyId) return;
    const cells = { ...(workbook.sections?.assumptions?.cells ?? {}), B6: stance };
    await get().updateSectionCells("assumptions", cells);
    get().recalculate();
  },

  setSubmittedAt(iso) {
    set({ submittedAt: iso });
  },

  markTouched(sectionId, fieldRef) {
    set((s) => ({
      touched: {
        ...s.touched,
        [sectionId]: { ...s.touched[sectionId], [fieldRef]: true },
      },
    }));
  },

  resetTouched(sectionId) {
    if (!sectionId) {
      set({ touched: {} });
      return;
    }
    set((s) => {
      const next = { ...s.touched };
      delete next[sectionId];
      return { touched: next };
    });
  },

  isTouched(sectionId, fieldRef) {
    return Boolean(get().touched[sectionId]?.[fieldRef]);
  },

  setSubmitAttempted(v) {
    set({ submitAttempted: v });
  },

  setValidationExpanded(v) {
    set({ validationExpanded: v });
  },

  async seedDemo(companyId) {
    const res = await fetch(`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/seed-demo`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("seed-demo failed");
  },
}));
