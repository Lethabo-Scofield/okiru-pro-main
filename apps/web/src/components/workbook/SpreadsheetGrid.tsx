import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import type { ColumnDef } from "./sections";

type Row = Record<string, unknown> & { _id: string };

interface Props {
  columns: ColumnDef[];
  rows: Row[];
  onChange: (rows: Row[]) => void;
  /** Optional cross-field row validator merged into per-cell errors. */
  rowValidate?: (row: Record<string, unknown>) => Record<string, string>;
}

// A row counts as "empty" when no cell has user-entered content. Boolean
// columns default to `false` on row creation, so only `true` is treated as
// user data; non-boolean cells count as data when non-blank (trimmed).
function isRowEmpty(row: Row, columns: ColumnDef[]): boolean {
  for (const c of columns) {
    const v = row[c.key];
    if (c.type === "boolean") {
      if (v === true) return false;
      continue;
    }
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return false;
  }
  return true;
}

function makeId(): string {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyRow(columns: ColumnDef[]): Row {
  const r: Row = { _id: makeId() };
  for (const c of columns) {
    r[c.key] = c.type === "boolean" ? false : "";
  }
  return r;
}

export function SpreadsheetGrid({ columns, rows, onChange, rowValidate }: Props) {
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const validateRow = useCallback(
    (row: Row): Record<string, string> => {
      const errors: Record<string, string> = {};
      // Per ruleset global_rules: only validate a row if at least one cell has data.
      const empty = isRowEmpty(row, columns);
      for (const col of columns) {
        const v = row[col.key];
        const blank =
          v === "" || v === undefined || v === null ||
          (typeof v === "string" && v.trim() === "");
        if (!empty && col.required && blank) {
          errors[col.key] = "Required";
          continue;
        }
        if (col.validate) {
          const err = col.validate(v);
          if (err) errors[col.key] = err;
        }
      }
      if (!empty && rowValidate) {
        const crossErrs = rowValidate(row);
        for (const [k, msg] of Object.entries(crossErrs)) {
          if (!errors[k]) errors[k] = msg;
        }
      }
      return errors;
    },
    [columns, rowValidate],
  );

  const errorMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const r of rows) m[r._id] = validateRow(r);
    return m;
  }, [rows, validateRow]);

  const totalErrors = useMemo(
    () => Object.values(errorMap).reduce((sum, e) => sum + Object.keys(e).length, 0),
    [errorMap],
  );

  const updateCell = useCallback(
    (rowIdx: number, colKey: string, value: unknown) => {
      const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r));
      onChange(next);
    },
    [rows, onChange],
  );

  const addRow = useCallback(() => {
    onChange([...rows, emptyRow(columns)]);
    setTimeout(() => setActive({ row: rows.length, col: 0 }), 0);
  }, [rows, columns, onChange]);

  const deleteRow = useCallback(
    (rowIdx: number) => {
      onChange(rows.filter((_, i) => i !== rowIdx));
    },
    [rows, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!active) return;
      const { row, col } = active;
      const lastCol = columns.length - 1;
      const lastRow = rows.length - 1;

      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (row < lastRow) setActive({ row: row + 1, col });
        else if (e.key === "Enter") addRow();
      } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
        if (row > 0) {
          e.preventDefault();
          setActive({ row: row - 1, col });
        }
      } else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        if (col < lastCol) {
          e.preventDefault();
          setActive({ row, col: col + 1 });
        } else if (e.key === "Tab" && row < lastRow) {
          e.preventDefault();
          setActive({ row: row + 1, col: 0 });
        }
      } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        if (col > 0) {
          e.preventDefault();
          setActive({ row, col: col - 1 });
        }
      }
    },
    [active, columns.length, rows.length, addRow],
  );

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const sel = containerRef.current.querySelector<HTMLElement>(
      `[data-cell="${active.row}-${active.col}"] input, [data-cell="${active.row}-${active.col}"] select`,
    );
    sel?.focus();
  }, [active]);

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px] text-[#8e8e93]">
          <span data-testid="grid-row-count">{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
          {totalErrors > 0 && (
            <span className="inline-flex items-center gap-1 text-status-error" data-testid="grid-error-count">
              <AlertCircle className="h-3 w-3" />
              {totalErrors} validation {totalErrors === 1 ? "issue" : "issues"}
            </span>
          )}
        </div>
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold press-sm hover:bg-white/90 smooth"
          data-testid="button-add-row"
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
      </div>

      <div
        ref={containerRef}
        className="rounded-xl border border-[#2c2c2e] bg-[#0e0e10] overflow-auto max-h-[60vh]"
      >
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-[#1c1c1e] z-10">
            <tr>
              <th className="w-10 p-2 text-[#636366] font-medium text-[11px] border-b border-r border-[#2c2c2e]">
                #
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.width || 120 }}
                  className="text-left px-3 py-2 font-semibold text-[#d1d1d6] border-b border-r border-[#2c2c2e] uppercase tracking-wider text-[11px]"
                >
                  {c.label}
                  {c.required && <span className="text-status-error ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-10 p-2 border-b border-[#2c2c2e]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="text-center py-12 text-[#636366] text-[13px]"
                  data-testid="empty-state"
                >
                  No rows yet. Click <span className="text-[#d1d1d6] font-medium">Add row</span> to begin.
                </td>
              </tr>
            )}
            {rows.map((row, rIdx) => {
              const errs = errorMap[row._id] || {};
              return (
                <tr key={row._id} className="hover:bg-white/[0.02]" data-testid={`row-${rIdx}`}>
                  <td className="text-[#636366] text-[11px] text-center border-b border-r border-[#2c2c2e] p-1.5">
                    {rIdx + 1}
                  </td>
                  {columns.map((col, cIdx) => {
                    const v = row[col.key];
                    const err = errs[col.key];
                    const isActive = active?.row === rIdx && active?.col === cIdx;
                    return (
                      <td
                        key={col.key}
                        data-cell={`${rIdx}-${cIdx}`}
                        className={`border-b border-r border-[#2c2c2e] p-0 relative ${isActive ? "ring-1 ring-inset ring-blue-500" : ""} ${err ? "bg-status-error-bg/30" : ""}`}
                        onClick={() => setActive({ row: rIdx, col: cIdx })}
                        title={err || undefined}
                      >
                        {col.type === "select" ? (
                          <select
                            value={String(v ?? "")}
                            onChange={(e) => updateCell(rIdx, col.key, e.target.value)}
                            onFocus={() => setActive({ row: rIdx, col: cIdx })}
                            className="w-full bg-transparent px-3 py-2 text-[13px] text-white outline-none"
                            data-testid={`cell-${rIdx}-${col.key}`}
                          >
                            <option value="" className="bg-[#1c1c1e]">—</option>
                            {col.options?.map((o) => (
                              <option key={o} value={o} className="bg-[#1c1c1e]">
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : col.type === "boolean" ? (
                          <div className="flex items-center justify-center h-full py-2">
                            <input
                              type="checkbox"
                              checked={Boolean(v)}
                              onChange={(e) => updateCell(rIdx, col.key, e.target.checked)}
                              onFocus={() => setActive({ row: rIdx, col: cIdx })}
                              className="h-4 w-4 accent-blue-500"
                              data-testid={`cell-${rIdx}-${col.key}`}
                            />
                          </div>
                        ) : (
                          <input
                            type={col.type === "number" ? "number" : "text"}
                            value={String(v ?? "")}
                            onChange={(e) =>
                              updateCell(
                                rIdx,
                                col.key,
                                col.type === "number" && e.target.value !== ""
                                  ? Number(e.target.value)
                                  : e.target.value,
                              )
                            }
                            onFocus={() => setActive({ row: rIdx, col: cIdx })}
                            className="w-full bg-transparent px-3 py-2 text-[13px] text-white outline-none placeholder-[#48484a]"
                            placeholder={col.required ? "Required" : ""}
                            data-testid={`cell-${rIdx}-${col.key}`}
                          />
                        )}
                        {err && (
                          <span className="absolute right-1 top-1.5 text-status-error" title={err}>
                            <AlertCircle className="h-3 w-3" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-[#2c2c2e] p-1 text-center">
                    <button
                      onClick={() => deleteRow(rIdx)}
                      className="p-1.5 rounded hover:bg-white/[0.06] text-[#636366] hover:text-status-error smooth press-sm"
                      title="Delete row"
                      data-testid={`button-delete-row-${rIdx}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
