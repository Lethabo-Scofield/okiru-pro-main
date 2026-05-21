import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, X } from "lucide-react";
import {
  EXTRACTED_FIELD_LABELS,
  type ExcelExtractionResult,
  type ExtractedCompanyData,
  type FieldStatus,
} from "@/lib/excelImport";

function formatValue(key: keyof ExtractedCompanyData, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "number") {
    if (key.includes("Percent") || key.includes("Ownership")) {
      return `${value}%`;
    }
    return `R ${value.toLocaleString("en-ZA")}`;
  }
  return String(value);
}

function StatusIcon({ status }: { status: FieldStatus | undefined }) {
  if (status === "mapped") return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  return <HelpCircle className="h-4 w-4 text-[#636366] shrink-0" />;
}

export function ExcelImportPreviewModal({
  open,
  fileName,
  result,
  importing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  result: ExcelExtractionResult | null;
  importing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const rows = useMemo(() => {
    if (!result) return [];
    const keys = Object.keys(EXTRACTED_FIELD_LABELS) as Array<keyof ExtractedCompanyData>;
    return keys
      .map((key) => ({
        key,
        label: EXTRACTED_FIELD_LABELS[key],
        value: result.data[key],
        status: result.fieldStatuses[key] ?? (result.data[key] !== undefined ? "mapped" : "unrecognized"),
      }))
      .filter((r) => r.value !== undefined || r.status !== "unrecognized");
  }, [result]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] shadow-2xl flex flex-col"
        data-testid="modal-excel-import-preview"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#2c2c2e]">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Import Preview</h2>
            <p className="text-[12px] text-[#8e8e93] mt-0.5 truncate max-w-md">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#8e8e93] hover:text-white smooth"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!result?.isBeeGatheringFormat ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-[13px] text-amber-100">
              This file does not match the BEE Information Gathering layout. Expected sheets like
              Instructions, Finance, and Ownership.
            </div>
          ) : (
            <>
              <div className="text-[12px] text-[#8e8e93]">
                Mapped sheets: {result.mappedSheets.join(", ") || "—"}
              </div>
              <div className="rounded-xl border border-[#2c2c2e] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#0e0e10] text-[#8e8e93] text-left">
                      <th className="px-3 py-2 font-medium w-[40%]">Field</th>
                      <th className="px-3 py-2 font-medium">Extracted Value</th>
                      <th className="px-3 py-2 font-medium w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-t border-[#2c2c2e]">
                        <td className="px-3 py-2 text-[#d1d1d6]">{row.label}</td>
                        <td className="px-3 py-2 text-white font-medium tabular-nums">
                          {formatValue(row.key, row.value)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusIcon status={row.status as FieldStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
                  <p className="text-[12px] font-semibold text-amber-200 mb-2">Warnings</p>
                  <ul className="space-y-1">
                    {result.warnings.map((w) => (
                      <li key={w} className="text-[12px] text-amber-100/90 flex gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#2c2c2e]">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-[13px] text-[#d1d1d6] hover:bg-white/[0.06] smooth press-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={importing || !result?.isBeeGatheringFormat || !result.data.companyName}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-[#e5e5e5] smooth press-sm disabled:opacity-50"
            data-testid="button-confirm-excel-import"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Use this data
          </button>
        </div>
      </div>
    </div>
  );
}
