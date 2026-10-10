/**
 * Side-by-side captioned blocks on a digital PDF page, and the field read from
 * its own block.
 *
 * The layout is a CIPC disclosure's: a key/value list, then the postal
 * address and the registered office printed next to each other under their
 * captions. In reading order every line holds both blocks ("PO BOX 100 12 MAIN
 * ROAD EAST"), and a read dropped "EAST" at the seam. Positions are shaped like
 * pdfjs's; every name and number is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { captionedColumns, pdfCaptionedColumns, type PdfTextItemLike } from '../../src/services/pdfColumns.js';
import { applyCaptionedColumns, columnFor, columnsFromMetadata } from '../../src/services/columnReadings.js';
import { reconstructPdfLines } from '../../src/services/markdownConversion.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import { extractionDomain } from '../../src/services/extractionDomain.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => resetExtractionCache());

const CIPC = 'ownership__cipc_registration_documents_cor14_1_cor14_3';
const at = (y: number, x: number, str: string): PdfTextItemLike => ({ str, x, y });

const PAGE: PdfTextItemLike[] = [
  at(688, 36, 'ENTERPRISE INFORMATION'),
  at(601, 36, 'Enterprise Type'), at(601, 186, 'Close Corporation'),
  at(583, 36, 'Enterprise Status'), at(583, 186, 'In Business'),
  at(564, 36, 'Compliance Notice Status'), at(564, 186, 'NONE'),
  at(546, 36, 'Financial Year End'), at(546, 186, 'June'),
  at(528, 36, 'TAX Number'), at(528, 186, '9000000001'),
  at(510, 36, 'Addresses'), at(509, 186, 'POSTAL ADDRESS'), at(509, 372, 'ADDRESS OF REGISTERED OFFICE'),
  at(492, 186, 'PO BOX 100'), at(492, 372, '12 MAIN ROAD EAST'),
  at(480, 186, 'SOMETOWN'), at(479, 372, 'WESTVILLE'),
  at(468, 186, 'KWAZULU-NATAL'), at(467, 372, 'KWAZULU-NATAL'),
  at(456, 186, '4000'), at(455, 372, '3630'),
  at(421, 30, 'ACTIVE MEMBERS / DIRECTORS'),
  at(403, 30, 'Surname and First Names'), at(403, 204, 'Type'), at(403, 264, 'ID Number /'),
  at(375, 33, 'EXAMPLE, THABO'), at(375, 207, 'Member'),
];

describe('reading captioned blocks from positions', () => {
  it('keeps each caption\'s own lines, where reading order runs the two blocks together', () => {
    expect(reconstructPdfLines(PAGE)).toContain('PO BOX 100 12 MAIN ROAD EAST');
    const columns = captionedColumns(PAGE, 1);
    const byCaption = Object.fromEntries(columns.map((c) => [c.caption, c.lines]));
    expect(byCaption['POSTAL ADDRESS']).toEqual(['PO BOX 100', 'SOMETOWN', 'KWAZULU-NATAL', '4000']);
    expect(byCaption['ADDRESS OF REGISTERED OFFICE']).toEqual(['12 MAIN ROAD EAST', 'WESTVILLE', 'KWAZULU-NATAL', '3630']);
    // The block ends where the spacing breaks: the members' table is not in it.
    expect(columns.flatMap((c) => c.lines)).not.toContain('ACTIVE MEMBERS / DIRECTORS');
  });

  it('finds nothing on a page of prose or label/value pairs with figures', () => {
    expect(captionedColumns([at(700, 30, 'One paragraph of text.'), at(688, 30, 'Another line of it.')], 1)).toEqual([]);
    expect(captionedColumns([at(700, 30, 'Registration Date'), at(700, 186, '01/02/2003'), at(688, 30, 'Tax Number'), at(688, 186, '9000000001')], 1)).toEqual([]);
  });

  it('numbers the pages', () => {
    expect(pdfCaptionedColumns([[], PAGE]).every((c) => c.page === 2)).toBe(true);
  });
});

describe('a field read from its own captioned block', () => {
  const skillFor = (id: string) => extractionDomain('bbbee').skillFor(id);
  const columns = captionedColumns(PAGE, 1);
  const cipc = (registered: string): DocumentExtraction => ({
    documentId: CIPC, documentName: 'CIPC', sourceFile: 'cipc.pdf',
    values: [
      { field: 'registered_address', value: registered, sourceFile: 'cipc.pdf', sourceDocumentId: CIPC },
      { field: 'entity_type', value: 'Close Corporation', sourceFile: 'cipc.pdf', sourceDocumentId: CIPC },
    ],
    missingFields: [], unexpectedFields: [], exceptions: [],
  });

  it('names the block by a label of two or more words inside its caption', () => {
    expect(columnFor(['Registered Office'], columns)).toBe('12 MAIN ROAD EAST, WESTVILLE, KWAZULU-NATAL, 3630');
    expect(columnFor(['Postal Address'], columns)).toBe('PO BOX 100, SOMETOWN, KWAZULU-NATAL, 4000');
    expect(columnFor(['Address'], columns)).toBeNull();
  });

  it('keeps the printed lines when the read lost a word at the seam, and says so', () => {
    const extraction = cipc('12 MAIN ROAD WESTVILLE KWAZULU-NATAL 3630');
    applyCaptionedColumns([extraction], () => columns, skillFor);
    expect(extraction.values[0].value).toBe('12 MAIN ROAD EAST, WESTVILLE, KWAZULU-NATAL, 3630');
    expect(extraction.exceptions[0]).toMatch(/^registered_address: read as "12 MAIN ROAD WESTVILLE/);
    expect(extraction.values[1].value).toBe('Close Corporation');
  });

  it('never replaces a reading that says something else, or one that already says it', () => {
    const other = cipc('7 OLD STREET, WESTVILLE, 3630');
    applyCaptionedColumns([other], () => columns, skillFor);
    expect(other.values[0].value).toBe('7 OLD STREET, WESTVILLE, 3630');
    const same = cipc('12 Main Road East Westville KwaZulu-Natal 3630');
    applyCaptionedColumns([same], () => columns, skillFor);
    expect(same.values[0].value).toBe('12 Main Road East Westville KwaZulu-Natal 3630');
    expect([...other.exceptions, ...same.exceptions]).toEqual([]);
  });

  it('runs inside extractCaseEntities from the columns the input carries', async () => {
    const text = reconstructPdfLines(PAGE).join('\n');
    const input: RawExtractionInput = {
      file_id: 'p1', filename: 'CIPC disclosure example.pdf', mime_type: 'application/pdf', tables: [],
      raw_text: `Disclosure Certificate: Companies and Close Corporations\n${text}`,
      markdown: `## Page 1\n\nDisclosure Certificate: Companies and Close Corporations\n${text}`,
      metadata: { pdf_columns: pdfCaptionedColumns([PAGE]) },
    };
    expect(columnsFromMetadata(input.metadata)).toHaveLength(columns.length);
    const model: ExtractionModel = {
      name: 'stub',
      async complete(_system, user) {
        if (!/EXPECTED JSON KEYS: [^\n]*registered_address/.test(user)) return JSON.stringify({ not_this_document: true });
        return JSON.stringify({ entity_type: 'Close Corporation', registered_address: '12 MAIN ROAD WESTVILLE KWAZULU-NATAL 3630' });
      },
    };
    const result = await extractCaseEntities([input], model);
    const value = result!.extractions.flatMap((e) => e.values).find((v) => v.field === 'registered_address');
    expect(value?.value).toBe('12 MAIN ROAD EAST, WESTVILLE, KWAZULU-NATAL, 3630');
  });
});
