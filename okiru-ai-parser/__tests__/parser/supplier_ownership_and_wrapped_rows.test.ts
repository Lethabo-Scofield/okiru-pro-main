/**
 * Two ways a gathering workbook lost values on the way to the scorecard.
 *
 * 1. SUPPLIER OWNERSHIP. The Procurement sheet states each supplier's black and
 *    black-woman ownership (percent-formatted) and the "51% or more" / "30% or
 *    more" flags. The supplier table shape had no slot for any of them, so the
 *    51%-black-owned and 30%-black-woman-owned procurement lines scored nothing.
 *
 * 2. WRAPPED ROWS. A Skills sheet types a long course name across two rows
 *    ("Mobile Elevating -" / "operator"). Read as blank-means-ditto, the
 *    second half overwrote the course for every learner below it, and a stray
 *    hours-only row became a phantom copy of the last learner.
 *
 * All data here is synthetic.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { dittoFill } from '../../src/services/sheetRegions.js';
import { cellValue } from '../../src/services/sheetCellValues.js';
import { extractionInputsFromUpload } from '../../src/services/fileExtraction.js';
import { applyColumnMapping } from '../../src/services/sheetColumnMapping.js';
import { extractSheetTable } from '../../src/services/sheetTableExtraction.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import { mapEntitiesToCalculator, fieldElementIndex } from '../../src/services/entityCalculatorMapping.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

beforeEach(() => {
  resetDecisionCacheForTest();
});

function book(sheets: Record<string, XLSX.WorkSheet>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, sheet, name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** The Procurement layout: banner, hint row, header, then suppliers with percent-formatted ownership. */
function procurementSheet(): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Measured Entity: Acme Haulage'],
    ['', 'Use dropdown', '', '', '', '', '... or enter %'],
    ['Supplier Name', 'Expenditure (excluding VAT)', 'Supplier Classification', 'BEE Level',
      '51% or more black owned', 'Black Ownership (%)', '30% or more black woman owned', 'Black Woman Ownership (%)'],
    ['Alpha Tyres', 120000, 'QSE', 2, 'No', 0.3659, 'No', 0.1678],
    ['Beta Diesel', 450000, 'Generic', 4, 'Yes', 0.75, 'Yes', 0.4],
    ['Gamma Spares', 8000, 'EME', 1, 'Yes', '', '', ''],
  ]);
  for (const address of ['F4', 'H4', 'F5', 'H5']) (sheet[address] as XLSX.CellObject).z = '0.00%';
  return sheet;
}

/** A model that chooses the shape and maps columns the way a reader of the headers would. */
function mappingModel(shape: string, mapping: Record<string, string>, seen: string[] = []): ExtractionModel {
  const answer = async (system: string, user: string) => {
    seen.push(user);
    if (system.includes('WHAT KIND')) return JSON.stringify({ shape });
    return JSON.stringify({ mapping });
  };
  return { name: 'fake', complete: answer, completeHard: answer };
}

