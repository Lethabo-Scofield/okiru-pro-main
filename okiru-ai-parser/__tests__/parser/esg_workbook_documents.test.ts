/**
 * Round 2 of the ESG readers: a workbook is typed as ONE document, its header
 * block and summary tables are read under that type, a customer's survey grid
 * is read cell by cell, a saved e-mail is read as an e-mail, a waste sheet's
 * title gives its masses their route, and an issuer that is only the scan's
 * filing label is refused. Stub models and synthetic sheets; every name and
 * figure is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import {
  EMAIL_SPEC_ID,
  classifyWorkbooks,
  extractEsgCaseEntities,
  isEmailInput,
  sheetTitleAbove,
  unprintedValuesAsExceptions,
  workbookOf,
  workbookOverview,
} from '../../src/services/esgCaseExtraction.js';
import { PRINTED_SUMMARY_FIELD, extractEsgSheetFacts, rangeOf } from '../../src/services/esgSheetFacts.js';
import { findQuestionRow, isQuestionHeading, readSurveyGrid, SURVEY_SPEC_ID } from '../../src/services/esgSurveyGrid.js';
import { routeWasteRowsByTitle, wasteRouteFromTitle } from '../../src/services/esgSheetTableExtraction.js';
import { partialTableMarkdown } from '../../src/services/workbookSheetSplit.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { resetClassificationCacheForTest } from '../../src/services/documentClassification.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => {
  resetExtractionCache();
  resetClassificationCacheForTest();
  resetDecisionCacheForTest();
  process.env.AI_EXTRACTION_SWEEP = 'false';
  process.env.AI_EXTRACTION_CACHE = 'false';
});

const BOWSER = 'ghg_energy__generator_diesel_bowser_reconciliation';
const DEBRIEF = 'fleet__telematics_driver_debrief_report';
const EXPORT = 'emissions_system_export';

const valueOf = (reads: DocumentExtraction[] | null, field: string) =>
  reads?.flatMap((r) => r.values).find((v) => v.field === field)?.value;

/** A Pass A system prompt (the ESG menu) vs every other question. */
const isPassA = (system: string) => /document_type_id/.test(system);

describe('labelled cells: the skill\'s own wording', () => {
  const STOCK: unknown[][] = [
    ['Opening stock (dip)', 2000],
    ['Stock per book', 2950],
    ['Closing stock (last dip)', 2900],
  ];

  it('is never cancelled by a label the model guessed for the same field', async () => {
    const model: ExtractionModel = {
      name: 'stub',
      // The model takes "Stock per book" for the closing dip.
      async complete() { return JSON.stringify({ mapping: { 'Stock per book': `${BOWSER}/closing_stock_litres` } }); },
    };
    const reads = await extractEsgSheetFacts(model, { filename: 'Tank.xlsx › Recon', sheetName: 'Recon', matrix: STOCK, specIds: [BOWSER] });
    expect(valueOf(reads, 'opening_stock_litres')).toBe(2000);
    // The printed "Closing stock" wins; the guess is a note, and the reviewer is told.
    expect(valueOf(reads, 'closing_stock_litres')).toBe(2900);
    expect(reads!.flatMap((r) => r.exceptions).join(' ')).toMatch(/closing_stock_litres: the sheet prints it as "Closing stock \(last dip\)"/);
    expect(reads!.flatMap((r) => r.open?.facts ?? []).map((f) => f.label)).toContain('Stock per book');
  });

  it('maps a document-level total that shares its name with a row column', async () => {
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Debrief.xlsx › Summary', sheetName: 'Summary',
      matrix: [['Total Plan Stops', 3519], [], ['Total Actual Stops', 3295]],
      specIds: [DEBRIEF],
    });
    expect(valueOf(reads, 'planned_stops')).toBe(3519);
    expect(valueOf(reads, 'actual_stops')).toBe(3295);
  });

  it('splits a printed range under a period start into its start and end', async () => {
    expect(rangeOf('reporting_period_start', '2025-07-01 - 2026-06-30')).toEqual(['2025-07-01', '2026-06-30']);
    expect(rangeOf('reporting_period_start', '1 July 2025 to 30 June 2026')).toEqual(['1 July 2025', '30 June 2026']);
    expect(rangeOf('reporting_period_start', '2025-07-01')).toBeNull();
    expect(rangeOf('report_title', '2025 - 2026')).toBeNull();
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Export.xls › Sheet1', sheetName: 'Sheet1',
      matrix: [['Report:', 'Emissions Summary Export'], ['Date Range:', '2025-07-01 - 2026-06-30'], ['Node:', 'Example Group']],
      specIds: [EXPORT],
    });
    expect(valueOf(reads, 'reporting_period_start')).toBe('2025-07-01');
    expect(valueOf(reads, 'reporting_period_end')).toBe('2026-06-30');
    expect(valueOf(reads, 'organisation_node')).toBe('Example Group');
    expect(valueOf(reads, 'report_title')).toBe('Emissions Summary Export');
  });
});

