/**
 * The whole-pack scorer on SYNTHETIC data only. The real pack and its answer
 * key are client data and never enter the repository; packEval.test.ts reads
 * them from outside it.
 */
import { describe, expect, it } from 'vitest';
import {
  agrees,
  baselineFrom,
  gateFailures,
  KEY_NAME_ALIASES,
  keyNames,
  scoreMarkdown,
  scorePack,
  toIsoDate,
  toLevel,
  toNumber,
  type AnswerKey,
  type KeyField,
  type PackCase,
} from './packScore.js';

function field(over: Partial<KeyField> & Pick<KeyField, 'label' | 'value' | 'kind'>): KeyField {
  return { keys: [], tolerance: null, absentOk: false, ...over };
}

const caseResult: PackCase = {
  documents_detected: [
    {
      filename: 'Acme CIPC.pdf',
      document_type: 'CIPC registration documents (COR14.1 / COR14.3)',
      extracted_fields: {
        entity_name: { normalized_value: 'ACME TRADING CC 2001 / 123456 / 23 Registration Number Enterprise Name ENTERPRISE INFORMATION Addresses PO BOX 1' },
        incorporation_date: { normalized_value: '2001-03-10' },
        registration_number: { normalized_value: null },
      },
    },
    {
      filename: 'Workbook.xlsx › Finance',
      document_type: 'Audited AFS or signed management accounts',
      extracted_fields: { operating_expenditure: { normalized_value: '30 June 2024' } },
    },
  ],
  ai_entities: {
    extractions: [
      {
        documentId: 'ownership__cipc_registration_documents_cor14_1_cor14_3',
        sourceFile: 'Acme CIPC.pdf',
        values: [
          { field: 'entity_name', value: 'Acme Trading CC' },
          { field: 'registration_number', value: '2001 / 123456 / 23' },
          { field: 'tax_number', value: '9999999999' },
        ],
      },
      {
        documentId: 'sheet_financials',
        sourceFile: 'Workbook.xlsx › Finance',
        values: [
          { field: 'current_year_revenue', value: 'R 12 345 678' },
          { field: 'current_year_npat', value: '(54 321)' },
        ],
      },
      {
        documentId: 'sheet_table__esd',
        sourceFile: 'Workbook.xlsx › Procurement',
        values: [{
          field: 'supplier_rows',
          value: [
            { supplier_name: 'Alpha Ltd', claimed_spend_ex_vat: 100.5 },
            { supplier_name: 'Beta CC', claimed_spend_ex_vat: '200' },
          ],
        }],
      },
    ],
  },
};

const key: AnswerKey = {
  version: 1,
  documents: [
    {
      file: 'Acme CIPC.pdf',
      path: 'parser',
      type: 'CIPC disclosure certificate',
      typeAccepts: ['CIPC registration documents (COR14.1 / COR14.3)', 'ownership__cipc_registration_documents_cor14_1_cor14_3'],
      fields: [
        field({ label: 'Name', keys: ['entity_name'], value: 'ACME TRADING CC', kind: 'text' }),
        field({ label: 'Reg no', keys: ['registration_number'], value: '2001/123456/23', kind: 'regno' }),
        field({ label: 'Registered', keys: ['incorporation_date'], value: '10/03/2001', kind: 'date' }),
        field({ label: 'Tax number', value: '9999999999', kind: 'regno' }),
        field({ label: 'Status', value: 'In Business', kind: 'text' }),
        field({ label: 'Member ID', keys: ['id_number'], value: null, kind: 'regno', absentOk: true }),
      ],
    },
    {
      file: 'Workbook.xlsx',
      path: 'workbook',
      type: 'Gathering workbook',
      typeAccepts: [],
      fields: [
        field({ label: 'Revenue', keys: ['current_year_revenue'], value: 12345678, kind: 'money' }),
        field({ label: 'NPAT', keys: ['current_year_npat'], value: -54321, kind: 'money' }),
        field({ label: 'Opex', keys: ['operating_expenditure'], value: 3456789, kind: 'money' }),
        field({ label: 'Suppliers', keys: ['supplier_rows.supplier_name'], value: ['Alpha Ltd', 'Beta CC'], kind: 'list' }),
        field({ label: 'Supplier count', keys: ['supplier_rows'], value: 2, kind: 'count' }),
        field({ label: 'Spend', keys: ['supplier_rows.claimed_spend_ex_vat'], value: 300.5, kind: 'money', aggregate: 'sum' }),
        field({ label: 'TMPS', keys: ['total_measured_procurement_spend'], value: null, kind: 'money', absentOk: true }),
      ],
    },
  ],
};

