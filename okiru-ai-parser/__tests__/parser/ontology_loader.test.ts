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

describe('ontology loader', () => {
  it('builds records from workbook sheets', () => {
    const records = buildOntologyRecordsFromWorkbook(createWorkbook());
    expect(records).toHaveLength(1);
    expect(records[0].pillar.name).toBe('ESD');
    expect(records[0].document.name).toBe('Supplier B-BBEE Certificate');
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
});