describe('labelled cells: a type that keeps its printed summary tables', () => {
  const SUMMARY: unknown[][] = [
    ['Node', 'Electricity (Grid)', 'Road Freight', 'Total'],
    ['Example Group - North', 120, 80, 200],
    ['Example Group - South', 300, 45.5, 345.5],
    ['Total', 420, 125.5, 545.5],
  ];

  it('keeps every summary cell as a row, with its row label, column header and figure', async () => {
    const reads = await extractEsgSheetFacts(null, { filename: 'Export.xls › Sheet2', sheetName: 'Sheet2', matrix: SUMMARY, specIds: [EXPORT] });
    const rows = valueOf(reads, PRINTED_SUMMARY_FIELD) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(9);
    expect(rows).toContainEqual(expect.objectContaining({ summary_row_label: 'Example Group - South', summary_column_label: 'Road Freight', summary_value: 45.5 }));
    expect(rows).toContainEqual(expect.objectContaining({ summary_row_label: 'Total', summary_column_label: 'Total', summary_value: 545.5, summary_is_total: true }));
    expect(reads!.find((r) => r.values.some((v) => v.field === PRINTED_SUMMARY_FIELD))?.documentId).toBe(EXPORT);
    expect(reads!.flatMap((r) => r.open?.facts ?? [])).toHaveLength(0);
  });

  it('leaves them as notes for a type that does not, and on a hidden sheet', async () => {
    const plain = await extractEsgSheetFacts(null, { filename: 'Tank.xlsx › Sheet2', sheetName: 'Sheet2', matrix: SUMMARY, specIds: [BOWSER] });
    expect(valueOf(plain, PRINTED_SUMMARY_FIELD)).toBeUndefined();
    const hidden = await extractEsgSheetFacts(null, { filename: 'Export.xls › Old', sheetName: 'Old', matrix: SUMMARY, specIds: [EXPORT], hidden: true });
    expect(valueOf(hidden, PRINTED_SUMMARY_FIELD)).toBeUndefined();
    expect(hidden!.flatMap((r) => r.open?.facts ?? []).length).toBeGreaterThan(0);
  });
});

