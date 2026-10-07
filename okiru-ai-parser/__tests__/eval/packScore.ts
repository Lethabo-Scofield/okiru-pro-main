/**
 * Score a whole-pack case (scripts/pack-eval.ts --domain bbbee) against the
 * pack's answer key. Pure: no files, no network — packEval.test.ts does the I/O.
 *
 * Three layers are scored for every expected field:
 *  - det:   documents_detected[].extracted_fields[k].normalized_value (what
 *           parser_runs stores and the review screen shows), plus the
 *           deterministic supplier rows and measured procurement spend;
 *  - ai:    ai_entities.extractions[sourceFile].values[{field, value}];
 *  - union: either layer.
 *
 * A key field with `keys` compares only those parser field names, so a value
 * under them is correct, wrong, or (for absentOk fields) invented. A key field
 * without `keys` scores recall only: correct when the value appears anywhere in
 * that document's output. Precision is counted over keyed fields only, and the
 * report says how many fields that is, so the base of the figure is visible.
 */
import { valuesAgree } from '../../src/services/entityResolution.js';

export type FieldKind = 'regno' | 'date' | 'number' | 'money' | 'percent' | 'text' | 'bool' | 'level' | 'count' | 'list';

/** The kinds a list's items can be compared as. */
export type ItemKind = Exclude<FieldKind, 'count' | 'list'>;

export interface KeyField {
  label: string;
  /**
   * Parser field names. `rows.column` reads a column across an array-of-rows
   * field. For a `count`, a plain name counts the rows of each array under it;
   * `rows.column` counts the non-empty cells in that column.
   */
  keys: string[];
  value: unknown;
  kind: FieldKind;
  /** list only: how each item compares (default text). */
  itemKind?: ItemKind;
  /** number/money/percent: absolute slack; list: minimum fraction of items found (default 1). */
  tolerance: number | null;
  /** The document does not contain this; any value under `keys` is invented. */
  absentOk: boolean;
  /** Other renderings that also count as correct ("CC" for "Close Corporation"). */
  alternatives?: unknown[];
  /** How several values under `keys` combine: any one agreeing (default), or their sum. */
  aggregate?: 'any' | 'sum';
  source?: string;
  review?: string;
}

export interface KeyDocument {
  file: string;
  path: 'parser' | 'workbook';
  type: string;
  /** Deterministic document_type names or AI spec ids that count as the right type. */
  typeAccepts: string[];
  fields: KeyField[];
}

export interface AnswerKey {
  version: number;
  sector?: string;
  size?: string;
  yearEnd?: string;
  certified?: { certificate?: string; score?: number; level?: number; elements?: Record<string, number> };
  documents: KeyDocument[];
}

interface DetField { normalized_value?: unknown }
interface DetDocument {
  filename: string;
  document_type: string;
  status?: string;
  extracted_fields?: Record<string, DetField>;
  parser_output?: { supplier_rows?: Array<Record<string, unknown>>; measured_procurement_spend?: number | null };
}
interface AiExtraction { documentId: string; sourceFile: string; values?: Array<{ field: string; value: unknown }> }

export interface PackCase {
  documents_detected?: DetDocument[];
  ai_entities?: { extractions?: AiExtraction[] } | null;
  /** Files the run could not read at all (pack-eval.ts). */
  unreadable_files?: Array<{ file_name: string; reason?: string }>;
}

export type FieldStatus = 'correct' | 'wrong' | 'missing' | 'invented' | 'absent_ok' | 'unscored';
export type Layer = 'det' | 'ai' | 'union';

export interface LayerCounts {
  /** Fields the document validly contains (absentOk excluded). */
  expected: number;
  correct: number;
  /** Correct among keyed fields — the precision numerator. */
  correctKeyed: number;
  wrong: number;
  missing: number;
  invented: number;
  recall: number | null;
  precision: number | null;
}

export interface DocScore {
  file: string;
  path: string;
  type_ok: boolean | null;
  ai_type_ok: boolean | null;
  ours_type: string[];
  keyedFields: number;
  det: LayerCounts;
  ai: LayerCounts;
  union: LayerCounts;
}

export interface FieldScore {
  file: string;
  label: string;
  keyed: boolean;
  absentOk: boolean;
  expected: unknown;
  det: { status: FieldStatus; ours: string[] };
  ai: { status: FieldStatus; ours: string[] };
  union: { status: FieldStatus };
}