describe('supplier ownership columns', () => {
  it('a percent-formatted ownership cell reaches the rows as 36.59%, not the ratio 0.3659', () => {
    const [doc] = splitWorkbookIntoSheets(book({ Procurement: procurementSheet(), Notes: XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]) }));
    const alpha = doc.rows.find((r) => r['Supplier Name'] === 'Alpha Tyres')!;
    expect(alpha['Black Ownership (%)']).toBe('36.59%');
    expect(alpha['Black Woman Ownership (%)']).toBe('16.78%');
  });

  it('the supplier table asks for, and keeps, black ownership, black woman ownership and both flags', async () => {
    const [doc] = splitWorkbookIntoSheets(book({ Procurement: procurementSheet(), Notes: XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]) }));
    const prompts: string[] = [];
    const result = await extractSheetTable(
      mappingModel('suppliers', {
        'Supplier Name': 'supplier_name',
        'Expenditure (excluding VAT)': 'claimed_spend_ex_vat',
        'Supplier Classification': 'supplier_classification',
        'BEE Level': 'bee_level',
        '51% or more black owned': 'is_51_black_owned',
        'Black Ownership (%)': 'supplier_black_ownership_percentage',
        '30% or more black woman owned': 'is_30_black_woman_owned',
        'Black Woman Ownership (%)': 'supplier_black_women_ownership_percentage',
      }, prompts),
      'ESD',
      { filename: 'pp.xlsm › Procurement', raw_text: doc.text, markdown: doc.markdown, rows: doc.rows },
    );

    const mappingPrompt = prompts.find((p) => p.includes('TARGET FIELDS'))!;
    for (const field of ['supplier_black_ownership_percentage', 'supplier_black_women_ownership_percentage', 'is_51_black_owned', 'is_30_black_woman_owned']) {
      expect(mappingPrompt).toContain(field);
    }

    const rows = result!.values[0].value as Array<Record<string, unknown>>;
    expect(result!.values[0].field).toBe('supplier_rows');
    expect(rows).toHaveLength(3);
    const alpha = rows.find((r) => r.supplier_name === 'Alpha Tyres')!;
    expect(alpha.supplier_black_ownership_percentage).toBe('36.59%');
    expect(alpha.supplier_black_women_ownership_percentage).toBe('16.78%');
    const gamma = rows.find((r) => r.supplier_name === 'Gamma Spares')!;
    expect(gamma.is_51_black_owned).toBe('Yes');
    expect(gamma.supplier_black_ownership_percentage).toBeUndefined();
  });

  it('maps a supplier\'s ownership to the SUPPLIER keys, never the measured entity\'s', () => {
    const documentId = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.element === 'ESD')!.id;
    const extraction: DocumentExtraction = {
      documentId,
      documentName: documentId,
      sourceFile: 'cert.pdf',
      values: [
        { field: 'supplier_black_ownership_percentage', value: '36.59%', sourceFile: 'cert.pdf', sourceDocumentId: documentId },
        { field: 'supplier_black_women_ownership_percentage', value: '0.5%', sourceFile: 'cert.pdf', sourceDocumentId: documentId },
      ],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    const result = mapEntitiesToCalculator(resolveCaseEntities([extraction]), fieldElementIndex([extraction]));
    expect(result.payload['supplier.black_ownership']).toBe(36.59);
    // "0.5%" states its unit — half a percent, not a 0.5 ratio read as 50%.
    expect(result.payload['supplier.black_women_ownership']).toBe(0.5);
    expect(result.payload['ownership.black_ownership']).toBeUndefined();
  });
});

