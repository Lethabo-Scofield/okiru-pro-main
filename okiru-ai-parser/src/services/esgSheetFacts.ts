/**
 * Read the LABELLED CELLS of an ESG sheet — the figures a sheet states by
 * name rather than in a register or a month grid.
 *
 * WHY THIS EXISTS
 *
 * The other sheet readers each read one shape: a register (a row per record),
 * a site × month table, one period's summary. A great deal of what a client's
 * workbook states is in none of them:
 *  - label/value pairs: "Opening stock (dip) | 12 345", "Report: | Data Audit
 *    Report", a price under its caption;
 *  - small summary blocks: a header and a row or two of totals, a site × measure
 *    block without months, a pivot's "Row Labels … Grand Total";
 *  - the blocks beside or above a register: a report's run date and title over
 *    its table, a "GRAND TOTALS" block to the right of a route list.
 * The register chooser answers NONE for those sheets, the monthly reader finds
 * no months, and the flat read of a spreadsheet's markdown cannot see the cells
 * outside its main table at all. Those figures were never read.
 *
 * THE SPLIT OF LABOUR, as in every sheet reader:
 *   - CODE finds the labelled cells, by layout alone (findSheetFacts).
 *   - The SKILL names the wordings a field is printed under: a label that is
 *     one of them is that field, with no model call.
 *   - The MODEL maps the remaining labels to the fields of the sheet's document
 *     type, once per set of labels (cached; values are never sent, so every tab
 *     of a template asks one question).
 *   - CODE reads every mapped cell's value as printed.
 * A label nothing maps is kept as an open fact (openFacts.ts): reported on the
 * document, never a value, never scored.
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import { extractionDomain } from './extractionDomain.js';
import { emptyIdentity, MAX_OPEN_FACTS, type OpenFact } from './openFacts.js';
import { decisionFingerprint, rememberDecision } from './semanticDecisionCache.js';
import { rankSpecsForDocument } from './specRetrieval.js';
import { dateOf } from './skillDerivations.js';

const logger = createLogger('EsgSheetFacts');

/** One labelled figure, as the sheet prints it. */
export interface SheetFact {
  /** The sheet's own words for it: a caption, or a row label and its column header. */
  label: string;
  value: string | number;
  /** A1 reference of the value. */
  cell: string;
  /** pair: caption beside or over a value; summary: a block's row × header; total: a block's total line. */
  kind: 'pair' | 'summary' | 'total' | 'title';
  /** A pair's caption cell (0-based), to tell two captions of the same words apart. */
  at?: { r: number; c: number };
  /** A summary or total cell: its row's label and its column's header, as printed. */
  row?: string;
  column?: string;
}

/** Rows (inclusive, 0-based) another reader already read: their cells are not facts of this reader. */
export interface ReadSpan {
  top: number;
  bottom: number;
  /** Only these columns of the rows (inclusive); every column when absent. */
  left?: number;
  right?: number;
}

/** Above this many rows a block is a register, not a summary. */
const MAX_SUMMARY_ROWS = 25;
/** Above this many columns a block is a grid, not a summary. */
const MAX_SUMMARY_COLUMNS = 14;
/** A caption is a few words, not a paragraph. */
const MAX_LABEL = 80;
/** How far right of its caption a value may sit. */
const PAIR_REACH = 3;
/** Facts kept per sheet. */
const MAX_FACTS = 160;

const isBlank = (c: unknown) => c === null || c === undefined || String(c).trim() === '';
const asText = (c: unknown) => (typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : '');
const isNumber = (c: unknown): c is number => typeof c === 'number' && Number.isFinite(c);
/** A cell that reads as a caption: words, not a figure, not a sentence. */
const isCaption = (c: unknown) => {
  const text = asText(c);
  return text.length >= 2 && text.length <= MAX_LABEL && /[a-z]{2}/i.test(text) && !/^[-\d\s.,%R()]+$/.test(text);
};
/** A caption ending in ":" announces the value beside it. */
const announces = (c: unknown) => /:\s*$/.test(asText(c));
/**
 * A record's identifier, not a caption: one token mixing letters and digits
 * (a registration, a route or asset code). A block whose rows start with them
 * is a small register, not a summary.
 */
const isRecordId = (c: unknown) => {
  const text = asText(c);
  return /^\S+$/.test(text) && /\d/.test(text) && /[a-z]/i.test(text);
};
/** A text value worth reading beside a caption: a code or a date carries a digit; a caption ending in ":" announces any text. */
const textValueFor = (caption: string, c: unknown) => {
  const text = asText(c);
  if (!text || text.length > 120) return false;
  return /:\s*$/.test(caption) || /\d/.test(text);
};