export interface PackScore {
  perDoc: DocScore[];
  perField: FieldScore[];
  totals: {
    documents: number;
    fields: number;
    keyedFields: number;
    unkeyedFields: number;
    absentOkFields: number;
    type_ok: number;
    ai_type_ok: number;
    typed_documents: number;
    /** Key documents the run could not read at all. */
    unreadable: number;
    det: LayerCounts;
    ai: LayerCounts;
    union: LayerCounts;
  };
}

// ── value normalisers ──────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fullYear(y: number): number {
  if (y >= 100) return y;
  return y < 50 ? 2000 + y : 1900 + y;
}

/** A date in any form the pack uses → yyyy-mm-dd. South African order is day first. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    // An Excel serial date (1955–2064).
    if (value > 20000 && value < 60000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return iso(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
  return null;
}

/** "R 1 250 000", "(71 205)", "-R54,321", "37.5%" → number. Null for prose. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/^-\s*/, () => { negative = !negative; return ''; });
  s = s.replace(/^(zar|r)\s*/i, '').replace(/^-\s*/, () => { negative = !negative; return ''; });
  s = s.replace(/[\s %]/g, '');
  // 1,250.50 or 1 250,50 — a comma followed by exactly two digits at the end is a decimal comma.
  if (/,\d{2}$/.test(s) && !s.includes('.')) s = s.replace(/,(\d{2})$/, '.$1');
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

export function normaliseRegNo(value: unknown): string {
  return String(value ?? '').replace(/[\s ]/g, '').toUpperCase();
}

export function normaliseText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const s = normaliseText(value);
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

const LEVEL_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

/** "Level 1", "LEVEL ONE CONTRIBUTOR", 1, "1" → 1; "Non-compliant" → 0. */
export function toLevel(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 8 ? value : null;
  const s = normaliseText(value);
  if (!s) return null;
  if (/\bnon compliant\b/.test(s)) return 0;
  const m = s.match(/^(?:b bbee |bee )?(?:level )?([0-8]|one|two|three|four|five|six|seven|eight)(?: contributor)?$/)
    ?? s.match(/\blevel ([0-8]|one|two|three|four|five|six|seven|eight)\b/);
  if (!m) return null;
  return /\d/.test(m[1]) ? Number(m[1]) : LEVEL_WORDS[m[1]];
}

/** A stated nothing ("nil", "none", "-") is zero for a figure. */
function toFigure(value: unknown): number | null {
  if (typeof value === 'string' && /^\s*(nil|none|-|—)\s*$/i.test(value)) return 0;
  return toNumber(value);
}

function numericSlack(kind: FieldKind, expected: number, tolerance: number | null): number {
  if (tolerance !== null && tolerance !== undefined) return tolerance;
  if (kind === 'percent') return 0.01;
  if (kind === 'money') return Math.max(0.5, Math.abs(expected) * 0.001);
  return 1e-6;
}

const TEXTUAL_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['text', 'list', 'regno']);

/** A value that can only be a ratio: a number (or a string without a % sign) within ±1. */
function isBareRatio(raw: unknown, parsed: number): boolean {
  // Strictly below 1: a stray 1 under a 100% field (a single share, "1 of 1",
  // a Level 1) must not score as 100%.
  if (Math.abs(parsed) >= 1) return false;
  if (typeof raw === 'number') return true;
  return typeof raw === 'string' && !raw.includes('%');
}

