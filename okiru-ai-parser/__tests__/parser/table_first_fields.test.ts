/**
 * Table-first field reading, capture guards, type-gated heuristics and the
 * normalisers they rely on (claude-level plan items 2.2, 2.3, 2.4).
 *
 * Every document here is invented. The shapes are the real ones: a scanned
 * register's header row and data row, a 2-column "LABEL: | value" form, a
 * share certificate's colon-labelled header row, a statement's Notes column,
 * a workbook sheet flattened to "Header: value, Header: value".
 */
import { describe, expect, it } from 'vitest';
import { extractFields } from '../../parser/extract_fields.js';
import { normalizeBeeLevel, normalizeDate } from '../../parser/normalize.js';
import {
  isCompanyRegistrationField,
  normalizeCipcRegistration,
  validateCipcRegistration,
} from '../../parser/checksums.js';
import { fieldLabelRegex, inferDataType } from '../../graph/ontology_loader.js';
import { defaultDocumentKnowledge } from '../../graph/ontology_queries.js';
import type { FieldKnowledge } from '../../graph/ontology_models.js';
import type { ParserDataType } from '../../schemas/document_types.js';
import type { TableCell, TableCellKind, TableGrid } from '../../schemas/table_grid.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

/** A field as the matrix loader builds it: its name as a label pattern. */
function matrixField(name: string, dataType: ParserDataType = 'string'): FieldKnowledge {
  return {
    field: { name, data_type: dataType, required: false, description: name, calculator_key: `x.${name}`, graph_version: 'v1' },
    rules: [],
    patterns: [{ name, pattern_type: 'label', examples: [], regex: fieldLabelRegex(name), semantic_hint: name, graph_version: 'v1' }],
    calculator_requirements: [],
  };
}

/** A field with no pattern at all: only the label pass and heuristics can read it. */
function bareField(name: string, dataType: ParserDataType = 'string'): FieldKnowledge {
  return {
    field: { name, data_type: dataType, required: false, description: name, calculator_key: `x.${name}`, graph_version: 'v1' },
    rules: [],
    patterns: [],
    calculator_requirements: [],
  };
}

function canonicalField(documentName: string, fieldName: string): FieldKnowledge {
  const doc = defaultDocumentKnowledge().find((d) => d.document.name === documentName)!;
  return doc.fields.find((f) => f.field.name === fieldName)!;
}

/** A grid in the TableGrid contract; `kinds` marks header rows. */
function grid(sheetName: string, page: number, rows: string[][], headerRows: number[] = []): TableGrid {
  const cells: TableCell[] = [];
  rows.forEach((row, r) => row.forEach((content, c) => {
    const kind: TableCellKind = headerRows.includes(r) ? 'columnHeader' : 'content';
    cells.push({ page, rowIndex: r, columnIndex: c, rowSpan: 1, columnSpan: 1, kind, content });
  }));
  return { sheetName, page, rows, cells };
}

function input(rawText: string, tables: unknown[] = []): RawExtractionInput {
  return { file_id: 'f', filename: 'scan.pdf', mime_type: 'application/pdf', raw_text: rawText, tables, metadata: {} };
}

const REGISTER_FORM = grid('Table 1', 2, [
  ['COMPANY NAME:', 'Acme Trading cc'],
  ['REGISTRATION NUMBER:', '2019 / 111222 / 07'],
  ['ENTITY TYPE:', 'CC'],
]);
const REGISTER_TABLE = grid('Table 2', 3, [
  ['SHAREHOLDER NAME AND SURNAME', 'ID / REG NUMBER', 'CERTIFICATE NUMBER', 'NO OF SHARES ISSUED', 'CLASS SHARE', '% SHARES'],
  ['Jane Example', '800101 5009 087', 'ACM001', '250', 'Ordinary', '100%'],
  ['', '', '', '', '', ''],
], [0]);
// What the text layer of the same scan says: the header row one pipe line, the data row the next.
const REGISTER_TEXT = [
  'SHARE REGISTER',
  'COMPANY NAME: Acme Trading cc',
  'REGISTRATION NUMBER: 2019 / 111222 / 07',
  'SHAREHOLDER NAME AND SURNAME | ID / REG NUMBER | CERTIFICATE NUMBER | NO OF SHARES ISSUED | CLASS SHARE | % SHARES',
  'Jane Example | 800101 5009 087 | ACM001 | 250 | Ordinary | 100%',
].join('\n');

