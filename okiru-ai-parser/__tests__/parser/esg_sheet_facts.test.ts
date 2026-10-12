/**
 * The labelled cells of an ESG sheet: label/value pairs, small summary blocks,
 * a controlled document's header block, and the blocks above and beside a large
 * sheet's table. Synthetic data throughout.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import {
  extractEsgSheetFacts,
  fieldBySkillWording,
  findSheetFacts,
  labelKey,
  mergeCellReads,
  registerBodySpan,
  sheetFactsEnabled,
  sparseMatrix,
} from '../../src/services/esgSheetFacts.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';

beforeEach(() => resetDecisionCacheForTest());

const BOWSER = 'ghg_energy__generator_diesel_bowser_reconciliation';

/** A tank reconciliation laid out as label/value lines under a one-row delivery table. */
const STOCK_SHEET: unknown[][] = [
  ['Tank reconciliation Depot North'],
  [],
  ['Date', 'Delivery Note', 'Litres', 'Value'],
  [46100, 'DN-0001', 5000, 90000],
  [],
  [],
  ['Opening stock (dip)', 2000],
  ['Purchased', 5000],
  ['Fuel issued', 4100],
  ['Closing stock  (last dip)', 2900],
  ['Difference', 0],
  ['Difference', 5],
  ['Allowed variance -100 litres'],
];

describe('findSheetFacts', () => {
  it('finds a caption beside its value, a caption over its value, and a "Label:" beside text', () => {
    const facts = findSheetFacts([
      ['Report:', 'Monthly audit'],
      ['Run date:', '2026-01-15 10:00'],
      ['unit price'],
      [12.5, '', 'Fuel use'],
      ['Opening stock (dip)', 2000],
    ]);
    expect(facts.map((f) => [f.label, f.value, f.cell])).toEqual([
      ['Report', 'Monthly audit', 'B1'],
      ['Run date', '2026-01-15 10:00', 'B2'],
      ['Opening stock (dip)', 2000, 'B5'],
      ['unit price', 12.5, 'A4'],
    ]);
  });

  it('reads a summary block by row label and header, and its total line', () => {
    const facts = findSheetFacts([
      ['1. Totals'],
      [],
      ['Node', 'Electricity', 'Water', '%'],
      ['Site North', 10, 20, 25],
      ['Site South', 30, 40, 75],
      ['Total', 40, 60, 100],
    ]);
    expect(facts.find((f) => f.label === 'Site South › Water')).toMatchObject({ value: 40, cell: 'C5', kind: 'summary' });
    expect(facts.find((f) => f.label === 'Total › Electricity')).toMatchObject({ value: 40, kind: 'total' });
    expect(facts).toHaveLength(9);
  });

  it('reads a document header block: captions over one row of values', () => {
    const facts = findSheetFacts([
      ['Document Title', 'Document Class', '', 'Site'],
      ['Skills Grid', 'Form (F)', '', 'Depot North'],
      ['Document Number', 'Revised Date', '', 'Page'],
      ['DOC-0042', '05-02-2026', '', 'Page 1'],
      [],
      ['Name', 'Position', 'Induction', 'First Aid'],
      ['Person One', 'Clerk', 46000, 46001],
      ['Person Two', 'Driver', 46002, 46003],
      ['Person Three', 'Driver', 46004, 46005],
    ], [{ top: 5, bottom: 8 }]);
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ['Document Title', 'Skills Grid'],
      ['Document Class', 'Form (F)'],
      ['Site', 'Depot North'],
      ['Document Number', 'DOC-0042'],
      ['Revised Date', '05-02-2026'],
      ['Page', 'Page 1'],
    ]);
  });

  it('never takes a table row for a pair, nor a cell another reader read', () => {
    const table: unknown[][] = [
      ['Reg', 'Litres', 'Cost'],
      ['AB11CDGP', 100, 1800],
      ['AB22CDGP', 200, 3600],
      ['AB33CDGP', 300, 5400],
      [],
      ['Grand total', 600],
    ];
    expect(findSheetFacts(table).map((f) => f.label)).toEqual(['Grand total']);
    expect(findSheetFacts(table, [{ top: 5, bottom: 5 }])).toEqual([]);
  });

  it('never takes a registration or asset code for a caption, unless it announces its value', () => {
    const facts = findSheetFacts([
      ['AB12CDGP', '2026-01-15'],
      [],
      ['XY34ZWGP', 'Front left', 4],
      [],
      ['TX9001'],
      [12],
      [],
      ['Ref2026:', 'Batch A'],
    ]);
    expect(facts.map((f) => [f.label, f.value])).toEqual([['Ref2026', 'Batch A']]);
  });
});