function colName(c: number): string {
  let name = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
const a1 = (r: number, c: number) => `${colName(c)}${r + 1}`;
/** The caption as a label: its trailing colon and dash leaders dropped. */
const clean = (caption: string) => caption.replace(/\s*[:\-–]+\s*$/, '').replace(/\s+/g, ' ').trim();
/** Binary noise (1234.5600000000002) is no printed figure. */
const printed = (value: unknown): string | number => (isNumber(value) ? Math.round(value * 1e6) / 1e6 : asText(value));

/**
 * The labelled cells of a sheet, found by layout. `read` lists the rows other
 * readers already read; their cells are left to them.
 */
export function findSheetFacts(matrix: unknown[][], read: ReadSpan[] = []): SheetFact[] {
  return findSheetFactsAndCells(matrix, read).facts.map(({ at: _at, ...fact }) => fact);
}

/** The labelled cells, and every cell ("r:c") they used: their captions, headers and values. */
function findSheetFactsAndCells(matrix: unknown[][], read: ReadSpan[] = []): { facts: SheetFact[]; used: Set<string> } {
  const taken = (r: number, c: number) => read.some((span) => r >= span.top && r <= span.bottom
    && (span.left === undefined || c >= span.left) && (span.right === undefined || c <= span.right));
  const used = new Set<string>();
  const facts: SheetFact[] = [];
  const free = (r: number, c: number) => !taken(r, c) && !used.has(`${r}:${c}`) && !isBlank((matrix[r] ?? [])[c]);
  const cellsOf = (r: number) => (matrix[r] ?? []).map((value, c) => ({ c, value })).filter(({ c }) => free(r, c));

  // 1. Summary blocks: a row of headers over a few rows that each start with a
  //    label and print figures under those headers ("Node | Electricity |
  //    Total", "Row Labels | Count of Reg", "… | Grand Total").
  for (let r = 0; r < matrix.length && facts.length < MAX_FACTS; r += 1) {
    const header = cellsOf(r);
    // Headers are words (a lone "%" among them is still a header), never figures.
    if (header.length < 2 || header.length > MAX_SUMMARY_COLUMNS) continue;
    if (!header.every((cell) => typeof cell.value === 'string') || header.filter((cell) => isCaption(cell.value)).length * 2 < header.length) continue;
    const labelCol = header[0].c;
    const body: number[] = [];
    for (let d = r + 1; d < matrix.length && body.length <= MAX_SUMMARY_ROWS; d += 1) {
      const row = matrix[d] ?? [];
      if (!isCaption(row[labelCol]) || isRecordId(row[labelCol]) || taken(d, labelCol)) break;
      if (!header.slice(1).some((h) => isNumber(row[h.c]))) break;
      body.push(d);
    }
    if (body.length === 0 || body.length > MAX_SUMMARY_ROWS) continue;
    for (const d of body) {
      const rowLabel = asText((matrix[d] ?? [])[labelCol]);
      const total = /^(grand\s+)?(sub-?)?totals?\b/i.test(rowLabel);
      for (const h of header.slice(1)) {
        const value = (matrix[d] ?? [])[h.c];
        if (!isNumber(value) || !free(d, h.c)) continue;
        facts.push({
          label: `${clean(rowLabel)} › ${clean(asText(h.value))}`,
          value: printed(value),
          cell: a1(d, h.c),
          kind: total ? 'total' : 'summary',
          row: clean(rowLabel),
          column: clean(asText(h.value)),
        });
        used.add(`${d}:${h.c}`);
      }
      used.add(`${d}:${labelCol}`);
    }
    for (const h of header) used.add(`${r}:${h.c}`);
    r = body[body.length - 1];
  }

  // 2. A row of captions over ONE row of values, cell for cell — a controlled
  //    document's header block ("Document Number | Revised Date" over its
  //    values), a header and its single row of totals. A second row filled the
  //    same way makes it a table, which is not this reader's.
  const filledCols = (r: number) => cellsOf(r).map((cell) => cell.c);
  for (let r = 0; r + 1 < matrix.length && facts.length < MAX_FACTS; r += 1) {
    const top = cellsOf(r);
    if (top.length < 2 || top.length > MAX_SUMMARY_COLUMNS || !top.every((cell) => isCaption(cell.value))) continue;
    // "Report: | Monthly audit" over "Run date: | …" is two rows of pairs, not captions over values.
    if (top.some((cell) => announces(cell.value)) || cellsOf(r + 1).some((cell) => announces(cell.value))) continue;
    const cols = top.map((cell) => cell.c).join(',');
    if (filledCols(r + 1).join(',') !== cols) continue;
    if (r + 2 < matrix.length && filledCols(r + 2).join(',') === cols && !cellsOf(r + 2).every((cell) => isCaption(cell.value))) continue;
    const under = matrix[r + 1] ?? [];
    // Words under words with figures below them: a two-row table header, not a block.
    const after = cellsOf(r + 2);
    if (top.every((cell) => isCaption(under[cell.c])) && after.length >= top.length && after.some((cell) => isNumber(cell.value))) continue;
    for (const cell of top) {
      facts.push({ label: clean(asText(cell.value)), value: printed(under[cell.c]), cell: a1(r + 1, cell.c), kind: 'pair', at: { r, c: cell.c } });
      used.add(`${r}:${cell.c}`);
      used.add(`${r + 1}:${cell.c}`);
    }
    r += 1;
  }

  // 3. Pairs: a caption with its value beside it, on a row of a few cells —
  //    never a row of a table (three or more cells, filled like the row above
  //    or below it), whose first cell is a record's name, not a caption.
  const tableRow = (r: number) => {
    const cols = filledCols(r);
    if (cols.length < 3) return false;
    return [r - 1, r + 1].some((n) => n >= 0 && filledCols(n).join(',') === cols.join(','));
  };
  for (let r = 0; r < matrix.length && facts.length < MAX_FACTS; r += 1) {
    const cells = cellsOf(r);
    if (cells.length === 0 || cells.length > 6 || tableRow(r)) continue;
    // A line that starts with a registration or an asset code is that record's line, not captions.
    if (isRecordId(cells[0].value) && !announces(cells[0].value)) continue;
    for (let i = 0; i < cells.length; i += 1) {
      const caption = cells[i];
      if (!isCaption(caption.value) || (isRecordId(caption.value) && !announces(caption.value))) continue;
      const next = cells[i + 1];
      if (!next || next.c - caption.c > PAIR_REACH) continue;
      const label = asText(caption.value);
      if (!isNumber(next.value) && !textValueFor(label, next.value)) continue;
      facts.push({ label: clean(label), value: printed(next.value), cell: a1(r, next.c), kind: 'pair', at: { r, c: caption.c } });
      used.add(`${r}:${caption.c}`);
      used.add(`${r}:${next.c}`);
      i += 1;
    }
  }

  // 4. A caption over its figure: alone on its row, the figure directly under it.
  for (let r = 0; r + 1 < matrix.length && facts.length < MAX_FACTS; r += 1) {
    const cells = cellsOf(r);
    if (cells.length !== 1 || !isCaption(cells[0].value) || isRecordId(cells[0].value)) continue;
    const { c } = cells[0];
    const below = (matrix[r + 1] ?? [])[c];
    if (!isNumber(below) || !free(r + 1, c)) continue;
    facts.push({ label: clean(asText(cells[0].value)), value: printed(below), cell: a1(r + 1, c), kind: 'pair', at: { r, c } });
    used.add(`${r}:${c}`);
    used.add(`${r + 1}:${c}`);
  }
  qualifyRepeatedCaptions(matrix, facts);
  return { facts, used };
}

/**
 * A caption printed twice with different figures (a reconciliation's two
 * "Difference" lines: meter against issues, and dip against book stock) is two
 * facts the same words cannot tell apart, and one field given both used
 * neither. Each is named by the caption it follows: the nearest caption above
 * it in the same column, within a few rows ("Theoretical stock › Difference").
 * A caption printed twice with the same figure is one fact and keeps its words.
 */
function qualifyRepeatedCaptions(matrix: unknown[][], facts: SheetFact[]): void {
  const byLabel = new Map<string, SheetFact[]>();
  for (const fact of facts) {
    if (fact.kind !== 'pair' || !fact.at) continue;
    byLabel.set(fact.label, [...(byLabel.get(fact.label) ?? []), fact]);
  }
  for (const [label, same] of byLabel) {
    if (same.length < 2 || new Set(same.map((fact) => String(fact.value))).size < 2) continue;
    const named = same.map((fact) => {
      const { r, c } = fact.at!;
      for (let up = r - 1; up >= Math.max(0, r - 4); up -= 1) {
        const above = asText((matrix[up] ?? [])[c]);
        if (isCaption(above) && clean(above) !== label) return `${clean(above)} › ${label}`;
      }
      return null;
    });
    // Only when every one of them is told apart: otherwise they keep their words.
    if (named.some((name) => name === null) || new Set(named).size < named.length) continue;
    same.forEach((fact, i) => { fact.label = named[i]!; });
  }
}

/** A register's body (the rows its reader read) and its header row. */
export interface RegisterSpan extends ReadSpan {
  headerRow: number;
}

/** A line that totals a register: "TOTAL", "Grand Total", "TOTAL TO BE INVOICED:-". */
const TOTAL_LINE = /^\s*(?:grand\s+)?(?:sub-?)?totals?\b/i;

/**
 * A register's own TOTAL line ("TOTAL TO BE INVOICED:- | 597 | 10 906.77"
 * under the LITERS and AMOUNT columns): no record, and the register reader
 * skips it, but it is the figure the document states for the whole register.
 * Each of its figures is a labelled cell named by the line's caption and its
 * column's header ("TOTAL TO BE INVOICED › LITERS"), mapped like any other.
 */
export function registerTotalFacts(matrix: unknown[][], register: RegisterSpan): SheetFact[] {
  const header = matrix[register.headerRow] ?? [];
  const left = register.left ?? 0;
  const facts: SheetFact[] = [];
  for (let r = register.headerRow + 1; r <= register.bottom && r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const right = register.right ?? row.length - 1;
    let caption = '';
    for (let c = left; c <= right; c += 1) {
      const text = asText(row[c]);
      if (text && !isNumber(row[c])) {
        caption = text;
        break;
      }
    }
    if (!caption || !TOTAL_LINE.test(caption)) continue;
    for (let c = left; c <= right; c += 1) {
      const value = row[c];
      const column = clean(asText(header[c]));
      if (!isNumber(value) || !column) continue;
      facts.push({
        label: `${clean(caption)} › ${column}`,
        value: printed(value),
        cell: a1(r, c),
        kind: 'total',
        row: clean(caption),
        column,
      });
    }
  }
  return facts;
}

/* ------------------------------------------------------------------ *
 * The words a sheet prints that are no labelled figure: titles and notes
 * ------------------------------------------------------------------ */

/** A sheet's title lines, as printed: kept on its read (never a value of any field). */
export const PRINTED_TITLE_FIELD = 'printed_title_lines';
/** A sheet's notes (annotations, legends, warnings), as printed. */
export const PRINTED_NOTES_FIELD = 'printed_notes';

/** A tab name that says nothing about the document ("Sheet1", "Detail3", "Table 2"). */
const GENERIC_SHEET_NAME = /^(?:sheet|detail|table|page|tab|blad|pivot|chart|query|data|copy)\s*\d*$/i;
/** A cell's words: text with a letter in it, never a figure. */
const wordsOf = (c: unknown): string => {
  const text = asText(c);
  return text && /\p{L}/u.test(text) && !/^[-\d\s.,%R()]+$/.test(text) ? text : '';
};
/** A month's name and nothing else ("AUGUST", "Mar 2026"). */
const MONTH_ONLY = /^\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s*'?(?:19|20)?\d{2})?\s*$/i;
/** Lines kept per sheet, and the longest kept. */
const MAX_LINES = 40;
const MAX_LINE = 200;

/**
 * The words a sheet prints that no labelled cell, register or month grid
 * reads, kept exactly as printed:
 *  - TITLE LINES: the lone lines over the sheet's first table or block ("DASHBOARD
 *    2025/2026", a contractor's name over its export, "Driver Debrief Summary
 *    Report" and its run date), and the tab's own name when it says something
 *    ("Jul 25 - Apr 26", a department), never "Sheet1";
 *  - NOTES: a line of one or two words-cells below that ("estimated", a
 *    legend's "X (date) | Completed", a warning that the export was truncated),
 *    and the remark a table carries at the end of a row of figures ("no invoice
 *    received for Dec - used Nov figures").
 * They are the document's own words about itself: reported on its read, never a
 * value of a field, never a rival answer to another document.
 */
/** A date as a file name writes one: "01 July 2025", "JUNE 2026", "Jul 25", "31.03.2026". */
const NAME_DATE = String.raw`(?:\d{1,2}\s*)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*'?(?:19|20)?\d{2}|\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}`;
const NAME_PERIOD = new RegExp(String.raw`(?<![\p{L}\d])(?:${NAME_DATE})\s*(?:to|until|till|-|–|—)\s*(?:${NAME_DATE})(?![\p{L}\d])`, 'iu');

/**
 * The period a file's own name states, as written ("01 July 2025 to JUNE
 * 2026", "Jul 25- Apr 26"): two dates joined by "to" or a dash. Only the
 * workbook's name counts (a sheet's part after " › " is its tab). Null when the
 * name states no period: one month alone is no period.
 */
export function periodInFileName(fileName?: string): string | null {
  const base = String(fileName ?? '').split(' › ')[0].replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const m = NAME_PERIOD.exec(base.replace(/_/g, ' '));
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export function findSheetText(
  matrix: unknown[][],
  used: ReadonlySet<string> = new Set(),
  sheetName?: string,
  read: ReadSpan[] = [],
  fileName?: string,
): { titles: string[]; notes: string[] } {
  // A register's or a month grid's own rows are its reader's; only the remark
  // at the end of a row of figures is read from inside them.
  const inRead = (r: number, c: number) => read.some((span) => r >= span.top && r <= span.bottom
    && (span.left === undefined || c >= span.left) && (span.right === undefined || c <= span.right));
  const titles: string[] = [];
  const notes: string[] = [];
  const keep = (list: string[], text: string) => {
    const line = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE);
    if (line && !titles.includes(line) && !notes.includes(line) && list.length < MAX_LINES) list.push(line);
  };
  const tab = String(sheetName ?? '').replace(/\s+/g, ' ').trim();
  if (tab && /\p{L}|\d/u.test(tab) && !GENERIC_SHEET_NAME.test(tab)) keep(titles, tab);
  // The period the FILE's name states ("... 01 July 2025 to JUNE 2026.xlsx"):
  // often the only place a report says what it covers.
  const named = periodInFileName(fileName);
  if (named) keep(titles, named);

  // An exported table's "Column1 … Column12" row is no line the sheet's author wrote.
  const placeholderRow = (r: number) => {
    const cells = (matrix[r] ?? []).filter((value) => !isBlank(value));
    return cells.length >= 2 && cells.every((value) => /^(?:column|col|field|unnamed:?)[\s_]*\d+$/i.test(asText(value)));
  };
  const filled = (r: number) => (placeholderRow(r) ? [] : (matrix[r] ?? []).map((value, c) => ({ c, value })).filter(({ value }) => !isBlank(value)));
  // The figures and words a column holds, for telling a remark from a column of text.
  const textInColumn = (c: number) => matrix.filter((row) => wordsOf((row ?? [])[c])).length;
  const rowsWithFigures = matrix.filter((row) => (row ?? []).some(isNumber)).length;
  // The title area ends at the first row that is not a lone line: a table's
  // header, a block, a caption and its value.
  let body = matrix.length;
  for (let r = 0; r < matrix.length; r += 1) {
    const cells = filled(r);
    if (cells.length >= 2) {
      body = r;
      break;
    }
  }
  for (let r = 0; r < matrix.length; r += 1) {
    const cells = filled(r);
    const free = cells.filter(({ c }) => !used.has(`${r}:${c}`));
    if (r < body) {
      for (const cell of free) {
        const text = wordsOf(cell.value);
        if (text) keep(titles, text);
        // A date printed alone over the table is the sheet's date, as printed.
        else if (typeof cell.value === 'number' && Number.isInteger(cell.value) && cell.value > 36526 && cell.value < 73051) {
          keep(titles, new Date(Math.round((cell.value - 25569) * 86400 * 1000)).toISOString().slice(0, 10));
        }
      }
      continue;
    }
    // A line of one or two word cells: a note, a legend line, a warning.
    if (cells.length >= 1 && cells.length <= 2 && free.length === cells.length && cells.every((cell) => wordsOf(cell.value))
      && !cells.some((cell) => inRead(r, cell.c))) {
      const line = cells.map((cell) => wordsOf(cell.value)).join(': ');
      // A month's name on its own heads the rows under it; it says nothing of its own.
      if (!MONTH_ONLY.test(line)) keep(notes, line);
      continue;
    }
    // A remark at the end of a row of figures, in a column that holds remarks
    // only now and then (a column of text on most rows is a register's column).
    const last = cells[cells.length - 1];
    if (last && free.includes(last) && cells.length >= 3 && cells.slice(0, -1).some((cell) => typeof cell.value === 'number')) {
      const text = wordsOf(last.value);
      if (text && text.split(/\s+/).length >= 3 && textInColumn(last.c) * 3 <= Math.max(3, rowsWithFigures)) keep(notes, text);
    }
  }
  return { titles, notes };
}

/* ------------------------------------------------------------------ *
 * Which field a label is
 * ------------------------------------------------------------------ */

interface CandidateField {
  specId: string;
  field: string;
  description: string;
  /** The wordings the skill says the field is printed under. */
  labels: string[];
  /** The skill's type for the field (date, count, text...), when it has one. */
  type?: string;
}

/** A label as compared with a skill's wordings: lower case, no punctuation, no bracketed aside. */
export function labelKey(label: string): string {
  return label.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9%]+/g, ' ').trim();
}

