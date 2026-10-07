import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, loadOntologyFromWorkbook } from '../../graph/ontology_loader.js';
import { extractFields } from '../../parser/extract_fields.js';
import {
  MATRIX_SHEET_ELEMENTS,
  VERIFICATION_DOCUMENT_MATRIX,
  findDocumentForWorkbookRow,
} from '../../schemas/verification_document_matrix.js';

function createWorkbook(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okiru-parser-'));
  const workbookPath = path.join(dir, 'matrix.xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Document required': 'Supplier B-BBEE Certificate',
      'What auditor tests / looks for': 'B-BBEE level; black ownership; expiry date',
      'Example of expected data': 'Level Two; 51%; 01 Feb 2027',
      'Prompt template / extraction instruction': 'Extract supplier status level and validity evidence',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'ESD');
  XLSX.writeFile(workbook, workbookPath);
  return workbookPath;
}

function createNoisyWorkbook(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okiru-parser-'));
  const workbookPath = path.join(dir, 'noisy-matrix.xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Document required': 'B-BBEE certificate or affidavit for each ESD/SD beneficiary entity',
      'What auditor tests / looks for': 'Inspect that the certificate is valid and the status level is present',
      'Example of expected data': 'Inspect certificate and confirm validity',
      'Prompt template / extraction instruction': 'Inspect and return assessment notes',
    },
    {
      'Document required': 'Full supplier schedule — all B-BBEE suppliers with total spend and B-BBEE status',
      'What auditor tests / looks for': 'Confirm supplier spend, supplier name, level and black ownership',
      'Example of expected data': 'Supplier schedule with total spend and B-BBEE status',
      'Prompt template / extraction instruction': 'Inspect schedule',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'ESD');
  XLSX.writeFile(workbook, workbookPath);
  return workbookPath;
}

