/**
 * Extraction eval harness.
 *
 * The foundation the whole extraction-improvement effort is gated on: it scores
 * extraction quality PER FIELD against known-good expectations, so any converter
 * swap, OCR change, or checksum tweak can be judged by numbers instead of vibes.
 *
 * A fixture is a document (raw text, or an uploaded file buffer that runs through
 * the real `rawExtractionInputFromUpload` converters) plus an `expected` map of
 * the values that should come out. The harness runs each fixture through the live
 * ParserService and reports correct/wrong/missing per field plus an aggregate.
 */
import { rawExtractionInputFromUpload, type UploadedFileLike } from '../../src/services/fileExtraction.js';
import { ParserService } from '../../parser/parser_service.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

/** An expectation is a literal value to match, or a predicate over the actual value. */
export type Expectation = unknown | ((actual: unknown) => boolean);

export interface EvalFixture {
  name: string;
  /** How the document reaches the parser: pre-extracted text, or a file to convert. */
  input:
    | { kind: 'text'; raw_text: string; mime_type?: string }
    | { kind: 'upload'; file: UploadedFileLike };
  /**
   * Expected outputs. Plain keys target `extracted_fields[key].normalized_value`.
   * Keys starting with `@` target document-level metrics exposed by flattenResult
   * (`@document_type`, `@status`, `@measured_procurement_spend`, `@supplier_rows`).
   */
  expected: Record<string, Expectation>;
}

export type FieldStatus = 'correct' | 'wrong' | 'missing';

export interface FieldResult {
  field: string;
  expected: Expectation;
  actual: unknown;
  status: FieldStatus;
}

export interface FixtureScore {
  name: string;
  correct: number;
  total: number;
  fields: FieldResult[];
}

export interface EvalScorecard {
  fixtures: FixtureScore[];
  totalCorrect: number;
  totalFields: number;
  accuracy: number; // 0..1
}

/** Flatten a parser result into a single lookup so expected keys map uniformly. */
function flattenResult(result: Awaited<ReturnType<ParserService['resolve']>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(result.extracted_fields ?? {})) {
    flat[name] = (field as { normalized_value?: unknown })?.normalized_value ?? null;
  }
  flat['@document_type'] = result.document_type;
  flat['@status'] = result.status;
  flat['@measured_procurement_spend'] = result.measured_procurement_spend ?? null;
  flat['@supplier_rows'] = (result.supplier_rows ?? []).length;
  return flat;
}

/** Numbers compare with a small epsilon; everything else by structural equality. */
function valuesEqual(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(expected - actual) < 1e-6;
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function scoreField(field: string, expectation: Expectation, actual: unknown): FieldResult {
  let status: FieldStatus;
  if (typeof expectation === 'function') {
    status = (expectation as (a: unknown) => boolean)(actual) ? 'correct' : (actual == null ? 'missing' : 'wrong');
  } else if (actual == null && expectation != null) {
    status = 'missing';
  } else {
    status = valuesEqual(expectation, actual) ? 'correct' : 'wrong';
  }
  return { field, expected: expectation, actual, status };
}

async function toRawInput(fixture: EvalFixture): Promise<RawExtractionInput> {
  if (fixture.input.kind === 'upload') {
    return rawExtractionInputFromUpload(fixture.input.file);
  }
  return {
    file_id: fixture.name,
    filename: fixture.name,
    mime_type: fixture.input.mime_type ?? 'text/plain',
    raw_text: fixture.input.raw_text,
    tables: [],
    metadata: {},
  };
}

/** Run one fixture through converters + parser and score every expected field. */
export async function scoreFixture(fixture: EvalFixture): Promise<FixtureScore> {
  const rawInput = await toRawInput(fixture);
  const result = await new ParserService().resolve(rawInput);
  const flat = flattenResult(result);

  const fields = Object.entries(fixture.expected).map(([field, expectation]) =>
    scoreField(field, expectation, flat[field]),
  );
  const correct = fields.filter((f) => f.status === 'correct').length;
  return { name: fixture.name, correct, total: fields.length, fields };
}

/** Score a whole suite into an aggregate scorecard. */
export async function runEval(fixtures: EvalFixture[]): Promise<EvalScorecard> {
  const scored = await Promise.all(fixtures.map(scoreFixture));
  const totalCorrect = scored.reduce((s, f) => s + f.correct, 0);
  const totalFields = scored.reduce((s, f) => s + f.total, 0);
  return {
    fixtures: scored,
    totalCorrect,
    totalFields,
    accuracy: totalFields === 0 ? 1 : totalCorrect / totalFields,
  };
}

/** Human-readable scorecard for the console / CI logs. */
export function formatScorecard(card: EvalScorecard): string {
  const lines: string[] = [];
  lines.push(`Extraction eval — ${card.totalCorrect}/${card.totalFields} fields (${(card.accuracy * 100).toFixed(1)}%)`);
  for (const fx of card.fixtures) {
    lines.push(`  ${fx.correct === fx.total ? '✓' : '✗'} ${fx.name}: ${fx.correct}/${fx.total}`);
    for (const f of fx.fields.filter((x) => x.status !== 'correct')) {
      const exp = typeof f.expected === 'function' ? '<predicate>' : JSON.stringify(f.expected);
      lines.push(`      ${f.status.toUpperCase()} ${f.field}: expected ${exp}, got ${JSON.stringify(f.actual)}`);
    }
  }
  return lines.join('\n');
}
