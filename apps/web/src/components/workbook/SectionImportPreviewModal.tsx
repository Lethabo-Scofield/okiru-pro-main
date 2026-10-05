import { Loader2, Sparkles, X } from "lucide-react";
import type { SectionImportDiff } from "@/lib/workbookSectionImportExport";
import type { ColumnDef } from "./sections";
import type { NormalizationResult } from "@/lib/tabularNormalize";
import { MappingPreviewTable } from "./MappingPreviewTable";

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
  /** Target columns + normalized mapping result for the aligned preview. */
  columns?: ColumnDef[];
  normalization?: NormalizationResult | null;
  usedAi?: boolean;
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
  columns,
  normalization,
  usedAi,
}: Props) {
  if (!open) return null;

  const showMapping = Boolean(columns?.length && normalization);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[color:var(--ink)]/70 p-4"
      onClick={() => !importing && onClose()}
      data-testid="section-import-preview-modal"
    >
      <div
        className={`w-full ${showMapping ? "max-w-4xl" : "max-w-lg"} max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-[color:var(--ink-3)] border border-[color:var(--rule)] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-[16px] font-semibold text-white flex items-center gap-2">
              Import {sectionLabel}
              {usedAi && (
                <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-normal">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-assisted
                </span>
              )}
            </h2>
            <p className="text-[12px] text-[color:var(--body)] mt-0.5 truncate">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[color:var(--body)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {showMapping && normalization && columns && (
            <MappingPreviewTable
              columns={columns}
              mapping={normalization.mapping}
              rows={normalization.rows}
              unmappedHeaders={normalization.unmappedHeaders}
            />
          )}
          {diff ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <div className="text-[20px] font-bold text-emerald-400">{diff.added.length}</div>
                <div className="text-[11px] text-[color:var(--body)]">To add</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <div className="text-[20px] font-bold text-amber-400">{diff.updated.length}</div>
                <div className="text-[11px] text-[color:var(--body)]">To update</div>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <div className="text-[20px] font-bold text-red-400">
                  {importMode === "replace" ? diff.removed.length : 0}
                </div>
                <div className="text-[11px] text-[color:var(--body)]">To remove</div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-[color:var(--body)]">Parsing file…</div>
          )}

          <div className="space-y-2">
            <div className="text-[12px] text-[color:var(--body)] font-medium">Import mode</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onImportModeChange("append")}
                className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium smooth ${
                  importMode === "append"
                    ? "bg-white text-black"
                    : "bg-[rgba(255,255,255,0.06)] text-[color:var(--body)] hover:bg-[rgba(255,255,255,0.10)]"
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
                      : "bg-[rgba(255,255,255,0.06)] text-[color:var(--body)] hover:bg-[rgba(255,255,255,0.10)]"
                  }`}
                  data-testid="import-mode-replace"
                >
                  Replace all
                </button>
              )}
            </div>
            <p className="text-[11px] text-[color:var(--muted)]">
              Only this section will be updated. Other workbook sections stay unchanged.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.06)] text-[13px] text-[color:var(--body)] hover:bg-[rgba(255,255,255,0.10)] disabled:opacity-60"
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
