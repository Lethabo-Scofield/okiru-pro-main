import { useMemo } from "react";
import type { EsgImportPreview } from "@/lib/esg/esgWorkbookImport";
import { analyseEsgImport, describeEsgImport, type EsgWorkbookLike } from "@/lib/esg/esgImportAnalysis";
import { EsgImportAnalysisPanel } from "./EsgImportAnalysisPanel";

type Props = {
  open: boolean;
  preview: EsgImportPreview | null;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  /**
   * The workbook being imported INTO.
   *
   * Without it the dialog can only count cells; with it the dialog can say
   * which of them replace figures already captured — which is the only part of
   * an import that cannot be undone, and the only reason to ask before doing it.
   */
  workbook?: EsgWorkbookLike | null;
  /** Section id → the wording a practitioner recognises. */
  sectionLabels?: Record<string, string>;
};

export function EsgImportPreviewModal({
  open, preview, onClose, onConfirm, confirming, workbook = null, sectionLabels,
}: Props) {
  // Hooks run before the early return: an import preview opening and closing
  // must not change the hook order.
  const analysis = useMemo(
    () => (preview ? analyseEsgImport(preview, workbook) : null),
    [preview, workbook],
  );
  if (!open || !preview || !analysis) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="esg-import-preview-modal"
    >
      <div className="max-w-xl w-full rounded-2xl border border-white/[0.06] bg-[#141416] p-6">
        <h3 className="text-[16px] font-semibold text-white mb-1">Import preview</h3>
        <p className="text-[12px] text-[#8e8e93] mb-4">{describeEsgImport(analysis)}.</p>
        <div className="mb-4 max-h-[46vh] overflow-y-auto pr-1">
          <EsgImportAnalysisPanel analysis={analysis} sectionLabels={sectionLabels} />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#2c2c2e] text-[13px] text-[#d1d1d6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-[13px] font-semibold disabled:opacity-50"
            data-testid="esg-import-confirm"
          >
            {confirming
              ? "Importing…"
              : analysis.overwrites.length > 0
                ? `Replace ${analysis.overwrites.length} and import`
                : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