describe('rows that wrap onto the next line', () => {
  /** The Skills block layout, with both wrap styles and a stray hours-only row. */
  function skillsSheet(): XLSX.WorkSheet {
    return XLSX.utils.aoa_to_sheet([
      ['Measured Entity: Acme Haulage'],
      ['Date of Training', 'End Date', 'Training Course', 'Trainer or Service Provider', 'Learner Name & Surname', 'Emp No', 'ID Number', 'Race', 'Gender', 'Total Expenditure', 'Duration (Hours)'],
      [45055, '', 'Food Safety Basics', 'Safety Co', 'Lindiwe Dube', 'E01', '9001015800087', 'African', 'Female', 3150, 3],
      ['', '', '', '', 'Sipho Zulu', 'E02', '9102025800086', 'African', 'Male', '', ''],
      ['', '', '', '', 'Ravi Pillay', '', '8803035800085', 'Indian', 'Male', '', ''],
      ['12 Marc 2024', '', 'Mobile Elevating -', 'Safety Co', 'Andile Nkosi', 'E04', '8504045800084', 'African', 'Male', 28400, 3],
      ['', '', 'operator', '', 'Piet Mokoena', 'E05', '8105055800083', 'African', 'Male', '', 3],
      ['', '', '', '', 'Tumi Sello', 'E06', '9306065800082', 'African', 'Male', '', 3],
      // The stray row: only training hours, no learner.
      ['', '', '', '', '', '', '', '', '', '', 3],
      ['12 March 2024', '', 'Scaffold Erection and-', '', 'Lindiwe Dube', 'E01', '9001015800087', 'African', 'Female', '', 3],
      ['', '', 'Dismantling Training', '', 'Sipho Zulu', 'E02', '9102025800086', 'African', 'Male', '', 3],
      ['', '', '', '', 'Ravi Pillay', '', '8803035800085', 'Indian', 'Male', 39120, ''],
    ]);
  }

  function split() {
    const [doc] = splitWorkbookIntoSheets(book({
      'Skills Development': skillsSheet(),
      Notes: XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]),
    }));
    return doc;
  }

  it('rejoins a course name typed across two rows, for every learner on it', () => {
    const doc = split();
    const course = (name: string) => doc.rows.filter((r) => r['Learner Name & Surname'] === name).map((r) => r['Training Course']);
    expect(course('Andile Nkosi')).toEqual(['Mobile Elevating operator']);
    expect(course('Piet Mokoena')).toEqual(['Mobile Elevating operator']);
    expect(course('Tumi Sello')).toEqual(['Mobile Elevating operator']);
    expect(course('Lindiwe Dube')).toEqual(['Food Safety Basics', 'Scaffold Erection and Dismantling Training']);
    expect(course('Ravi Pillay')).toEqual(['Food Safety Basics', 'Scaffold Erection and Dismantling Training']);
    expect(doc.rows.some((r) => /^(operator|Dismantling Training)$/.test(String(r['Training Course'])))).toBe(false);
  });

  it('never clones a learner into a row that only carries hours, nor a per-person cell into another person', () => {
    const doc = split();
    expect(doc.rows.filter((r) => r['Learner Name & Surname'] === 'Tumi Sello')).toHaveLength(1);
    // Ravi has no employee number; he must not inherit Sipho's.
    for (const ravi of doc.rows.filter((r) => r['Learner Name & Surname'] === 'Ravi Pillay')) {
      expect(ravi['Emp No']).toBeUndefined();
    }
  });

  it('every distinct training entry survives the table read, and the hours-only line is reported, not credited', () => {
    const doc = split();
    const table = applyColumnMapping(doc.rows, {
      'Learner Name & Surname': 'learner_name',
      'Training Course': 'program_name',
      'Trainer or Service Provider': 'training_provider',
      'ID Number': 'id_number',
      Race: 'race',
      Gender: 'gender',
      'Total Expenditure': 'total_cost',
      'Date of Training': 'start_date',
      'End Date': 'end_date',
    }, { columns: ['learner_name', 'program_name', 'training_provider', 'id_number', 'race', 'gender', 'total_cost', 'start_date', 'end_date'], what: 'each learner' });

    expect(table.rows).toHaveLength(9);
    const entries = new Set(table.rows.map((r) => `${r.learner_name}|${r.program_name}`));
    expect(entries.size).toBe(9);
    expect(table.rows.filter((r) => r.learner_name === 'Tumi Sello')).toHaveLength(1);
    expect(table.exceptions.some((e) => /nothing of their own/.test(e))).toBe(true);
    // Each cost stays on the row that states it.
    expect(table.rows.find((r) => r.learner_name === 'Ravi Pillay' && /Scaffold/.test(String(r.program_name)))!.total_cost).toBe(39120);
  });

  it('still lets a keyless row with a figure of its own inherit the key (a second line under one supplier)', () => {
    const table = applyColumnMapping([
      { Supplier: 'Alpha', Spend: 100 },
      { Supplier: 'Beta', Spend: 200 },
      { Supplier: '', Spend: 50 },
      { Supplier: 'Gamma', Spend: 300 },
      { Supplier: 'Delta', Spend: 400 },
    ], { Supplier: 'supplier_name', Spend: 'claimed_spend_ex_vat' }, { columns: ['supplier_name', 'claimed_spend_ex_vat'], what: 'each supplier' });
    expect(table.rows).toHaveLength(5);
    expect(table.rows[2]).toEqual({ supplier_name: 'Beta', claimed_spend_ex_vat: 50 });
  });

  it('does not treat a lone "-" (the usual "nothing here" mark) as a wrapped fragment', () => {
    const filled = dittoFill([
      ['Germiston Centre', '-', 'Donation', '500'],
      ['', 'Weekly', '', '100'],
      ['', '', '', '100'],
    ], 4);
    expect(filled[0][1]).toBe('-');
    expect(filled[1][1]).toBe('Weekly');
  });

  it('keeps whole options whole: a trailing "to" or a label\'s ":-" is not a wrapped fragment', () => {
    const answers = dittoFill([
      ['X', 'Why no engagement?', 'We have not been asked to'],
      ['', '', 'Lack of internal resources'],
      ['', '', 'No standardised procedure'],
    ], 3);
    expect(answers.map((r) => r[2])).toEqual(['We have not been asked to', 'Lack of internal resources', 'No standardised procedure']);

    const labels = dittoFill([
      ['TOTAL TO BE INVOICED:-', '0', '0'],
      ['', '18.27', '0'],
      ['GENERATOR', '', '0'],
    ], 3);
    expect(labels[0][0]).toBe('TOTAL TO BE INVOICED:-');
    expect(labels[2][0]).toBe('GENERATOR');
  });

  it('never joins in the identity column: two suppliers, each with its own spend, stay two suppliers', () => {
    const [doc] = splitWorkbookIntoSheets(book({
      Procurement: XLSX.utils.aoa_to_sheet([
        ['Supplier Name', 'Supplier Classification', 'Expenditure (excluding VAT)'],
        ['Acme Trading -', 'QSE', 1000],
        ['Zenith Logistics', 'EME', 2000],
        ['Orbit Fuels', 'Generic', 3000],
      ]),
      Notes: XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]),
    }));
    expect(doc.rows.map((r) => [r['Supplier Name'], r['Expenditure (excluding VAT)']])).toEqual([
      ['Acme Trading -', 1000],
      ['Zenith Logistics', 2000],
      ['Orbit Fuels', 3000],
    ]);
  });

  it('a dangling description followed by a line with its own amount is two line items', () => {
    const two = dittoFill([
      ['Hope Centre', 'Food parcels -', '500'],
      ['', 'blankets', '300'],
    ], 3);
    expect(two.map((r) => r[1])).toEqual(['Food parcels -', 'blankets']);

    // Same with amounts on every line (a per-row amount column).
    const ledger = dittoFill([
      ['Hope Centre', 'Food parcels -', '500'],
      ['', 'blankets', '300'],
      ['', '', '200'],
      ['Bright Start', 'Uniforms', '100'],
    ], 3);
    expect(ledger.map((r) => r[1])).toEqual(['Food parcels -', 'blankets', 'blankets', 'Uniforms']);
  });

  it('a continuation row that states a block value of its own (another provider) is not a wrap', () => {
    const filled = dittoFill([
      ['22 Jul 2024', 'Crane -', 'Safety Co', 'Lindiwe Dube'],
      ['', 'operator', 'Lift Academy', 'Sipho Zulu'],
      ['', '', '', 'Ravi Pillay'],
      ['20 Jun 2024', 'Scaffold', 'Safety Co', 'Tumi Sello'],
    ], 4);
    expect(filled[0][1]).toBe('Crane -');
    expect(filled[1][1]).toBe('operator');
  });
});