/** Does one value we returned agree with one expected rendering, for this kind? */
export function agrees(kind: FieldKind, expected: unknown, ours: unknown, tolerance: number | null = null): boolean {
  if (ours === null || ours === undefined || ours === '') return false;
  // The resolver's loose comparison is only for names and numbers-as-identifiers.
  // Its number parser drops every comma, so "12,50" would equal 1250; figures,
  // dates, levels and flags go through this file's own normalisers instead.
  if (TEXTUAL_KINDS.has(kind) && typeof ours !== 'object' && valuesAgree(expected, ours)) return true;

  switch (kind) {
    case 'regno': {
      const e = normaliseRegNo(expected);
      const o = normaliseRegNo(ours);
      return e.length > 0 && (o === e || (o.includes(e) && e.length >= 6));
    }
    case 'date': {
      const e = toIsoDate(expected);
      return e !== null && e === toIsoDate(ours);
    }
    case 'number':
    case 'count':
    case 'money':
    case 'percent': {
      const e = toFigure(expected);
      const o = toFigure(ours);
      if (e === null || o === null) return false;
      const slack = numericSlack(kind, e, tolerance);
      if (Math.abs(e - o) <= slack) return true;
      // Costs are printed in brackets; a positive expectation matches either sign.
      if (kind === 'money' && e > 0 && Math.abs(e + o) <= slack) return true;
      // A percentage stored as a ratio (0.375 for 37.5%). Only our bare ratio
      // scales up: "1%" is one percent, never 100%, and an expected ratio is
      // never read as our percentage — a 100x slip must score wrong.
      if (kind === 'percent' && isBareRatio(ours, o) && Math.abs(e - o * 100) <= slack) return true;
      return false;
    }
    case 'bool': {
      const e = toBool(expected);
      return e !== null && e === toBool(ours);
    }
    case 'level': {
      const e = toLevel(expected);
      return e !== null && e === toLevel(ours);
    }
    case 'text':
    case 'list':
    default: {
      const e = normaliseText(expected);
      const o = normaliseText(ours);
      if (!e || !o) return false;
      if (e === o) return true;
      const [shorter, longer] = e.length <= o.length ? [e, o] : [o, e];
      // Containment counts only when the shorter is most of the longer: a
      // 300-character page dump that happens to contain the name is not a name.
      return shorter.length >= 4 && shorter.length >= longer.length * 0.5 && ` ${longer} `.includes(` ${shorter} `);
    }
  }
}

// ── reading our output ─────────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Every scalar inside a value (rows, nested objects), in order. */
export function leaves(value: unknown): unknown[] {
  if (isEmpty(value)) return [];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(leaves);
  return [value];
}

/** One layer's fields for one key document, as name → list of values. */
type FieldBag = Map<string, unknown[]>;

function add(bag: FieldBag, name: string, value: unknown): void {
  if (isEmpty(value)) return;
  const list = bag.get(name) ?? [];
  list.push(value);
  bag.set(name, list);
}

export function belongsTo(outputName: string, keyFile: string): boolean {
  if (!outputName) return false;
  if (outputName === keyFile) return true;
  return outputName.startsWith(`${keyFile} › `);
}

function detBag(caseResult: PackCase, file: string): { bag: FieldBag; types: string[] } {
  const bag: FieldBag = new Map();
  const types: string[] = [];
  for (const doc of caseResult.documents_detected ?? []) {
    if (!belongsTo(doc.filename, file)) continue;
    types.push(doc.document_type);
    for (const [name, field] of Object.entries(doc.extracted_fields ?? {})) add(bag, name, field?.normalized_value);
    const rows = doc.parser_output?.supplier_rows ?? [];
    if (rows.length > 0) add(bag, 'supplier_rows', rows);
    add(bag, 'measured_procurement_spend', doc.parser_output?.measured_procurement_spend);
  }
  return { bag, types };
}

function aiBag(caseResult: PackCase, file: string): { bag: FieldBag; types: string[] } {
  const bag: FieldBag = new Map();
  const types: string[] = [];
  for (const extraction of caseResult.ai_entities?.extractions ?? []) {
    if (!belongsTo(extraction.sourceFile, file)) continue;
    types.push(extraction.documentId);
    for (const { field, value } of extraction.values ?? []) add(bag, field, value);
  }
  return { bag, types };
}

/** The values under one key: a plain field name, or `rows.column` across rows. */
function valuesFor(bag: FieldBag, key: string): unknown[] {
  const direct = bag.get(key);
  if (direct) return direct;
  const dot = key.indexOf('.');
  if (dot < 0) return [];
  const rowsField = key.slice(0, dot);
  const column = key.slice(dot + 1);
  const out: unknown[] = [];
  for (const value of bag.get(rowsField) ?? []) {
    const rows = Array.isArray(value) ? value : [value];
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        const cell = (row as Record<string, unknown>)[column];
        if (!isEmpty(cell)) out.push(cell);
      }
    }
  }
  return out;
}

function shown(values: unknown[]): string[] {
  return values.slice(0, 5).map((v) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  });
}

// ── key-name aliases ───────────────────────────────────────────────────────