describe('registerBodySpan', () => {
  it('ends the table at the gap before the label and value lines', () => {
    expect(registerBodySpan(STOCK_SHEET, { headerRow: 2, startCol: 0, endCol: 3 })).toEqual({ top: 2, bottom: 3, left: 0, right: 3 });
  });
});

describe('which field a label is', () => {
  it('compares labels by their words, without punctuation or a bracketed aside', () => {
    expect(labelKey('Closing stock  (last dip):')).toBe('closing stock');
  });

  it('takes the skill\'s own wording, and nothing two fields both claim', () => {
    const candidates = [
      { specId: 'a', field: 'opening_stock_litres', description: '', labels: ['Opening stock', 'Opening dip'] },
      { specId: 'a', field: 'closing_stock_litres', description: '', labels: ['Closing stock'] },
      { specId: 'b', field: 'other_opening', description: '', labels: ['Opening dip'] },
    ];
    expect(fieldBySkillWording('Opening stock (dip)', candidates)?.field).toBe('opening_stock_litres');
    expect(fieldBySkillWording('Opening dip', candidates)).toBeNull();
    expect(fieldBySkillWording('Theoretical stock', candidates)).toBeNull();
  });
});

describe('extractEsgSheetFacts', () => {
  it('reads the stock lines the skill names, with no model, each citing its cell', async () => {
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Tanks.xlsx › Recon',
      sheetName: 'Recon',
      matrix: STOCK_SHEET,
      read: [registerBodySpan(STOCK_SHEET, { headerRow: 2, startCol: 0, endCol: 3 })],
      specIds: [BOWSER],
    });
    const bowser = reads?.find((r) => r.documentId === BOWSER);
    const value = (field: string) => bowser?.values.find((v) => v.field === field);
    expect(value('opening_stock_litres')).toMatchObject({ value: 2000, source: { method: 'cell', cellRef: 'B7' } });
    expect(value('closing_stock_litres')?.value).toBe(2900);
    // What no field names stays a note on the document, never a value.
    const notes = reads?.flatMap((r) => r.open?.facts ?? []) ?? [];
    expect(notes.map((f) => f.label)).toEqual(expect.arrayContaining(['Purchased', 'Fuel issued']));
    expect(notes.every((f) => f.method === 'code')).toBe(true);
    // The delivery table's row is the register's, not a fact.
    expect(notes.some((f) => f.value === 'DN-0001')).toBe(false);
  });

  it('asks the model about the other labels once, by label alone, and reads the cells it maps', async () => {
    const prompts: string[] = [];
    const model: ExtractionModel = {
      name: 'fake',
      async complete(_system: string, user: string) {
        prompts.push(user);
        return JSON.stringify({ mapping: { 'Fuel issued': `${BOWSER}/issued_total_litres`, Purchased: `${BOWSER}/deliveries_litres`, Difference: `${BOWSER}/stock_variance_litres` } });
      },
    };
    const reads = await extractEsgSheetFacts(model, {
      filename: 'Tanks.xlsx › Recon', sheetName: 'Recon', matrix: STOCK_SHEET,
      read: [registerBodySpan(STOCK_SHEET, { headerRow: 2, startCol: 0, endCol: 3 })], specIds: [BOWSER],
    });
    expect(prompts).toHaveLength(1);
    // Values never enter the question: every tab of a template asks the same one.
    expect(prompts[0]).not.toContain('4100');
    const bowser = reads!.find((r) => r.documentId === BOWSER)!;
    expect(bowser.values.find((v) => v.field === 'issued_total_litres')?.value).toBe(4100);
    expect(bowser.values.find((v) => v.field === 'deliveries_litres')?.value).toBe(5000);
    // Two cells under one label disagree: neither is used, and the reviewer is told.
    expect(bowser.values.some((v) => v.field === 'stock_variance_litres')).toBe(false);
    expect(reads!.flatMap((r) => r.exceptions).some((e) => /stock_variance_litres: the sheet states 0 \(B11/.test(e))).toBe(true);
  });

  it('keeps a hidden sheet\'s cells as notes only, and asks nothing', async () => {
    let asked = 0;
    const model: ExtractionModel = { name: 'fake', async complete() { asked += 1; return '{}'; } };
    const reads = await extractEsgSheetFacts(model, {
      filename: 'Tanks.xlsx › Old', sheetName: 'Old', matrix: STOCK_SHEET, specIds: [BOWSER], hidden: true,
    });
    expect(asked).toBe(0);
    expect(reads!.flatMap((r) => r.values)).toEqual([]);
    expect(reads!.flatMap((r) => r.open?.facts ?? []).length).toBeGreaterThan(0);
  });

  it('reads the block beside a large sheet\'s table from the cells the split carries', async () => {
    const aoa: unknown[][] = [['Route', 'Stops', 'Km', '', '', 'GRAND TOTALS']];
    for (let i = 0; i < 700; i += 1) aoa.push([`R${i + 1}`, 2, 10]);
    aoa[1][4] = 'Total Routes:';
    aoa[1][5] = 700;
    aoa[2][4] = 'Total Stops:';
    aoa[2][5] = 1400;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), 'Routes');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Note', 'x'], ['a', 1]]), 'Other');
    const [sheet] = splitWorkbookIntoSheets(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    expect(sheet.matrix).toBeUndefined();
    expect(sheet.region).toEqual({ headerRow: 0, startCol: 0, endCol: 2 });
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Routes.xlsx › Routes', sheetName: 'Routes', matrix: sparseMatrix(sheet.outside ?? []),
    });
    const notes = reads!.flatMap((r) => r.open?.facts ?? []);
    expect(notes.map((f) => [f.label, f.value, f.cell])).toEqual(expect.arrayContaining([
      ['Total Stops', '1400', 'F3'],
    ]));
    // "Total Routes" is the debrief skill's own wording: a value, citing its cell.
    const routes = reads!.flatMap((r) => r.values).find((v) => v.field === 'total_routes');
    expect(routes).toMatchObject({ value: 700, source: { cellRef: 'F2' } });
  });
});