describe('value normalisers', () => {
  it('reads South African dates day first, in every form the pack uses', () => {
    expect(toIsoDate('14/07/2009')).toBe('2009-07-14');
    expect(toIsoDate('14 July 2009')).toBe('2009-07-14');
    expect(toIsoDate('19 May 2024, 09:41')).toBe('2024-05-19');
    expect(toIsoDate('3RD NOVEMBER 2024')).toBe('2024-11-03');
    expect(toIsoDate('2024-06-30T00:00:00Z')).toBe('2024-06-30');
    expect(toIsoDate('03/11/24')).toBe('2024-11-03');
    expect(toIsoDate(45473)).toBe('2024-06-30');
    expect(toIsoDate('February')).toBeNull();
  });

  it('reads money in brackets, with a rand sign and with spaces', () => {
    expect(toNumber('(71 205)')).toBe(-71205);
    expect(toNumber('-R54,321')).toBe(-54321);
    expect(toNumber('R 3 210 987.65')).toBe(3210987.65);
    expect(toNumber('12,34')).toBe(12.34);
    expect(toNumber('Registration Number')).toBeNull();
  });

  it('matches per kind', () => {
    expect(agrees('regno', '2001/123456/23', '2001 / 123456 / 23')).toBe(true);
    expect(agrees('regno', '8001015009087', '800101 5009 087')).toBe(true);
    expect(agrees('percent', 37.5, 0.375)).toBe(true);
    expect(agrees('percent', 100, '100%')).toBe(true);
    expect(agrees('money', 2468024, '(2 468 024)')).toBe(true);
    expect(agrees('money', -54321, '54 321')).toBe(false);
    expect(agrees('bool', 'Yes', true)).toBe(true);
    expect(agrees('text', 'Acme Packers and Hauliers cc', 'ACME PACKERS & HAULIERS CC')).toBe(true);
    // A page dump that merely contains the name is not the name.
    expect(agrees('text', 'ACME TRADING CC', 'ACME TRADING CC 2001 / 123456 / 23 Registration Number Enterprise Name ENTERPRISE INFORMATION')).toBe(false);
    expect(agrees('text', 'x', '</td>')).toBe(false);
  });

  it('reads B-BBEE levels in words and numbers, and a stated nil as zero', () => {
    expect(toLevel('LEVEL ONE CONTRIBUTOR')).toBe(1);
    expect(toLevel('Level 4')).toBe(4);
    expect(toLevel(2)).toBe(2);
    expect(toLevel('Non-compliant')).toBe(0);
    expect(toLevel('Registration Number')).toBeNull();
    expect(agrees('level', 'Level 1', 'LEVEL ONE CONTRIBUTOR')).toBe(true);
    expect(agrees('level', 'Level 1', 'Level 2')).toBe(false);
    expect(agrees('money', 0, 'nil')).toBe(true);
    expect(agrees('money', 0, '30 June 2024')).toBe(false);
  });

  it('scores a 100x percentage slip as wrong; only our bare ratio scales up', () => {
    // The ratio form is ours as a bare number (or a %-less string) within ±1.
    expect(agrees('percent', 51, 0.51)).toBe(true);
    expect(agrees('percent', 51, '0.51')).toBe(true);
    // A bare 1 is not a ratio of 100%: a single share or a Level 1 would otherwise score as 100%.
    expect(agrees('percent', 100, 1)).toBe(false);
    expect(agrees('percent', 100, '1.0')).toBe(false);
    expect(agrees('percent', 37.5, 0.375)).toBe(true);
    // A % sign means the value is already a percentage.
    expect(agrees('percent', 100, '1%')).toBe(false);
    expect(agrees('percent', 51, '0.51%')).toBe(false);
    // Never the reverse: an expected 1% is not our 100.
    expect(agrees('percent', 1, 100)).toBe(false);
    expect(agrees('percent', 0.51, 51)).toBe(false);
    // Out of ratio range: 37.5 is not 3750%.
    expect(agrees('percent', 3750, 37.5)).toBe(false);
  });

  it('keeps a decimal comma a decimal for figures', () => {
    expect(agrees('money', 12.5, '12,50')).toBe(true);
    expect(agrees('money', 1250, '12,50')).toBe(false);
    expect(agrees('money', 1250.5, '1 250,50')).toBe(true);
    expect(agrees('money', 125050, '1 250,50')).toBe(false);
    expect(agrees('number', 1250, '12,50')).toBe(false);
    expect(agrees('count', 125050, '1 250,50')).toBe(false);
    expect(agrees('percent', 1250, '12,50')).toBe(false);
    // Thousands separators still read as thousands.
    expect(agrees('money', 1250000, 'R 1,250,000')).toBe(true);
  });
});