/**
 * Other parser field names for the SAME field as a key name. Field-name
 * vocabulary only, never a value: the answer key was written against the
 * names the first-pass extraction spoke, and the per-document skills (the agent
 * loop's targets) name some of the same fields differently. Each alias is the
 * same quantity under another name:
 *
 *  - black_ownership / black_women_ownership: `*_percentage` maps to the same
 *    calculator key (ownership.black_ownership / ownership.black_women_ownership,
 *    entityCalculatorMapping), and on a supplier's certificate the canonical
 *    type's `black_ownership` and `supplier_black_ownership_percentage` both
 *    feed supplier.black_ownership (likewise black women).
 *  - employee_rows: a count key already treats a stated number as its count;
 *    `employee_count` is the headcount the payroll report states.
 *  - percentage: a close corporation member's interest is its holding
 *    percentage (`member_interest_percentage`, the CC equivalent of a share).
 *  - net_value_inputs.assets / .equity: the matrix's net-value inputs are the
 *    balance sheet's total assets and total equity (members' interest for a CC).
 *
 * Aliases only add names a key reads. For an absentOk field that makes the
 * check stricter (a value under the alias is invented), never looser.
 */
export const KEY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  black_ownership: ['black_ownership_percentage', 'supplier_black_ownership_percentage'],
  black_women_ownership: ['black_women_ownership_percentage', 'supplier_black_women_ownership_percentage'],
  employee_rows: ['employee_count'],
  percentage: ['member_interest_percentage'],
  'net_value_inputs.assets': ['total_assets'],
  'net_value_inputs.equity': ['total_equity'],
};

export interface ScoreOptions {
  /** Read KEY_NAME_ALIASES too (default true). False scores the key's names only. */
  aliases?: boolean;
}

/** A key field's names, plus their aliases when enabled, each once. */
export function keyNames(field: KeyField, options: ScoreOptions = {}): string[] {
  if (options.aliases === false) return field.keys;
  return [...new Set(field.keys.flatMap((key) => [key, ...(KEY_NAME_ALIASES[key] ?? [])]))];
}

// ── scoring one field in one layer ─────────────────────────────────────────

function expectations(field: KeyField): unknown[] {
  return [field.value, ...(field.alternatives ?? [])].filter((v) => !isEmpty(v));
}

function anyAgrees(field: KeyField, candidates: unknown[]): boolean {
  return expectations(field).some((e) => candidates.some((o) => agrees(field.kind, e, o, field.tolerance)));
}

/** One list item found among our values: by its item kind, or named inside a longer text. */
function itemFound(kind: ItemKind, item: unknown, candidates: unknown[]): boolean {
  if (candidates.some((o) => agrees(kind, item, o))) return true;
  if (kind !== 'text') return false;
  const needle = normaliseText(item);
  return needle.length >= 4 && candidates.some((o) => ` ${normaliseText(o)} `.includes(` ${needle} `));
}

function listMatches(field: KeyField, candidates: unknown[]): boolean {
  const items = Array.isArray(field.value) ? field.value : [field.value];
  if (items.length === 0) return false;
  const found = items.filter((item) => itemFound(field.itemKind ?? 'text', item, candidates)).length;
  return found / items.length >= (field.tolerance ?? 1) - 1e-9;
}

/**
 * The counts a `count` field's keys yield, one per table: under a plain key,
 * each array's rows (a stated number counts as itself); under `rows.column`,
 * each table's non-empty cells in that column.
 */
function countsFor(names: string[], bag: FieldBag): number[] {
  return names.flatMap((key) => {
    const dot = key.indexOf('.');
    if (dot > 0 && !bag.has(key)) {
      const column = key.slice(dot + 1);
      return (bag.get(key.slice(0, dot)) ?? []).map((table) => (Array.isArray(table) ? table : [table])
        .filter((row) => row && typeof row === 'object' && !isEmpty((row as Record<string, unknown>)[column])).length)
        .filter((n) => n > 0);
    }
    return (bag.get(key) ?? []).map((v) => (Array.isArray(v) ? v.length : toNumber(v))).filter((n): n is number => n !== null);
  });
}

