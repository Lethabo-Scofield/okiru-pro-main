/**
 * Read a SURVEY GRID: questions across the top, the respondent's answers per
 * site and period down the side, cell by cell, by code.
 *
 * WHY THIS EXISTS
 *
 * A customer's sustainability survey answered by the client
 * (skills/esg/customer_sustainability_survey.md) is a sheet no other reader
 * reads: it is not a register (no row is a record of one kind), not a monthly
 * table (no months), and its labelled cells are questions, not captions. Sent
 * to the model as one flat read, forty questions times a dozen rows came back
 * as nulls: the dashboard skill Pass A chose said "no monthly grid here".
 *
 * The layout is regular, so the code reads it, the way the register and the
 * monthly readers do: find the row of questions; each row below either opens
 * a group (a site's heading line, almost no answers) or holds one period's
 * answers; every filled answer cell is one row of `survey_answer_rows`, with
 * its group, its row label and its question, copied as printed. Nothing is
 * converted, totalled or placed: these are the client's statements to a
 * customer, reported on the document.
 */
import type { DocumentExtraction } from './aiExtraction.js';

/** The skill (and the spec id) a survey grid is read under. */
export const SURVEY_SPEC_ID = 'customer_sustainability_survey';
export const SURVEY_ROWS_FIELD = 'survey_answer_rows';

export interface SurveyAnswer {
  answer_group: string | null;
  answer_row_label: string | null;
  answer_question: string;
  answer_value: string | number;
}

/** How far down a sheet its question row may sit. */
const HEADER_SEARCH_ROWS = 12;
/** A survey asks at least this many questions across. */
const MIN_QUESTIONS = 6;
/** Answers kept per sheet, at most. */
const MAX_ANSWERS = 2000;

const text = (c: unknown) => (typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : '');
const filled = (c: unknown) => c !== null && c !== undefined && String(c).trim() !== '';

/**
 * A column heading that is a QUESTION: a numbered item ("A03.14-Total ...",
 * "Q7. ..."), a sentence ending in "?", or a long descriptive heading. A
 * register's headings ("Date", "Litres", "Registration") are none of these.
 */
export function isQuestionHeading(cell: unknown): boolean {
  const t = text(cell);
  if (t.length < 12) return false;
  if (/\?\s*$/.test(t)) return true;
  if (/^[A-Z]{0,3}\d{1,3}(?:[.\-]\d{1,3})+\s*[-–.:)]/.test(t)) return true;
  return t.length >= 40 && /\b(?:do|does|are|is|how|who|what|which|total|annual)\b/i.test(t);
}

/** The question row and its question columns, or null when the sheet is no survey grid. */
export function findQuestionRow(matrix: unknown[][]): { row: number; questions: number[]; labels: number[] } | null {
  for (let r = 0; r < Math.min(HEADER_SEARCH_ROWS, matrix.length); r += 1) {
    const row = matrix[r] ?? [];
    const questions: number[] = [];
    row.forEach((cell, c) => { if (isQuestionHeading(cell)) questions.push(c); });
    const headings = row.filter(filled).length;
    // Most of the row's headings must be questions: a register with one long
    // "Description of the incident" heading is still a register.
    if (questions.length >= MIN_QUESTIONS && questions.length * 3 >= headings * 2) {
      const first = questions[0];
      const labels: number[] = [];
      for (let c = 0; c < first; c += 1) labels.push(c);
      return { row: r, questions, labels };
    }
  }
  return null;
}

/**
 * Every answer in a survey grid, with its group and row label. Null when the
 * sheet has no question row.
 */
export function readSurveyGrid(matrix: unknown[][]): SurveyAnswer[] | null {
  const header = findQuestionRow(matrix);
  if (!header) return null;
  const questionText = new Map(header.questions.map((c) => [c, text((matrix[header.row] ?? [])[c])]));
  const answers: SurveyAnswer[] = [];
  let group: string | null = null;
  for (let r = header.row + 1; r < matrix.length && answers.length < MAX_ANSWERS; r += 1) {
    const row = matrix[r] ?? [];
    const labelCells = header.labels.map((c) => row[c]).filter(filled).map((c) => String(c).replace(/\s+/g, ' ').trim());
    const answered = header.questions.filter((c) => filled(row[c]));
    if (labelCells.length === 0 && answered.length === 0) continue;
    // A heading line: a label in a later label column (the site), with at
    // most one answer beside it. It opens a group for the rows below it.
    const later = header.labels.slice(1).map((c) => text(row[c])).find((t) => t.length > 0);
    if (later && answered.length <= 1) group = later;
    const rowLabel = labelCells[0] ?? null;
    for (const c of answered) {
      const value = row[c];
      answers.push({
        answer_group: group,
        answer_row_label: rowLabel,
        answer_question: questionText.get(c) ?? '',
        answer_value: typeof value === 'number' ? value : String(value).trim(),
      });
    }
  }
  return answers.length > 0 ? answers : null;
}

/** A survey grid as the survey type's extraction: its answers, each cell as printed. */
export function surveyGridExtraction(
  matrix: unknown[][] | undefined,
  input: { filename: string; sheetName?: string },
): DocumentExtraction | null {
  if (!matrix) return null;
  const answers = readSurveyGrid(matrix);
  if (!answers) return null;
  return {
    documentId: SURVEY_SPEC_ID,
    documentName: `${input.sheetName ?? input.filename} survey answers`,
    sourceFile: input.filename,
    values: [{
      field: SURVEY_ROWS_FIELD,
      value: answers,
      sourceFile: input.filename,
      sourceDocumentId: SURVEY_SPEC_ID,
      source: { method: 'cell', quote: `${answers.length} answers read from the survey grid` },
    }],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [
      'A customer survey answered by the client: its answers are the client\'s statements to a customer, reported as printed and never placed as measured figures.',
    ],
  };
}
