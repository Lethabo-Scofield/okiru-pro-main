import { Trash2 } from "lucide-react";
import type { ColumnDef } from "./sections";
import { coerceYesNo, yesNoToSelectValue } from "@/lib/yesNoValue";
import { NumericDateInput } from "@/components/ui/NumericDateInput";

type Row = Record<string, unknown> & { _id: string };

interface Props {
  columns: ColumnDef[];
  rows: Row[];
  onChange: (rows: Row[]) => void;
  readOnly?: boolean;
  canDeleteRows?: boolean;
}

export function FormModeGrid({
  columns,
  rows,
  onChange,
  readOnly = false,
  canDeleteRows = true,
}: Props) {
  const updateCell = (rowIdx: number, colKey: string, value: unknown) => {
    if (readOnly) return;
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r)));
  };

  const deleteRow = (rowIdx: number) => {
    if (readOnly || !canDeleteRows) return;
    onChange(rows.filter((_, i) => i !== rowIdx));
  };

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-12 px-6 text-center text-[13px] text-[#636366]"
        data-testid="form-mode-empty"
      >
        No records yet. Switch to spreadsheet mode or add a row.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="form-mode-grid">
      {rows.map((row, rIdx) => (
        <div
          key={row._id}
          className="rounded-xl border border-[#2c2c2e] bg-[#0e0e10] p-4"
          data-testid={`form-row-${rIdx}`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wide">
              Record {rIdx + 1}
            </span>
            {canDeleteRows && !readOnly && (
              <button
                type="button"
                onClick={() => deleteRow(rIdx)}
                className="p-1.5 rounded hover:bg-white/[0.06] text-[#636366] hover:text-status-error smooth press-sm"
                title="Delete record"
                data-testid={`form-delete-row-${rIdx}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {columns.map((f) => {
              const v = row[f.key];
              const blank =
                v === "" || v === undefined || v === null ||
                (typeof v === "string" && v.trim() === "");
              const err = f.required && blank ? "Required" : f.validate ? f.validate(v) : null;
              return (
                <label key={f.key} className="block" data-testid={`form-field-${rIdx}-${f.key}`}>
                  <div className="text-[12px] text-[#8e8e93] mb-1.5 flex items-center gap-1">
                    {f.label}
                    {f.required && <span className="text-status-error">*</span>}
                  </div>
                  {f.type === "select" ? (
                    <select
                      value={f.yesNoBoolean ? yesNoToSelectValue(v) : String(v ?? "")}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateCell(
                          rIdx,
                          f.key,
                          f.yesNoBoolean ? coerceYesNo(e.target.value) : e.target.value,
                        )
                      }
                      className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-[#48484a] disabled:opacity-60"
                    >
                      <option value="" className="bg-[#1c1c1e]">—</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o} className="bg-[#1c1c1e]">{o}</option>
                      ))}
                    </select>
                  ) : f.type === "boolean" ? (
                    <div className="flex items-center h-9">
                      <input
                        type="checkbox"
                        checked={Boolean(v)}
                        disabled={readOnly}
                        onChange={(e) => updateCell(rIdx, f.key, e.target.checked)}
                        className="h-4 w-4 accent-blue-500 disabled:opacity-60"
                      />
                    </div>
                  ) : f.type === "date" ? (
                    <NumericDateInput
                      value={String(v ?? "")}
                      disabled={readOnly}
                      onChange={(iso) => updateCell(rIdx, f.key, iso)}
                      className={`w-full bg-[#1c1c1e] border rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a] disabled:opacity-60 ${err ? "border-status-error" : "border-[#2c2c2e]"}`}
                      placeholder="dd/mm/yyyy"
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={String(v ?? "")}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateCell(
                          rIdx,
                          f.key,
                          f.type === "number" && e.target.value !== ""
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      className={`w-full bg-[#1c1c1e] border rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a] disabled:opacity-60 ${err ? "border-status-error" : "border-[#2c2c2e]"}`}
                      placeholder={f.required ? "Required" : ""}
                    />
                  )}
                  {err && <div className="text-[11px] text-status-error mt-1">{err}</div>}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