describe('lists and counts', () => {
  const rows = [
    { learner_name: 'A One', program_name: 'Welding Basics', total_cost: 'R3,140', start_date: '14 Mar 2023' },
    { learner_name: 'B Two', program_name: 'Spreadsheet Skills', total_cost: 1760, start_date: '' },
  ];
  const listCase: PackCase = {
    ai_entities: { extractions: [{ documentId: 'sheet_table__skills_development', sourceFile: 'Book.xlsx › Skills', values: [
      { field: 'learner_rows', value: rows },
      { field: 'signed_by', value: 'A One and B Two, directors' },
    ] }] },
  };
  const doc = (fields: KeyField[]): AnswerKey => ({ version: 1, documents: [{ file: 'Book.xlsx', path: 'workbook', type: 'x', typeAccepts: [], fields }] });
  const one = (f: KeyField) => scorePack(listCase, doc([f])).perField[0].ai.status;

  it('compares list items by their kind, and finds a name inside a longer text', () => {
    expect(one(field({ label: 'Costs', keys: ['learner_rows.total_cost'], value: [3140, 1760], kind: 'list', itemKind: 'money' }))).toBe('correct');
    expect(one(field({ label: 'Dates', keys: ['learner_rows.start_date'], value: ['2023-03-14'], kind: 'list', itemKind: 'date' }))).toBe('correct');
    expect(one(field({ label: 'Signatories', keys: ['signed_by'], value: ['A One', 'B Two'], kind: 'list' }))).toBe('correct');
    expect(one(field({ label: 'Courses', keys: ['learner_rows.program_name'], value: ['Welding Basics', 'Bricklaying'], kind: 'list' }))).toBe('wrong');
  });

  it('counts rows under a plain key and filled cells under rows.column', () => {
    expect(one(field({ label: 'Entries', keys: ['learner_rows'], value: 2, kind: 'count' }))).toBe('correct');
    expect(one(field({ label: 'Dated entries', keys: ['learner_rows.start_date'], value: 1, kind: 'count' }))).toBe('correct');
    expect(one(field({ label: 'Dated entries', keys: ['learner_rows.start_date'], value: 2, kind: 'count' }))).toBe('wrong');
  });
});

