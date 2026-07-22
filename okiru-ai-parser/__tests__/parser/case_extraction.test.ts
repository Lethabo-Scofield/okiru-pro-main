/**
 * Case-level extraction across mixed formats.
 *
 * The requirement this pins: a client's evidence for one fact arrives spread
 * across a PDF, a spreadsheet and a deck, and the system must still end up with
 * one answer per fact — with every value traceable to the file it came from.
 *
 * The model is faked, so this runs offline and asserts the plumbing rather than
 * the model's judgement.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
beforeEach(() => resetExtractionCache());
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

function input(over: Partial<RawExtractionInput> & { filename: string }): RawExtractionInput {
  return {
    file_id: over.filename,
    mime_type: 'application/octet-stream',
    raw_text: '',
    tables: [],
    metadata: {},
    ...over,
  };
}

/** Answers based on which spec is being asked about and which file is attached. */
function modelFor(answers: Array<{ whenKeys: string; whenFile: string; reply: Record<string, unknown> }>): ExtractionModel {
  return {
    name: 'fake-deployment',
    async complete(_system, user) {
      const match = answers.find((a) => user.includes(`EXPECTED JSON KEYS: ${a.whenKeys}`) && user.includes(a.whenFile));
      return JSON.stringify(match?.reply ?? { not_this_document: true });
    },
  };
}

describe('extracting a case whose evidence spans several formats', () => {
  const files = [
    input({
      filename: 'Thandanani Share Register.pdf',
      raw_text: 'Securities / share register as at measurement date. Total shares in issue 100.',
    }),
    input({
      filename: 'BEE Information Gathering File.xlsm',
      raw_text: 'EEA2 forms submitted to the Department of Labour for the reporting period',
      markdown: '| Level | African | White |\n| --- | --- | --- |\n| Top | 0 | 1 |',
    }),
    input({
      filename: 'B-BBEE Strategy Pack_Nov25.pptx',
      raw_text: 'SETA registration certificate confirmed for the entity',
    }),
  ];

  it('pulls entities out of PDF, spreadsheet and deck alike', async () => {
    const model = modelFor([
      { whenKeys: 'total_shares_in_issue', whenFile: 'Share Register.pdf', reply: { total_shares_in_issue: 100, holdings_table: [{ shareholder_name: 'T Mokoena', number_of_shares: 100 }] } },
      { whenKeys: 'reporting_period', whenFile: 'Information Gathering File.xlsm', reply: { reporting_period: '2025', submission_date: '2025-01-15' } },
      { whenKeys: 'entity_name', whenFile: 'Strategy Pack_Nov25.pptx', reply: { entity_name: 'Thandanani Transport', seta_name: 'TETA' } },
    ]);

    const result = await extractCaseEntities(files, model);

    expect(result).not.toBeNull();
    // The format the value arrived in is irrelevant by this point — everything
    // was markdown by the time extraction saw it.
    const sourceFiles = new Set(Object.values(result!.fields).flatMap((f) => f.sources));
    expect(sourceFiles.has('Thandanani Share Register.pdf')).toBe(true);
    expect(sourceFiles.has('BEE Information Gathering File.xlsm')).toBe(true);
    expect(sourceFiles.has('B-BBEE Strategy Pack_Nov25.pptx')).toBe(true);

    expect(result!.fields.total_shares_in_issue?.value).toBe(100);
    expect(result!.fields.entity_name?.value).toBe('Thandanani Transport');
    expect(result!.model).toBe('fake-deployment');
  });

  it('keeps every value traceable to its file', async () => {
    const model = modelFor([
      { whenKeys: 'total_shares_in_issue', whenFile: 'Share Register.pdf', reply: { total_shares_in_issue: 100 } },
    ]);

    const result = await extractCaseEntities(files, model);

    expect(result!.fields.total_shares_in_issue.sources).toEqual(['Thandanani Share Register.pdf']);
    for (const extraction of result!.extractions) {
      for (const value of extraction.values) {
        expect(value.sourceFile).toBeTruthy();
        expect(value.sourceDocumentId).toBeTruthy();
      }
    }
  });

  it('names the files it got nothing from, so they can be chased', async () => {
    const model = modelFor([
      { whenKeys: 'total_shares_in_issue', whenFile: 'Share Register.pdf', reply: { total_shares_in_issue: 100 } },
    ]);

    const result = await extractCaseEntities(files, model);

    // Everything the model declined on is reported rather than quietly dropped.
    expect(result!.filesWithNoExtraction).toContain('B-BBEE Strategy Pack_Nov25.pptx');
  });

  it('carries the whole chain through to calculator inputs', async () => {
    // document → entities → resolved case → allowlisted calculator payload.
    // This is the chain that turns an uploaded PDF into a number on a scorecard.
    const model: ExtractionModel = {
      name: 'fake',
      async complete(_system, user) {
        if (!user.includes('EXPECTED JSON KEYS: entity_name')) return JSON.stringify({ not_this_document: true });
        return JSON.stringify({ entity_name: 'Thandanani Transport', seta_name: 'TETA' });
      },
    };

    const result = await extractCaseEntities(files, model);

    expect(result!.calculator.payload['ownership.entity_name']).toBe('Thandanani Transport');
    const entry = result!.calculator.entries.find((e) => e.key === 'ownership.entity_name')!;
    expect(entry.sourceFiles.length).toBeGreaterThan(0);
    // seta_name is real evidence with no calculator key — reported, not dropped.
    expect(result!.calculator.unmapped.some((u) => u.field === 'seta_name')).toBe(true);
  });

  it('is skipped entirely when no model is configured', async () => {
    // A missing API key must never turn a working upload into a failed one.
    expect(await extractCaseEntities(files, null)).toBeNull();
  });

  it('survives a file that makes the model throw', async () => {
    let calls = 0;
    const flaky: ExtractionModel = {
      name: 'flaky',
      // Fails the first call, then answers whichever schema it is asked for —
      // the recovering calls are for other documents, so a fixed reply would not
      // match their fields.
      async complete(_system, user) {
        calls += 1;
        if (calls === 1) throw new Error('500 from provider');
        const firstKey = user.match(/EXPECTED JSON KEYS: ([a-zA-Z0-9_]+)/)?.[1];
        return JSON.stringify(firstKey ? { [firstKey]: 'recovered value' } : { not_this_document: true });
      },
    };

    const result = await extractCaseEntities(files, flaky);

    // The failure is recorded, and the rest of the paid-for case still extracts.
    expect(result).not.toBeNull();
    expect(result!.extractions.some((e) => e.error)).toBe(true);
    expect(Object.keys(result!.fields).length).toBeGreaterThan(0);
  });

  it('returns null rather than an empty shell when nothing matched at all', async () => {
    const nothing: ExtractionModel = {
      name: 'none',
      async complete() { return JSON.stringify({ not_this_document: true }); },
    };

    const result = await extractCaseEntities([input({ filename: 'lunch.pdf', raw_text: 'lunch receipt' })], nothing);
    expect(result).toBeNull();
  });
});
