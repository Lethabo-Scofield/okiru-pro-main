/**
 * The gathering workbook's Instructions sheet states the measured entity's
 * sector, financial year end, name and applicable Codes, and names those cells
 * (`Sector`, `YearEnd`, `CompanyName`, `Codes`). The sheet is skipped as a
 * document because it carries no evidence, and until now its four facts went
 * with it: the client typed the sector and year end again, and could type them
 * differently. These build the template's layout synthetically.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbookInstructions, splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { extractionInputsFromUpload } from '../../src/services/fileExtraction.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import { mapEntitiesToCalculatorWithSemantics } from '../../src/services/entityCalculatorMapping.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';

/** 28 February 2026 as an Excel serial, the way a date cell stores it. */
const YEAR_END_SERIAL = 46081;

type Layout = 'named' | 'labelled' | 'both';

/**
 * The template's Instructions sheet: captions in H, values in I, and the
 * dropdown lists two columns further right (K, L). `named` drops the captions
 * and keeps only the defined names; `labelled` drops the names.
 */
function instructionsSheet(layout: Layout, overrides: { sector?: string } = {}): XLSX.WorkSheet {
  const caption = (text: string) => (layout === 'named' ? '' : text);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['How to complete this workbook', '', '', '', '', '', '', '', '', '', 'Revised Codes', 'Non Revised Codes'],
    ['', '', '', '', '', '', '', caption('Measured Entity Name:'), 'Acme Trading (Pty) Ltd', '', 'Agriculture', 'Generic'],
    ['', '', '', '', '', '', '', caption('Applicable Code:'), 'Revised Codes', '', 'Transport', 'Tourism'],
    ['', '', '', '', '', '', '', caption('Industry Sector:'), overrides.sector ?? 'Transport', '', 'Construction', ''],
    ['', '', '', '', '', '', '', caption('Financial Year End:'), YEAR_END_SERIAL, '', 'ICT', ''],
  ]);
  // A date cell: the serial, displayed as a long date.
  sheet.I5 = { t: 'n', v: YEAR_END_SERIAL, z: 'dddd, mmmm dd, yyyy' };
  return sheet;
}

function gatheringWorkbook(layout: Layout, overrides: { sector?: string } = {}): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, instructionsSheet(layout, overrides), 'Instructions');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['FINANCIAL INFORMATION', 'Year 0'],
    ['Turnover', 1234567.89],
  ]), 'Finance');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Supplier Name', 'Expenditure (excluding VAT)'],
    ['Bongi Fuels', 450000],
  ]), 'Procurement');
  if (layout !== 'labelled') {
    book.Workbook = {
      Names: [
        { Name: 'CompanyName', Ref: "'Instructions'!$I$2" },
        { Name: 'Codes', Ref: "'Instructions'!$I$3" },
        { Name: 'Sector', Ref: "'Instructions'!$I$4" },
        { Name: 'YearEnd', Ref: 'Instructions!$I$5' },
      ],
    };
  }
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const read = (buffer: Buffer) => XLSX.read(buffer, { type: 'buffer', cellNF: true });

const upload = (name: string, buffer: Buffer) => ({
  originalname: name,
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
  size: buffer.length,
});

const PROFILE = {
  sheetName: 'Instructions',
  measured_entity_name: 'Acme Trading (Pty) Ltd',
  applicable_code: 'Revised Codes',
  industry_sector: 'Transport',
  financial_year_end: '2026-02-28',
};

