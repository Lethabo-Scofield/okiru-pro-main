/**
 * Table-first field reading: take a labelled value from a table's CELLS.
 *
 * WHY: flattened to text, a register's header row and its first data row are
 * just two lines, and "the text after the label SHAREHOLDER NAME" is the rest
 * of the header ("AND SURNAME | ID / REG NUMBER"). A person reading the table
 * looks the other way: under the header, or beside the row label. The cell
 * grid (schemas/table_grid.ts) keeps exactly the structure needed to do that.
 *
 * HOW: find the cell whose text is the field's label, then
 *  - a COLUMN header (tagged `columnHeader`, or the first row of an untagged
 *    table three or more columns wide) gives the first non-empty cell below it;
 *  - any other label gives the next non-empty, non-header cell to its right
 *    in the same row (skipping a "Notes" reference column), or — when the cell
 *    to its right is itself a label, so the row is really a header row — the
 *    cell below it;
 *  - a cell holding "Label: value" gives its own value.
 * Every value goes through the capture guard and the caller's type gate before
 * it is accepted, and the next matching cell is tried when one is refused.
 */
import { gridHeader, isTableGrid, type TableCell, type TableGrid } from '../schemas/table_grid.js';
import { cleanCapture, isUnusableCapture, looksLikeLabel, normalizeLabel } from './field_labels.js';

export interface TableFieldHit {
  value: string;
  /** 1-based page of the value's cell, else of its table; null when unknown. */
  page: number | null;
  /** The table's name, e.g. 'Table 2'. */
  table: string;
  /** The label cell's own text, for the snippet. */
  labelText: string;
}

/** Extra words a header may carry around the label ("SHAREHOLDER NAME AND SURNAME"). */
const MAX_EXTRA_LEADING_WORDS = 2;
const MAX_EXTRA_TRAILING_WORDS = 3;

interface LabelCell {
  quality: number;
  labelIndex: number;
  gridIndex: number;
  cell: TableCell;
  /** Set when the cell holds both label and value ("Registration No: 123"). */
  inlineValue?: string;
}

function startsWithWords(text: string, label: string): number | null {
  if (text === label) return 0;
  if (!text.startsWith(`${label} `)) return null;
  return text.slice(label.length).trim().split(' ').length;
}

function endsWithWords(text: string, label: string): number | null {
  if (!text.endsWith(` ${label}`)) return null;
  return text.slice(0, text.length - label.length).trim().split(' ').length;
}

/** How well a cell's text names a label: 0 exact, 1 label plus a tail, 2 a prefix plus label; null no. */
function labelQuality(cellText: string, label: string): number | null {
  const text = normalizeLabel(cellText);
  if (!text || !label) return null;
  if (text === label) return 0;
  const trailing = startsWithWords(text, label);
  if (trailing != null && trailing <= MAX_EXTRA_TRAILING_WORDS) return 1;
  const leading = endsWithWords(text, label);
  if (leading != null && leading <= MAX_EXTRA_LEADING_WORDS) return 2;
  return null;
}

/** "Label: value" inside a single cell. */
function inlineValue(cellText: string, label: string): string | null {
  const colon = cellText.indexOf(':');
  if (colon <= 0) return null;
  const head = cellText.slice(0, colon);
  const tail = cellText.slice(colon + 1).trim();
  if (!tail || labelQuality(head, label) !== 0) return null;
  return tail;
}

function isHeaderKind(cell: TableCell | undefined): boolean {
  return cell?.kind === 'columnHeader' || cell?.kind === 'rowHeader' || cell?.kind === 'stubHead';
}

/** The anchored cell at (row, column), if one starts there. */
function cellAt(grid: TableGrid, row: number, column: number): TableCell | undefined {
  return grid.cells.find((c) => c.rowIndex === row && c.columnIndex === column);
}

function isColumnHeader(grid: TableGrid, cell: TableCell, headerRows: Set<number>, tagged: boolean): boolean {
  if (cell.kind === 'columnHeader') return true;
  if (tagged) return false;
  const width = grid.rows[0]?.length ?? 0;
  return width >= 3 && headerRows.has(cell.rowIndex);
}

