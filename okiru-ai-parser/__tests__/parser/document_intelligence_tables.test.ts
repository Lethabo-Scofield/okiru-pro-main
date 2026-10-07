/**
 * Scanned tables must arrive as TABLES.
 *
 * Document Intelligence's markdown puts every table into `content` as HTML.
 * That HTML used to become the scan's `raw_text`, so a label-reading regex ran
 * on into `</td>` and `AND SURNAME</th>`, and the structured tables were kept
 * as bare strings that no table reader accepted. These fixtures are synthetic
 * analyzeResults shaped like the real ones (a share register, a BI register
 * split across two pages, a set of financial statements); no client data.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyseWithDocumentIntelligence } from '../../src/services/documentIntelligence.js';
import { extractPdfText, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';
import { structuredRows } from '../../src/services/caseExtraction.js';
import {
  isTableGrid,
  tableGridToRecords,
  type TableGrid,
} from '../../schemas/table_grid.js';

type Cell = {
  rowIndex: number;
  columnIndex: number;
  content: string;
  kind?: string;
  rowSpan?: number;
  columnSpan?: number;
  page?: number;
};

/** A raw DI table: cells as DI lists them, located in `content` by `spans`. */
function rawTable(rowCount: number, columnCount: number, cells: Cell[], content: string, page: number, nth = 0) {
  let offset = -1;
  for (let i = 0; i <= nth; i += 1) offset = content.indexOf('<table>', offset + 1);
  return {
    rowCount,
    columnCount,
    boundingRegions: [{ pageNumber: page, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
    spans: [{ offset, length: content.indexOf('</table>', offset) + 8 - offset }],
    cells: cells.map(({ page: cellPage, ...cell }) => ({
      ...cell,
      boundingRegions: [{ pageNumber: cellPage ?? page, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
      spans: [],
      elements: [],
    })),
  };
}

const SHARE_REGISTER_CONTENT = [
  '# Register of Members',
  '',
  'Example Haulage &amp; Logistics (Pty) Ltd, registration number 2001/000001/07, holds the following issued ordinary shares.',
  '',
  '<table>',
  '<tr><th>FULL NAMES AND SURNAME</th><th>Identity Number</th><th>Number of Shares</th><th>Percentage</th></tr>',
  '<tr><td>Ayanda Example</td><td>7001015000080</td><td>60</td><td>60%</td></tr>',
  '<tr><td>Bongani Sample</td><td>7202025000081</td><td>40</td><td>40%</td></tr>',
  '</table>',
  '',
  '<!-- PageFooter="Certified a true copy of the original" -->',
  '<!-- PageNumber="1" -->',
].join('\n');

const SHARE_REGISTER = {
  content: SHARE_REGISTER_CONTENT,
  pages: [{}],
  tables: [rawTable(3, 4, [
    { rowIndex: 0, columnIndex: 0, kind: 'columnHeader', content: 'FULL NAMES AND SURNAME' },
    { rowIndex: 0, columnIndex: 1, kind: 'columnHeader', content: 'Identity Number' },
    { rowIndex: 0, columnIndex: 2, kind: 'columnHeader', content: 'Number of Shares' },
    { rowIndex: 0, columnIndex: 3, kind: 'columnHeader', content: 'Percentage' },
    { rowIndex: 1, columnIndex: 0, content: 'Ayanda Example' },
    { rowIndex: 1, columnIndex: 1, content: '7001015000080' },
    { rowIndex: 1, columnIndex: 2, content: '60' },
    { rowIndex: 1, columnIndex: 3, content: '60%' },
    { rowIndex: 2, columnIndex: 0, content: 'Bongani Sample' },
    { rowIndex: 2, columnIndex: 1, content: '7202025000081' },
    { rowIndex: 2, columnIndex: 2, content: '40' },
    { rowIndex: 2, columnIndex: 3, content: '40%' },
  ], SHARE_REGISTER_CONTENT, 1)],
};

/** A two-level header ("Black Interest" over Race and Gender), carried on to page 2 without its header. */
const BI_REGISTER_CONTENT = [
  'BENEFICIAL INTEREST REGISTER',
  '',
  '<table>',
  '<tr><th rowspan="2">Name</th><th colspan="2">Black Interest</th><th rowspan="2">Shares</th></tr>',
  '<tr><th>Race</th><th>Gender</th></tr>',
  '<tr><td>Ayanda Example</td><td>African</td><td>Female</td><td>60</td></tr>',
  '</table>',
  '',
  '<!-- PageBreak -->',
  '',
  '<table>',
  '<tr><td>Bongani Sample</td><td>African</td><td>Male</td><td>40</td></tr>',
  '</table>',
].join('\n');

const BI_REGISTER = {
  content: BI_REGISTER_CONTENT,
  pages: [{}, {}],
  tables: [
    rawTable(3, 4, [
      { rowIndex: 0, columnIndex: 0, kind: 'columnHeader', rowSpan: 2, content: 'Name' },
      { rowIndex: 0, columnIndex: 1, kind: 'columnHeader', columnSpan: 2, content: 'Black Interest' },
      { rowIndex: 0, columnIndex: 3, kind: 'columnHeader', rowSpan: 2, content: 'Shares' },
      { rowIndex: 1, columnIndex: 1, kind: 'columnHeader', content: 'Race' },
      { rowIndex: 1, columnIndex: 2, kind: 'columnHeader', content: 'Gender' },
      { rowIndex: 2, columnIndex: 0, content: 'Ayanda Example' },
      { rowIndex: 2, columnIndex: 1, content: 'African' },
      { rowIndex: 2, columnIndex: 2, content: 'Female' },
      { rowIndex: 2, columnIndex: 3, content: '60' },
    ], BI_REGISTER_CONTENT, 1, 0),
    rawTable(1, 4, [
      { rowIndex: 0, columnIndex: 0, content: 'Bongani Sample' },
      { rowIndex: 0, columnIndex: 1, content: 'African' },
      { rowIndex: 0, columnIndex: 2, content: 'Male' },
      { rowIndex: 0, columnIndex: 3, content: '40' },
    ], BI_REGISTER_CONTENT, 2, 1),
  ],
};

/** A form table (no header, two columns) and an income statement with a blank corner header. */
const AFS_CONTENT = [
  '<figure>',
  'Example Haulage (Pty) Ltd',
  '</figure>',
  '',
  '## Annual Financial Statements for the year ended 28 February 2025',
  '',
  '<table>',
  '<tr><td>Registration number</td><td>2001/000001/07</td></tr>',
  '<tr><td>Accounting officer:</td><td>Example &amp; Co Chartered Accountants</td></tr>',
  '</table>',
  '',
  '## Statement of Comprehensive Income',
  '',
  '<table>',
  '<tr><th></th><th>Notes</th><th>2025 R</th><th>2024 R</th></tr>',
  '<tr><td>Revenue</td><td>3</td><td>12 345 678</td><td>10 987 654</td></tr>',
  '<tr><td>Profit for the year</td><td></td><td>1 234 567</td><td>987 654</td></tr>',
  '</table>',
].join('\n');

const AFS = {
  content: AFS_CONTENT,
  pages: [{}, {}],
  tables: [
    rawTable(2, 2, [
      { rowIndex: 0, columnIndex: 0, content: 'Registration number' },
      { rowIndex: 0, columnIndex: 1, content: '2001/000001/07' },
      { rowIndex: 1, columnIndex: 0, content: 'Accounting officer:' },
      { rowIndex: 1, columnIndex: 1, content: 'Example & Co Chartered Accountants' },
    ], AFS_CONTENT, 1, 0),
    rawTable(3, 4, [
      { rowIndex: 0, columnIndex: 0, kind: 'stubHead', content: '' },
      { rowIndex: 0, columnIndex: 1, kind: 'columnHeader', content: 'Notes' },
      { rowIndex: 0, columnIndex: 2, kind: 'columnHeader', content: '2025 R' },
      { rowIndex: 0, columnIndex: 3, kind: 'columnHeader', content: '2024 R' },
      { rowIndex: 1, columnIndex: 0, kind: 'rowHeader', content: 'Revenue' },
      { rowIndex: 1, columnIndex: 1, content: '3' },
      { rowIndex: 1, columnIndex: 2, content: '12 345 678' },
      { rowIndex: 1, columnIndex: 3, content: '10 987 654' },
      { rowIndex: 2, columnIndex: 0, kind: 'rowHeader', content: 'Profit for the year' },
      { rowIndex: 2, columnIndex: 2, content: '1 234 567' },
      { rowIndex: 2, columnIndex: 3, content: '987 654' },
    ], AFS_CONTENT, 2, 1),
  ],
};

let dir: string;

/** Serve an analyzeResult from the evaluation raw-response cache: no network, no credentials. */
function cacheAnalysis(buffer: Buffer, analyzeResult: unknown): void {
  const sha = createHash('sha256').update(buffer).digest('hex');
  writeFileSync(join(dir, `${sha}.prebuilt-layout.2024-11-30.json`), JSON.stringify({ analyzeResult }));
}

async function read(analyzeResult: unknown, name: string) {
  const buffer = Buffer.from(`synthetic scan ${name}`);
  cacheAnalysis(buffer, analyzeResult);
  const result = await analyseWithDocumentIntelligence(buffer, 'application/pdf', `${name}.pdf`);
  expect(result).not.toBeNull();
  return result!;
}

function expectNoMarkup(text: string): void {
  for (const tag of ['<table', '<tr', '<td', '</td>', '<th', '</th>', '<!--', '<figure', '&amp;']) {
    expect(text).not.toContain(tag);
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'di-tables-'));
  process.env.PARSER_DI_CACHE_DIR = dir;
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
});

afterEach(() => {
  delete process.env.PARSER_DI_CACHE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('a scanned share register', () => {
  it('reads as text with no HTML, each row on its own pipe line under its header', async () => {
    const result = await read(SHARE_REGISTER, 'share-register');

    expectNoMarkup(result.text);
    expect(result.text).toContain('Register of Members');
    expect(result.text).not.toMatch(/^#/m);
    expect(result.text).toContain('Example Haulage & Logistics (Pty) Ltd');
    expect(result.text).toContain('FULL NAMES AND SURNAME | Identity Number | Number of Shares | Percentage');
    expect(result.text).toContain('Ayanda Example | 7001015000080 | 60 | 60%');
    // A running footer's words are kept; a page number is not.
    expect(result.text).toContain('Certified a true copy of the original');
    expect(result.text).not.toMatch(/PageNumber/);
  });

  it('keeps every cell with its kind, span and page', async () => {
    const result = await read(SHARE_REGISTER, 'share-register');
    const [table] = result.tables;

    expect(isTableGrid(table)).toBe(true);
    expect(table.sheetName).toBe('Table 1');
    expect(table.page).toBe(1);
    expect(table.rows[1]).toEqual(['Ayanda Example', '7001015000080', '60', '60%']);
    expect(table.cells).toHaveLength(12);
    expect(table.cells[0]).toEqual({
      page: 1, rowIndex: 0, columnIndex: 0, rowSpan: 1, columnSpan: 1, kind: 'columnHeader', content: 'FULL NAMES AND SURNAME',
    });
    expect(table.cells[4]).toMatchObject({ rowIndex: 1, columnIndex: 0, kind: 'content', content: 'Ayanda Example' });
  });

  it('renders the markdown table in place, with no HTML table left behind', async () => {
    const result = await read(SHARE_REGISTER, 'share-register');

    expect(result.markdown).not.toMatch(/<\/?t[rdh]\b|<table/);
    expect(result.markdown).toContain('| FULL NAMES AND SURNAME | Identity Number | Number of Shares | Percentage |');
    expect(result.markdown).toContain('| Bongani Sample | 7202025000081 | 40 | 40% |');
    // In place: the table comes after the sentence that introduces it, once.
    expect(result.markdown.indexOf('issued ordinary shares')).toBeLessThan(result.markdown.indexOf('| Ayanda'));
    expect(result.markdown.split('| Ayanda Example').length).toBe(2);
  });

  it('reaches the table readers as header-keyed rows', async () => {
    const result = await read(SHARE_REGISTER, 'share-register');
    expect(structuredRows(result.tables)).toEqual([
      { 'FULL NAMES AND SURNAME': 'Ayanda Example', 'Identity Number': '7001015000080', 'Number of Shares': '60', Percentage: '60%' },
      { 'FULL NAMES AND SURNAME': 'Bongani Sample', 'Identity Number': '7202025000081', 'Number of Shares': '40', Percentage: '40%' },
    ]);
  });
});

describe('a BI register with a two-level header, split over two pages', () => {
  it('names each column by every header above it', async () => {
    const result = await read(BI_REGISTER, 'bi-register');
    const { headers } = tableGridToRecords(result.tables[0]);
    expect(headers).toEqual(['Name', 'Black Interest Race', 'Black Interest Gender', 'Shares']);
    expect(result.text).toContain('Name | Black Interest Race | Black Interest Gender | Shares');
    expectNoMarkup(result.text);
  });

  it('joins the page-2 continuation onto the page-1 table, keeping each cell page', async () => {
    const result = await read(BI_REGISTER, 'bi-register');
    expect(result.tables.map((t) => t.page)).toEqual([1, 2]);
    expect(result.tables[1].cells[0].page).toBe(2);

    expect(structuredRows(result.tables)).toEqual([
      { Name: 'Ayanda Example', 'Black Interest Race': 'African', 'Black Interest Gender': 'Female', Shares: '60' },
      { Name: 'Bongani Sample', 'Black Interest Race': 'African', 'Black Interest Gender': 'Male', Shares: '40' },
    ]);
  });

  it('keeps spans, which a dense row cannot show', async () => {
    const result = await read(BI_REGISTER, 'bi-register');
    const blackInterest = result.tables[0].cells.find((c) => c.content === 'Black Interest');
    expect(blackInterest).toMatchObject({ rowIndex: 0, columnIndex: 1, columnSpan: 2, rowSpan: 1, kind: 'columnHeader' });
    // Anchor only: the column the header also covers stays empty in `rows`.
    expect(result.tables[0].rows[0]).toEqual(['Name', 'Black Interest', '', 'Shares']);
  });
});

describe('annual financial statements', () => {
  it('reads a form table as "label: value" and the statement as pipe lines', async () => {
    const result = await read(AFS, 'afs');

    expectNoMarkup(result.text);
    expect(result.text).toContain('Registration number: 2001/000001/07');
    expect(result.text).toContain('Accounting officer: Example & Co Chartered Accountants');
    expect(result.text).toContain('Annual Financial Statements for the year ended 28 February 2025');
    expect(result.text).toContain('Notes | 2025 R | 2024 R');
    expect(result.text).toContain('Revenue | 3 | 12 345 678 | 10 987 654');
    expect(result.text).toContain('Profit for the year |  | 1 234 567 | 987 654');
    // Each value ends where its line ends, not at the end of the page.
    const revenueLine = result.text.split('\n').find((line) => line.startsWith('Revenue'));
    expect(revenueLine).toBe('Revenue | 3 | 12 345 678 | 10 987 654');
  });

  it('keeps row headers and the blank corner cell in the grid', async () => {
    const result = await read(AFS, 'afs');
    const statement = result.tables[1];
    expect(statement.page).toBe(2);
    expect(statement.cells.find((c) => c.content === 'Revenue')?.kind).toBe('rowHeader');
    expect(statement.cells.find((c) => c.rowIndex === 0 && c.columnIndex === 0)).toMatchObject({ kind: 'stubHead', content: '' });
  });

  it('hands the larger table to the readers, keyed by its own header', async () => {
    const result = await read(AFS, 'afs');
    expect(structuredRows(result.tables)).toEqual([
      { __EMPTY: 'Revenue', Notes: '3', '2025 R': '12 345 678', '2024 R': '10 987 654' },
      { __EMPTY: 'Profit for the year', Notes: '', '2025 R': '1 234 567', '2024 R': '987 654' },
    ]);
  });
});

describe('a table the structured result does not describe', () => {
  it('is still rendered from its HTML, never left as HTML', async () => {
    const content = 'Directors\n\n<table><tr><th>Name</th><th>Role</th></tr><tr><td>A Example</td><td>Director</td></tr></table>';
    const result = await read({ content, pages: [{}], tables: [] }, 'orphan');
    expectNoMarkup(result.text);
    expect(result.text).toContain('Name | Role');
    expect(result.text).toContain('A Example | Director');
    expect(result.markdown).toContain('| A Example | Director |');
  });
});

describe('the upload path', () => {
  it('stores each scanned table as a cell grid and keeps HTML out of raw_text', async () => {
    const pdf = minimalPdf([]);
    cacheAnalysis(pdf, SHARE_REGISTER);

    const input = await rawExtractionInputFromUpload({
      buffer: pdf,
      originalname: 'Share Register.pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
    });

    expectNoMarkup(input.raw_text);
    expect(input.raw_text).toContain('Ayanda Example | 7001015000080 | 60 | 60%');
    expect(input.tables).toHaveLength(1);
    const [table] = input.tables as TableGrid[];
    expect(Object.keys(table).sort()).toEqual(['cells', 'page', 'rows', 'sheetName']);
    expect(table.sheetName).toBe('Table 1');
    expect(table.cells.filter((c) => c.kind === 'columnHeader')).toHaveLength(4);
    // The agent-loop gate reads this: the text is OCR, not a text layer.
    expect(input.metadata).toMatchObject({ scanned: true, text_source: 'document_intelligence' });
  }, 30_000);
});

describe('a digital PDF', () => {
  it('keeps its line breaks, in reading order', async () => {
    const pdf = minimalPdf([
      // Drawn out of order, and one line in two pieces, the way PDFs often are.
      { x: 72, y: 680, text: 'Registration Number: 2001/000001/07' },
      { x: 72, y: 700, text: 'Company Name:' },
      { x: 200, y: 700, text: 'Example Haulage (Pty) Ltd' },
      { x: 72, y: 660, text: 'B-BBEE Level: Level 1' },
    ]);

    const text = await extractPdfText(pdf);
    expect(text.split('\n')).toEqual([
      'Company Name: Example Haulage (Pty) Ltd',
      'Registration Number: 2001/000001/07',
      'B-BBEE Level: Level 1',
    ]);
  }, 30_000);
});

/** A one-page PDF with text drawn at the given positions (empty list = a page with no text layer). */
function minimalPdf(items: Array<{ x: number; y: number; text: string }>): Buffer {
  const stream = items
    .map(({ x, y, text }) => `BT /F1 12 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
