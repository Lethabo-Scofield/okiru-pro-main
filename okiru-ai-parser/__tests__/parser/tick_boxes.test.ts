/**
 * Yes/no questions answered with boxes, decided by the mark beside each option.
 *
 * The trap this pins: on a scanned EEA1 someone writes "N/A" inside the
 * "Foreign Nationals" and "Person with a disability" boxes; the scan reports
 * the boxes as marked (☒), and a reader that sees the mark declares the person
 * a foreign national with a disability — which takes them out of every
 * employment equity count. The text below is shaped like Document
 * Intelligence's markdown of such a form; the person is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { applyTickBoxes, boxAnswer, decideFromBoxes, normaliseMarks } from '../../src/services/tickBoxes.js';
import { valueBesideLabel } from '../../src/services/agentExtraction.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import { extractionDomain } from '../../src/services/extractionDomain.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => resetExtractionCache());

const EEA1 = 'management_control__eea1_declaration_by_employee_disabled_employees';

const SCANNED_EEA1 = [
  '# DECLARATION BY EMPLOYEE (Confidential)',
  "'People with disabilities' are defined in the Act as people who have a long-term",
  'or recurring physical or mental impairment.',
  '1\\. Name of employee',
  'T.M. EXAMPLE',
  "3\\. Please indicate to which categories you belong with an 'X'",
  '☒',
  'below:',
  '| Male | Female |',
  '| --- | --- |',
  '| :selected: |  |',
  '| African | Coloured | Indian | White |',
  '| --- | --- | --- | --- |',
  '| :selected: |  |  |  |',
  'Foreign Nationals',
  '☒',
  'N/A',
  'If you are not a citizen by birth, please indicate the date you',
  'acquired your citizenship:',
  'Person with a disability*',
  '',
  '☒',
  '',
  'N/A',
  '',
  'If yes, specify nature of disability:',
  'N/A',
  'Signed:',
  'Date:',
  '01/02/25',
].join('\n');

const skillFor = (id: string) => extractionDomain('bbbee').skillFor(id);
const fieldOf = (name: string) => skillFor(EEA1)!.fields.find((f) => f.name === name)!;

describe('the boxes beside a label', () => {
  it('a ticked box is yes, an empty one no, and one that holds "N/A" is no', () => {
    expect(boxAnswer(' ☒ If yes, describe')?.value).toBe(true);
    expect(boxAnswer(': ☐ If yes, describe')?.value).toBe(false);
    expect(boxAnswer('* ☒ N/A If yes, specify')).toEqual({ value: false, why: 'its box holds "N/A", which is not a tick' });
    expect(boxAnswer(' ☒ n.a. ')?.value).toBe(false);
  });

  it('a Yes/No pair is decided by the one ticked box, and undecided otherwise', () => {
    expect(boxAnswer(' Yes ☐ No ☒')?.value).toBe(false);
    expect(boxAnswer(' ☒ Yes ☐ No')?.value).toBe(true);
    expect(boxAnswer(' Yes ☒ No ☒')).toBeUndefined();
    expect(boxAnswer(' Yes ☐ No ☐')).toBeUndefined();
  });

  it('no box right after the label decides nothing', () => {
    expect(boxAnswer(': N/A Signed')).toBeUndefined();
    expect(boxAnswer(', unless it is in line with the job ☒')).toBeUndefined();
  });

  it('reads Document Intelligence selection marks as boxes', () => {
    expect(normaliseMarks('| :selected: | :unselected: |')).toBe('☒ ☐');
  });
});

describe('an EEA1 whose boxes hold "N/A"', () => {
  it('is not a foreign national and declares no disability', () => {
    expect(decideFromBoxes(fieldOf('is_foreign'), SCANNED_EEA1)?.value).toBe(false);
    expect(decideFromBoxes(fieldOf('disability_declared'), SCANNED_EEA1)?.value).toBe(false);
  });

  it('never decides a field the form does not print (no labels): the Act\'s definition is a judgement', () => {
    expect(decideFromBoxes(fieldOf('ee_act_disability_definition_met'), SCANNED_EEA1)).toBeUndefined();
  });

  it('a box ticked without "N/A" is a yes', () => {
    const ticked = SCANNED_EEA1.replace('Foreign Nationals\n☒\nN/A', 'Foreign Nationals\n☒\n');
    expect(decideFromBoxes(fieldOf('is_foreign'), ticked)?.value).toBe(true);
  });

  it('overrules a model that read the marks as yes, and says so', () => {
    const extraction: DocumentExtraction = {
      documentId: EEA1, documentName: 'EEA1', sourceFile: 'eea1.pdf',
      values: [
        { field: 'is_foreign', value: true, sourceFile: 'eea1.pdf', sourceDocumentId: EEA1 },
        { field: 'disability_declared', value: 'Yes', sourceFile: 'eea1.pdf', sourceDocumentId: EEA1 },
      ],
      missingFields: [], unexpectedFields: [], exceptions: [],
    };
    applyTickBoxes([extraction], () => SCANNED_EEA1, skillFor);
    expect(extraction.values.find((v) => v.field === 'is_foreign')?.value).toBe(false);
    expect(extraction.values.find((v) => v.field === 'disability_declared')?.value).toBe(false);
    expect(extraction.exceptions.join('\n')).toMatch(/is_foreign: read as true, but beside "Foreign Nationals" its box holds "N\/A", which is not a tick, so it is no\./);
    expect(extraction.values.some((v) => v.field === 'ee_act_disability_definition_met')).toBe(false);
  });

  it('the agent\'s citation check reads the same box the same way', () => {
    const field = { name: 'is_foreign', labels: ['Foreign national'], type: 'bool' as const };
    expect(valueBesideLabel(field, true, 'Foreign national ☒ N/A If you are not a citizen')).toBe(false);
    expect(valueBesideLabel(field, false, 'Foreign national ☒ N/A If you are not a citizen')).toBe(true);
    expect(valueBesideLabel(field, true, 'Foreign national ☒ If you are not a citizen')).toBe(true);
  });

  it('runs inside extractCaseEntities, after the model read', async () => {
    const form: RawExtractionInput = {
      file_id: 'e1', filename: 'EEA1 example.pdf', mime_type: 'application/pdf', tables: [],
      metadata: { scanned: true, text_source: 'document_intelligence' },
      raw_text: SCANNED_EEA1, markdown: SCANNED_EEA1,
    };
    const model: ExtractionModel = {
      name: 'stub',
      async complete(_system, user) {
        if (!/EXPECTED JSON KEYS: [^\n]*is_foreign/.test(user)) return JSON.stringify({ not_this_document: true });
        return JSON.stringify({ employee_name: 'T.M. EXAMPLE', race: 'African', gender: 'Male', is_foreign: true, disability_declared: true });
      },
    };
    const result = await extractCaseEntities([form], model);
    const values = result!.extractions.flatMap((e) => e.values);
    expect(values.find((v) => v.field === 'is_foreign')?.value).toBe(false);
    expect(values.find((v) => v.field === 'disability_declared')?.value).toBe(false);
  });
});
