import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2, AlertCircle, Maximize2, Minimize2, X, Undo2 } from "lucide-react";
import type { ColumnDef } from "./sections";
import { applyPasteToRows, parseClipboardMatrix } from "@/lib/workbookGridParse";

type Row = Record<string, unknown> & { _id: string };
type CellRef = { row: number; col: number };

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

const VIRTUAL_THRESHOLD = 50;
const ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = 120;

function colLetter(idx: number): string {
  let n = idx;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

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

function normalizeRange(a: CellRef, b: CellRef) {
  return {
    minR: Math.min(a.row, b.row),
    maxR: Math.max(a.row, b.row),
    minC: Math.min(a.col, b.col),
    maxC: Math.max(a.col, b.col),
  };
}

function formatCellDisplay(v: unknown, col: ColumnDef): string {
  if (col.type === "boolean") return v ? "TRUE" : "FALSE";
  if (v === null || v === undefined) return "";
  return String(v);
}

function serializeCellValue(v: unknown, col: ColumnDef): string {
  if (col.type === "boolean") return v ? "TRUE" : "FALSE";
  if (v === null || v === undefined) return "";
  return String(v);
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
  const [activeCell, setActiveCell] = useState<CellRef | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellRef | null>(null);
  const [extraCells, setExtraCells] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<CellRef | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const c of columns) w[c.key] = c.width || DEFAULT_COL_WIDTH;
    return w;
  });
  const [undoStack, setUndoStack] = useState<Row[][]>([]);
  const [pastePreview, setPastePreview] = useState<{ rows: number; cols: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragAnchor = useRef<CellRef | null>(null);
  const isDragging = useRef(false);
  const fillDrag = useRef<{ startRow: number; endRow: number } | null>(null);
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
    if (!activeCell || !selectionEnd) return null;
    return normalizeRange(activeCell, selectionEnd);
  }, [activeCell, selectionEnd]);

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

  const getCellValue = useCallback(
    (rowIdx: number, colIdx: number): unknown => {
      const col = columns[colIdx];
      if (!col) return "";
      return rows[rowIdx]?.[col.key];
    },
    [columns, rows],
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

  const commitEdit = useCallback(
    (moveTo?: CellRef | null) => {
      if (!editingCell) return;
      const col = columns[editingCell.col];
      if (col && !readOnly) {
        let value: unknown = editValue;
        if (col.type === "number") {
          value = editValue !== "" ? Number(editValue) : "";
        } else if (col.type === "boolean") {
          value = editValue.toLowerCase() === "true" || editValue === "1";
        }
        updateCell(editingCell.row, col.key, value);
      }
      setEditingCell(null);
      setEditValue("");
      if (moveTo) {
        setActiveCell(moveTo);
        setSelectionEnd(moveTo);
      }
    },
    [editingCell, editValue, columns, readOnly, updateCell],
  );

  const startEdit = useCallback(
    (ref: CellRef, initialValue?: string) => {
      if (readOnly) return;
      const col = columns[ref.col];
      if (!col || col.type === "boolean") return;
      const v = getCellValue(ref.row, ref.col);
      setEditingCell(ref);
      setEditValue(initialValue ?? String(v ?? ""));
      setActiveCell(ref);
      setSelectionEnd(ref);
    },
    [readOnly, columns, getCellValue],
  );

  const addRow = useCallback(
    (atIdx?: number) => {
      if (readOnly || !canAddRows) return;
      pushUndo(rows);
      const newRow = emptyRow(columns);
      const idx = atIdx ?? rows.length;
      const next = [...rows.slice(0, idx), newRow, ...rows.slice(idx)];
      onChange(next);
      setTimeout(() => {
        const ref = { row: idx, col: 0 };
        setActiveCell(ref);
        setSelectionEnd(ref);
        setSelectedRow(null);
      }, 0);
    },
    [rows, columns, onChange, readOnly, canAddRows, pushUndo],
  );

  const deleteRow = useCallback(
    (rowIdx: number) => {
      if (readOnly || !canDeleteRows) return;
      pushUndo(rows);
      onChange(rows.filter((_, i) => i !== rowIdx));
      setSelectedRow(null);
      setActiveCell(null);
      setSelectionEnd(null);
      setExtraCells(new Set());
      setEditingCell(null);
    },
    [rows, onChange, readOnly, canDeleteRows, pushUndo],
  );

  const clearSelection = useCallback(() => {
    if (readOnly || !selectionRange) return;
    pushUndo(rows);
    const next = rows.map((r, ri) => {
      if (ri < selectionRange.minR || ri > selectionRange.maxR) return r;
      const copy = { ...r };
      for (let ci = selectionRange.minC; ci <= selectionRange.maxC; ci++) {
        const col = columns[ci];
        if (col) copy[col.key] = col.type === "boolean" ? false : "";
      }
      return copy;
    });
    for (const key of extraCells) {
      const [rs, cs] = key.split(":").map(Number);
      if (next[rs]) {
        const col = columns[cs];
        if (col) next[rs] = { ...next[rs], [col.key]: col.type === "boolean" ? false : "" };
      }
    }
    onChange(next);
  }, [readOnly, selectionRange, extraCells, rows, columns, onChange, pushUndo]);

  const collectSelectedCells = useCallback((): Array<{ row: number; col: number }> => {
    const cells: Array<{ row: number; col: number }> = [];
    const seen = new Set<string>();
    const add = (r: number, c: number) => {
      const k = cellKey(r, c);
      if (!seen.has(k)) {
        seen.add(k);
        cells.push({ row: r, col: c });
      }
    };
    if (selectionRange) {
      for (let r = selectionRange.minR; r <= selectionRange.maxR; r++) {
        for (let c = selectionRange.minC; c <= selectionRange.maxC; c++) add(r, c);
      }
    }
    for (const k of extraCells) {
      const [r, c] = k.split(":").map(Number);
      add(r, c);
    }
    if (cells.length === 0 && activeCell) add(activeCell.row, activeCell.col);
    return cells;
  }, [selectionRange, extraCells, activeCell]);

  const copySelection = useCallback(async () => {
    const cells = collectSelectedCells();
    if (cells.length === 0) return;

    const minR = Math.min(...cells.map((c) => c.row));
    const maxR = Math.max(...cells.map((c) => c.row));
    const minC = Math.min(...cells.map((c) => c.col));
    const maxC = Math.max(...cells.map((c) => c.col));

    const lines: string[] = [];
    for (let r = minR; r <= maxR; r++) {
      const rowVals: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        const inSel = cells.some((x) => x.row === r && x.col === c);
        if (inSel) {
          const col = columns[c];
          rowVals.push(col ? serializeCellValue(getCellValue(r, c), col) : "");
        } else {
          rowVals.push("");
        }
      }
      lines.push(rowVals.join("\t"));
    }
    const tsv = lines.join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      /* clipboard may be blocked */
    }
  }, [collectSelectedCells, columns, getCellValue]);

  const handlePaste = useCallback(
    (text: string) => {
      if (readOnly || !activeCell) return;
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
        activeCell,
        Boolean(firstRowLooksLikeHeaders),
      );
      onChange(next);
      setPastePreview({ rows: matrix.length, cols: matrix[0]?.length ?? 0 });
      setTimeout(() => setPastePreview(null), 2000);
    },
    [readOnly, activeCell, columns, rows, onChange, pushUndo],
  );

  const applyFill = useCallback(
    (fromRow: number, toRow: number) => {
      if (readOnly || !selectionRange) return;
      const sourceRow = selectionRange.minR;
      if (toRow <= sourceRow) return;
      pushUndo(rows);
      const next = rows.map((r) => ({ ...r }));
      for (let r = sourceRow + 1; r <= toRow; r++) {
        if (r >= next.length) {
          next.push(emptyRow(columns));
        }
        for (let c = selectionRange.minC; c <= selectionRange.maxC; c++) {
          const col = columns[c];
          if (!col) continue;
          next[r] = { ...next[r], [col.key]: next[sourceRow][col.key] };
        }
      }
      onChange(next);
    },
    [readOnly, selectionRange, rows, columns, onChange, pushUndo],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPaste = (e: ClipboardEvent) => {
      if (readOnly) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text || !activeCell) return;
      e.preventDefault();
      handlePaste(text);
    };

    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [readOnly, activeCell, handlePaste]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditingCell(null);
          setEditValue("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const { row, col } = editingCell;
          commitEdit({ row: Math.min(row + 1, rows.length - 1), col });
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const { row, col } = editingCell;
          if (e.shiftKey && col > 0) commitEdit({ row, col: col - 1 });
          else if (!e.shiftKey && col < columns.length - 1) commitEdit({ row, col: col + 1 });
          else commitEdit();
          return;
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && activeCell) {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key === "F2" && activeCell) {
        e.preventDefault();
        startEdit(activeCell);
        return;
      }
      if (!activeCell) return;

      const { row, col } = activeCell;
      const lastCol = columns.length - 1;
      const lastRow = rows.length - 1;

      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (row < lastRow) {
          const next = { row: row + 1, col };
          setActiveCell(next);
          setSelectionEnd(next);
          setExtraCells(new Set());
        } else if (e.key === "Enter" && canAddRows && !readOnly) addRow();
      } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
        if (row > 0) {
          e.preventDefault();
          const next = { row: row - 1, col };
          setActiveCell(next);
          setSelectionEnd(next);
          setExtraCells(new Set());
        }
      } else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        if (col < lastCol) {
          e.preventDefault();
          const next = { row, col: col + 1 };
          setActiveCell(next);
          setSelectionEnd(next);
          setExtraCells(new Set());
        } else if (e.key === "Tab" && row < lastRow) {
          e.preventDefault();
          const next = { row: row + 1, col: 0 };
          setActiveCell(next);
          setSelectionEnd(next);
          setExtraCells(new Set());
        }
      } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        if (col > 0) {
          e.preventDefault();
          const next = { row, col: col - 1 };
          setActiveCell(next);
          setSelectionEnd(next);
          setExtraCells(new Set());
        }
      }
    },
    [
      editingCell,
      activeCell,
      columns.length,
      rows.length,
      addRow,
      undo,
      canAddRows,
      readOnly,
      copySelection,
      clearSelection,
      startEdit,
      commitEdit,
    ],
  );

  const handleCellMouseDown = (rIdx: number, cIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const ref = { row: rIdx, col: cIdx };
    if (e.ctrlKey || e.metaKey) {
      setExtraCells((prev) => {
        const next = new Set(prev);
        const k = cellKey(rIdx, cIdx);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
      setActiveCell(ref);
      return;
    }
    if (e.shiftKey && activeCell) {
      setSelectionEnd(ref);
      setExtraCells(new Set());
    } else {
      dragAnchor.current = ref;
      isDragging.current = true;
      setActiveCell(ref);
      setSelectionEnd(ref);
      setExtraCells(new Set());
      setSelectedRow(null);
    }
  };

  const handleCellMouseEnter = (rIdx: number, cIdx: number) => {
    if (fillDrag.current) {
      fillDrag.current.endRow = rIdx;
      return;
    }
    if (!isDragging.current || !dragAnchor.current) return;
    setSelectionEnd({ row: rIdx, col: cIdx });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (fillDrag.current) {
        /* visual feedback handled via state on mouseup */
      }
    };
    const up = () => {
      if (fillDrag.current) {
        const { startRow, endRow } = fillDrag.current;
        if (endRow > startRow) applyFill(startRow, endRow);
        fillDrag.current = null;
      }
      isDragging.current = false;
      dragAnchor.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", up);
    };
  }, [applyFill]);

  const handleRowSelect = (rIdx: number) => {
    setSelectedRow(rIdx);
    setActiveCell({ row: rIdx, col: 0 });
    setSelectionEnd({ row: rIdx, col: columns.length - 1 });
    setExtraCells(new Set());
  };

  const handleContextMenu = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row });
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

  const isCellSelected = (rIdx: number, cIdx: number): boolean => {
    if (extraCells.has(cellKey(rIdx, cIdx))) return true;
    if (selectionRange) {
      return (
        rIdx >= selectionRange.minR &&
        rIdx <= selectionRange.maxR &&
        cIdx >= selectionRange.minC &&
        cIdx <= selectionRange.maxC
      );
    }
    return false;
  };

  const isActiveCell = (rIdx: number, cIdx: number): boolean =>
    activeCell?.row === rIdx && activeCell?.col === cIdx;

  const showFillHandle =
    !readOnly &&
    selectionRange &&
    activeCell &&
    selectionRange.minR === selectionRange.maxR &&
    selectionRange.minC <= selectionRange.maxC;

  const renderCell = (row: Row, rIdx: number, col: ColumnDef, cIdx: number) => {
    const v = row[col.key];
    const errs = errorMap[row._id] || {};
    const err = errs[col.key];
    const selected = isCellSelected(rIdx, cIdx);
    const active = isActiveCell(rIdx, cIdx);
    const isEditing = editingCell?.row === rIdx && editingCell?.col === cIdx;

    return (
      <td
        key={col.key}
        data-cell={`${rIdx}-${cIdx}`}
        style={{ width: colWidths[col.key] || DEFAULT_COL_WIDTH, minWidth: colWidths[col.key] || DEFAULT_COL_WIDTH }}
        className={`border-b border-r border-[#2c2c2e] p-0 relative select-none ${
          selected ? "bg-blue-500/10" : ""
        } ${active ? "ring-2 ring-inset ring-blue-500 z-[2]" : ""} ${err ? "bg-status-error-bg/30" : ""}`}
        onMouseDown={(e) => handleCellMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
        onDoubleClick={() => startEdit({ row: rIdx, col: cIdx })}
        onContextMenu={(e) => handleContextMenu(e, rIdx)}
        title={
          err ||
          col.optionGuidance?.[String(v ?? "")] ||
          col.guidance ||
          undefined
        }
      >
        {col.type === "boolean" ? (
          <div className="flex items-center justify-center h-full py-2">
            <input
              type="checkbox"
              checked={Boolean(v)}
              disabled={readOnly}
              onChange={(e) => updateCell(rIdx, col.key, e.target.checked)}
              className="h-4 w-4 accent-blue-500 disabled:opacity-60"
              data-testid={`cell-${rIdx}-${col.key}`}
            />
          </div>
        ) : isEditing ? (
          <input
            ref={editInputRef}
            type={col.type === "number" ? "number" : "text"}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit()}
            className="absolute inset-0 w-full h-full bg-[#1c1c1e] px-3 py-2 text-[13px] text-white outline-none ring-2 ring-blue-500 z-10"
            data-testid={`cell-edit-${rIdx}-${col.key}`}
          />
        ) : (
          <div
            className="px-3 py-2 text-[13px] text-white truncate min-h-[36px] flex items-center"
            data-testid={`cell-${rIdx}-${col.key}`}
          >
            {formatCellDisplay(v, col) || (
              <span className="text-[#48484a]">{col.required ? "Required" : ""}</span>
            )}
          </div>
        )}
        {active && showFillHandle && cIdx === selectionRange!.maxC && (
          <span
            className="absolute -bottom-[3px] -right-[3px] w-2 h-2 bg-blue-500 border border-white cursor-crosshair z-20"
            onMouseDown={(e) => {
              e.stopPropagation();
              fillDrag.current = { startRow: rIdx, endRow: rIdx };
            }}
            data-testid="fill-handle"
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
        className={`text-[#636366] text-[11px] text-center border-b border-r border-[#2c2c2e] p-1.5 cursor-pointer select-none sticky left-0 bg-[#0e0e10] z-[1] ${
          selectedRow === rIdx ? "bg-blue-500/20 text-blue-300" : ""
        }`}
        onClick={() => handleRowSelect(rIdx)}
        onContextMenu={(e) => handleContextMenu(e, rIdx)}
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
            onClick={() => addRow()}
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
            <th className="w-10 p-2 text-[#636366] font-medium text-[11px] border-b border-r border-[#2c2c2e] sticky left-0 bg-[#1c1c1e] z-20" />
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{ width: colWidths[c.key] || DEFAULT_COL_WIDTH, minWidth: colWidths[c.key] || DEFAULT_COL_WIDTH }}
                className="relative text-left px-3 py-2 font-semibold text-[#d1d1d6] border-b border-r border-[#2c2c2e] text-[11px]"
              >
                <span className="text-[#636366] mr-1.5 font-mono">{colLetter(i)}</span>
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

  const contextMenuPortal =
    contextMenu &&
    createPortal(
      <div
        className="fixed z-[200] min-w-[160px] rounded-lg border border-[#2c2c2e] bg-[#1c1c1e] py-1 shadow-xl"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
        data-testid="grid-context-menu"
      >
        {!readOnly && canAddRows && (
          <>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06]"
              onClick={() => {
                addRow(contextMenu.row);
                setContextMenu(null);
              }}
            >
              Insert row above
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06]"
              onClick={() => {
                addRow(contextMenu.row + 1);
                setContextMenu(null);
              }}
            >
              Insert row below
            </button>
          </>
        )}
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06]"
          onClick={() => {
            copySelection();
            setContextMenu(null);
          }}
        >
          Copy
        </button>
        {!readOnly && (
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06]"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                handlePaste(text);
              } catch {
                /* ignore */
              }
              setContextMenu(null);
            }}
          >
            Paste
          </button>
        )}
        {!readOnly && canDeleteRows && (
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-[12px] text-status-error hover:bg-white/[0.06]"
            onClick={() => {
              deleteRow(contextMenu.row);
              setContextMenu(null);
            }}
          >
            Delete row
          </button>
        )}
      </div>,
      document.body,
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
          Click to select · drag for range · Shift+click extend · Ctrl+click multi-select · F2/double-click edit ·
          Ctrl+C copy · Ctrl+V paste · drag fill handle to copy down.
        </p>
      )}
      {contextMenuPortal}
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
