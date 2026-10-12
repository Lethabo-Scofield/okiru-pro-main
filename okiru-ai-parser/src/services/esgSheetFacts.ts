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

const logger = createLogger('EsgSheetFacts');

/** One labelled figure, as the sheet prints it. */
export interface SheetFact {
  /** The sheet's own words for it: a caption, or a row label and its column header. */
  label: string;
  value: string | number;
  /** A1 reference of the value. */
  cell: string;
  /** pair: caption beside or over a value; summary: a block's row × header; total: a block's total line. */
  kind: 'pair' | 'summary' | 'total';
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
      facts.push({ label: clean(asText(cell.value)), value: printed(under[cell.c]), cell: a1(r + 1, cell.c), kind: 'pair' });
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
      facts.push({ label: clean(label), value: printed(next.value), cell: a1(r, next.c), kind: 'pair' });
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
    facts.push({ label: clean(asText(cells[0].value)), value: printed(below), cell: a1(r + 1, c), kind: 'pair' });
    used.add(`${r}:${c}`);
    used.add(`${r + 1}:${c}`);
  }
  return facts;
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
    }));
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

/**
 * Read a sheet's labelled cells. One extraction per document type a label
 * mapped to (its values, each citing its cell), plus the open facts no label
 * mapped. Null when the sheet holds no labelled cell.
 */
export async function extractEsgSheetFacts(
  model: ExtractionModel | null,
  input: EsgSheetFactsInput,
): Promise<DocumentExtraction[] | null> {
  const facts = findSheetFacts(input.matrix, input.read ?? []);
  if (facts.length === 0) return null;
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
    const hit = fieldBySkillWording(fact.label, candidates);
    if (hit) {
      mapped.set(fact, hit);
      byWording.add(fact);
    }
  }
  // The model for the rest, once per set of labels. Never for a hidden sheet.
  if (model && !input.hidden) {
    const rest = facts.filter((fact) => !mapped.has(fact));
    const labels = [...new Map(rest.map((fact) => [fact.label, { label: fact.label, kind: kindOfValue(fact.value) }])).values()];
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
  for (const { candidate, facts: all } of byField.values()) {
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

  const out = [...extractions.values()];
  const open: OpenFact[] = [...unmapped].slice(0, MAX_OPEN_FACTS).map((fact) => ({
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