function keyedStatus(field: KeyField, bag: FieldBag, options: ScoreOptions): { status: FieldStatus; ours: unknown[] } {
  const names = keyNames(field, options);
  const raw = names.flatMap((key) => valuesFor(bag, key));
  if (field.absentOk) return { status: raw.length > 0 ? 'invented' : 'absent_ok', ours: raw };
  if (raw.length === 0) return { status: 'missing', ours: raw };

  let ok: boolean;
  if (field.kind === 'count') {
    const counts = countsFor(names, bag);
    ok = anyAgrees(field, counts);
    return { status: ok ? 'correct' : 'wrong', ours: counts };
  } else if (field.kind === 'list') {
    ok = listMatches(field, raw.flatMap(leaves));
  } else if (field.aggregate === 'sum') {
    const numbers = raw.flatMap(leaves).map(toNumber).filter((n): n is number => n !== null);
    ok = numbers.length > 0 && anyAgrees(field, [numbers.reduce((a, b) => a + b, 0)]);
  } else {
    ok = anyAgrees(field, raw.flatMap(leaves));
  }
  return { status: ok ? 'correct' : 'wrong', ours: raw };
}

/** No keys: recall only — does the value appear anywhere in this document's output? */
function unkeyedStatus(field: KeyField, bag: FieldBag): { status: FieldStatus; ours: unknown[] } {
  if (field.absentOk) return { status: 'unscored', ours: [] };
  // A yes/no "somewhere in the output" is every other flag's yes or no: it can
  // only be recalled under a named field.
  if (field.kind === 'bool') return { status: 'missing', ours: [] };
  const all = [...bag.values()].flat();
  const scalars = all.flatMap(leaves);
  let ok: boolean;
  if (field.kind === 'list') ok = listMatches(field, scalars);
  else if (field.kind === 'count') ok = anyAgrees(field, all.filter(Array.isArray).map((rows) => rows.length));
  else ok = anyAgrees(field, scalars);
  return { status: ok ? 'correct' : 'missing', ours: [] };
}

function fieldStatus(field: KeyField, bag: FieldBag, options: ScoreOptions): { status: FieldStatus; ours: unknown[] } {
  return field.keys.length > 0 ? keyedStatus(field, bag, options) : unkeyedStatus(field, bag);
}

function unionStatus(a: FieldStatus, b: FieldStatus): FieldStatus {
  for (const s of ['correct', 'wrong', 'invented', 'missing', 'absent_ok', 'unscored'] as FieldStatus[]) {
    if (a === s || b === s) return s;
  }
  return 'unscored';
}

function emptyCounts(): LayerCounts {
  return { expected: 0, correct: 0, correctKeyed: 0, wrong: 0, missing: 0, invented: 0, recall: null, precision: null };
}

function tally(counts: LayerCounts, field: KeyField, status: FieldStatus): void {
  if (!field.absentOk) counts.expected += 1;
  if (status === 'correct') {
    counts.correct += 1;
    if (field.keys.length > 0) counts.correctKeyed += 1;
  } else if (status === 'wrong') counts.wrong += 1;
  else if (status === 'missing') counts.missing += 1;
  else if (status === 'invented') counts.invented += 1;
}

