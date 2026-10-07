/**
 * The cell-grid contract: how a table read from a SCANNED document travels
 * through the parser.
 *
 * WHY: a scanned share register, BI register or set of financial statements is
 * a table. Flattened to text, "T Nkosi" and "100" are just neighbours on a
 * line, and a regex that reads "the text after the label" runs into the next
 * cell (`</td>`, `AND SURNAME</th>`). Kept as cells, a reader can ask "which
 * column is Shares, and what is in it on T Nkosi's row" — the question a person
 * reading the register actually answers.
 *
 * WHO PRODUCES IT: `fileExtraction.ts` stores one `TableGrid` per Document
 * Intelligence table in `RawExtractionInput.tables` (`sheetName: 'Table N'`).
 * Spreadsheets keep their own shape (`{ sheetName, rows: Record[], matrix }`):
 * a grid is recognised by its `cells` array, never by its name.
 *
 * WHO CONSUMES IT:
 *  - `caseExtraction.ts` `structuredRows` turns grids into header-keyed records
 *    (via {@link tableGridsToRecords}) for the ledger and financials readers.
 *  - Table-first field extraction (extract_fields, wave 2) reads `cells`
 *    directly: find the cell holding a label, take the value beside it in the
 *    same row or below it under a column header.
 *
 * INVARIANTS (every producer must hold them; consumers may rely on them):
 *  - `rows` is the dense [rowIndex][columnIndex] view, `rows.length` rows of
 *    equal width. A merged cell's text sits at its ANCHOR (top-left) position
 *    only; the positions it covers are ''. Nothing is ever invented to fill a
 *    gap.
 *  - `cells` lists every source cell exactly once (empty ones included, so a
 *    blank corner header still shows the table's shape), with its span. It is
 *    the authority: `rows` is derived from it.
 *  - `content` is whitespace-collapsed plain text — never HTML, never markdown.
 *  - `kind` is the reader's own structural call. `columnHeader` cells name the
 *    columns below them, `rowHeader` cells name the row they sit in. A table
 *    with no `columnHeader` cell has not told us its header; consumers fall
 *    back to its first row, which is what a person would assume.
 *  - `page` is 1-based; null only when the source did not say.
 */

export type TableCellKind = 'columnHeader' | 'rowHeader' | 'stubHead' | 'description' | 'content';

export interface TableCell {
  /** 1-based page the cell was read from; null when the source did not say. */
  page: number | null;
  /** 0-based row of the cell's top-left corner. */
  rowIndex: number;
  /** 0-based column of the cell's top-left corner. */
  columnIndex: number;
  /** Rows this cell covers (1 for an unmerged cell). */
  rowSpan: number;
  /** Columns this cell covers (1 for an unmerged cell). */
  columnSpan: number;
  kind: TableCellKind;
  /** Plain text, whitespace collapsed. */
  content: string;
}

export interface TableGrid {
  /** 'Table N', 1-based in reading order. Names the table in provenance. */
  sheetName: string;
  /** Page the table starts on; null when the source did not say. */
  page: number | null;
  /** Dense [row][column] text, anchors only (see the invariants above). */
  rows: string[][];
  cells: TableCell[];
}

const KINDS: ReadonlySet<string> = new Set(['columnHeader', 'rowHeader', 'stubHead', 'description', 'content']);

export function tableCellKind(raw: unknown): TableCellKind {
  return typeof raw === 'string' && KINDS.has(raw) ? raw as TableCellKind : 'content';
}

/** Is this `tables` entry a cell grid (as opposed to a spreadsheet sheet)? */
export function isTableGrid(value: unknown): value is TableGrid {
  if (!value || typeof value !== 'object') return false;
  const grid = value as Partial<TableGrid>;
  return Array.isArray(grid.cells)
    && Array.isArray(grid.rows)
    && grid.rows.every((row) => Array.isArray(row));
}

/** Rows (0-based) holding at least one `columnHeader` cell, top to bottom. */
export function columnHeaderRowIndexes(grid: TableGrid): number[] {
  const indexes = new Set<number>();
  for (const cell of grid.cells) {
    if (cell.kind !== 'columnHeader') continue;
    for (let r = cell.rowIndex; r < cell.rowIndex + Math.max(1, cell.rowSpan); r += 1) indexes.add(r);
  }
  return [...indexes].filter((r) => r < grid.rows.length).sort((a, b) => a - b);
}

/**
 * The grid's header: its `columnHeader` rows when the reader tagged any,
 * otherwise its first row (what a person would assume), with one label per
 * column. Labels are NOT made unique; see {@link tableGridToRecords} for keys.
 */
export function gridHeader(grid: TableGrid): { headerRows: number[]; labels: string[]; tagged: boolean } {
  if (grid.rows.length === 0) return { headerRows: [], labels: [], tagged: false };
  const tagged = columnHeaderRowIndexes(grid);
  const headerRows = tagged.length > 0 ? tagged : [0];
  return { headerRows, labels: columnLabels(grid, headerRows), tagged: tagged.length > 0 };
}