describe('ontology loader', () => {
  it('builds records from workbook sheets', () => {
    const records = buildOntologyRecordsFromWorkbook(createWorkbook());
    expect(records).toHaveLength(1);
    expect(records[0].pillar.name).toBe('ESD');
    // Canonical rows collapse to the canonical document name so they reinforce
    // (rather than duplicate) the canonical type; the original row label is kept
    // as an alias for classification recall.
    expect(records[0].document.name).toBe('B-BBEE Certificate');
    expect(records[0].document.aliases).toContain('Supplier B-BBEE Certificate');
    expect(records[0].fields.length).toBeGreaterThan(0);
  });

  it('is idempotent with upsert repositories', async () => {
    const repo = new InMemoryOntologyRepository([]);
    const workbookPath = createWorkbook();
    const first = await loadOntologyFromWorkbook(repo, workbookPath);
    const second = await loadOntologyFromWorkbook(repo, workbookPath);
    const docs = await repo.listDocumentTypes();

    expect(first.records).toBe(second.records);
    expect(docs).toHaveLength(1);
  });

  it('loads document requirements and JSON fields from the bundled B-BBEE matrix', () => {
    const records = buildOntologyRecordsFromWorkbook('ontology/BBBEE_Verification_Document_Matrix_v3.xlsx');
    const saId = records.find((record) => record.document.name.includes('SA ID document / certified copy'));
    const cipc = records.find((record) => record.document.name.includes('CIPC registration documents'));

    expect(records.length).toBeGreaterThan(100);
    expect(saId?.fields.map((field) => field.field.name)).toEqual(expect.arrayContaining([
      'id_number',
      'citizenship_status',
      'certified_date',
      'certification_within_3_months',
      'photo_legible',
      'race_declared',
      'exceptions',
    ]));
    expect(cipc?.fields.map((field) => field.field.name)).toEqual(expect.arrayContaining([
      'entity_name',
      'registration_number',
      'incorporation_date',
      'entity_type',
      'registered_address',
      'cipc_stamp_present',
    ]));
  });

  it('collapses the bundled matrix into a single canonical type per supported document (no duplicates)', async () => {
    const repo = new InMemoryOntologyRepository();
    const records = buildOntologyRecordsFromWorkbook('ontology/BBBEE_Verification_Document_Matrix_v3.xlsx');
    await repo.upsertOntology(records);
    const docTypes = await repo.listDocumentTypes();
    const names = docTypes.map((doc) => doc.name);

    // Each canonical supported type must appear exactly once, so it reinforces
    // rather than collides with itself during classification.
    for (const canonical of ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit', 'Supplier Spend Schedule']) {
      expect(names.filter((name) => name === canonical).length).toBe(1);
    }
  });

  describe('one field list: the loader reads the generated matrix, not its own parse of the prompt', () => {
    const BUNDLED = 'ontology/BBBEE_Verification_Document_Matrix_v3.xlsx';
    const fieldsOf = (records: ReturnType<typeof buildOntologyRecordsFromWorkbook>, name: string) =>
      records.find((record) => record.document.name.startsWith(name))?.fields.map((field) => field.field.name) ?? [];

    it('leaves no bundled B-BBEE type with only the primary_evidence placeholder', () => {
      const placeholderOnly = buildOntologyRecordsFromWorkbook(BUNDLED)
        .filter((record) => record.fields.every((field) => field.field.name === 'primary_evidence'))
        .map((record) => record.document.name);
      // "Return JSON per employee: …" / "per payment:" / "per certificate:" used
      // to fall through the loader's own regex and leave 28 types with nothing.
      expect(placeholderOnly).toEqual([]);
    });

    it('gives the per-row types their real fields', () => {
      const records = buildOntologyRecordsFromWorkbook(BUNDLED);
      expect(fieldsOf(records, 'EEA1')).toEqual(expect.arrayContaining(['employee_name', 'eea1_signed', 'eea1_date']));
      expect(fieldsOf(records, 'Proof of payment — cash grants')).toEqual(
        expect.arrayContaining(['beneficiary_name', 'payment_date', 'amount_paid']),
      );
      expect(fieldsOf(records, 'Detailed ledger')).toEqual(expect.arrayContaining(['supplier_name', 'claimed_spend_ex_vat']));
      expect(fieldsOf(records, 'Management representation letter')).toEqual(
        expect.arrayContaining(['signatory_name', 'signing_date']),
      );
      expect(fieldsOf(records, 'Valid B-BBEE verification certificate per sampled supplier')).toEqual(
        expect.arrayContaining(['supplier_name', 'certificate_recognition_level', 'certificate_expiry_date']),
      );
      expect(fieldsOf(records, 'CIPC COR39')).toEqual(expect.arrayContaining(['full_name', 'appointment_date']));
    });

    it('uses exactly the matrix field list for every non-canonical row', () => {
      for (const record of buildOntologyRecordsFromWorkbook(BUNDLED)) {
        const spec = findDocumentForWorkbookRow(record.pillar.name, record.document.name);
        if (!spec) continue; // canonical rows take the canonical type's fields
        const own = record.fields.filter((field) => field.field.identifying !== false).map((field) => field.field.name);
        expect(own, spec.id).toEqual(spec.expectedFields.map((name) => name.toLowerCase()));
      }
    });

    it('resolves every bundled workbook row to a matrix entry (sheet map in step with the generator)', () => {
      const workbook = XLSX.readFile(BUNDLED);
      const unresolved: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const header = rows.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === 'document required'));
        if (header < 0) continue;
        expect(MATRIX_SHEET_ELEMENTS[sheetName], `sheet ${sheetName}`).toBeDefined();
        const column = rows[header].findIndex((cell) => String(cell).trim().toLowerCase() === 'document required');
        for (const row of rows.slice(header + 1)) {
          const name = String(row[column] ?? '').trim();
          if (name && !findDocumentForWorkbookRow(sheetName, name)) unresolved.push(`${sheetName}: ${name}`);
        }
      }
      expect(unresolved).toEqual([]);
    });

    it('reads a one-record-per-item spec from labels only, never by a shaped guess', () => {
      const records = buildOntologyRecordsFromWorkbook(BUNDLED);
      const eea1 = records.find((record) => record.document.name.startsWith('EEA1'))!;
      const letter = records.find((record) => record.document.name.startsWith('Management representation letter'))!;
      const saId = records.find((record) => record.document.name.startsWith('SA ID document / certified copy — black'))!;
      const own = (record: typeof eea1) => record.fields.filter((field) => field.field.identifying !== false);
      // "Return JSON per employee:" / "per letter:" — many records in one document.
      expect(own(eea1).every((field) => field.field.labelled_only === true)).toBe(true);
      expect(own(letter).every((field) => field.field.labelled_only === true)).toBe(true);
      // "Return a JSON object with fields:" — one record; the guesses still help.
      expect(own(saId).some((field) => field.field.labelled_only)).toBe(false);

      // An EEA1 form quotes the 1994 cut-off and says "ID no" long before any
      // employee's own entry; neither is the declaration's date or a "No".
      const form = {
        file_id: 'f1',
        filename: 'declaration.pdf',
        raw_text: 'Population group as defined before 27 April 1994.\nID no ________\nCompany we have recorded the details below.',
      };
      const unlabelled = extractFields(form as never, own(eea1));
      expect(unlabelled.eea1_date.raw_value).toBeNull();
      expect(unlabelled.eea1_signed.raw_value).toBeNull();
      const signatory = extractFields(form as never, own(letter));
      expect(signatory.signatory_name.raw_value).toBeNull();

      const labelled = extractFields({ ...form, raw_text: `${form.raw_text}\nEEA1 date: 03 March 2025` } as never, own(eea1));
      expect(labelled.eea1_date.raw_value).toBe('03 March 2025');
    });

    it('keeps the placeholder for a row the matrix does not know', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okiru-parser-'));
      const workbookPath = path.join(dir, 'custom.xlsx');
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        'Document required': 'Acme Trading widget register',
        'What auditor tests / looks for': 'Widgets',
        'Prompt template / extraction instruction': 'Return JSON: widget_count, widget_colour.',
      }]), 'Ownership');
      XLSX.writeFile(workbook, workbookPath);
      const [record] = buildOntologyRecordsFromWorkbook(workbookPath);
      expect(record.fields.filter((field) => field.field.identifying !== false).map((field) => field.field.name))
        .toEqual(['primary_evidence']);
    });
  });

  describe('generated matrix field lists end where the prompt\'s list ends', () => {
    const fields = (id: string) => VERIFICATION_DOCUMENT_MATRIX.find((doc) => doc.id === id)?.expectedFields ?? [];

    it('does not read the prose after the list as fields', () => {
      const all = VERIFICATION_DOCUMENT_MATRIX.flatMap((doc) => doc.expectedFields);
      // "…, and vice versa." / "…, not Measurement Date." / "If absent or expired,
      // flag — zero points" / "each clawback classified as…" / "state the variance"
      for (const artefact of ['vice', 'not', 'flag', 'each', 'state', 'distributions']) {
        expect(all, artefact).not.toContain(artefact);
      }
      expect(fields('esd__audited_financial_statements_or_signed_management_accounts_w')).toEqual([
        'cost_of_sales', 'operating_expenditure', 'capital_expenditure', 'finance_costs',
        'total_pre_exclusions_tmps', 'line_items_classified_as_procurement',
      ]);
    });

    it('keeps snake_case names that start with a digit, and the fields after them', () => {
      expect(fields('sed__stats_sa_quarterly_industry_statistics_verifiable_industry_n')).toEqual(expect.arrayContaining([
        'industry_norm_margin', '25_percent_norm', 'entity_revenue', 'indicative_npat', 'one_percent_target',
      ]));
    });

    it('reads a table\'s first column as a field', () => {
      expect(fields('ownership__securities_share_register')).toEqual(expect.arrayContaining([
        'total_shares_in_issue', 'holdings_table', 'shareholder_name', 'share_class', 'number_of_shares',
      ]));
    });
  });

  it('enriches noisy high-value matrix rows with canonical parser fields and aliases', () => {
    const records = buildOntologyRecordsFromWorkbook(createNoisyWorkbook());
    // Canonical dedup: the noisy row names collapse into the canonical types,
    // with the original noisy label preserved as an alias.
    const certificate = records.find((record) => record.document.name === 'B-BBEE Certificate');
    const schedule = records.find((record) => record.document.name === 'Supplier Spend Schedule');

    expect(certificate?.document.aliases).toEqual(expect.arrayContaining([
      'B-BBEE Certificate',
      'Supplier B-BBEE Certificate',
      'B-BBEE certificate or affidavit for each ESD/SD beneficiary entity',
    ]));
    expect(certificate?.fields.map((field) => field.field.name)).toEqual(expect.arrayContaining([
      'supplier_name',
      'bee_level',
      'black_ownership',
      'expiry_date',
    ]));
    expect(certificate?.fields.map((field) => field.field.name)).not.toContain('inspect');

    expect(schedule?.document.aliases).toEqual(expect.arrayContaining([
      'Supplier Spend Schedule',
      'Full supplier schedule',
    ]));
    expect(schedule?.fields.map((field) => field.field.name)).toEqual(expect.arrayContaining([
      'supplier_name',
      'spend_amount',
      'bee_level',
      'black_ownership',
    ]));
  });
});
