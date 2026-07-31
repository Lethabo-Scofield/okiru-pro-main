/**
 * Region-aware worksheet rendering — the table-understanding layer.
 *
 * Real gathering workbooks are not one clean grid. The Thandanani SED sheet
 * that produced 68 phantom "contributions" looks like this:
 *
 *   A..I  : preamble rows (entity, year end, summary), then the REAL header on
 *           row ~7, then a ledger that uses the blank-means-ditto idiom —
 *           "Germiston Youth Centre | Donation" stated once, followed by
 *           dozens of continuation rows carrying only a date and an amount.
 *   M..N  : the sheet's dropdown/reference lists ("Grant", "Direct Cost",
 *           "HIV (Aviation)", "Bursaries (Forwarding & Clearing)" …) sitting
 *           in side columns, separated from the data by blank columns.
 *
 * Rendering all of that as ONE wide table (keyed off row 1) fused the
 * reference lists into data rows and hid the header — the extractor invented
 * beneficiaries out of dropdown options. This module:
 *
 *   1. splits the grid into column REGIONS on fully-blank column gaps,
 *   2. treats the region with the most content as the data table, finds its
 *      real header row, and renders preamble rows as context lines,
 *   3. forward-fills the ditto blanks in TEXT columns of continuation rows
 *      (a new value in the leftmost identity column starts a new block —
 *      numeric/date columns are never filled), and
 *   4. renders side regions under an explicit "Reference options (dropdown
 *      values — not data)" label so the extractor knows to skip them.
 */

const MAX_HEADER_SCAN_ROWS = 15;
const MAX_HEADER_CELL_LEN = 60;

type Region = { start: number; end: number };

function isBlank(cell: string): boolean {
  return cell.trim() === '';
}

function isNumericish(cell: string): boolean {
  const t = cell.trim();
  if (!t) return false;
  // Numbers, currency, percentages, and datey strings all count as "value
  // cells" — they are never ditto-filled and never make a column textual.
  if (/^[R$€£]?\s*-?[\d\s,.]+%?$/.test(t)) return true;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(t) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(t)) return true;
  return false;
}

/** Contiguous ranges of columns that hold ANY content, split on blank columns. */
function columnRegions(grid: string[][]): Region[] {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const colHasContent: boolean[] = Array.from({ length: width }, (_, c) =>
    grid.some((row) => !isBlank(row[c] ?? '')),
  );
  const regions: Region[] = [];
  let start = -1;
  for (let c = 0; c < width; c++) {
    if (colHasContent[c] && start === -1) start = c;
    if (!colHasContent[c] && start !== -1) { regions.push({ start, end: c - 1 }); start = -1; }
  }
  if (start !== -1) regions.push({ start, end: width - 1 });
  return regions;
}

function regionCells(grid: string[][], region: Region): string[][] {
  return grid.map((row) => {
    const cells: string[] = [];
    for (let c = region.start; c <= region.end; c++) cells.push(String(row[c] ?? '').trim());
    return cells;
  });
}

function filledCount(rows: string[][]): number {
  return rows.reduce((sum, r) => sum + r.filter((c) => !isBlank(c)).length, 0);
}

/**
 * The header is the early row with the most short text labels. A preamble row
 * ("Measured Entity: …") has one or two long cells; the real header
 * ("Beneficiary | Site | % Black participation | Contribution Type | …") has
 * many short ones.
 */
function findHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 0;
  const scan = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);
  for (let i = 0; i < scan; i++) {
    const labels = rows[i].filter(
      (c) => !isBlank(c) && !isNumericish(c) && c.length <= MAX_HEADER_CELL_LEN,
    );
    if (labels.length >= 3 && labels.length > bestScore) { best = i; bestScore = labels.length; }
  }
  if (best >= 0) return best;
  return rows.findIndex((r) => r.some((c) => !isBlank(c)));
}

/** ≥60% of a column's non-blank body cells are text → ditto-fillable. */
function textDominantColumns(body: string[][], width: number): boolean[] {
  return Array.from({ length: width }, (_, c) => {
    const nonBlank = body.map((r) => r[c] ?? '').filter((v) => !isBlank(v));
    if (nonBlank.length === 0) return false;
    const textish = nonBlank.filter((v) => !isNumericish(v)).length;
    return textish / nonBlank.length >= 0.6;
  });
}

/**
 * Blank-means-ditto: fill blank TEXT cells of a continuation row from the last
 * stated value. A new value in the leftmost text column starts a new block and
 * clears the other columns' memory, so a later beneficiary can never inherit
 * an earlier one's location or type. Numeric/date columns are never filled —
 * a blank amount is genuinely blank.
 */
function dittoFill(body: string[][], width: number): string[][] {
  const textCol = textDominantColumns(body, width);
  const identityCol = textCol.findIndex(Boolean);
  if (identityCol === -1) return body;

  const memory: string[] = Array.from({ length: width }, () => '');
  return body.map((row) => {
    const out = [...row];
    while (out.length < width) out.push('');
    if (out.every((c) => isBlank(c))) return out;

    if (!isBlank(out[identityCol]) && out[identityCol] !== memory[identityCol]) {
      for (let c = 0; c < width; c++) if (c !== identityCol) memory[c] = '';
    }
    for (let c = 0; c < width; c++) {
      if (!textCol[c]) continue;
      if (!isBlank(out[c])) memory[c] = out[c];
      else if (memory[c]) out[c] = memory[c];
    }
    return out;
  });
}

function pipeRow(cells: string[]): string {
  return `| ${cells.map((c) => c.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')} |`;
}

function renderMainRegion(rows: string[][]): string {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return '';
  const width = Math.max(...rows.map((r) => r.length));

  const preamble = rows
    .slice(0, headerIdx)
    .map((r) => r.filter((c) => !isBlank(c)).join(' — '))
    .filter(Boolean);

  const header = Array.from({ length: width }, (_, c) => {
    const cell = (rows[headerIdx][c] ?? '').trim();
    return cell || `col${c + 1}`;
  });

  const body = dittoFill(rows.slice(headerIdx + 1).filter((r) => r.some((c) => !isBlank(c))), width);

  const lines = [
    ...preamble,
    ...(preamble.length ? [''] : []),
    pipeRow(header),
    pipeRow(header.map(() => '---')),
    ...body.map((r) => pipeRow(r)),
  ];
  return lines.join('\n');
}

function renderSideRegion(rows: string[][]): string {
  const values = rows.flatMap((r) => r.filter((c) => !isBlank(c)));
  if (values.length === 0) return '';
  return [
    '### Reference options (dropdown values — not data)',
    ...values.map((v) => `- ${v}`),
  ].join('\n');
}

/**
 * Render a raw sheet grid (header:1 rows) as extraction-ready markdown:
 * the data table cleanly headed and ditto-filled, side lists labelled as
 * reference options.
 */
export function sheetGridToMarkdown(sheetName: string, grid: string[][]): string {
  const heading = `## ${sheetName.trim() || 'Sheet'}`;
  const regions = columnRegions(grid);
  if (regions.length === 0) return heading;

  const withCells = regions.map((region) => ({ region, cells: regionCells(grid, region) }));
  const main = withCells.reduce((a, b) => (filledCount(b.cells) > filledCount(a.cells) ? b : a));

  const blocks = [heading];
  const mainTable = renderMainRegion(main.cells);
  if (mainTable) blocks.push(mainTable);
  for (const other of withCells) {
    if (other === main) continue;
    const side = renderSideRegion(other.cells);
    if (side) blocks.push(side);
  }
  return blocks.join('\n\n');
}