/** The document-level fields of a spec, with what its skill says of each. */
function fieldsOf(specId: string): CandidateField[] {
  const domain = extractionDomain('esg');
  const spec = domain.findDocumentById(specId);
  if (!spec) return [];
  const grid = domain.gridForDocument(specId);
  const rowFields = new Set([...(grid?.rowFields ?? []), grid?.rowsField].filter(Boolean) as string[]);
  const skill = domain.skillFor(specId);
  const skillFields = new Map((skill?.fields ?? []).filter((f) => !f.rowLevel).map((f) => [f.name, f]));
  const names = new Set([...spec.expectedFields, ...skillFields.keys()]);
  // A row column is no document-level field, unless the skill declares it at
  // document level too: a waste report's site total and a debrief's grand
  // total of planned stops share their rows' names (skills.ts), and are
  // exactly the figures a labelled cell prints.
  return [...names]
    .filter((name) => (!rowFields.has(name) || skillFields.has(name)) && name !== skill?.rowsField && name !== 'exceptions')
    .map((name) => ({
      specId,
      field: name,
      description: skillFields.get(name)?.description ?? '',
      labels: skillFields.get(name)?.labels ?? [],
      ...(skillFields.get(name)?.type ? { type: skillFields.get(name)!.type } : {}),
    }));
}