describe('a survey grid', () => {
  const GRID: unknown[][] = [
    ['Year', 'ITEMS', 'Q01.01-Ambient storage surface in square meters (m2)', 'Q01.02-Total electricity consumption in kilowatt hour (KWh)',
      'Q01.03-Are solar panels situated on site?', 'Q01.04-Who owns the solar panels?', 'Q01.05-How many lithium battery forklifts?',
      'Q01.06-What is the capacity of the tank (in m3)?'],
    ['2024', 'EXAMPLE CO NORTH 2024', 0],
    ['1st half 2025', null, 1234, 52000, 'yes', 'landlord', 7, '40000l'],
    ['2nd half 2025', null, 1150, 49500, 'yes', 'landlord', 7, '40000l'],
    ['2024', 'EXAMPLE CO SOUTH 2024', 0],
    ['1st half 2025', null, 300, 9000, 'no', 'n/a', 2, 'none'],
  ];

  it('finds the row of questions, and is no register', () => {
    expect(isQuestionHeading('Q01.03-Are solar panels situated on site?')).toBe(true);
    expect(isQuestionHeading('Registration')).toBe(false);
    expect(findQuestionRow(GRID)).toEqual({ row: 0, questions: [2, 3, 4, 5, 6, 7], labels: [0, 1] });
    expect(findQuestionRow([['Date', 'Registration', 'Litres', 'Km', 'Driver', 'Depot'], [46100, 'AB12CDGP', 100, 900, 'X', 'Y']])).toBeNull();
  });

  it('reads every answer with its site, its period and its question, as printed', () => {
    const answers = readSurveyGrid(GRID)!;
    expect(answers).toContainEqual({
      answer_group: 'EXAMPLE CO NORTH 2024', answer_row_label: '2nd half 2025',
      answer_question: 'Q01.01-Ambient storage surface in square meters (m2)', answer_value: 1150,
    });
    expect(answers).toContainEqual(expect.objectContaining({ answer_group: 'EXAMPLE CO SOUTH 2024', answer_question: 'Q01.06-What is the capacity of the tank (in m3)?', answer_value: 'none' }));
    expect(answers.filter((a) => a.answer_group === 'EXAMPLE CO NORTH 2024' && a.answer_row_label === '1st half 2025')).toHaveLength(6);
  });

  it('is read by the code in the case, not sent to a flat read', async () => {
    const asked: string[] = [];
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system: string) {
        asked.push(isPassA(system) ? 'passA' : /extracting evidence/.test(system) ? 'flat-read' : 'case');
        return isPassA(system) ? JSON.stringify({ element: 'GHG_ENERGY', document_type: 'Survey', document_type_id: SURVEY_SPEC_ID, confidence: 0.9 }) : '{}';
      },
    };
    const input: RawExtractionInput = {
      file_id: 's1', filename: 'Customer survey.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_text: 'survey', markdown: '## Survey\n| Year | ITEMS | Q01.01 |\nA customer sustainability survey', tables: [{ matrix: GRID, rows: [] }],
      metadata: { sheet_name: 'Survey', single_sheet: true },
    };
    const result = await extractEsgCaseEntities([input], model);
    const survey = result!.extractions.find((e) => e.documentId === SURVEY_SPEC_ID);
    expect((survey!.values[0].value as unknown[]).length).toBeGreaterThan(10);
    // No flat read of the grid.
    expect(asked).toContain('passA');
    expect(asked).not.toContain('flat-read');
  });
});

