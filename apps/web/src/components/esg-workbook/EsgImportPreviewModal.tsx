import { useEffect, useMemo, useState } from "react";
import type { EsgImportPreview } from "@/lib/esg/esgWorkbookImport";
import { analyseEsgImport, describeEsgImport, type EsgWorkbookLike } from "@/lib/esg/esgImportAnalysis";
import { EsgImportAnalysisPanel } from "./EsgImportAnalysisPanel";

type Props = {
  open: boolean;
  preview: EsgImportPreview | null;
  onClose: () => void;
  /** Confirm, with the registers the person chose to replace with the file's rows. */
  onConfirm: (replace: string[]) => void;
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
  // Registers to REPLACE with the file's rows — chosen per register, for the
  // client who sends a complete corrected list. Every new file starts at the
  // safe default: update and add, remove nothing.
  const [replace, setReplace] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setReplace(new Set()), [preview]);

  // Hooks run before the early return: an import preview opening and closing
  // must not change the hook order.
  const analysis = useMemo(
    () => (preview ? analyseEsgImport(preview, workbook, replace) : null),
    [preview, workbook, replace],
  );
  if (!open || !preview || !analysis) return null;

  const removed = (analysis.registers ?? []).reduce((n, r) => n + (r.removed ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink)]/70 p-4"
      data-testid="esg-import-preview-modal"
    >
      <div className="max-w-xl w-full rounded-2xl border border-white/[0.06] bg-[color:var(--ink-3)] p-6">
        <h3 className="text-[16px] font-semibold text-white mb-1">Import preview</h3>
        <p className="text-[12px] text-[color:var(--body)] mb-4">{describeEsgImport(analysis)}.</p>
        <div className="mb-4 max-h-[46vh] overflow-y-auto pr-1">
          <EsgImportAnalysisPanel
            analysis={analysis}
            sectionLabels={sectionLabels}
            replace={replace}
            onReplaceChange={(sectionId, on) =>
              setReplace((prior) => {
                const next = new Set(prior);
                if (on) next.add(sectionId);
                else next.delete(sectionId);
                return next;
              })
            }
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[color:var(--rule)] text-[13px] text-[color:var(--body)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={() => onConfirm(Array.from(replace))}
            // The one primary action here wears the ESG accent, like every
            // other confirm in this flow. A raw Tailwind blue ignored the
            // theme and was the last thing on the page still reading as blue.
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#08090b] disabled:opacity-50"
            style={{ background: "var(--esg-acc-e, #22c55e)" }}
            data-testid="esg-import-confirm"
          >
            {confirming
              ? "Importing…"
              : removed > 0
                ? `Remove ${removed} register row${removed === 1 ? "" : "s"} and import`
                : analysis.overwrites.length > 0
                  ? `Replace ${analysis.overwrites.length} and import`
                  : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