describe('scorePack', () => {
  const score = scorePack(caseResult, key);
  const status = (file: string, label: string) => score.perField.find((f) => f.file === file && f.label === label)!;

  it('scores the deterministic and AI layers separately, and their union', () => {
    expect(status('Acme CIPC.pdf', 'Name').det.status).toBe('wrong');
    expect(status('Acme CIPC.pdf', 'Name').ai.status).toBe('correct');
    expect(status('Acme CIPC.pdf', 'Name').union.status).toBe('correct');
    expect(status('Acme CIPC.pdf', 'Reg no').det.status).toBe('missing');
    expect(status('Acme CIPC.pdf', 'Reg no').ai.status).toBe('correct');
    expect(status('Acme CIPC.pdf', 'Registered').det.status).toBe('correct');
  });

  it('scores an unkeyed field on recall only: found anywhere, never wrong', () => {
    expect(status('Acme CIPC.pdf', 'Tax number').ai.status).toBe('correct');
    expect(status('Acme CIPC.pdf', 'Status').ai.status).toBe('missing');
  });

  it('never recalls an unkeyed yes/no from some other flag', () => {
    const flagged = scorePack(
      { ai_entities: { extractions: [{ documentId: 'x', sourceFile: 'Acme CIPC.pdf', values: [{ field: 'cipc_stamp_present', value: 'Yes' }] }] } },
      { version: 1, documents: [{ file: 'Acme CIPC.pdf', path: 'parser', type: 'x', typeAccepts: [], fields: [field({ label: 'New entrant', value: 'Yes', kind: 'bool' })] }] },
    );
    expect(flagged.perField[0].union.status).toBe('missing');
  });

  it('counts a value under an absentOk field as invented, and silence as fine', () => {
    expect(status('Acme CIPC.pdf', 'Member ID').union.status).toBe('absent_ok');
    // Workbook.xlsx › Finance has no TMPS; nothing is invented.
    expect(status('Workbook.xlsx', 'TMPS').union.status).toBe('absent_ok');
    const invented = scorePack({
      ai_entities: { extractions: [{ documentId: 'x', sourceFile: 'Workbook.xlsx › Finance', values: [{ field: 'total_measured_procurement_spend', value: 23 }] }] },
    }, key);
    expect(invented.perField.find((f) => f.label === 'TMPS')!.union.status).toBe('invented');
    expect(invented.totals.union.invented).toBe(1);
  });

  it('matches workbook sheets to their file, and reads row columns, counts and sums', () => {
    expect(status('Workbook.xlsx', 'Revenue').ai.status).toBe('correct');
    expect(status('Workbook.xlsx', 'NPAT').ai.status).toBe('correct');
    expect(status('Workbook.xlsx', 'Opex').det.status).toBe('wrong');
    expect(status('Workbook.xlsx', 'Suppliers').ai.status).toBe('correct');
    expect(status('Workbook.xlsx', 'Supplier count').ai.status).toBe('correct');
    expect(status('Workbook.xlsx', 'Spend').ai.status).toBe('correct');
  });

  it('reports type, recall and precision over keyed fields only', () => {
    const cipc = score.perDoc.find((d) => d.file === 'Acme CIPC.pdf')!;
    expect(cipc.type_ok).toBe(true);
    expect(cipc.ai_type_ok).toBe(true);
    expect(cipc.keyedFields).toBe(3);
    // det: Registered correct; Name wrong; Reg no, Tax, Status missing.
    expect(cipc.det).toMatchObject({ expected: 5, correct: 1, wrong: 1, missing: 3, recall: 0.2, precision: 0.5 });
    // ai: Name, Reg no, Tax correct (Tax unkeyed, so outside precision); Registered, Status missing.
    expect(cipc.ai).toMatchObject({ expected: 5, correct: 3, correctKeyed: 2, wrong: 0, precision: 1 });
    expect(score.perDoc.find((d) => d.file === 'Workbook.xlsx')!.type_ok).toBeNull();
    expect(score.totals).toMatchObject({ keyedFields: 9, unkeyedFields: 2, absentOkFields: 2, type_ok: 1, typed_documents: 1 });
  });

  it('renders a markdown report', () => {
    const md = scoreMarkdown(score, { mode: 'replay', cassette: { misses: 0 } });
    expect(md).toContain('| union |');
    expect(md).toContain('Acme CIPC.pdf');
  });
});

describe('gate', () => {
  const score = scorePack(caseResult, key);
  const baseline = baselineFrom(score, '2026-01-01');

  it('passes against its own baseline', () => {
    expect(gateFailures(score, baseline, { mode: 'replay', cassette: { misses: 0 } })).toEqual([]);
  });

  it('fails a replay that missed the cassette, even with no baseline yet, and names the documents', () => {
    const failures = gateFailures(score, null, {
      mode: 'replay',
      cassette: { misses: 2 },
      cassetteMissesByFile: { 'Acme CIPC.pdf': 2 },
    });
    expect(failures[0]).toMatch(/missed the cassette 2 time\(s\) \(Acme CIPC\.pdf x2\)/);
    expect(gateFailures(score, null, { mode: 'auto', cassette: { misses: 2 } })).toEqual([]);
    expect(scoreMarkdown(score, { mode: 'replay', cassette: { misses: 2 } })).toMatch(/NOT THE RECORDED RUN/);
  });

  it('fails when a document that was read becomes unreadable', () => {
    const lost = scorePack({ ...caseResult, unreadable_files: [{ file_name: 'Acme CIPC.pdf', reason: 'no text' }] }, key);
    expect(lost.totals.unreadable).toBe(1);
    expect(gateFailures(lost, baseline, null)).toContain('unreadable documents 1 > baseline 0');
  });

  it('fails when a document loses a correct value, a wrong value appears, or a type is lost', () => {
    const worse = scorePack({
      ...caseResult,
      documents_detected: caseResult.documents_detected!.map((d) => (
        d.filename === 'Acme CIPC.pdf' ? { ...d, document_type: 'B-BBEE Certificate', extracted_fields: { entity_name: { normalized_value: '</td>' } } } : d
      )),
    }, key);
    const failures = gateFailures(worse, baseline, null);
    expect(failures.some((f) => f.startsWith('union correct'))).toBe(true);
    expect(failures.some((f) => f.startsWith('Acme CIPC.pdf: correct'))).toBe(true);
    expect(failures.some((f) => f.startsWith('type_ok'))).toBe(true);

    const invented = scorePack({
      ...caseResult,
      ai_entities: { extractions: [...caseResult.ai_entities!.extractions!, { documentId: 'x', sourceFile: 'Workbook.xlsx › Finance', values: [{ field: 'total_measured_procurement_spend', value: 23 }] }] },
    }, key);
    // The AI layer's conflicting value is also reported on its own: the union
    // would let a correct value from the other layer hide it.
    expect(gateFailures(invented, baseline, null)).toEqual([
      expect.stringMatching(/^union wrong\+invented 2 > baseline 1/),
      expect.stringMatching(/^ai wrong\+invented 1 > baseline 0/),
    ]);
  });
});