describe('the ESG reading stays the plain reading', () => {
  /** A training block with a wrapped course, plus a fuel log with a #DIV/0! cell and a named cell. */
  function mixedBook(): Buffer {
    const fuel = XLSX.utils.aoa_to_sheet([
      ['Date', 'Km.', 'Total liters', 'L/100'],
      ['2026-03-01', 0, 40, 0],
      ['2026-03-02', 500, 60, 12],
    ]);
    fuel.D2 = { t: 'e', v: 7, w: '#DIV/0!' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date of Training', 'Training Course', 'Trainer', 'Learner Name', 'Emp No', 'Duration (Hours)'],
      ['12 Marc 2024', 'Mobile Elevating -', 'Safety Co', 'Andile Nkosi', 'E04', 3],
      ['', 'operator', '', 'Piet Mokoena', 'E05', 3],
      ['', '', '', 'Tumi Sello', '', 3],
      ['', '', '', 'Lindiwe Dube', 'E08', 3],
      ['', '', '', 'Sipho Zulu', 'E09', 3],
      ['20 Jun 2024', 'Forklift', 'Safety Co', 'Ravi Pillay', 'E07', 3],
    ]), 'Skills Development');
    XLSX.utils.book_append_sheet(wb, fuel, 'Fuel');
    wb.Workbook = { Names: [{ Name: 'FirstKm', Ref: 'Fuel!$B$3' }] };
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
  const upload = (buffer: Buffer) => ({
    originalname: 'mixed.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
    size: buffer.length,
  });
  const sheet = (inputs: Awaited<ReturnType<typeof extractionInputsFromUpload>>, name: string) => {
    const input = inputs.find((i) => i.metadata?.sheet_name === name)!;
    return { input, rows: (input.tables?.[0] as { rows: Array<Record<string, unknown>> }).rows };
  };

  it('ESG: no wrap joining, no per-row exemption, error cells as SheetJS stores them, no named cells', async () => {
    const inputs = await extractionInputsFromUpload(upload(mixedBook()), { domain: 'esg' });
    const skills = sheet(inputs, 'Skills Development');
    expect(skills.rows.map((r) => r['Training Course'])).toEqual(['Mobile Elevating -', 'operator', 'operator', 'operator', 'operator', 'Forklift']);
    expect(skills.rows.find((r) => r['Learner Name'] === 'Tumi Sello')!['Emp No']).toBe('E05');
    const fuel = sheet(inputs, 'Fuel');
    expect(fuel.rows[0]['L/100']).toBe(7);
    expect((fuel.input.tables?.[0] as { namedCells?: unknown }).namedCells).toBeUndefined();
    expect(fuel.input.markdown).not.toContain('#DIV/0!');
  });

  it('B-BBEE (the default): wraps rejoined, per-row cells kept, error cells as their text, named cells attached', async () => {
    const inputs = await extractionInputsFromUpload(upload(mixedBook()));
    const skills = sheet(inputs, 'Skills Development');
    expect(skills.rows.map((r) => r['Training Course'])).toEqual([
      ...Array(5).fill('Mobile Elevating operator'), 'Forklift',
    ]);
    expect(skills.rows.find((r) => r['Learner Name'] === 'Tumi Sello')!['Emp No']).toBeUndefined();
    const fuel = sheet(inputs, 'Fuel');
    expect(fuel.rows[0]['L/100']).toBe('#DIV/0!');
    expect((fuel.input.tables?.[0] as { namedCells?: unknown }).namedCells).toEqual({ FirstKm: 500 });
  });

  it('ESG keeps the echo-row forward-fill; B-BBEE leaves the echo row out', () => {
    const rows = [
      { Learner: 'Andile Nkosi', Course: 'Forklift', Hours: 3 },
      { Learner: 'Piet Mokoena', Course: 'Forklift', Hours: 3 },
      { Learner: '', Course: 'Forklift' },
      { Learner: 'Tumi Sello', Course: 'Forklift', Hours: 3 },
      { Learner: 'Lindiwe Dube', Course: 'Forklift', Hours: 3 },
      { Learner: 'Sipho Zulu', Course: 'Forklift', Hours: 3 },
    ];
    const mapping = { Learner: 'learner_name', Course: 'program_name', Hours: 'hours' };
    const shape = { columns: ['learner_name', 'program_name', 'hours'], what: 'each learner' };
    expect(applyColumnMapping(rows, mapping, shape).rows).toHaveLength(5);
    expect(applyColumnMapping(rows, mapping, shape, { skipEchoRows: false }).rows).toHaveLength(6);
  });
});

