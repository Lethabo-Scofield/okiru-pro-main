import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, loadOntologyFromWorkbook } from '../../graph/ontology_loader.js';

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