/** A printed date, written any of the ways a sheet prints one ("06-Aug-2026 09:41:12 PM", "12/06/2026"), as yyyy-mm-dd; null otherwise. */
export function printedDateIso(text: string): string | null {
  const bare = text.trim().replace(/[\sT]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[AP]M)?$/i, '');
  return dateOf(bare);
}

/** A month and a year the line names ("SUMMARY FEBRUARY 2026", "Mar 2026"). */
const MONTH_AND_YEAR_IN = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(?:19|20)\d{2}\b/i;

/**
 * What a title line gives a field it was mapped to: the line itself for a
 * name or a text, its date (yyyy-mm-dd) for a date field when it is one date,
 * the line as printed for a date field when it names a month and a year
 * ("SUMMARY FEBRUARY 2026" for a list current at February 2026). Never a
 * figure: a count, an amount or a quantity is no title. Null when the line
 * cannot be that field's value.
 */
export function titleValueFor(candidate: { field: string; type?: string }, line: string): string | null {
  const type = candidate.type ?? (/(?:_date|_start|_end)$/.test(candidate.field) ? 'date' : 'text');
  if (['count', 'number', 'money', 'percent', 'level', 'bool', 'idno'].includes(type)) return null;
  if (type === 'date') {
    const iso = printedDateIso(line);
    if (iso) return iso;
    return MONTH_AND_YEAR_IN.test(line) ? line : null;
  }
  return line;
}