describe('a percent cell whose display rounds it', () => {
  const cell = (v: number, z: string, w: string): XLSX.CellObject => ({ t: 'n', v, z, w });

  it('reads as the exact percentage, so 50.6% shown as "51%" cannot clear the 51% line', () => {
    expect(cellValue(cell(0.506, '0%', '51%'))).toBe('50.6%');
    expect(cellValue(cell(0.2999, '0%', '30%'))).toBe('29.99%');
    // Display text that already states the stored value is kept as is.
    expect(cellValue(cell(0.3659, '0.00%', '36.59%'))).toBe('36.59%');
    expect(cellValue(cell(0.51, '0%', '51%'))).toBe('51%');
  });

  it('the ESG reading keeps the display text', () => {
    expect(cellValue(cell(0.506, '0%', '51%'), { exactPercent: false })).toBe('51%');
  });

  it('reaches the supplier rows exact', () => {
    const sheetWithEdge = XLSX.utils.aoa_to_sheet([
      ['Supplier Name', 'Expenditure (excluding VAT)', 'Black Ownership (%)'],
      ['Edge Co', 1000, 0.506],
      ['Clear Co', 2000, 0.75],
    ]);
    (sheetWithEdge.C2 as XLSX.CellObject).z = '0%';
    (sheetWithEdge.C3 as XLSX.CellObject).z = '0%';
    const [doc] = splitWorkbookIntoSheets(book({ Procurement: sheetWithEdge, Notes: XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]) }));
    expect(doc.rows.find((r) => r['Supplier Name'] === 'Edge Co')!['Black Ownership (%)']).toBe('50.6%');
    expect(doc.rows.find((r) => r['Supplier Name'] === 'Clear Co')!['Black Ownership (%)']).toBe('75%');
  });
});