describe('mergeCellReads', () => {
  const read = (values: Array<[string, unknown]>, id = 'spec'): DocumentExtraction => ({
    documentId: id, documentName: id, sourceFile: 'f', values: values.map(([field, value]) => ({ field, value, sourceFile: 'f', sourceDocumentId: id })),
    missingFields: [], unexpectedFields: [], exceptions: [],
  });

  it('drops a cell read another read already agrees with, and replaces one it contradicts, saying so', () => {
    const flat = read([['site_name', 'Transport'], ['opening_stock_litres', '2,000']]);
    const cells = read([['site_name', 'Depot North'], ['opening_stock_litres', 2000]], 'cells');
    cells.values.forEach((v) => { v.source = { method: 'cell', cellRef: 'B2', quote: 'Site: Depot North' }; });
    const merged = mergeCellReads([flat], [cells]);
    expect(flat.values.map((v) => v.field)).toEqual(['opening_stock_litres']);
    expect(flat.exceptions[0]).toMatch(/site_name: this read gave "Transport", but the sheet's cell B2/);
    expect(merged[1].values.map((v) => [v.field, v.value])).toEqual([['site_name', 'Depot North']]);
  });

  it('never replaces what the code read from the sheet\'s table: the disagreeing cell is not used', () => {
    const table = read([['fuel_litres', 1200]], 'table');
    const cells = read([['fuel_litres', 999]], 'cells');
    cells.values.forEach((v) => { v.source = { method: 'cell', cellRef: 'H2', quote: 'Fuel: 999' }; });
    const merged = mergeCellReads([table], [cells], [table]);
    expect(table.values.map((v) => v.value)).toEqual([1200]);
    expect(merged.flatMap((r) => r.values).filter((v) => v.field === 'fuel_litres').map((v) => v.value)).toEqual([1200]);
    expect(cells.exceptions[0]).toMatch(/cell H2 .* states "999", but the sheet's table reads "1200"/);
  });
});

describe('sheetFactsEnabled', () => {
  it('is on unless switched off', () => {
    expect(sheetFactsEnabled({})).toBe(true);
    expect(sheetFactsEnabled({ PARSER_ESG_SHEET_FACTS: 'off' })).toBe(false);
  });
});