describe('table-first field extraction', () => {
  it('reads a register column from the cell under its header, with the real page and table', () => {
    const out = extractFields(input(REGISTER_TEXT, [REGISTER_FORM, REGISTER_TABLE]), [
      matrixField('shareholder_name'),
      matrixField('number_of_shares'),
      matrixField('share_class'),
      matrixField('percentage', 'percentage'),
    ]);
    expect(out.shareholder_name.raw_value).toBe('Jane Example');
    expect(out.number_of_shares.raw_value).toBe('250');
    expect(out.share_class.raw_value).toBe('Ordinary');
    expect(out.percentage.normalized_value).toBe(100);
    expect(out.shareholder_name.source).toMatchObject({ page: 3, table: 'Table 2' });
    // A table cell under the field's own label is the document labelling the field.
    expect(out.shareholder_name.matched_patterns).toContain('shareholder_name');
  });

  it('reads a form row from the cell beside its label, and normalises a spaced registration number', () => {
    const out = extractFields(input('', [REGISTER_FORM]), [matrixField('registration_number'), matrixField('entity_type')]);
    expect(out.registration_number.raw_value).toBe('2019 / 111222 / 07');
    expect(out.registration_number.normalized_value).toBe('2019/111222/07');
    expect(out.registration_number.matched_patterns).toContain('checksum_valid');
    expect(out.registration_number.source).toMatchObject({ page: 2, table: 'Table 1' });
    expect(out.entity_type.raw_value).toBe('CC');
  });

  it('never takes a shareholder ID column as the company registration number', () => {
    const out = extractFields(input('', [REGISTER_TABLE]), [matrixField('registration_number')]);
    expect(out.registration_number.raw_value).toBeNull();
  });

  it('reads under a header row of colon labels even when the reader did not tag it', () => {
    const certificate = grid('Table 1', 1, [
      ['Certificate Number:', 'Class:', 'Number of Shares:'],
      ['ACM001', 'Ordinary Shares', '250'],
    ]);
    const text = 'SHARE CERTIFICATE\nCertificate Number: | Class: | Number of Shares:\nACM001 | Ordinary Shares | 250';
    const out = extractFields(input(text, [certificate]), [
      matrixField('certificate_number'),
      matrixField('share_class'),
      matrixField('number_of_shares'),
    ]);
    expect(out.certificate_number.raw_value).toBe('ACM001');
    expect(out.share_class.raw_value).toBe('Ordinary Shares');
    expect(out.number_of_shares.raw_value).toBe('250');
  });

  it('skips a statement\'s Notes column and takes the current-year figure', () => {
    const statement = grid('Table 3', 4, [
      ['', 'Notes', '2025', '2024'],
      ['Finance costs', '4', '12 345', '9 876'],
    ], [0]);
    const out = extractFields(input('', [statement]), [matrixField('finance_costs', 'money')]);
    expect(out.finance_costs.normalized_value).toBe(12345);
    expect(out.finance_costs.source.page).toBe(4);
  });
});

