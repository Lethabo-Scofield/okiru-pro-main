import { Loader2, X } from "lucide-react";
import type { SectionImportDiff } from "@/lib/workbookSectionImportExport";

interface Props {
  open: boolean;
  sectionLabel: string;
  fileName: string;
  diff: SectionImportDiff | null;
  importMode: "append" | "replace";
  onImportModeChange: (mode: "append" | "replace") => void;
  canReplace: boolean;
  importing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function SectionImportPreviewModal({
  open,
  sectionLabel,
  fileName,
  diff,
  importMode,
  onImportModeChange,
  canReplace,
  importing,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={() => !importing && onClose()}
      data-testid="section-import-preview-modal"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Import {sectionLabel}</h2>
            <p className="text-[12px] text-[#8e8e93] mt-0.5 truncate">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#8e8e93]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {diff ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <div className="text-[20px] font-bold text-emerald-400">{diff.added.length}</div>
                <div className="text-[11px] text-[#8e8e93]">To add</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <div className="text-[20px] font-bold text-amber-400">{diff.updated.length}</div>
                <div className="text-[11px] text-[#8e8e93]">To update</div>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <div className="text-[20px] font-bold text-red-400">
                  {importMode === "replace" ? diff.removed.length : 0}
                </div>
                <div className="text-[11px] text-[#8e8e93]">To remove</div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-[#8e8e93]">Parsing file…</div>
          )}

          <div className="space-y-2">
            <div className="text-[12px] text-[#8e8e93] font-medium">Import mode</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onImportModeChange("append")}
                className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium smooth ${
                  importMode === "append"
                    ? "bg-white text-black"
                    : "bg-[#2c2c2e] text-[#d1d1d6] hover:bg-[#3a3a3c]"
                }`}
                data-testid="import-mode-append"
              >
                Append / merge
              </button>
              {canReplace && (
                <button
                  type="button"
                  onClick={() => onImportModeChange("replace")}
                  className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium smooth ${
                    importMode === "replace"
                      ? "bg-white text-black"
                      : "bg-[#2c2c2e] text-[#d1d1d6] hover:bg-[#3a3a3c]"
                  }`}
                  data-testid="import-mode-replace"
                >
                  Replace all
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#636366]">
              Only this section will be updated. Other workbook sections stay unchanged.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-[#2c2c2e] text-[13px] text-[#d1d1d6] hover:bg-[#3a3a3c] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={importing || !diff}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-white/90 disabled:opacity-60"
            data-testid="confirm-section-import"
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm import
          </button>
        </div>
      </div>
    </div>
  );
}