/**
 * The fields a label is by the skills' own wordings: its key equals exactly
 * one wording of exactly one field. Two fields claiming it is no answer.
 */
export function fieldBySkillWording(label: string, candidates: CandidateField[]): CandidateField | null {
  const key = labelKey(label);
  if (!key) return null;
  const hits = candidates.filter((candidate) => candidate.labels.some((wording) => labelKey(wording) === key));
  const distinct = new Map(hits.map((hit) => [`${hit.specId}:${hit.field}`, hit]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

const MAP_SYSTEM = [
  'You map the labelled cells of a spreadsheet sheet to the fields of an ESG document type.',
  'Map a label only when the cell beside it IS that field\'s value for the whole document (not one',
  'site\'s or one row\'s share, unless the field is per site). Leave out every label that is no listed field.',
  'A label of kind "title line" is a line the sheet prints on its own above its tables: it is its own',
  'value. Map it only when the WHOLE line is that field\'s value (a site or depot\'s name, the date the',
  'report was run, the month a list is current at, the company that issued the report), never a field',
  'it only mentions.',
  'Reply with JSON only: {"mapping": {"<label>": "<spec id>/<field>"}}.',
].join(' ');

async function mapLabelsByModel(
  model: ExtractionModel,
  labels: Array<{ label: string; kind: string }>,
  candidates: CandidateField[],
  context: { template: string },
): Promise<Record<string, CandidateField>> {
  if (labels.length === 0 || candidates.length === 0) return {};
  const byId = new Map(candidates.map((candidate) => [`${candidate.specId}/${candidate.field}`, candidate]));
  const user = [
    `SHEET: ${context.template}`,
    `LABELS (with the kind of value beside each): ${JSON.stringify(labels)}`,
    'FIELDS:',
    ...candidates.map((candidate) => `  ${candidate.specId}/${candidate.field}${candidate.description ? `: ${candidate.description}` : ''}`),
    'Reply as JSON: {"mapping": {"<label>": "<spec id>/<field>"}}',
  ].join('\n');
  const fingerprint = decisionFingerprint([
    'esgsheetfacts',
    context.template,
    ...labels.map((l) => l.label).sort(),
    ...[...byId.keys()].sort(),
  ]);
  try {
    const decision = await rememberDecision<Record<string, string>>('esgsheetfacts', fingerprint, async () => {
      const ask = model.completeHard?.bind(model) ?? model.complete.bind(model);
      const reply = await ask(MAP_SYSTEM, user);
      const json = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as { mapping?: Record<string, unknown> };
      const mapping: Record<string, string> = {};
      for (const [label, target] of Object.entries(json.mapping ?? {})) {
        if (typeof target === 'string' && byId.has(target) && labels.some((l) => l.label === label)) mapping[label] = target;
      }
      return mapping;
    });
    return Object.fromEntries(Object.entries(decision.value ?? {}).map(([label, id]) => [label, byId.get(id)!]).filter(([, c]) => c));
  } catch (err) {
    logger.warn('Labelled cells could not be mapped', { sheet: context.template, reason: (err as Error).message });
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * The read
 * ------------------------------------------------------------------ */

export interface EsgSheetFactsInput {
  filename: string;
  sheetName?: string;
  /** The template a tab shares with its siblings ("Vehicle fuel log"): the mapping is asked once for them all. */
  template?: string;
  matrix: unknown[][];
  /** Rows other readers read. */
  read?: ReadSpan[];
  /** Specs the sheet's other reads were filed under (a register, the flat read). */
  specIds?: string[];
  /** A hidden sheet: its facts are kept as open facts only, and nothing is asked of the model. */
  hidden?: boolean;
  /** The register the sheet's register reader read: its total line is read here. */
  register?: RegisterSpan;
}

/** How many specs retrieval offers when the sheet's other reads named none. */
const RANKED_SPECS = 3;

function kindOfValue(value: string | number): string {
  if (typeof value === 'number') return Number.isInteger(value) && value > 36526 && value < 73051 ? 'number or date' : 'number';
  return /\d/.test(value) ? 'code or date' : 'text';
}

/** A date field's Excel day number is the date it shows. */
function valueFor(field: string, value: string | number): string | number {
  if (typeof value === 'number' && /(_date|_start|_end)$/.test(field) && Number.isInteger(value) && value > 36526 && value < 73051) {
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  return value;
}

/** The rows a skill with `summaryTables` keeps its printed summary cells under. */
export const PRINTED_SUMMARY_FIELD = 'printed_summary_rows';

/** What the code keeps of a sheet as printed: its summary cells, title lines and notes. Each describes its own document. */
export const PRINTED_DOCUMENT_FIELDS: ReadonlySet<string> = new Set([PRINTED_SUMMARY_FIELD, PRINTED_TITLE_FIELD, PRINTED_NOTES_FIELD]);

/**
 * A period printed as one range ("2025-07-01 - 2026-06-30", "1 July 2025 to
 * 30 June 2026") under a field that names its start: the two ends, as printed.
 * Null for anything else, a single date included (ISO dashes have no spaces
 * around them, so they never split).
 */
export function rangeOf(field: string, value: string | number): [string, string] | null {
  if (!/_start$/.test(field) || typeof value !== 'string') return null;
  const parts = value.trim().split(/\s+(?:-|–|to)\s+/i);
  if (parts.length !== 2) return null;
  const dateLike = (part: string) => /\d/.test(part) && (/\b\d{4}\b/.test(part) || /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(part));
  return dateLike(parts[0]) && dateLike(parts[1]) ? [parts[0].trim(), parts[1].trim()] : null;
}

const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A period field's cell whose caption says it is a MONTH ("for the month of:",
 * "Month") is that whole month: a sheet prints the month as its first day
 * (2026-03-01, a day number) or as "March 2026". Under a period's start or end
 * it gives both ends, first and last day. Null for anything else: a caption
 * that names no month, or a value that is no date or month.
 */
export function wholeMonthOf(field: string, label: string, value: string | number): [string, string] | null {
  if (!/_(?:start|end)$/.test(field) || !/\bmonth\b/i.test(label)) return null;
  let year: number | null = null;
  let month: number | null = null;
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
  } else {
    const named = /^([A-Za-z]{3,9})\.?[\s\-/]+(\d{4})$/.exec(text);
    const index = named ? MONTH_WORDS.indexOf(named[1].slice(0, 3).toLowerCase()) : -1;
    if (named && index >= 0) {
      year = Number(named[2]);
      month = index + 1;
    }
  }
  if (!year || !month || month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`];
}

/**
 * Read a sheet's labelled cells. One extraction per document type a label
 * mapped to (its values, each citing its cell), plus the open facts no label
 * mapped. Null when the sheet holds no labelled cell.
 */
export async function extractEsgSheetFacts(
  model: ExtractionModel | null,
  input: EsgSheetFactsInput,
): Promise<DocumentExtraction[] | null> {
  const found = findSheetFactsAndCells(input.matrix, input.read ?? []);
  const used = found.used;
  // A hidden sheet's words are scratch work, never the document's.
  const text = input.hidden ? { titles: [], notes: [] } : findSheetText(input.matrix, used, input.sheetName, input.read ?? [], input.filename);
  // A register's own total line, inside the rows the register reader read.
  const totals = input.hidden || !input.register ? [] : registerTotalFacts(input.matrix, input.register);
  // Title lines are offered to the mapping as labels that are their own value.
  // A tab of a template (one per vehicle) shares one question with its
  // siblings, so its own lines are never part of it.
  const titleFacts: SheetFact[] = input.template ? [] : text.titles.map((line) => ({ label: line, value: line, cell: 'title', kind: 'title' as const }));
  const facts = [...found.facts, ...totals, ...titleFacts];
  if (facts.length === 0 && text.titles.length === 0 && text.notes.length === 0) return null;
  const sheet = input.sheetName ?? input.filename;

  const specIds = [...new Set([
    ...(input.specIds ?? []),
    ...rankSpecsForDocument(`${sheet}\n${facts.map((f) => f.label).join('\n')}`, input.filename, { domain: 'esg', limit: RANKED_SPECS, elementHint: input.sheetName })
      .map((candidate) => candidate.spec.id),
  ])];
  const candidates = specIds.flatMap(fieldsOf);

  // The skills' own wordings first: free and exact.
  const mapped = new Map<SheetFact, CandidateField>();
  const byWording = new Set<SheetFact>();
  // A hidden sheet's cells are notes only: scratch copies and stale lists are no reading.
  for (const fact of input.hidden ? [] : facts) {
    // A title line is its own value: never taken for a field by a wording it shares (a sheet titled "Generator").
    if (fact.kind === 'title') continue;
    const hit = fieldBySkillWording(fact.label, candidates);
    if (hit) {
      mapped.set(fact, hit);
      byWording.add(fact);
    }
  }
  // The model for the rest, once per set of labels. Never for a hidden sheet.
  if (model && !input.hidden) {
    const rest = facts.filter((fact) => !mapped.has(fact));
    const labels = [...new Map(rest.map((fact) => [fact.label, { label: fact.label, kind: fact.kind === 'title' ? 'title line' : kindOfValue(fact.value) }])).values()];
    const byModel = await mapLabelsByModel(model, labels, candidates, { template: input.template ?? sheet });
    for (const fact of rest) if (byModel[fact.label]) mapped.set(fact, byModel[fact.label]);
  }

  // One value per field: two cells mapped to one field must agree, or neither is used.
  const byField = new Map<string, { candidate: CandidateField; facts: SheetFact[] }>();
  for (const [fact, candidate] of mapped) {
    const key = `${candidate.specId}/${candidate.field}`;
    const entry = byField.get(key) ?? { candidate, facts: [] };
    entry.facts.push(fact);
    byField.set(key, entry);
  }
  const extractions = new Map<string, DocumentExtraction>();
  const exceptions: string[] = [];
  const unmapped = new Set(facts.filter((fact) => !mapped.has(fact)));
  const extractionFor = (specId: string): DocumentExtraction => {
    const extraction = extractions.get(specId) ?? {
      documentId: specId,
      documentName: `${sheet} labelled cells`,
      sourceFile: input.filename,
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    extractions.set(specId, extraction);
    return extraction;
  };
  const taken = new Set([...byField.values()].map(({ candidate }) => `${candidate.specId}/${candidate.field}`));
  for (const { candidate, facts: mappedHere } of byField.values()) {
    // A title line yields to a labelled cell for the same field; alone, it must
    // be a value the field can hold (a date field takes a printed date or month).
    const labelled = mappedHere.filter((fact) => fact.kind !== 'title');
    const all = labelled.length > 0 ? labelled : mappedHere.flatMap((fact) => {
      const value = titleValueFor(candidate, String(fact.value));
      return value === null ? [] : [{ ...fact, value }];
    });
    if (all.length === 0) continue;
    let cells = all;
    // A label printed in the skill's own wording IS the field; a label the
    // model guessed for the same field that disagrees with it ("Theoretical
    // stock" taken for the closing dip) is left as a note, never allowed to
    // cancel the exact one.
    const exact = all.filter((fact) => byWording.has(fact));
    if (exact.length > 0 && exact.length < all.length && new Set(exact.map((fact) => String(fact.value))).size === 1) {
      const guessed = all.filter((fact) => !byWording.has(fact) && String(fact.value) !== String(exact[0].value));
      if (guessed.length > 0) {
        exceptions.push(`${candidate.field}: the sheet prints it as "${exact[0].label}" (${exact[0].value}, ${exact[0].cell}); `
          + `${guessed.map((f) => `"${f.label}" (${f.value}, ${f.cell})`).join(' and ')} was not used for it.`);
        guessed.forEach((fact) => unmapped.add(fact));
        cells = all.filter((fact) => !guessed.includes(fact));
      }
    }
    const values = [...new Set(cells.map((fact) => String(fact.value)))];
    if (values.length > 1) {
      exceptions.push(`${candidate.field}: the sheet states ${cells.map((f) => `${f.value} (${f.cell}, "${f.label}")`).join(' and ')}; none was used.`);
      cells.forEach((fact) => unmapped.add(fact));
      continue;
    }
    const fact = cells[0];
    const extraction = extractionFor(candidate.specId);
    const source = { method: 'cell' as const, cellRef: fact.cell, quote: `${fact.label}: ${fact.value}` };
    // "2025-07-01 - 2026-06-30" under a period START is the whole range: its
    // start is the start, and its end is the period's end when that field
    // exists and no cell of its own states it.
    const range = rangeOf(candidate.field, fact.value);
    const endField = range ? candidate.field.replace(/_start$/, '_end') : null;
    if (range && endField && candidates.some((c) => c.specId === candidate.specId && c.field === endField)
      && !taken.has(`${candidate.specId}/${endField}`)) {
      extraction.values.push({ field: candidate.field, value: range[0], sourceFile: input.filename, sourceDocumentId: candidate.specId, source });
      extraction.values.push({ field: endField, value: range[1], sourceFile: input.filename, sourceDocumentId: candidate.specId, source });
      continue;
    }
    // "for the month of: 2026-03-01" is the whole month: its first and last day.
    const month = wholeMonthOf(candidate.field, fact.label, valueFor(candidate.field, fact.value));
    const otherEnd = month ? candidate.field.replace(/_(start|end)$/, (_m, end: string) => (end === 'start' ? '_end' : '_start')) : null;
    if (month && otherEnd && candidates.some((c) => c.specId === candidate.specId && c.field === otherEnd)
      && !taken.has(`${candidate.specId}/${otherEnd}`)) {
      const startField = /_start$/.test(candidate.field) ? candidate.field : otherEnd;
      const endField2 = startField === candidate.field ? otherEnd : candidate.field;
      extraction.values.push({ field: startField, value: month[0], sourceFile: input.filename, sourceDocumentId: candidate.specId, source });
      extraction.values.push({ field: endField2, value: month[1], sourceFile: input.filename, sourceDocumentId: candidate.specId, source });
      continue;
    }
    extraction.values.push({
      field: candidate.field,
      value: valueFor(candidate.field, fact.value),
      sourceFile: input.filename,
      sourceDocumentId: candidate.specId,
      source,
    });
  }

  // A document type whose skill keeps its printed summary tables (a system
  // export's totals per site and category, a register's count per depot) gets
  // every summary cell no field took, as one row each: its row label, its
  // column header and the figure, as printed. Never on a hidden sheet.
  // Only a type the sheet IS (its reads, its workbook's type), never one
  // keyword retrieval merely offered for its labels.
  const summaryHolder = input.hidden ? null : (input.specIds ?? []).find((id) => extractionDomain('esg').skillFor(id)?.summaryTables);
  if (summaryHolder) {
    const cells = facts.filter((fact) => unmapped.has(fact) && (fact.kind === 'summary' || fact.kind === 'total') && fact.row && fact.column);
    if (cells.length > 0) {
      extractionFor(summaryHolder).values.push({
        field: PRINTED_SUMMARY_FIELD,
        value: cells.map((fact) => ({
          summary_row_label: fact.row,
          summary_column_label: fact.column,
          summary_value: fact.value,
          summary_is_total: fact.kind === 'total' || /^(grand\s+)?(sub-?)?totals?\b/i.test(fact.column ?? ''),
          summary_cell: fact.cell,
        })),
        sourceFile: input.filename,
        sourceDocumentId: summaryHolder,
        source: { method: 'cell', cellRef: `${cells[0].cell}:${cells[cells.length - 1].cell}`, quote: `${sheet}: ${cells.length} summary cells` },
      });
      cells.forEach((fact) => unmapped.delete(fact));
    }
  }

  // The sheet's title lines and notes, as printed, on the read of the type the
  // sheet is (a listed skill's spec), or on the sheet's own labelled-cell read.
  if (text.titles.length > 0 || text.notes.length > 0) {
    const domain = extractionDomain('esg');
    const typed = (input.specIds ?? []).find((id) => domain.skillFor(id) !== null);
    const holder = typed ? extractionFor(typed) : extractionFor('esg_sheet_facts');
    for (const [field, lines] of [[PRINTED_TITLE_FIELD, text.titles], [PRINTED_NOTES_FIELD, text.notes]] as const) {
      if (lines.length === 0) continue;
      holder.values.push({
        field,
        value: [...lines],
        sourceFile: input.filename,
        sourceDocumentId: holder.documentId,
        source: { method: 'cell', quote: `${sheet}: ${lines.length} line(s) as printed` },
      });
    }
  }

  const out = [...extractions.values()];
  const open: OpenFact[] = [...unmapped].filter((fact) => fact.kind !== 'title').slice(0, MAX_OPEN_FACTS).map((fact) => ({
    label: fact.label,
    value: String(fact.value),
    unit: null,
    kind: typeof fact.value === 'number' ? 'figure' : 'other',
    page: null,
    cell: fact.cell,
    quote: `${fact.label}: ${fact.value}`,
    method: 'code',
  }));
  if (open.length > 0 || exceptions.length > 0) {
    const holder = out[0] ?? {
      documentId: 'esg_sheet_facts',
      documentName: `${sheet} labelled cells`,
      sourceFile: input.filename,
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    holder.exceptions.push(...exceptions);
    if (input.hidden) holder.exceptions.push(`These cells are on a HIDDEN sheet ("${sheet}"): kept as notes, never read as figures.`);
    if (open.length > 0) {
      holder.open = { other: false, label: null, couldEvidence: [], identity: emptyIdentity(), facts: open, dropped: 0 };
    }
    if (!out.includes(holder)) out.push(holder);
  }

  logger.info('Read labelled sheet cells', {
    file: input.filename,
    facts: facts.length,
    mapped: mapped.size,
    fields: byField.size,
    open: open.length,
  });
  return out.length > 0 ? out : null;
}

/* ------------------------------------------------------------------ *
 * Where the reader looks, and how its reads join the sheet's others
 * ------------------------------------------------------------------ */

/** PARSER_ESG_SHEET_FACTS=off turns the reader off: every sheet is read exactly as before. */
export function sheetFactsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !/^(off|false|0)$/i.test(String(env.PARSER_ESG_SHEET_FACTS ?? '').trim());
}

/** Where a sheet's main table sits (workbookSheetSplit.ts SheetRegion). */
export interface MainRegion {
  headerRow: number;
  startCol: number;
  endCol: number;
}

/**
 * The rows of a sheet's main table, header to last record: rows filled in two
 * or more of its columns, a single blank line inside it allowed. The label and
 * value lines a sheet keeps under its table ("Opening stock (dip) | …") start
 * after the gap, and are this reader's.
 */
export function registerBodySpan(matrix: unknown[][], region: MainRegion): ReadSpan {
  const filled = (r: number) => {
    const row = matrix[r] ?? [];
    let n = 0;
    for (let c = region.startCol; c <= region.endCol; c += 1) if (!isBlank(row[c])) n += 1;
    return n;
  };
  let bottom = region.headerRow;
  for (let r = region.headerRow + 1; r < matrix.length; r += 1) {
    if (filled(r) >= 2) {
      bottom = r;
      continue;
    }
    if (filled(r) === 0 && filled(r + 1) >= 3) continue;
    break;
  }
  return { top: region.headerRow, bottom, left: region.startCol, right: region.endCol };
}

/** The cells a large sheet carries from outside its main table, laid back out where they sit. */
export function sparseMatrix(cells: Array<{ r: number; c: number; value: unknown }>): unknown[][] {
  const matrix: unknown[][] = [];
  for (const { r, c, value } of cells) {
    (matrix[r] ??= [])[c] = value;
  }
  for (let r = 0; r < matrix.length; r += 1) matrix[r] ??= [];
  return matrix;
}

const sameValue = (a: unknown, b: unknown): boolean => {
  const x = Number(String(a ?? '').replace(/[\s,]/g, ''));
  const y = Number(String(b ?? '').replace(/[\s,]/g, ''));
  if ((typeof a === 'number' || typeof b === 'number') && Number.isFinite(x) && Number.isFinite(y)) {
    return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x));
  }
  const text = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return text(a) === text(b);
};

/**
 * Join a sheet's labelled-cell reads to its other reads. A field another read
 * already gave the same value is not repeated. A field another read gave a
 * DIFFERENT value takes the cell's: the cell is the figure the sheet prints
 * under that field's own label, read by the code; the other value is kept as
 * an exception on its read, never dropped silently. A read the CODE made (a
 * register, a month grid, a period summary: `codeReads`) is never replaced:
 * the disagreeing cell is not used, and the reviewer is told.
 */
export function mergeCellReads(
  results: DocumentExtraction[],
  cellReads: DocumentExtraction[],
  codeReads: ReadonlyArray<DocumentExtraction | null> = [],
): DocumentExtraction[] {
  for (const read of cellReads) {
    read.values = read.values.filter((value) => {
      let keep = true;
      for (const other of results) {
        const index = other.values.findIndex((v) => v.field === value.field && !Array.isArray(v.value));
        if (index < 0) continue;
        const prior = other.values[index];
        if (sameValue(prior.value, value.value)) return false;
        if (codeReads.includes(other)) {
          read.exceptions.push(
            `${value.field}: the sheet's cell ${value.source?.cellRef ?? ''} (${value.source?.quote ?? ''}) states `
              + `"${String(value.value)}", but the sheet's table reads "${String(prior.value)}". The table's reading was kept.`,
          );
          keep = false;
          continue;
        }
        other.values.splice(index, 1);
        other.exceptions.push(
          `${value.field}: this read gave "${String(prior.value)}", but the sheet's cell ${value.source?.cellRef ?? ''} `
            + `(${value.source?.quote ?? ''}) states "${String(value.value)}". The cell was kept.`,
        );
      }
      return keep;
    });
  }
  return [...results, ...cellReads.filter((read) => read.values.length > 0 || read.open || read.exceptions.length > 0)];
}