describe('capture guards on label reads', () => {
  it('does not read the rest of a header row as a shareholder', () => {
    const out = extractFields(input(REGISTER_TEXT), [matrixField('shareholder_name')]);
    expect(out.shareholder_name.raw_value).not.toBe('AND SURNAME');
    expect(String(out.shareholder_name.raw_value ?? '')).not.toMatch(/SURNAME|\|/);
  });

  it('never returns a table tag as a value', () => {
    const out = extractFields(input('<tr><td>Cost of sales</td><td>1 234 567</td></tr>'), [matrixField('cost_of_sales', 'money')]);
    expect(String(out.cost_of_sales.raw_value ?? '')).not.toMatch(/<\/?t[dhr]/);
  });

  it('refuses a capture that runs on for hundreds of characters', () => {
    const out = extractFields(input(`Audit opinion: ${'unqualified and further words '.repeat(12)}`), [matrixField('audit_opinion')]);
    expect(out.audit_opinion.raw_value).toBeNull();
  });

  it('does not take the next label as a company name', () => {
    const supplierName = canonicalField('B-BBEE Certificate', 'supplier_name');
    const annexure = extractFields(input('ANNEXURE A\nEntity Name Registration Number VAT Number\nAcme Trading Limited 2019/111222/06 N/A'), [supplierName]);
    expect(annexure.supplier_name.raw_value).not.toBe('Registration Number');
    const certificate = extractFields(input('Company Registration Number:\n\n2019 / 111222 / 07'), [bareField('holder_name')]);
    expect(certificate.holder_name.raw_value).toBeNull();
    const entity = extractFields(input('Company Registration Number: 2019/111222/07'), [bareField('entity_name')]);
    expect(entity.entity_name.raw_value).toBeNull();
  });

  it('stops a workbook row capture at the next "Header: value" pair', () => {
    const out = extractFields(
      input('Sheet: Ownership Chain\ncol_0: 1, Entity Name: Acme Trading, Total Black Voting Rights: 100.00%'),
      [canonicalField('Ownership Confirmation', 'entity_name')],
    );
    expect(out.entity_name.raw_value).toBe('Acme Trading');
  });

  it('reads a spreadsheet header with a unit note before its colon', () => {
    const out = extractFields(
      input('Supplier Name: Acme Fuels, BEE Level: Level 1, Black Ownership (%): 42.5%, Black Woman Ownership (%): 12%'),
      [bareField('black_ownership', 'percentage')],
    );
    expect(out.black_ownership.normalized_value).toBe(42.5);
  });

  it('does not read a document title as a value of the field its words name', () => {
    const out = extractFields(input('BENEFICIAL INTEREST REGISTER\nCOMPANY NAME: Acme Trading cc'), [matrixField('percentage', 'percentage')]);
    expect(out.percentage.raw_value).toBeNull();
  });

  it('reads "Label value" only where the label begins its line', () => {
    const changeLog = '14/11/2017 Registered Address Change on 14/11/2017.\n12 Example Road';
    const out = extractFields(input(changeLog), [matrixField('registered_address')]);
    expect(out.registered_address.raw_value).toBeNull();
    const form = extractFields(input('Enterprise Type Close Corporation\nEnterprise Status In Business'), [matrixField('entity_type')]);
    expect(form.entity_type.raw_value).toBe('Close Corporation');
  });
});