/** First non-empty body cell below a header cell, within its column span. */
function valueBelow(grid: TableGrid, cell: TableCell, headerRows: Set<number>): { text: string; cell?: TableCell } | null {
  const lastColumn = cell.columnIndex + Math.max(1, cell.columnSpan) - 1;
  for (let r = cell.rowIndex + Math.max(1, cell.rowSpan); r < grid.rows.length; r += 1) {
    if (headerRows.has(r)) continue;
    for (let c = cell.columnIndex; c <= lastColumn; c += 1) {
      const text = (grid.rows[r]?.[c] ?? '').trim();
      if (!text) continue;
      return { text, cell: cellAt(grid, r, c) };
    }
  }
  return null;
}

/**
 * Next non-empty cell to the right in the same row. A column whose header is
 * "Notes" holds a reference number, not the line's value, and is skipped.
 */
function valueRight(grid: TableGrid, cell: TableCell, columnLabels: string[]): { text: string; cell?: TableCell } | null {
  const row = grid.rows[cell.rowIndex] ?? [];
  for (let c = cell.columnIndex + Math.max(1, cell.columnSpan); c < row.length; c += 1) {
    const text = (row[c] ?? '').trim();
    if (!text) continue;
    if (/^notes?$/i.test((columnLabels[c] ?? '').trim())) continue;
    return { text, cell: cellAt(grid, cell.rowIndex, c) };
  }
  return null;
}

/** The cell grids among a document's tables (spreadsheets keep their own shape). */
export function tableGridsOf(tables: unknown[] | undefined): TableGrid[] {
  return (tables ?? []).filter(isTableGrid);
}

/**
 * The first value a document's tables give for any of `labels` that the guard
 * and `accept` (the field's type gate) both allow, or null.
 */
export function findTableValue(
  labels: string[],
  grids: TableGrid[],
  accept: (value: string) => boolean,
): TableFieldHit | null {
  const wanted = labels.map(normalizeLabel).filter(Boolean);
  if (wanted.length === 0 || grids.length === 0) return null;

  const candidates: LabelCell[] = [];
  grids.forEach((grid, gridIndex) => {
    for (const cell of grid.cells) {
      if (!cell.content) continue;
      wanted.forEach((label, labelIndex) => {
        const inline = inlineValue(cell.content, label);
        if (inline) {
          candidates.push({ quality: 0, labelIndex, gridIndex, cell, inlineValue: inline });
          return;
        }
        const quality = labelQuality(cell.content, label);
        if (quality != null) candidates.push({ quality, labelIndex, gridIndex, cell });
      });
    }
  });
  candidates.sort((a, b) => a.quality - b.quality
    || a.labelIndex - b.labelIndex
    || a.gridIndex - b.gridIndex
    || a.cell.rowIndex - b.cell.rowIndex
    || a.cell.columnIndex - b.cell.columnIndex);

  const usable = (text: string | undefined): string | null => {
    if (!text) return null;
    const value = cleanCapture(text);
    return !isUnusableCapture(value) && accept(value) ? value : null;
  };

  for (const candidate of candidates) {
    const grid = grids[candidate.gridIndex];
    const { cell } = candidate;
    const header = gridHeader(grid);
    const headerRows = new Set(header.headerRows);
    const hit = (value: string, from?: TableCell): TableFieldHit => ({
      value,
      page: from?.page ?? cell.page ?? grid.page ?? null,
      table: grid.sheetName,
      labelText: cell.content,
    });

    if (candidate.inlineValue) {
      const value = usable(candidate.inlineValue);
      if (value) return hit(value, cell);
      continue;
    }

    let read: { text: string; cell?: TableCell } | null;
    if (isColumnHeader(grid, cell, headerRows, header.tagged)) {
      read = valueBelow(grid, cell, headerRows);
    } else {
      read = valueRight(grid, cell, header.labels);
      // The cell beside the label is a label too: this row is a header row
      // that was never tagged as one, and the values sit underneath.
      if (read && (isHeaderKind(read.cell) || looksLikeLabel(read.text))) {
        read = valueBelow(grid, cell, headerRows);
      }
    }
    if (read && !isHeaderKind(read.cell)) {
      const value = usable(read.text);
      if (value) return hit(value, read.cell);
    }
  }
  return null;
}
