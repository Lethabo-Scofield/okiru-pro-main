/**
 * A skill's contract answers a wrong document with nulls and a reason. A reply
 * that gives the reason ("Document is a Beneficial Interest Register, not a
 * CIPC COR14.1") but returns values anyway is still a wrong-type read: its
 * values describe another document under this type's field names (a beneficial
 * owner's ID and 100% as CIPC directors). The code enforces the contract the
 * prompt states — for skill reads only, and only when the exception names THIS
 * type as what the document is not. All values are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractWithSpec, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { resetSkillsCache } from '../../src/services/skills.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';

const CIPC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'ownership__cipc_registration_documents_cor14_1_cor14_3')!;
const SHARE_REGISTER = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'ownership__securities_share_register')!;
const ETHICS = ESG_DOCUMENT_MATRIX.find((d) => d.id === 'ethics_compliance__ethics_whistleblower_policy_and_register')!;
const MOI = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'ownership__memorandum_of_incorporation_moi')!;

const ENV_KEYS = ['AI_EXTRACTION_SWEEP', 'AI_EXTRACTION_CACHE', 'PARSER_SKILLS'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.AI_EXTRACTION_SWEEP = 'false';
  process.env.AI_EXTRACTION_CACHE = 'false';
  resetSkillsCache();
  resetExtractionCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetSkillsCache();
  resetExtractionCache();
});

function replying(reply: Record<string, unknown>): ExtractionModel {
  return { name: 'fake', complete: vi.fn(async () => JSON.stringify(reply)) };
}

const register = {
  filename: 'Register.pdf',
  raw_text: 'BENEFICIAL INTEREST REGISTER\nAcme Trading (Pty) Ltd 2015/123456/07\nJ Doe 8001015009087 100%',
  markdown: 'BENEFICIAL INTEREST REGISTER\nAcme Trading (Pty) Ltd 2015/123456/07\nJ Doe 8001015009087 100%',
};

describe('a skill read that says the document is another type keeps no values', () => {
  it('the CIPC skill on a beneficial interest register', async () => {
    const result = await extractWithSpec(replying({
      entity_name: 'Acme Trading (Pty) Ltd',
      director_rows: [{ full_name: 'J Doe', id_number: '8001015009087' }],
      exceptions: ['Document is a Beneficial Interest Register, not a CIPC COR14.1 / COR14.3; per instructions all fields returned from this document only.'],
    }), CIPC, register);
    expect(result.values).toEqual([]);
    expect(result.exceptions.join(' ')).toMatch(/not a CIPC/);
  });

  it('the share-register skill on a beneficial interest register', async () => {
    const result = await extractWithSpec(replying({
      holdings_table: [{ holder_name: 'J Doe', shares_held: '100' }],
      exceptions: ['Document is a Beneficial Interest Register, not a Securities (share) register under section 50.'],
    }), SHARE_REGISTER, register);
    expect(result.values).toEqual([]);
  });
});

describe('values stay when the exception is not a wrong-type statement about this type', () => {
  it('a reservation about the copy, not the type', async () => {
    const result = await extractWithSpec(replying({
      entity_name: 'Acme Trading (Pty) Ltd',
      exceptions: ['Document is a certified copy, not an original CIPC certificate.'],
    }), CIPC, register);
    expect(result.values.map((v) => v.field)).toContain('entity_name');
  });

  it('the document IS this type and only lacks one part of it (a code of ethics, "not an incident register")', async () => {
    // The ESG spec covers the code, the whistleblower policy AND the incident
    // register. A code of conduct is the first of those: "not an incident
    // register" says which part is absent, not that this is another document.
    const code = {
      filename: 'Acme Code of Conduct.pdf',
      raw_text: 'ACME GROUP CODE OF CONDUCT AND ETHICS\nRevision 2\nEthics hotline: Example Line 0800 000 000 (anonymous)',
      markdown: 'ACME GROUP CODE OF CONDUCT AND ETHICS\nRevision 2\nEthics hotline: Example Line 0800 000 000 (anonymous)',
    };
    const result = await extractWithSpec(replying({
      policy_title: 'Acme Group Code of Conduct and Ethics',
      policy_version: 'Revision 2',
      whistleblower_hotline_provider: 'Example Line',
      exceptions: ['Document is a code of conduct (not an incident register); incident counts are not given.'],
    }), ETHICS, code, { domain: 'esg' });
    expect(result.values.map((v) => v.field)).toEqual(expect.arrayContaining(['policy_title', 'policy_version', 'whistleblower_hotline_provider']));
  });

  it('a generic word ("a report of fuel issues") never makes another document this type', async () => {
    const result = await extractWithSpec(replying({
      policy_title: 'Fuel issues',
      exceptions: ['Document is a report of fuel issues, not a code of ethics or whistleblower policy.'],
    }), ETHICS, { filename: 'Fuel.pdf', raw_text: 'Fuel issues per vehicle', markdown: 'Fuel issues per vehicle' }, { domain: 'esg' });
    expect(result.values).toEqual([]);
  });

  it('a spec without a skill is read as before', async () => {
    const result = await extractWithSpec(replying({
      share_classes_defined: 'Ordinary',
      exceptions: ['Document is an ownership spreadsheet, not an MOI.'],
    }), MOI, register);
    expect(result.values.map((v) => v.field)).toContain('share_classes_defined');
  });

  it('with skills off the CIPC read keeps its values, as before', async () => {
    process.env.PARSER_SKILLS = 'off';
    resetSkillsCache();
    const result = await extractWithSpec(replying({
      entity_name: 'Acme Trading (Pty) Ltd',
      exceptions: ['Document is a Beneficial Interest Register, not a CIPC COR14.1.'],
    }), CIPC, register);
    expect(result.values.map((v) => v.field)).toContain('entity_name');
  });
});
