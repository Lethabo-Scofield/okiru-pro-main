/**
 * A group policy filed under another element keeps its policy header. Pass A
 * types an employment-equity policy as employment-equity evidence (an EE
 * plan); the plan reader rightly finds no plan in it and the policy's title,
 * revision, dates, author and approver were lost. A policy, code or charter
 * that no read took as a policy is now also read with the generic policy
 * reader. Stub model; every name and date is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractEsgCaseEntities, needsPolicyHeaderRead } from '../../src/services/esgCaseExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { resetClassificationCacheForTest } from '../../src/services/documentClassification.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => {
  resetExtractionCache();
  resetClassificationCacheForTest();
  process.env.AI_EXTRACTION_SWEEP = 'false';
  process.env.AI_EXTRACTION_CACHE = 'false';
});

const policyText = [
  '## Page 1',
  'Employment Equity and Workplace Diversity Policy',
  'Policy Title Example Group Employment Equity Policy Revision 2',
  'Author A Person Date issued 25 January 2021',
  'Reviewed & Approved by Example Group Executive Committee Date Reviewed 30 January 2023',
  'Disclosure Internal Use Only',
  '## Page 2',
  'SCOPE OF APPLICATION: all companies of the group.',
].join('\n');

const policy: RawExtractionInput = {
  file_id: 'p1', filename: 'Example EE policy.pdf', mime_type: 'application/pdf',
  raw_text: policyText, markdown: policyText, tables: [], metadata: {},
};

function extraction(documentId: string, fields: Record<string, unknown>): DocumentExtraction {
  return {
    documentId, documentName: documentId, sourceFile: policy.filename, missingFields: [], unexpectedFields: [], exceptions: [],
    values: Object.entries(fields).map(([field, value]) => ({ field, value, sourceFile: policy.filename, sourceDocumentId: documentId })),
  };
}

describe('needsPolicyHeaderRead', () => {
  const cls = (documentType: string) => ({ element: 'EMPLOYMENT_EQUITY' as const, documentType, confidence: 0.9, skillId: 'ee_plan' });

  it('a policy that no read took as a policy needs the policy read', () => {
    expect(needsPolicyHeaderRead(policy, cls('Employment Equity & Workplace Diversity Policy'), [])).toBe(true);
    // The plan reader read something, but not as a policy.
    expect(needsPolicyHeaderRead(policy, cls('EE policy'), [extraction('employment_equity__ee_plan_and_forum_minutes', { ee_plan_start_date: '01/09/2023' })])).toBe(true);
  });

  it('a policy already read by a reader that asks for its title does not', () => {
    expect(needsPolicyHeaderRead(policy, cls('Policy'), [extraction('ethics_compliance__ethics_whistleblower_policy_and_register', { policy_title: 'Code' })])).toBe(false);
    expect(needsPolicyHeaderRead(policy, cls('Policy'), [extraction('policy_document', { policy_title: 'EE Policy' })])).toBe(false);
  });

  it('a document that is no policy, code or charter does not', () => {
    const plan = { filename: 'EE plan.pdf', markdown: 'FORM EEA13 Employment Equity Plan\nNumerical goals', raw_text: '' };
    expect(needsPolicyHeaderRead(plan, cls('Employment Equity plan'), [])).toBe(false);
  });

  it('a header table naming a policy title is enough, whatever the label', () => {
    const anonymous = { filename: 'Scan 0001.pdf', markdown: policyText, raw_text: '' };
    expect(needsPolicyHeaderRead(anonymous, null, [])).toBe(true);
  });
});

describe('an EE policy typed as an EE plan', () => {
  it('is also read with the policy reader and keeps its header', async () => {
    const asked: string[] = [];
    const model: ExtractionModel = {
      name: 'stub',
      complete: async (system: string, user: string) => {
        if (/"document_type_id"/.test(system) || /Classify|classif/i.test(system.slice(0, 400))) {
          asked.push('passA');
          return JSON.stringify({ element: 'EMPLOYMENT_EQUITY', document_type: 'Employment Equity & Workplace Diversity Policy', document_type_id: 'ee_plan', confidence: 0.9 });
        }
        if (user.includes('SKILL: ee_plan')) {
          asked.push('ee_plan');
          return JSON.stringify({ exceptions: ['Document is an employment equity policy, not an EE plan.'] });
        }
        if (user.includes('SKILL: policy_document')) {
          asked.push('policy_document');
          return JSON.stringify({
            policy_title: 'Example Group Employment Equity Policy', policy_version: 'Revision 2',
            policy_issue_date: '25 January 2021', board_approval_date: '30 January 2023', policy_author: 'A Person',
            policy_approved_by: 'Example Group Executive Committee', policy_disclosure: 'Internal Use Only', exceptions: [],
          });
        }
        return '{}';
      },
    };
    const result = await extractEsgCaseEntities([policy], model);
    expect(asked).toContain('ee_plan');
    expect(asked).toContain('policy_document');
    const read = result!.extractions.find((e) => e.documentId === 'policy_document');
    expect(read?.values.map((v) => v.field)).toEqual(expect.arrayContaining(['policy_title', 'policy_version', 'board_approval_date', 'policy_author']));
  });
});
