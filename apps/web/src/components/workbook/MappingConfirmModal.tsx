import { Loader2, Sparkles, X } from "lucide-react";
import type { ColumnDef } from "./sections";
import type { NormalizationResult } from "@/lib/tabularNormalize";
import { MappingPreviewTable } from "./MappingPreviewTable";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  result: NormalizationResult | null;
  usedAi?: boolean;
  notes?: string[];
  loading?: boolean;
  busy?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Non-blocking confirm dialog shown before committing pasted/imported tabular
 * data. Surfaces the proposed column→field mapping (aligned to the target
 * columns) and any per-cell validation flags so the user can verify before the
 * data lands in the grid.
 */
export function MappingConfirmModal({
  open,
  title,
  subtitle,
  columns,
  result,
  usedAi = false,
  notes = [],
  loading = false,
  busy = false,
  confirmLabel = "Apply to grid",
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  const hasErrors = result
    ? result.rows.some((r) => Object.values(r.cells).some((c) => c.flag?.level === "error"))
    : false;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
      data-testid="mapping-confirm-modal"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#2c2c2e]">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-white flex items-center gap-2">
              {title}
              {usedAi && (
                <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-normal">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-assisted
                </span>
              )}
            </h2>
            {subtitle && <p className="text-[12px] text-[#8e8e93] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#8e8e93] hover:text-white smooth disabled:opacity-60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading || !result ? (
            <div className="flex items-center gap-2 text-[13px] text-[#8e8e93] py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing and mapping data…
            </div>
          ) : (
            <>
              <MappingPreviewTable
                columns={columns}
                mapping={result.mapping}
                rows={result.rows}
                unmappedHeaders={result.unmappedHeaders}
              />
              {notes.length > 0 && (
                <ul className="space-y-1">
                  {notes.map((n) => (
                    <li key={n} className="text-[11px] text-[#8e8e93]">
                      • {n}
                    </li>
                  ))}
                </ul>
              )}
              {hasErrors && (
                <div className="rounded-lg border border-status-error/30 bg-status-error-bg/20 px-3 py-2 text-[12px] text-status-error">
                  Some cells couldn’t be normalized and will be left blank. You can fix them in the grid after importing.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#2c2c2e]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] text-[#d1d1d6] hover:bg-white/[0.06] smooth press-sm disabled:opacity-60"
            data-testid="mapping-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || loading || !result || result.rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-[#e5e5e5] smooth press-sm disabled:opacity-50"
            data-testid="mapping-confirm-apply"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
