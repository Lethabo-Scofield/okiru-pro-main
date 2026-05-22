import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2, AlertCircle, Maximize2, Minimize2, X, Undo2 } from "lucide-react";
import type { ColumnDef } from "./sections";
import { applyPasteToRows, parseClipboardMatrix } from "@/lib/workbookGridParse";

type Row = Record<string, unknown> & { _id: string };

interface Props {
  columns: ColumnDef[];
  rows: Row[];
  onChange: (rows: Row[]) => void;
  rowValidate?: (row: Record<string, unknown>) => Record<string, string>;
  sectionLabel?: string;
  sectionDescription?: string;
  readOnly?: boolean;
  canDeleteRows?: boolean;
  canAddRows?: boolean;
}

type CellRef = { row: number; col: number };

const VIRTUAL_THRESHOLD = 100;
const ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = 120;

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

function normalizeRange(a: CellRef, b: CellRef): { minR: number; maxR: number; minC: number; maxC: number } {
  return {
    minR: Math.min(a.row, b.row),
    maxR: Math.max(a.row, b.row),
    minC: Math.min(a.col, b.col),
    maxC: Math.max(a.col, b.col),
  };
}

function cellInRange(row: number, col: number, range: ReturnType<typeof normalizeRange> | null): boolean {
  if (!range) return false;
  return row >= range.minR && row <= range.maxR && col >= range.minC && col <= range.maxC;
}