describe('a workbook is typed as one document', () => {
  const sheet = (name: string, matrix: unknown[][], markdown: string): RawExtractionInput => ({
    file_id: `w_${name}`, filename: `Export.xls › ${name}`, mime_type: 'application/vnd.ms-excel',
    raw_text: markdown, markdown, tables: [{ matrix, rows: [] }],
    metadata: { sheet_name: name, parent_file: 'Export.xls', sheet_hidden: false },
  });
  const header = sheet('Sheet1', [
    ['Report:', 'Emissions Summary Export'], ['Date Run:', '2026-04-08 10:15:00'], ['View:', 'Example Division'], ['Node:', 'Example Group'],
    ['Date Range:', '2025-07-01 - 2026-06-30'], ['Methodology:', 'Location-based'],
  ], '## Sheet1\nReport: Emissions Summary Export\nDate Run: 2026-04-08\nNode: Example Group\nMethodology: Location-based');
  const totals = sheet('Sheet2', [
    ['Node', 'Electricity (Grid)', 'Road Freight', 'Total'],
    ['Example Group - North', 120, 80, 200],
    ['Total', 120, 80, 200],
  ], '## Sheet2\n| Node | Electricity (Grid) | Road Freight | Total |');

  it('a split sheet belongs to its workbook; a one-sheet workbook is its own document', () => {
    expect(workbookOf(header)).toBe('Export.xls');
    expect(workbookOf({ ...header, metadata: { ...header.metadata, single_sheet: true } })).toBeNull();
    expect(workbookOf({ ...header, metadata: {} })).toBeNull();
  });

  it('Pass A is asked once per workbook, over its visible sheets', async () => {
    const asked: string[] = [];
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system: string, user: string) {
        asked.push(user);
        return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'GHG export', document_type_id: EXPORT, confidence: 0.92 });
      },
    };
    const hidden = { ...totals, file_id: 'w_old', filename: 'Export.xls › Old', metadata: { ...totals.metadata, sheet_name: 'Old', sheet_hidden: true }, markdown: '## Old\nSECRET SCRATCH' };
    expect(workbookOverview([header, totals, hidden])).not.toContain('SECRET SCRATCH');
    const types = await classifyWorkbooks(model, [header, totals, hidden]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('DOCUMENT: Export.xls');
    expect(asked[0]).toContain('## Sheet2');
    expect(types.get('Export.xls')).toEqual([EXPORT]);
  });

  it('reads the header block and the summary table under the workbook\'s type', async () => {
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system: string) {
        if (isPassA(system)) return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'GHG export', document_type_id: EXPORT, confidence: 0.92 });
        return '{}';
      },
    };
    const result = await extractEsgCaseEntities([header, totals], model);
    const values = result!.extractions.filter((e) => e.documentId === EXPORT).flatMap((e) => e.values);
    const field = (name: string) => values.find((v) => v.field === name)?.value;
    expect(field('report_title')).toBe('Emissions Summary Export');
    expect(field('organisation_node')).toBe('Example Group');
    expect(field('organisation_view')).toBe('Example Division');
    expect(field('scope2_method')).toBe('Location-based');
    expect(field('reporting_period_end')).toBe('2026-06-30');
    expect((field(PRINTED_SUMMARY_FIELD) as unknown[]).length).toBe(6);
  });
});

describe('a saved e-mail', () => {
  const email: RawExtractionInput = {
    file_id: 'e1', filename: 'Data thread.eml', mime_type: 'message/rfc822',
    raw_text: 'thread', markdown: '# E-mail thread: RE: Example data\n## Message 1\nFrom: A Person\nSubject: RE: Example data\nPlease send the ISO 14001 audit report.',
    tables: [], metadata: { email: { subject: 'RE: Example data', messages: 1, attachments: ['Audit summary'] } },
  };

  it('is recognised by its format', () => {
    expect(isEmailInput(email)).toBe(true);
    expect(isEmailInput({ ...email, metadata: {} })).toBe(false);
  });

  it('is read with the e-mail skill, never typed by what it discusses', async () => {
    const systems: string[] = [];
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system: string, user: string) {
        systems.push(isPassA(system) ? 'passA' : user.includes('email_subject') ? 'email-read' : 'other');
        return JSON.stringify({ email_subject: 'RE: Example data', email_item_rows: [] });
      },
    };
    const result = await extractEsgCaseEntities([email], model);
    expect(systems).not.toContain('passA');
    expect(systems).toContain('email-read');
    expect(result!.extractions.some((e) => e.documentId === EMAIL_SPEC_ID)).toBe(true);
    expect(result!.extractions.some((e) => /iso14001/.test(e.documentId))).toBe(false);
  });
});

