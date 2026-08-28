import { useMemo } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import type { ColumnDef } from "./sections";
import type { ColumnMapping, NormalizedRow } from "@/lib/tabularNormalize";

const DEFAULT_COL_WIDTH = 120;
const MAX_PREVIEW_ROWS = 50;

interface Props {
  columns: ColumnDef[];
  mapping: ColumnMapping[];
  rows: NormalizedRow[];
  /** Source headers that were not mapped to any target field (shown, never hidden). */
  unmappedHeaders?: string[];
  maxRows?: number;
}

function methodLabel(method: ColumnMapping["method"]): { text: string; cls: string; ai?: boolean } {
  switch (method) {
    case "exact":
      return { text: "exact", cls: "text-emerald-400" };
    case "alias":
      return { text: "matched", cls: "text-emerald-400" };
    case "fuzzy":
      return { text: "fuzzy", cls: "text-amber-400" };
    case "ai":
      return { text: "AI", cls: "text-blue-400", ai: true };
    case "position":
      return { text: "by position", cls: "text-[#8e8e93]" };
    default:
      return { text: "unmapped", cls: "text-[#636366]" };
  }
}

function display(value: unknown, col: ColumnDef): string {
  if (col.type === "boolean") return value ? "TRUE" : "FALSE";
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/**
 * Renders an incoming dataset already aligned to the TARGET section columns:
 * every column header sits directly above the data that will land in that
 * field, with a sub-header showing which source column it came from. This is
 * the shared preview used by both the paste-confirm modal and the section
 * Excel import, so columns always line up with their destination.
 */
export function MappingPreviewTable({
  columns,
  mapping,
  rows,
  unmappedHeaders = [],
  maxRows = MAX_PREVIEW_ROWS,
}: Props) {
  const mappingByTarget = useMemo(() => {
    const m = new Map<string, ColumnMapping>();
    for (const entry of mapping) {
      if (entry.targetKey) m.set(entry.targetKey, entry);
    }
    return m;
  }, [mapping]);

  const visibleRows = rows.slice(0, maxRows);
  const flagCount = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + Object.values(r.cells).filter((c) => c.flag).length,
        0,
      ),
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#8e8e93]">
        <span data-testid="mapping-preview-rowcount">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        <span>{mappingByTarget.size} columns mapped</span>
        {flagCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-400" data-testid="mapping-preview-flags">
            <AlertTriangle className="h-3 w-3" />
            {flagCount} cell{flagCount === 1 ? "" : "s"} need review
          </span>
        )}
        {rows.length > visibleRows.length && (
          <span className="text-[#636366]">showing first {visibleRows.length}</span>
        )}
      </div>

      <div
        className="rounded-xl border border-[#2c2c2e] bg-[#0e0e10] overflow-auto max-h-[48vh]"
        data-testid="mapping-preview-table"
      >
        <table className="text-[13px] border-collapse table-fixed">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1c1c1e]">
              <th className="w-10 p-2 border-b border-r border-[#2c2c2e] sticky left-0 bg-[#1c1c1e] z-20" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width || DEFAULT_COL_WIDTH, minWidth: col.width || DEFAULT_COL_WIDTH }}
                  className="text-left px-3 py-2 font-semibold text-[#d1d1d6] border-b border-r border-[#2c2c2e] text-[11px] align-bottom"
                >
                  {col.label}
                  {col.required && <span className="text-status-error ml-0.5">*</span>}
                </th>
              ))}
            </tr>
            <tr className="bg-[#161618]">
              <th className="w-10 p-1 border-b border-r border-[#2c2c2e] sticky left-0 bg-[#161618] z-20" />
              {columns.map((col) => {
                const entry = mappingByTarget.get(col.key);
                const meta = entry ? methodLabel(entry.method) : methodLabel("unmapped");
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width || DEFAULT_COL_WIDTH, minWidth: col.width || DEFAULT_COL_WIDTH }}
                    className="text-left px-3 py-1.5 border-b border-r border-[#2c2c2e] font-normal"
                  >
                    {entry ? (
                      <span className="inline-flex items-center gap-1 text-[10px]">
                        <span className="text-[#8e8e93] truncate max-w-[90px]" title={entry.sourceHeader || "(by position)"}>
                          {entry.sourceHeader || "col " + (entry.sourceIndex + 1)}
                        </span>
                        <ArrowRight className="h-2.5 w-2.5 text-[#48484a] shrink-0" />
                        <span className={`inline-flex items-center gap-0.5 ${meta.cls}`}>
                          {meta.ai && <Sparkles className="h-2.5 w-2.5" />}
                          {meta.text}
                        </span>
                        {/* The column name fit more than one field. The pick was
                            made, but not earned — say so, and say what else it
                            could have been, so a reviewer can settle it. */}
                        {entry.ambiguous && (
                          <span
                            className="text-amber-400 shrink-0"
                            data-testid={`mapping-ambiguous-${col.key}`}
                            title={
                              `"${entry.sourceHeader}" also matches ` +
                              `${(entry.alternatives ?? []).map((a) => a.targetKey).join(", ")}. ` +
                              `Check this column before importing.`
                            }
                          >
                            ?
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#636366] italic">not imported</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rIdx) => (
              <tr key={row._id} className="hover:bg-white/[0.02]" data-testid={`mapping-preview-row-${rIdx}`}>
                <td className="text-[#636366] text-[11px] text-center border-b border-r border-[#2c2c2e] p-1.5 sticky left-0 bg-[#0e0e10] z-[1]">
                  {rIdx + 1}
                </td>
                {columns.map((col) => {
                  const cell = row.cells[col.key];
                  const flag = cell?.flag;
                  const isError = flag?.level === "error";
                  return (
                    <td
                      key={col.key}
                      style={{ width: col.width || DEFAULT_COL_WIDTH, minWidth: col.width || DEFAULT_COL_WIDTH }}
                      className={`border-b border-r border-[#2c2c2e] px-3 py-2 relative ${
                        isError
                          ? "bg-status-error-bg/30"
                          : flag
                            ? "bg-amber-500/10"
                            : cell?.changed
                              ? "bg-blue-500/[0.06]"
                              : ""
                      }`}
                      title={flag?.message}
                    >
                      <span className="text-white truncate block min-h-[18px]">
                        {cell ? display(cell.value, col) : ""}
                      </span>
                      {flag && (
                        <span
                          className={`absolute right-1 top-1.5 ${isError ? "text-status-error" : "text-amber-400"}`}
                          title={flag.message}
                        >
                          <AlertCircle className="h-3 w-3" />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmappedHeaders.length > 0 && (
        <div className="rounded-lg border border-[#2c2c2e] bg-[#161618] px-3 py-2 text-[11px] text-[#8e8e93]">
          <span className="text-[#d1d1d6] font-medium">Not imported:</span>{" "}
          {unmappedHeaders.join(", ")} — no matching field. Rename the column to match a field, or paste into the
          target column directly.
        </div>
      )}
    </div>
  );
}