/**
 * One label per column, read from the header rows. A header that spans columns
 * names every column under it ("Shareholding" over "Shares" and "%" gives
 * "Shareholding Shares" and "Shareholding %"), because that is what the header
 * means. Body cells are never spread this way.
 */
function columnLabels(grid: TableGrid, headerRows: number[]): string[] {
  const width = grid.rows[0]?.length ?? 0;
  const parts: string[][] = Array.from({ length: width }, () => []);
  const headerSet = new Set(headerRows);

  const anchored = grid.cells.filter((cell) => headerSet.has(cell.rowIndex) && cell.content);
  if (anchored.length > 0) {
    for (const row of headerRows) {
      for (const cell of anchored.filter((c) => c.rowIndex === row).sort((a, b) => a.columnIndex - b.columnIndex)) {
        const last = Math.min(width, cell.columnIndex + Math.max(1, cell.columnSpan));
        for (let c = cell.columnIndex; c < last; c += 1) {
          if (parts[c][parts[c].length - 1] !== cell.content) parts[c].push(cell.content);
        }
      }
    }
  } else {
    // A first-row fallback for grids whose cells were never kind-tagged.
    for (const row of headerRows) {
      (grid.rows[row] ?? []).forEach((text, c) => { if (text && c < width) parts[c].push(text); });
    }
  }
  return parts.map((p) => p.join(' ').trim());
}

/** Header labels made unique the way SheetJS does, so callers keyed on names behave alike. */
function uniqueKeys(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label, index) => {
    const base = label || `__EMPTY${index > 0 ? `_${index}` : ''}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });
}

export interface GridRecords {
  /** The column labels used as keys. */
  headers: string[];
  /** One header-keyed record per non-blank body row. */
  records: Array<Record<string, string>>;
}

/**
 * Header-keyed records for one grid: the header rows are the `columnHeader`
 * rows when the reader tagged any, otherwise the first row. Blank body rows are
 * dropped (as SheetJS drops them). Values stay the cell TEXT — a scan's
 * "R 1 234,56" is evidence to be read by the consumer, not a number guessed here.
 */
export function tableGridToRecords(grid: TableGrid, inheritedHeaders?: string[]): GridRecords {
  if (grid.rows.length === 0) return { headers: [], records: [] };
  const header = gridHeader(grid);
  let headerRows: number[];
  let headers: string[];
  if (!header.tagged && inheritedHeaders && inheritedHeaders.length === (grid.rows[0]?.length ?? 0)) {
    // A continuation: the table carried on from the previous page without
    // repeating its header, so its first row is DATA under the inherited labels.
    headerRows = [];
    headers = inheritedHeaders;
  } else {
    headerRows = header.headerRows;
    headers = uniqueKeys(header.labels);
  }

  const skip = new Set(headerRows);
  const records: Array<Record<string, string>> = [];
  grid.rows.forEach((row, r) => {
    if (skip.has(r)) return;
    if (!row.some((text) => text.trim() !== '')) return;
    const record: Record<string, string> = {};
    headers.forEach((key, c) => { record[key] = row[c] ?? ''; });
    records.push(record);
  });
  return { headers, records };
}

/**
 * Records for a document's tables taken TOGETHER, for readers that expect one
 * table (a ledger, a register, a statement).
 *
 * A scanned table that runs over several pages comes back as one grid per page.
 * Consecutive grids that are the same table — the same header labels, or no
 * header of their own and the same width — are joined, so a three-page ledger
 * is read as three pages, not one. The largest joined table is returned; the
 * others still reach the model through the document's markdown.
 */
export function tableGridsToRecords(grids: TableGrid[]): GridRecords | null {
  const groups: GridRecords[] = [];
  let current: GridRecords | null = null;

  for (const grid of grids) {
    const width = grid.rows[0]?.length ?? 0;
    const hasOwnHeader = columnHeaderRowIndexes(grid).length > 0;
    const continues = current !== null && !hasOwnHeader && current.headers.length === width;
    const read = tableGridToRecords(grid, continues ? current!.headers : undefined);
    if (read.records.length === 0 && read.headers.length === 0) continue;

    const sameHeader = current !== null
      && current.headers.length === read.headers.length
      && current.headers.every((h, i) => h === read.headers[i]);
    if (current && (continues || sameHeader)) {
      current.records.push(...read.records);
    } else {
      current = { headers: read.headers, records: [...read.records] };
      groups.push(current);
    }
  }

  const best = groups.reduce<GridRecords | null>(
    (top, group) => (top === null || group.records.length > top.records.length ? group : top),
    null,
  );
  return best && best.records.length > 0 ? best : null;
}