describe('key-name aliases', () => {
  const aliasKey: AnswerKey = {
    version: 1,
    documents: [
      {
        file: 'Supplier cert.pdf', path: 'parser', type: 'supplier certificate', typeAccepts: [],
        fields: [
          field({ label: 'Black ownership', keys: ['black_ownership'], value: 51, kind: 'percent' }),
          field({ label: 'Black women ownership', keys: ['black_women_ownership'], value: 30, kind: 'percent' }),
        ],
      },
      {
        file: 'Payroll.pdf', path: 'parser', type: 'payroll', typeAccepts: [],
        fields: [field({ label: 'Number of employees', keys: ['employee_rows'], value: 7, kind: 'count' })],
      },
      {
        file: 'Share cert.pdf', path: 'parser', type: 'share certificate', typeAccepts: [],
        fields: [field({ label: 'Black ownership %', keys: ['black_ownership'], value: null, kind: 'percent', absentOk: true })],
      },
    ],
  };
  const aliasCase: PackCase = {
    ai_entities: {
      extractions: [
        { documentId: 'x', sourceFile: 'Supplier cert.pdf', values: [
          { field: 'supplier_black_ownership_percentage', value: '51.00%' },
          { field: 'supplier_black_women_ownership_percentage', value: '30%' },
        ] },
        { documentId: 'y', sourceFile: 'Payroll.pdf', values: [{ field: 'employee_count', value: '7' }] },
        { documentId: 'z', sourceFile: 'Share cert.pdf', values: [{ field: 'black_ownership_percentage', value: '100%' }] },
      ],
    },
  };

  it('reads a correctly named skill field under the key name it is an alias of', () => {
    const score = scorePack(aliasCase, aliasKey);
    expect(score.perField.map((f) => f.ai.status)).toEqual(['correct', 'correct', 'correct', 'invented']);
  });

  it('scores the key names alone when aliases are off, so the change is visible either way', () => {
    const score = scorePack(aliasCase, aliasKey, { aliases: false });
    expect(score.perField.map((f) => f.ai.status)).toEqual(['missing', 'missing', 'missing', 'absent_ok']);
  });

  it('an alias never makes a wrong value right', () => {
    const wrong: PackCase = { ai_entities: { extractions: [
      { documentId: 'x', sourceFile: 'Supplier cert.pdf', values: [{ field: 'supplier_black_ownership_percentage', value: '25%' }] },
    ] } };
    expect(scorePack(wrong, aliasKey).perField[0].ai.status).toBe('wrong');
  });

  it('aliases are field names only, each a different name from its key', () => {
    for (const [key, names] of Object.entries(KEY_NAME_ALIASES)) {
      for (const name of names) {
        expect(name).toMatch(/^[a-z][a-z0-9_.]*$/);
        expect(name).not.toBe(key);
      }
    }
    expect(keyNames(field({ label: 'x', keys: ['black_ownership', 'black_ownership_percentage'], value: 1, kind: 'percent' })))
      .toEqual(['black_ownership', 'black_ownership_percentage', 'supplier_black_ownership_percentage']);
  });
});