function finish(counts: LayerCounts): LayerCounts {
  const base = counts.correctKeyed + counts.wrong + counts.invented;
  return {
    ...counts,
    recall: counts.expected > 0 ? round(counts.correct / counts.expected) : null,
    precision: base > 0 ? round(counts.correctKeyed / base) : null,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sum(into: LayerCounts, from: LayerCounts): void {
  into.expected += from.expected;
  into.correct += from.correct;
  into.correctKeyed += from.correctKeyed;
  into.wrong += from.wrong;
  into.missing += from.missing;
  into.invented += from.invented;
}

// ── the whole pack ─────────────────────────────────────────────────────────

export function scorePack(caseResult: PackCase, key: AnswerKey, options: ScoreOptions = {}): PackScore {
  const perDoc: DocScore[] = [];
  const perField: FieldScore[] = [];
  const totals = { det: emptyCounts(), ai: emptyCounts(), union: emptyCounts() };
  let typeOk = 0;
  let aiTypeOk = 0;
  let typed = 0;

  for (const doc of key.documents) {
    const det = detBag(caseResult, doc.file);
    const ai = aiBag(caseResult, doc.file);
    const counts = { det: emptyCounts(), ai: emptyCounts(), union: emptyCounts() };

    for (const field of doc.fields) {
      const d = fieldStatus(field, det.bag, options);
      const a = fieldStatus(field, ai.bag, options);
      const u = unionStatus(d.status, a.status);
      tally(counts.det, field, d.status);
      tally(counts.ai, field, a.status);
      tally(counts.union, field, u);
      perField.push({
        file: doc.file,
        label: field.label,
        keyed: field.keys.length > 0,
        absentOk: field.absentOk,
        expected: field.value,
        det: { status: d.status, ours: shown(d.ours) },
        ai: { status: a.status, ours: shown(a.ours) },
        union: { status: u },
      });
    }

    const accepts = new Set(doc.typeAccepts.map((t) => t.toLowerCase()));
    const typeKnown = accepts.size > 0;
    const type_ok = typeKnown ? det.types.some((t) => accepts.has(t.toLowerCase())) : null;
    const ai_type_ok = typeKnown ? ai.types.some((t) => accepts.has(t.toLowerCase())) : null;
    if (typeKnown) typed += 1;
    if (type_ok) typeOk += 1;
    if (ai_type_ok) aiTypeOk += 1;

    for (const layer of ['det', 'ai', 'union'] as const) sum(totals[layer], counts[layer]);
    perDoc.push({
      file: doc.file,
      path: doc.path,
      type_ok,
      ai_type_ok,
      ours_type: [...new Set(det.types)],
      keyedFields: doc.fields.filter((f) => !f.absentOk && f.keys.length > 0).length,
      det: finish(counts.det),
      ai: finish(counts.ai),
      union: finish(counts.union),
    });
  }

  const all = key.documents.flatMap((d) => d.fields);
  const unreadable = key.documents.filter((doc) => (
    (caseResult.unreadable_files ?? []).some((u) => u.file_name === doc.file || u.file_name.endsWith(`/${doc.file}`) || u.file_name.endsWith(`\\${doc.file}`))
  )).length;
  return {
    perDoc,
    perField,
    totals: {
      documents: key.documents.length,
      fields: all.length,
      keyedFields: all.filter((f) => !f.absentOk && f.keys.length > 0).length,
      unkeyedFields: all.filter((f) => !f.absentOk && f.keys.length === 0).length,
      absentOkFields: all.filter((f) => f.absentOk).length,
      type_ok: typeOk,
      ai_type_ok: aiTypeOk,
      typed_documents: typed,
      unreadable,
      det: finish(totals.det),
      ai: finish(totals.ai),
      union: finish(totals.union),
    },
  };
}

// ── baseline and gate ──────────────────────────────────────────────────────

export interface PackBaseline {
  union: { correct: number; wrong: number; invented: number };
  /** Per-layer bad counts: the union lets a correct value hide a conflicting one from the other layer. */
  ai?: { wrong: number; invented: number };
  det?: { wrong: number; invented: number };
  perDoc: Record<string, number>;
  type_ok: number;
  ai_type_ok: number;
  unreadable?: number;
  /** Context only (not gated): the base the precision figures are counted over. */
  keyedFields?: number;
  at: string;
}

export function baselineFrom(score: PackScore, at: string): PackBaseline {
  return {
    union: { correct: score.totals.union.correct, wrong: score.totals.union.wrong, invented: score.totals.union.invented },
    ai: { wrong: score.totals.ai.wrong, invented: score.totals.ai.invented },
    det: { wrong: score.totals.det.wrong, invented: score.totals.det.invented },
    perDoc: Object.fromEntries(score.perDoc.map((d) => [d.file, d.union.correct])),
    type_ok: score.totals.type_ok,
    ai_type_ok: score.totals.ai_type_ok,
    unreadable: score.totals.unreadable,
    keyedFields: score.totals.keyedFields,
    at,
  };
}

export interface RunSummary {
  mode?: string;
  cassette?: { misses?: number; replayedFailures?: number };
  cassetteMissesByFile?: Record<string, number>;
}

/** Every reason the gate fails; empty means it passes. */
export function gateFailures(score: PackScore, baseline: PackBaseline | null, summary: RunSummary | null): string[] {
  const failures: string[] = [];
  if (summary?.mode === 'replay' && (summary.cassette?.misses ?? 0) > 0) {
    const where = Object.entries(summary.cassetteMissesByFile ?? {}).map(([file, n]) => `${file} x${n}`).join(', ');
    failures.push(
      `replay missed the cassette ${summary.cassette!.misses} time(s)${where ? ` (${where})` : ''}: `
      + 'the run was not the recorded one (re-run in auto mode)',
    );
  }
  if (!baseline) return failures;
  if (score.totals.unreadable > (baseline.unreadable ?? 0)) {
    failures.push(`unreadable documents ${score.totals.unreadable} > baseline ${baseline.unreadable ?? 0}`);
  }
  const u = score.totals.union;
  if (u.correct < baseline.union.correct) failures.push(`union correct ${u.correct} < baseline ${baseline.union.correct}`);
  for (const doc of score.perDoc) {
    const before = baseline.perDoc[doc.file];
    if (before !== undefined && doc.union.correct < before) {
      failures.push(`${doc.file}: correct ${doc.union.correct} < baseline ${before}`);
    }
  }
  const bad = u.wrong + u.invented;
  const badBefore = baseline.union.wrong + baseline.union.invented;
  if (bad > badBefore) failures.push(`union wrong+invented ${bad} > baseline ${badBefore}`);
  // A conflicting value still reaches users even when the other layer is right.
  for (const layer of ["ai", "det"] as const) {
    const before = baseline[layer];
    if (!before) continue;
    const now = score.totals[layer].wrong + score.totals[layer].invented;
    if (now > before.wrong + before.invented) failures.push(`${layer} wrong+invented ${now} > baseline ${before.wrong + before.invented}`);
  }
  if (score.totals.type_ok < baseline.type_ok) failures.push(`type_ok ${score.totals.type_ok} < baseline ${baseline.type_ok}`);
  if (score.totals.ai_type_ok < (baseline.ai_type_ok ?? 0)) {
    failures.push(`ai_type_ok ${score.totals.ai_type_ok} < baseline ${baseline.ai_type_ok}`);
  }
  return failures;
}

// ── report ─────────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  return n === null ? '-' : `${(n * 100).toFixed(1)}%`;
}

function cell(c: LayerCounts): string {
  return `${c.correct}/${c.expected} (${pct(c.recall)}) p=${pct(c.precision)}`;
}

export function scoreMarkdown(score: PackScore, summary: RunSummary | null = null): string {
  const t = score.totals;
  const lines = [
    '# Pack score',
    '',
    `Documents ${t.documents}; fields ${t.fields} (keyed ${t.keyedFields}, recall-only ${t.unkeyedFields}, absentOk ${t.absentOkFields}).`,
    `Precision is counted over the ${t.keyedFields} keyed fields only.`,
    `Type correct: deterministic ${t.type_ok}/${t.typed_documents}, AI spec ${t.ai_type_ok}/${t.typed_documents}. Unreadable: ${t.unreadable}.`,
    summary
      ? `Run mode ${summary.mode ?? '?'}, cassette misses ${summary.cassette?.misses ?? '?'}, `
        + `model calls that failed in the recorded run and were replayed as failures ${summary.cassette?.replayedFailures ?? 0}.`
      : '',
    summary?.mode === 'replay' && (summary.cassette?.misses ?? 0) > 0
      ? `**REPLAY MISSED THE CASSETTE ${summary.cassette!.misses} TIME(S); THIS IS NOT THE RECORDED RUN.** ${
        Object.entries(summary.cassetteMissesByFile ?? {}).map(([file, n]) => `${file} x${n}`).join(', ')
      }`
      : '',
    '',
    '| Layer | correct / expected (recall) | precision | wrong | invented |',
    '|---|---|---|---|---|',
    ...(['det', 'ai', 'union'] as const).map((l) => (
      `| ${l} | ${t[l].correct}/${t[l].expected} (${pct(t[l].recall)}) | ${pct(t[l].precision)} | ${t[l].wrong} | ${t[l].invented} |`
    )),
    '',
    '| Document | type ok | det | ai | union |',
    '|---|---|---|---|---|',
    ...score.perDoc.map((d) => (
      `| ${d.file} | ${d.type_ok === null ? 'n/a' : d.type_ok ? 'yes' : 'no'} | ${cell(d.det)} | ${cell(d.ai)} | ${cell(d.union)} |`
    )),
    '',
    '| Document | Field | keyed | det | ai | union | ours |',
    '|---|---|---|---|---|---|---|',
    ...score.perField.map((f) => (
      `| ${f.file} | ${f.label} | ${f.keyed ? 'yes' : ''} | ${f.det.status} | ${f.ai.status} | ${f.union.status} | ${
        [...f.det.ours, ...f.ai.ours].slice(0, 2).join(' / ').replace(/\|/g, '\\|').replace(/\n/g, ' ')
      } |`
    )),
  ];
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n');
}