describe('type-gated heuristics', () => {
  it('does not read a date into an "expenditure" field ("expenditure" is not "end")', () => {
    const out = extractFields(input('Annual financial statements\nfor the year ended 30 June 2024'), [bareField('operating_expenditure')]);
    expect(out.operating_expenditure.raw_value).toBeNull();
  });

  it('reads an amount only beside its own label, never the first Rand figure on the page', () => {
    const field = bareField('total_measured_procurement_spend', 'money');
    const unlabelled = extractFields(input('Assessed tax loss carried forward R 55 555\nOther notes'), [field]);
    expect(unlabelled.total_measured_procurement_spend.raw_value).toBeNull();
    const labelled = extractFields(input('Summary\nTotal measured procurement spend R 1 234 567.89\n'), [field]);
    expect(labelled.total_measured_procurement_spend.normalized_value).toBe(1234567.89);
  });

  it('does not read "ID no" as a signing date', () => {
    const out = extractFields(input('Name: Jane Example, ID no: 8001015009087, New Entrant: Yes'), [bareField('signed_date', 'date')]);
    expect(out.signed_date.raw_value).toBeNull();
  });

  it('does not read prose as a name', () => {
    const out = extractFields(input('Beneficiary we have supported since 2019 in the region.'), [bareField('beneficiary_name')]);
    expect(out.beneficiary_name.raw_value).toBeNull();
  });

  it('does not find a role word inside another word ("Authorised" is not "Author")', () => {
    const out = extractFields(input('Authorised Shares:\n\n5000\nDirector\n\nJohn Sample'), [bareField('holder_name')]);
    expect(out.holder_name.raw_value).toBeNull();
  });

  it('does not read an organisation type as its name', () => {
    const out = extractFields(input('Enterprise Name ACME TRADING\nEnterprise Type Close Corporation'), [bareField('entity_type')]);
    expect(out.entity_type.raw_value).toBe('Close Corporation');
  });
});

describe('normalisers', () => {
  it('accepts a CIPC registration number written with spaced slashes', () => {
    expect(validateCipcRegistration('2019 / 111222 / 07').valid).toBe(true);
    expect(normalizeCipcRegistration('2019 / 111222 / 07')).toBe('2019/111222/07');
    expect(normalizeCipcRegistration('2019/111222/07')).toBe('2019/111222/07');
    expect(normalizeCipcRegistration('19/111222/07')).toBeNull();
  });

  it('reads "LEVEL ONE CONTRIBUTOR" as level 1 through the canonical level pattern', () => {
    const level = canonicalField('B-BBEE Certificate', 'bee_level');
    expect(extractFields(input('Acme Trading Limited\nLEVEL ONE CONTRIBUTOR\nScorecard'), [level]).bee_level.normalized_value).toBe(1);
    expect(extractFields(input('Level 3 Contributor'), [level]).bee_level.normalized_value).toBe(3);
  });

  it('does not read "none" as level one', () => {
    expect(normalizeBeeLevel('None')).toBeNull();
    expect(normalizeBeeLevel('Level Two')).toBe(2);
  });

  it('does not turn a bare number into a date', () => {
    expect(normalizeDate('46066')).toBeNull();
    expect(normalizeDate('July 14, 2023')).toBe('2023-07-14');
  });

  it('keeps yes/no checks that mention CIPC out of the registration-number checksum', () => {
    expect(isCompanyRegistrationField('cipc_stamp_present')).toBe(false);
    expect(isCompanyRegistrationField('cipc_director_history_consistent')).toBe(false);
    expect(isCompanyRegistrationField('registration_number')).toBe(true);
  });

  it('types identifiers and signatories as text, not dates', () => {
    expect(inferDataType('registration_number')).toBe('string');
    expect(inferDataType('signed_by')).toBe('string');
    expect(inferDataType('incorporation_date')).toBe('date');
  });

  // A spec that asks for one record per item ("per payment:") marks its fields
  // labelled_only. Shape guesses must not run for them: on a statement holding
  // many payments, "the first date on the page" is an arbitrary row.
  it('reads a labelled_only field from its label, never from a shape guess', () => {
    const statement = 'Acme Trading statement\n12/03/2025 Deposit 1 000.00\n15/04/2025 Deposit 2 500.00';
    const guessed = bareField('payment_date', 'date');
    expect(extractFields(input(statement), [guessed]).payment_date.raw_value).toBe('12/03/2025');

    const perItem: FieldKnowledge = { ...guessed, field: { ...guessed.field, labelled_only: true } };
    expect(extractFields(input(statement), [perItem]).payment_date.raw_value).toBeNull();
    expect(extractFields(input(`${statement}\nPayment date: 15/04/2025`), [perItem]).payment_date.raw_value).toBe('15/04/2025');
  });
});