export function SpreadsheetGrid({
  columns,
  rows,
  onChange,
  rowValidate,
  sectionLabel,
  sectionDescription,
  readOnly = false,
  canDeleteRows = true,
  canAddRows = true,
}: Props) {
  const [active, setActive] = useState<CellRef | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellRef | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const c of columns) w[c.key] = c.width || DEFAULT_COL_WIDTH;
    return w;
  });
  const [undoStack, setUndoStack] = useState<Row[][]>([]);
  const [pastePreview, setPastePreview] = useState<{ rows: number; cols: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragAnchor = useRef<CellRef | null>(null);
  const isDragging = useRef(false);
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const useVirtual = rows.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  });

  const selectionRange = useMemo(() => {
    if (!active || !selectionEnd) return null;
    return normalizeRange(active, selectionEnd);
  }, [active, selectionEnd]);

  const pushUndo = useCallback((snapshot: Row[]) => {
    setUndoStack((prev) => [...prev.slice(-19), snapshot.map((r) => ({ ...r }))]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onChange(last.map((r) => ({ ...r })));
      return prev.slice(0, -1);
    });
  }, [onChange]);

  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, exitFullscreen]);

  const validateRow = useCallback(
    (row: Row): Record<string, string> => {
      const errors: Record<string, string> = {};
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
      if (readOnly) return;
      pushUndo(rows);
      const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r));
      onChange(next);
    },
    [rows, onChange, readOnly, pushUndo],
  );

  const addRow = useCallback(() => {
    if (readOnly || !canAddRows) return;
    pushUndo(rows);
    onChange([...rows, emptyRow(columns)]);
    setTimeout(() => {
      setActive({ row: rows.length, col: 0 });
      setSelectionEnd({ row: rows.length, col: 0 });
      setSelectedRow(rows.length);
    }, 0);
  }, [rows, columns, onChange, readOnly, canAddRows, pushUndo]);

  const deleteRow = useCallback(
    (rowIdx: number) => {
      if (readOnly || !canDeleteRows) return;
      pushUndo(rows);
      onChange(rows.filter((_, i) => i !== rowIdx));
      setSelectedRow(null);
      setActive(null);
      setSelectionEnd(null);
    },
    [rows, onChange, readOnly, canDeleteRows, pushUndo],
  );

  const handlePaste = useCallback(
    (text: string) => {
      if (readOnly || !active) return;
      const matrix = parseClipboardMatrix(text);
      if (matrix.length === 0) return;

      const firstRowLooksLikeHeaders = matrix[0]?.some((h) =>
        columns.some((c) => c.label.toLowerCase().includes(h.trim().toLowerCase().slice(0, 6))),
      );

      pushUndo(rows);
      const next = applyPasteToRows(
        rows,
        columns,
        matrix,
        active,
        Boolean(firstRowLooksLikeHeaders),
      );
      onChange(next);
      setPastePreview(null);
    },
    [readOnly, active, columns, rows, onChange, pushUndo],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPaste = (e: ClipboardEvent) => {
      if (readOnly) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text || !active) return;
      e.preventDefault();
      const matrix = parseClipboardMatrix(text);
      if (matrix.length > 0) {
        setPastePreview({ rows: matrix.length, cols: matrix[0]?.length ?? 0 });
        handlePaste(text);
      }
    };

    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [readOnly, active, handlePaste]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (!active) return;
      const { row, col } = active;
      const lastCol = columns.length - 1;
      const lastRow = rows.length - 1;

      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const nr = row < lastRow ? row + 1 : row;
        if (row < lastRow) {
          const next = { row: nr, col };
          setActive(next);
          setSelectionEnd(next);
        } else if (e.key === "Enter" && canAddRows && !readOnly) addRow();
      } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
        if (row > 0) {
          e.preventDefault();
          const next = { row: row - 1, col };
          setActive(next);
          setSelectionEnd(next);
        }
      } else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        if (col < lastCol) {
          e.preventDefault();
          const next = { row, col: col + 1 };
          setActive(next);
          setSelectionEnd(next);
        } else if (e.key === "Tab" && row < lastRow) {
          e.preventDefault();
          const next = { row: row + 1, col: 0 };
          setActive(next);
          setSelectionEnd(next);
        }
      } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        if (col > 0) {
          e.preventDefault();
          const next = { row, col: col - 1 };
          setActive(next);
          setSelectionEnd(next);
        }
      }
    },
    [active, columns.length, rows.length, addRow, undo, canAddRows, readOnly],
  );

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const sel = containerRef.current.querySelector<HTMLElement>(
      `[data-cell="${active.row}-${active.col}"] input, [data-cell="${active.row}-${active.col}"] select`,
    );
    sel?.focus();
  }, [active]);

  const handleCellMouseDown = (rIdx: number, cIdx: number, e: React.MouseEvent) => {
    const ref = { row: rIdx, col: cIdx };
    if (e.shiftKey && active) {
      setSelectionEnd(ref);
    } else {
      dragAnchor.current = ref;
      isDragging.current = true;
      setActive(ref);
      setSelectionEnd(ref);
      setSelectedRow(null);
    }
  };

  const handleCellMouseEnter = (rIdx: number, cIdx: number) => {
    if (!isDragging.current || !dragAnchor.current) return;
    setSelectionEnd({ row: rIdx, col: cIdx });
  };

  useEffect(() => {
    const up = () => {
      isDragging.current = false;
      dragAnchor.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const handleRowSelect = (rIdx: number) => {
    setSelectedRow(rIdx);
    setActive({ row: rIdx, col: 0 });
    setSelectionEnd({ row: rIdx, col: columns.length - 1 });
  };

  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, startX: e.clientX, startW: colWidths[key] || DEFAULT_COL_WIDTH };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const nextW = Math.max(60, resizeRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizeRef.current!.key]: nextW }));
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const renderCell = (row: Row, rIdx: number, col: ColumnDef, cIdx: number) => {
    const v = row[col.key];
    const errs = errorMap[row._id] || {};
    const err = errs[col.key];
    const isActive = active?.row === rIdx && active?.col === cIdx;
    const inSelection = cellInRange(rIdx, cIdx, selectionRange);
    const rowSelected = selectedRow === rIdx;

    return (
      <td
        key={col.key}
        data-cell={`${rIdx}-${cIdx}`}
        style={{ width: colWidths[col.key] || DEFAULT_COL_WIDTH, minWidth: colWidths[col.key] || DEFAULT_COL_WIDTH }}
        className={`border-b border-r border-[#2c2c2e] p-0 relative ${
          isActive ? "ring-1 ring-inset ring-blue-500 z-[1]" : ""
        } ${inSelection || rowSelected ? "bg-blue-500/10" : ""} ${err ? "bg-status-error-bg/30" : ""}`}
        onMouseDown={(e) => handleCellMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
        title={err || undefined}
      >
        {col.type === "select" ? (
          <select
            value={String(v ?? "")}
            disabled={readOnly}
            onChange={(e) => updateCell(rIdx, col.key, e.target.value)}
            onFocus={() => {
              setActive({ row: rIdx, col: cIdx });
              setSelectionEnd({ row: rIdx, col: cIdx });
            }}
            className="w-full bg-transparent px-3 py-2 text-[13px] text-white outline-none disabled:opacity-60"
            data-testid={`cell-${rIdx}-${col.key}`}
          >
            <option value="" className="bg-[#1c1c1e]">—</option>
            {col.options?.map((o) => (
              <option key={o} value={o} className="bg-[#1c1c1e]">{o}</option>
            ))}
          </select>
        ) : col.type === "boolean" ? (
          <div className="flex items-center justify-center h-full py-2">
            <input
              type="checkbox"
              checked={Boolean(v)}
              disabled={readOnly}
              onChange={(e) => updateCell(rIdx, col.key, e.target.checked)}
              onFocus={() => {
                setActive({ row: rIdx, col: cIdx });
                setSelectionEnd({ row: rIdx, col: cIdx });
              }}
              className="h-4 w-4 accent-blue-500 disabled:opacity-60"
              data-testid={`cell-${rIdx}-${col.key}`}
            />
          </div>
        ) : (
          <input
            type={col.type === "number" ? "number" : "text"}
            value={String(v ?? "")}
            readOnly={readOnly}
            onChange={(e) =>
              updateCell(
                rIdx,
                col.key,
                col.type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
            onFocus={() => {
              setActive({ row: rIdx, col: cIdx });
              setSelectionEnd({ row: rIdx, col: cIdx });
            }}
            className="w-full bg-transparent px-3 py-2 text-[13px] text-white outline-none placeholder-[#48484a] read-only:opacity-80"
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
  };

  const renderDataRow = (row: Row, rIdx: number) => (
    <tr key={row._id} className="hover:bg-white/[0.02]" data-testid={`row-${rIdx}`}>
      <td
        className={`text-[#636366] text-[11px] text-center border-b border-r border-[#2c2c2e] p-1.5 cursor-pointer select-none ${
          selectedRow === rIdx ? "bg-blue-500/20 text-blue-300" : ""
        }`}
        onClick={() => handleRowSelect(rIdx)}
        data-testid={`row-select-${rIdx}`}
      >
        {rIdx + 1}
      </td>
      {columns.map((col, cIdx) => renderCell(row, rIdx, col, cIdx))}
      <td className="border-b border-[#2c2c2e] p-1 text-center">
        {canDeleteRows && !readOnly && (
          <button
            type="button"
            onClick={() => deleteRow(rIdx)}
            className="p-1.5 rounded hover:bg-white/[0.06] text-[#636366] hover:text-status-error smooth press-sm"
            title="Delete row"
            data-testid={`button-delete-row-${rIdx}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );

  const toolbar = (
    <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-3 text-[12px] text-[#8e8e93]">
        <span data-testid="grid-row-count">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        {totalErrors > 0 && (
          <span className="inline-flex items-center gap-1 text-status-error" data-testid="grid-error-count">
            <AlertCircle className="h-3 w-3" />
            {totalErrors} validation {totalErrors === 1 ? "issue" : "issues"}
          </span>
        )}
        {pastePreview && (
          <span className="text-blue-400" data-testid="paste-preview">
            Pasted {pastePreview.rows}×{pastePreview.cols}
          </span>
        )}
        {readOnly && (
          <span className="text-amber-400/90 uppercase text-[10px] font-semibold tracking-wide">Read-only</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {undoStack.length > 0 && !readOnly && (
          <button
            type="button"
            onClick={undo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] text-[#d1d1d6] press-sm smooth"
            title="Undo (Ctrl+Z)"
            data-testid="button-undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        )}
        <button
          type="button"
          onClick={() => (isFullscreen ? exitFullscreen() : setIsFullscreen(true))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] text-[#d1d1d6] press-sm smooth"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          data-testid="button-grid-fullscreen"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit fullscreen
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              Fullscreen
            </>
          )}
        </button>
        {canAddRows && !readOnly && (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold press-sm hover:bg-white/90 smooth"
            data-testid="button-add-row"
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </button>
        )}
      </div>
    </div>
  );

  const gridTable = (
    <div
      ref={scrollRef}
      className={`rounded-xl border border-[#2c2c2e] bg-[#0e0e10] overflow-auto ${
        isFullscreen ? "flex-1 min-h-0" : "max-h-[60vh]"
      }`}
      data-testid="grid-scroll-container"
    >
      <table className="w-full text-[13px] border-collapse table-fixed">
        <thead className="sticky top-0 bg-[#1c1c1e] z-10">
          <tr>
            <th className="w-10 p-2 text-[#636366] font-medium text-[11px] border-b border-r border-[#2c2c2e]">#</th>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: colWidths[c.key] || DEFAULT_COL_WIDTH, minWidth: colWidths[c.key] || DEFAULT_COL_WIDTH }}
                className="relative text-left px-3 py-2 font-semibold text-[#d1d1d6] border-b border-r border-[#2c2c2e] uppercase tracking-wider text-[11px]"
              >
                {c.label}
                {c.required && <span className="text-status-error ml-0.5">*</span>}
                <span
                  role="separator"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40"
                  onMouseDown={(e) => startResize(c.key, e)}
                  data-testid={`resize-${c.key}`}
                />
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
                No rows yet. Click <span className="text-[#d1d1d6] font-medium">Add row</span> or paste from Excel.
              </td>
            </tr>
          )}
          {useVirtual && rows.length > 0 ? (
            <>
              {virtualizer.getVirtualItems().length > 0 && (
                <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }}>
                  <td colSpan={columns.length + 2} />
                </tr>
              )}
              {virtualizer.getVirtualItems().map((vRow) => renderDataRow(rows[vRow.index], vRow.index))}
              {virtualizer.getVirtualItems().length > 0 && (
                <tr
                  style={{
                    height:
                      virtualizer.getTotalSize() -
                      (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                  }}
                >
                  <td colSpan={columns.length + 2} />
                </tr>
              )}
            </>
          ) : (
            rows.map((row, rIdx) => renderDataRow(row, rIdx))
          )}
        </tbody>
      </table>
    </div>
  );

  const gridBody = (
    <div
      ref={containerRef}
      tabIndex={0}
      className={isFullscreen ? "flex flex-col flex-1 min-h-0 gap-3 outline-none" : "space-y-3 outline-none"}
      onKeyDown={onKeyDown}
    >
      {toolbar}
      {gridTable}
      {!readOnly && (
        <p className="text-[11px] text-[#636366]">
          Tip: Copy from Excel/Sheets and paste here. Tab / Enter / arrows to navigate. Ctrl+Z to undo.
        </p>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        <div
          className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-10 px-6 text-center space-y-3"
          data-testid="grid-fullscreen-placeholder"
        >
          <p className="text-[13px] text-[#8e8e93]">
            {sectionLabel ? `${sectionLabel} grid` : "Grid"} is open in fullscreen.
          </p>
          <button
            type="button"
            onClick={exitFullscreen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] text-[#d1d1d6] press-sm smooth"
            data-testid="button-exit-fullscreen-inline"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Exit fullscreen
          </button>
        </div>
        {createPortal(
          <div
            className="fixed inset-0 z-[100] bg-[#1c1c1e] flex flex-col"
            data-testid="grid-fullscreen-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={sectionLabel ? `${sectionLabel} fullscreen grid` : "Fullscreen grid"}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="min-w-0">
                {sectionLabel && (
                  <h2 className="text-[18px] font-bold tracking-tight text-white truncate">{sectionLabel}</h2>
                )}
                {sectionDescription && (
                  <p className="text-[13px] text-[#8e8e93] mt-0.5">{sectionDescription}</p>
                )}
              </div>
              <button
                type="button"
                onClick={exitFullscreen}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-[#8e8e93] hover:text-white smooth press-sm shrink-0"
                title="Close fullscreen (Esc)"
                data-testid="button-close-fullscreen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col px-6 py-4">{gridBody}</div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return gridBody;
}
