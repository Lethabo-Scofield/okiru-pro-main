/**
 * An ESG document whose type Pass A named from the skills menu is read with
 * that type's spec — the same rule as B-BBEE (caseExtraction). Without this the
 * ESG pick reached the menu and was then thrown away, and retrieval chose the
 * spec as if no type had been named. With no ESG skills (today) nothing
 * changes. All values are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/services/documentClassification.js', async (orig) => ({
  ...(await orig<typeof import('../../src/services/documentClassification.js')>()),
  classifyDocument: vi.fn(async () => null),
}));
vi.mock('../../src/services/aiExtraction.js', async (orig) => ({
  ...(await orig<typeof import('../../src/services/aiExtraction.js')>()),
  extractDocument: vi.fn(async () => []),
}));

import { classifyDocument } from '../../src/services/documentClassification.js';
import { extractDocument, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractEsgCaseEntities } from '../../src/services/esgCaseExtraction.js';
import { resetSkillsCache } from '../../src/services/skills.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');
const model = {} as ExtractionModel;
const scan = { filename: 'Scan 0042.pdf', markdown: 'Invented signal. Reporting period: Mar 2025 - Feb 2026.', raw_text: 'Invented signal. Reporting period: Mar 2025 - Feb 2026.' } as unknown as RawExtractionInput;
const readWith = () => vi.mocked(extractDocument).mock.calls[0]?.[2] as { specIds?: string[]; elementOverride?: string; domain?: string } | undefined;

let savedDir: string | undefined;
let root = '';
const spec = ESG_DOCUMENT_MATRIX.find((d) => d.element === 'GHG_ENERGY')!;

beforeEach(() => {
  savedDir = process.env.PARSER_SKILLS_DIR;
  root = mkdtempSync(path.join(tmpdir(), 'okiru-skills-'));
  cpSync(path.join(parserRoot, 'skills', 'bbbee'), path.join(root, 'bbbee'), { recursive: true });
  mkdirSync(path.join(root, 'esg'));
  writeFileSync(path.join(root, 'esg', 'invented_esg_skill.md'), [
    '---',
    'id: invented_esg_skill',
    `appliesTo: [${spec.id}]`,
    `element: ${spec.element}`,
    'version: 1',
    'classify: { is: "An invented ESG evidence type for this test.", isNot: ["anything else"], filenameHints: ["invented"], contentSignals: ["Invented signal"] }',
    'fields:',
    '  - { name: reporting_period, type: text, required: true, labels: ["Reporting period"], description: "The period the evidence covers, as printed." }',
    '---',
    '## What it is / is not',
    'An invented type.',
    '## Where values sit',
    'In the header.',
    '## Traps',
    '- None worth naming.',
    '## Worked example',
    '{"reporting_period": "Mar 2025 - Feb 2026", "exceptions": []}',
    '',
  ].join('\n'));
  process.env.PARSER_SKILLS_DIR = root;
  resetSkillsCache();
  vi.mocked(extractDocument).mockClear();
  vi.mocked(classifyDocument).mockReset();
});

afterEach(() => {
  if (savedDir === undefined) delete process.env.PARSER_SKILLS_DIR;
  else process.env.PARSER_SKILLS_DIR = savedDir;
  resetSkillsCache();
  rmSync(root, { recursive: true, force: true });
});

describe('an ESG type named by Pass A picks the spec', () => {
  it('reads the document with the named type\'s spec, not retrieval\'s pick', async () => {
    vi.mocked(classifyDocument).mockResolvedValue({ element: spec.element, documentType: 'Invented', confidence: 0.9, skillId: 'invented_esg_skill' } as never);
    await extractEsgCaseEntities([scan], model);
    expect(readWith()).toMatchObject({ specIds: [spec.id], domain: 'esg' });
  });

  it('with no type named, retrieval decides under the element, as before', async () => {
    vi.mocked(classifyDocument).mockResolvedValue({ element: spec.element, documentType: 'Invented', confidence: 0.9 } as never);
    await extractEsgCaseEntities([scan], model);
    expect(readWith()).toEqual({ elementOverride: spec.element, domain: 'esg' });
  });
});
