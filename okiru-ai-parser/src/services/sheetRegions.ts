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

export type Region = { start: number; end: number };

function isBlank(cell: string): boolean {
  return cell.trim() === '';
}

/** "0", "0.00", "R 0", "0%" — what an empty template row's formula cells show. */
function isZeroResidue(cell: string): boolean {
  return /^[R$€£]?\s*-?0+([.,]0+)?\s*%?$/.test(cell.trim());
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
export function columnRegions(grid: string[][]): Region[] {
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0); // not Math.max(...rows): spreading every row as an argument overflows the stack past ~120k rows
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
 * The column region holding the data table — the one with the most content.
 * Side regions (dropdown legends, category keys) are what the extractor must
 * NOT read as data; the structured-rows path uses this so a "Category F |
 * Bursaries…" key sitting beside the learner table never becomes a learner's
 * category. Null when the grid has no content at all.
 */
export function mainColumnRegion(grid: string[][]): Region | null {
  const regions = columnRegions(grid);
  if (regions.length === 0) return null;
  let best = regions[0];
  let bestFill = filledCount(regionCells(grid, best));
  for (const region of regions.slice(1)) {
    const fill = filledCount(regionCells(grid, region));
    if (fill > bestFill) { best = region; bestFill = fill; }
  }
  return best;
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

/** A row that says something real — not blank, not a 0-residue template line. */
function isMeaningfulRow(row: string[]): boolean {
  return row.some((c) => !isBlank(c ?? '') && !isZeroResidue(c ?? ''));
}

/**
 * A text cell that breaks off mid-phrase because the sheet wrapped it onto the
 * next row: "Truck Mounted Crane -", "Basic Rigging and-" — a dash straight
 * after a word. Deliberately NOT a trailing "and"/"to": an answer list's "We
 * have not been asked to" is a whole option, and joining it to the next
 * option merged two answers. A bare "-" (the usual "nothing here" mark) and a
 * label's ":-" ("TOTAL TO BE INVOICED:-") are not fragments either.
 */
function isDanglingFragment(cell: string): boolean {
  return /[a-z]\s*[-–]$/i.test(cell.trim());
}

/** Join a wrapped fragment to its continuation: "Crane -" + "operator" → "Crane operator". */
function joinFragment(head: string, tail: string): string {
  return `${head.trim().replace(/\s*[-–]$/, '')} ${tail.trim()}`.replace(/\s+/g, ' ').trim();
}

/** A long run of digits (an SA ID number, a registration number) names something; it is not an amount. */
function isIdentifierNumber(cell: string): boolean {
  return /^\d{8,}$/.test(cell.replace(/\s/g, ''));
}

/**
 * Rejoin text that wrapped onto the next row. A client types a long course name
 * across two rows of the same column — "Truck Mounted Crane -" / "operator" —
 * on a row that starts no new block of its own. Read as ditto, the
 * continuation OVERWROTE the remembered course, so every learner after it was
 * on a course called "operator". The two halves are one value: the first row
 * gets the whole name, and the continuation cell is emptied so the rows below
 * inherit the whole name.
 *
 * Narrow on purpose, because a wrong join silently merges two records into one
 * (a supplier vanishes, its spend lands on a merged name):
 *  - the upper cell must visibly break off (a dash straight after a word), the
 *    continuation must be words, and it must sit on the very next row with
 *    content;
 *  - never in the identity column: a blank there is what marks a continuation
 *    row, so a value there is a record of its own ("Acme Trading -" / "Zenith
 *    Logistics", each with its spend, are two suppliers);
 *  - never in a per-row column (stated on nearly every row, so each value is
 *    its own row's), only in a block column the sheet states once per block;
 *  - the continuation row must carry NOTHING of its own: no identity, no amount
 *    or date, no other block-level value. All it may hold besides the tail is
 *    a repeat of the upper row's cell, or per-row facts about a person on the
 *    same block (a learner's name, ID number, race) — the shape of a
 *    continuation row in a training register. A line with its own amount
 *    ("Food parcels -" R500 / "blankets" R300) is a second line item.
 */
function joinWrappedFragments(
  body: string[][],
  textCol: boolean[],
  identityCol: number,
  perRow: boolean[],
): string[][] {
  const rows = body.map((row) => [...row]);
  const carriesNothingOfItsOwn = (head: string[], next: string[], c: number): boolean =>
    next.every((cell, k) => {
      const value = (cell ?? '').trim();
      if (k === c || isBlank(value) || isZeroResidue(value)) return true;
      if (k === identityCol) return false;
      if (value === (head[k] ?? '').trim()) return true; // a repeat of the row above
      if (!perRow[k]) return false; // a block-level value of its own
      return !isNumericish(value) || isIdentifierNumber(value); // a person's fact, not an amount or date
    });
  for (let i = 0; i < rows.length; i++) {
    if (!isMeaningfulRow(rows[i])) continue;
    for (let c = 0; c < textCol.length; c++) {
      if (!textCol[c] || c === identityCol || perRow[c]) continue;
      // A wrap can run over more than two rows: keep joining while it dangles.
      while (isDanglingFragment(rows[i][c] ?? '')) {
        let j = i + 1;
        while (j < rows.length && !rows[j].some((cell) => !isBlank(cell ?? ''))) j++;
        if (j >= rows.length) break;
        const tail = (rows[j][c] ?? '').trim();
        if (!tail || !/^[a-z(]/i.test(tail) || isNumericish(tail)) break;
        if (!carriesNothingOfItsOwn(rows[i], rows[j], c)) break;
        rows[i][c] = joinFragment(rows[i][c], tail);
        rows[j][c] = '';
      }
    }
  }
  return rows;
}

/**
 * Columns that hold PER-ROW facts in a block-layout sheet: stated on nearly
 * every row, so each value belongs to its own row.
 *
 * Blank-means-ditto is right for the columns a sheet states once per block (the
 * course, the beneficiary), and those are SPARSE. A column stated on nearly
 * every row — the learner's name, their employee number — is per-row data; a
 * blank there is genuinely blank. Filling it cloned the last learner into a row
 * that carried only training hours (a phantom second learner), and gave a
 * learner with no employee number the previous learner's.
 *
 * "Nearly every row" is measured against the blocks: a column stated on at
 * least 60% of the rows AND at least twice as often as the identity column
 * starts a block is per-row. Never the identity column itself, whose blank is
 * exactly what marks a continuation row. A sheet that is not block-shaped (the
 * identity stated on most rows) has no column that clears the second bar.
 * Covers every column, text or not; the ditto only ever consults text ones.
 */
function perRowColumns(body: string[][], width: number, identityCol: number): boolean[] {
  const meaningful = body.filter(isMeaningfulRow);
  if (meaningful.length < 3) return Array.from({ length: width }, () => false);
  const stated = (c: number) => meaningful.filter((r) => !isBlank(r[c] ?? '')).length;
  const blocks = stated(identityCol);
  const bar = Math.max(0.6 * meaningful.length, 2 * blocks);
  return Array.from({ length: width }, (_, c) => c !== identityCol && stated(c) >= bar);
}

/**
 * How continuation rows of a block-layout sheet are read.
 *
 * Both default ON (the B-BBEE reading). The ESG upload turns them OFF: its
 * registers (vehicle fuel logs, fleet lists) were read, recorded and checked
 * against the ESG answer key with the plain ditto, and these refinements were
 * built and verified on B-BBEE training and SED registers only. Off, `dittoFill`
 * is exactly the plain blank-means-ditto it always was.
 */
export interface DittoOptions {
  /** Rejoin a text value that wrapped onto the next row ("Crane -" / "operator"). */
  joinWrappedText?: boolean;
  /** Never ditto-fill a per-row column (a learner's name, an employee number). */
  keepPerRowColumns?: boolean;
}

/** The plain ditto, with neither refinement: what the ESG reading uses. */
export const PLAIN_DITTO: DittoOptions = Object.freeze({ joinWrappedText: false, keepPerRowColumns: false });

/**
 * Blank-means-ditto: fill blank TEXT cells of a continuation row from the last
 * stated value. A new value in the leftmost text column starts a new block and
 * clears the other columns' memory, so a later beneficiary can never inherit
 * an earlier one's location or type. Numeric/date columns are never filled —
 * a blank amount is genuinely blank. Text that wrapped onto the next row is
 * rejoined first, and per-row columns (a learner's name) are never filled —
 * each unless `options` turns it off (see DittoOptions).
 */
export function dittoFill(body: string[][], width: number, options: DittoOptions = {}): string[][] {
  const textCol = textDominantColumns(body, width);
  const identityCol = textCol.findIndex(Boolean);
  if (identityCol === -1) return body;

  const padded = body.map((row) => {
    const out = [...row];
    while (out.length < width) out.push('');
    return out;
  });
  const noneMarked = Array.from({ length: width }, () => false);
  // Measured before any join: the tail a join empties is not a blank of the column's own.
  const perRowAny = options.joinWrappedText === false && options.keepPerRowColumns === false
    ? noneMarked
    : perRowColumns(padded, width, identityCol);
  const joined = options.joinWrappedText === false
    ? padded
    : joinWrappedFragments(padded, textCol, identityCol, perRowAny);
  const perRow = options.keepPerRowColumns === false
    ? noneMarked
    : perRowColumns(joined, width, identityCol);

  const memory: string[] = Array.from({ length: width }, () => '');
  return joined.map((row) => {
    const out = [...row];
    if (out.every((c) => isBlank(c))) return out;
    // A continuation row carries something REAL of its own — a name, a date,
    // an amount. A row whose only content is zero residue (a formula column
    // evaluating to 0 down 2,000 empty template rows) is not a row at all, and
    // filling it would clone the last real learner into every one of them.
    // Zero is the test, not "text": an SED ledger's continuation rows carry
    // only a date and a non-zero amount, and those are genuine.
    const meaningful = out.some((c) => !isBlank(c) && !isZeroResidue(c));
    if (!meaningful) return out;

    if (!isBlank(out[identityCol]) && out[identityCol] !== memory[identityCol]) {
      for (let c = 0; c < width; c++) if (c !== identityCol) memory[c] = '';
    }
    for (let c = 0; c < width; c++) {
      if (!textCol[c] || perRow[c]) continue;
      if (!isBlank(out[c])) memory[c] = out[c];
      else if (memory[c]) out[c] = memory[c];
    }
    return out;
  });
}

function pipeRow(cells: string[]): string {
  return `| ${cells.map((c) => c.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')} |`;
}

function renderMainRegion(rows: string[][], options: DittoOptions): string {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return '';
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0); // not Math.max(...rows): spreading every row as an argument overflows the stack past ~120k rows

  const preamble = rows
    .slice(0, headerIdx)
    .map((r) => r.filter((c) => !isBlank(c)).join(' — '))
    .filter(Boolean);

  const header = Array.from({ length: width }, (_, c) => {
    const cell = (rows[headerIdx][c] ?? '').trim();
    return cell || `col${c + 1}`;
  });

  const body = dittoFill(rows.slice(headerIdx + 1).filter((r) => r.some((c) => !isBlank(c))), width, options);

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
export function sheetGridToMarkdown(sheetName: string, grid: string[][], options: DittoOptions = {}): string {
  const heading = `## ${sheetName.trim() || 'Sheet'}`;
  const regions = columnRegions(grid);
  if (regions.length === 0) return heading;

  const withCells = regions.map((region) => ({ region, cells: regionCells(grid, region) }));
  const main = withCells.reduce((a, b) => (filledCount(b.cells) > filledCount(a.cells) ? b : a));

  const blocks = [heading];
  const mainTable = renderMainRegion(main.cells, options);
  if (mainTable) blocks.push(mainTable);
  for (const other of withCells) {
    if (other === main) continue;
    const side = renderSideRegion(other.cells);
    if (side) blocks.push(side);
  }
  return blocks.join('\n\n');
}