describe('a waste sheet\'s title gives its masses their route', () => {
  const wasteRead = (): DocumentExtraction => ({
    documentId: 'waste__contractor_report_safe_disposal_certificate', documentName: 'w', sourceFile: 'Waste.xlsx › Sheet3',
    missingFields: [], unexpectedFields: [], exceptions: [],
    values: [{ field: 'waste_stream_rows', sourceFile: 'f', sourceDocumentId: 'w', value: [
      { waste_stream_type: 'General waste', waste_total_kg: 500 },
      { waste_stream_type: 'Cardboard', waste_recycled_kg: 80 },
    ] }],
  });

  it('reads a landfill sheet\'s masses as landfilled, a diversion sheet\'s as diverted', () => {
    expect(wasteRouteFromTitle('Weights per Waste Stream (Landfill)')).toBe('landfill');
    expect(wasteRouteFromTitle('Weights per Waste Stream (Diversion)')).toBe('recycled');
    expect(wasteRouteFromTitle('Landfill Weight vs Diversion Weight')).toBeNull();
    expect(wasteRouteFromTitle('Weights per Waste Stream')).toBeNull();
    const landfill = wasteRead();
    expect(routeWasteRowsByTitle(landfill, 'Example Contractor / Weights per Waste Stream (Landfill)')).toBe(1);
    expect(landfill.values[0].value).toEqual([
      { waste_stream_type: 'General waste', waste_landfill_kg: 500 },
      // A row that carries its own route is left as read.
      { waste_stream_type: 'Cardboard', waste_recycled_kg: 80 },
    ]);
    const plain = wasteRead();
    expect(routeWasteRowsByTitle(plain, 'Weights per Waste Stream')).toBe(0);
    expect(plain.values[0].value).toEqual(wasteRead().values[0].value);
  });

  it('finds the title above a sheet\'s main table', () => {
    expect(sheetTitleAbove([['Weights per Waste Stream (Landfill)'], [], ['Stream', 'Weight']], { headerRow: 2, startCol: 0, endCol: 1 }))
      .toBe('Weights per Waste Stream (Landfill)');
    expect(sheetTitleAbove([['Stream', 'Weight']], { headerRow: 0, startCol: 0, endCol: 1 })).toBeNull();
  });
});

describe('an issuer that is only the scan\'s filing label', () => {
  it('is refused, and an issuer printed beside a label of another place is kept', () => {
    const read = (issuer: string, label: string): DocumentExtraction => ({
      documentId: 'water__municipal_water_bill', documentName: 'w', sourceFile: 'Bill.pdf', missingFields: [], unexpectedFields: [], exceptions: [],
      values: [
        { field: 'municipality_or_supplier_name', value: issuer, sourceFile: 'Bill.pdf', sourceDocumentId: 'w' },
        { field: 'filing_label', value: label, sourceFile: 'Bill.pdf', sourceDocumentId: 'w' },
      ],
    });
    const refused = unprintedValuesAsExceptions(read('Rivertown', 'Rivertown July 2025'));
    expect(refused.values.map((v) => v.field)).toEqual(['filing_label']);
    expect(refused.exceptions.join(' ')).toMatch(/place in the document's filing label/);
    const kept = unprintedValuesAsExceptions(read('Example Water Board', 'Depot North July 2025'));
    expect(kept.values.map((v) => v.field)).toEqual(['municipality_or_supplier_name', 'filing_label']);
  });
});

describe('a sheet laid out in blocks side by side', () => {
  it('shows the model the cells outside its main table, and leaves an ordinary sheet as it was', () => {
    const blocks: unknown[][] = [
      ['APRIL', null, null, 'MAY', null, null, 'JUNE'],
      [46136, null, null, 46166, null, null, 46197],
      ['OCEAN MONTH', null, null, 'KINDNESS MONTH', null, null, 'WINTER WARMTH'],
      ['THANDI', null, null, 'MUSA', null, null, 'ALL'],
    ];
    const listed = partialTableMarkdown(blocks, { headerRow: 0, startCol: 6, endCol: 6 });
    expect(listed).toContain('Row 1: A1 APRIL | D1 MAY');
    expect(listed).toContain('D3 KINDNESS MONTH');
    expect(listed).not.toContain('G1');
    const table: unknown[][] = [['Date', 'Litres'], [46100, 10], [46101, 12]];
    expect(partialTableMarkdown(table, { headerRow: 0, startCol: 0, endCol: 1 })).toBeNull();
  });
});