describe('reading the Instructions sheet', () => {
  it('reads the four facts through the workbook\'s defined names, the year end as ISO', () => {
    expect(readWorkbookInstructions(read(gatheringWorkbook('named')))).toEqual(PROFILE);
  });

  it('finds them by their captions when a copy lost its defined names', () => {
    expect(readWorkbookInstructions(read(gatheringWorkbook('labelled')))).toEqual(PROFILE);
  });

  it('a blank value reads as blank, never as the dropdown list beside it', () => {
    const profile = readWorkbookInstructions(read(gatheringWorkbook('labelled', { sector: '' })));
    expect(profile?.industry_sector).toBeUndefined();
    expect(profile?.financial_year_end).toBe('2026-02-28');
  });

  it('a defined name pointing at an error cell states nothing', () => {
    const book = read(gatheringWorkbook('named'));
    book.Sheets.Instructions.I4 = { t: 'e', v: 23, w: '#REF!' };
    expect(readWorkbookInstructions(book)?.industry_sector).toBeUndefined();
  });

  it('a workbook without an Instructions sheet has no profile', () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Industry Sector:', 'Transport']]), 'Finance');
    expect(readWorkbookInstructions(book)).toBeNull();
  });
});

describe('the split carries the profile', () => {
  it('on the first document only, while the Instructions sheet stays out of the documents', () => {
    const docs = splitWorkbookIntoSheets(gatheringWorkbook('both'));
    expect(docs.map((d) => d.sheetName)).toEqual(['Finance', 'Procurement']);
    expect(docs[0].instructions).toEqual(PROFILE);
    expect(docs[1].instructions).toBeUndefined();
  });

  it('into the B-BBEE extraction input, and never into the ESG one', async () => {
    const bbbee = await extractionInputsFromUpload(upload('Acme Gathering.xlsx', gatheringWorkbook('both')));
    expect((bbbee[0].tables?.[0] as { instructions?: unknown }).instructions).toEqual(PROFILE);

    const esg = await extractionInputsFromUpload(upload('Acme Gathering.xlsx', gatheringWorkbook('both')), { domain: 'esg' });
    for (const input of esg) expect(Object.keys(input.tables?.[0] as object)).not.toContain('instructions');
  });
});

describe('the case', () => {
  const silent: ExtractionModel = { name: 'fake', complete: async () => '{}' };

  it('emits one sheet_instructions extraction per workbook, traced to its Instructions sheet', async () => {
    const inputs = await extractionInputsFromUpload(upload('Acme Gathering.xlsx', gatheringWorkbook('named')));
    const result = await extractCaseEntities(inputs, silent);
    const profiles = result!.extractions.filter((e) => e.documentId === 'sheet_instructions');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].sourceFile).toBe('Acme Gathering.xlsx › Instructions');
    expect(Object.fromEntries(profiles[0].values.map((v) => [v.field, v.value]))).toEqual({
      measured_entity_name: 'Acme Trading (Pty) Ltd',
      industry_sector: 'Transport',
      financial_year_end: '2026-02-28',
      applicable_code: 'Revised Codes',
    });
    // The year end and the entity reach the calculator payload.
    expect(result!.calculator.payload['entity.financial_year_end']).toBe('2026-02-28');
    expect(result!.calculator.payload['ownership.entity_name']).toBe('Acme Trading (Pty) Ltd');
  });

  it('never offers the sector or the Codes to the semantic pass', async () => {
    const profile: DocumentExtraction = {
      documentId: 'sheet_instructions',
      documentName: 'Workbook instructions',
      sourceFile: 'wb.xlsx › Instructions',
      values: [
        { field: 'industry_sector', value: 'Transport', sourceFile: 'wb.xlsx › Instructions', sourceDocumentId: 'sheet_instructions' },
        { field: 'applicable_code', value: 'Revised Codes', sourceFile: 'wb.xlsx › Instructions', sourceDocumentId: 'sheet_instructions' },
      ],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    const prompts: string[] = [];
    const recording: ExtractionModel = {
      name: 'recording',
      complete: async (_system, user) => {
        prompts.push(user);
        return '{"industry_sector":"entity.eap_province"}';
      },
    };
    const result = await mapEntitiesToCalculatorWithSemantics(resolveCaseEntities([profile]), new Map(), recording);
    expect(prompts).toEqual([]);
    expect(result.payload).toEqual({});
    expect(result.unmapped.map((u) => u.field).sort()).toEqual(['applicable_code', 'industry_sector']);
  });
});
