/**
 * Classification by CONTENT, not filename words (plan item 2.9a + 2.9b).
 *
 * On a real client pack both payroll PDFs became "EEA1 — Declaration by
 * Employee": the filename "Pay roll" normalised to two words, nothing in the
 * text said "payroll" (it says "Transaction History Report", "Employee", "Basic
 * Salary"), and "employee"/"employees" each counted for EEA1. The right type
 * never reached the adjudicator's 5-item shortlist, so the reader could not
 * choose it. A company profile ranked as a Skills Development schedule because
 * the alias "SED" matched inside "based".
 *
 * Every document below is SYNTHETIC — invented names and numbers — modelled on
 * the KIND of document in the pack. The adjudicator is a model call; here it is
 * always a stub.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { classifyDocument, contentConcepts } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook } from '../../graph/ontology_loader.js';
import { ParserService, adjudicationShortlist, needsAdjudication } from '../../parser/parser_service.js';
import {
  ADJUDICATION_MENU,
  type AdjudicationCandidate,
  type AdjudicationInput,
  type DocumentTypeAdjudicator,
} from '../../parser/type_adjudicator.js';
import { adjudicateDocumentType, resetAdjudicationCacheForTest } from '../../src/services/documentTypeAdjudication.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import type { DocumentClassification } from '../../schemas/document_types.js';

const PAYROLL = 'Payroll as at Measurement Date';
const EEA1 = 'EEA1 — Declaration by Employee (disabled employees)';
const EMP201 = 'SARS EMP201 submissions (monthly employer declarations)';
const MRL = 'Management representation letter confirming no undisclosed acquisition debt or options';
const SHARE_CERT = 'Share certificates / security certificates held by each BEE participant';
const SHARE_REGISTER = 'Securities / share register';
const OWNERSHIP_CONFIRMATION = 'Ownership Confirmation';
const CIPC = 'CIPC registration documents (COR14.1 / COR14.3)';

function doc(filename: string, raw_text: string) {
  return { file_id: `f_${filename}`, filename, mime_type: 'application/pdf', raw_text, tables: [], metadata: {} };
}

/** A payroll export as accounting software prints it — the word "payroll" appears nowhere. */
const PAYROLL_TEXT = [
  'Mokoena Freight CC',
  'Transaction History Report',
  '| Period: | 2025-10-31 to 2025-11-30 |',
  '| Number of employees: | 9 |',
  '| Employee | Basic Hourly Pay | Basic Salary |',
  '| Dlamini, Sipho | R 8 120,00 | R 0,00 |',
  '| Khoza, Lerato | R 0,00 | R 21 300,00 |',
  '| Ndlovu, Thabo | R 14 010,40 | R 0,00 |',
  '| Pillay, Anisha | R 0,00 | R 19 750,00 |',
  '| TOTAL | R 22 130,40 | R 41 050,00 |',
].join('\n');

/** The same report exported flat, the way a digital PDF's text layer reads. */
const SALARY_REPORT_TEXT = 'Mokoena Freight CC Transaction History Report Period: 2025-10-31 to 2025-11-30 '
  + 'Number of employees: 9 Employee Basic Hourly Pay Basic Salary Dlamini, Sipho R 8 120,00 R 0,00 '
  + 'Khoza, Lerato R 0,00 R 21 300,00 TOTAL R 22 130,40 R 41 050,00';

const EMP201_TEXT = [
  'SARS EMP201 Monthly Employer Declaration',
  'Employer: Mokoena Freight CC   PAYE reference 7012345678',
  'Period 2024/11',
  'PAYE R 18 402,00   SDL R 1 812,55   UIF R 1 450,10',
  'Leviable amount R 181 255,00',
  'Payment reference 7012345678LC202411',
].join('\n');

const COMPANY_PROFILE_TEXT = [
  'COMPANY PROFILE',
  'Mokoena Freight is a family-owned transport business based in Germiston and has been',
  'trading for 22 years. We are based on values of safety and service.',
  'Our services: general cartage, crane truck hire, machine moving, abnormal loads.',
  'Fleet: 14 rigid trucks, 3 crane trucks. Contact us: info@example.test',
].join('\n');

const MRL_TEXT = [
  'Mokoena Freight CC',
  '11 December 2025',
  'TO WHOM IT MAY CONCERN',
  'RE: Management Representation',
  'This letter serves to confirm that Mr S. Mokoena is the owner of Mokoena Freight CC and has been',
  'since its inception. We confirm that we are 100% black owned and that he is responsible for all',
  'decision making and the management of the operation.',
  'Yours faithfully, L. Mokoena, Admin Manager',
  'VAT Reg. No. 4000000000   Co.Reg. No. 2001/000000/23',
].join('\n');

const SHARE_CERT_TEXT = [
  'SHARE CERTIFICATE',
  'Authorised Shares: 1000',
  '| Certificate Number: | Class: | Number of Shares: |',
  '| MFR001 | Ordinary Shares | 100 |',
  'Company Name: Mokoena Freight CC   Company Registration Number: 2001 / 000000 / 23',
  'This is to certify that Sipho Mokoena is the registered holder of 100% shares in the above named company.',
  'Each share is recorded in the company\'s share register and is subject to the company\'s memorandum of incorporation.',
  'Given on behalf of the company, Director.',
].join('\n');

const SHARE_REGISTER_TEXT = [
  'SHARE REGISTER',
  '| COMPANY NAME: | Mokoena Freight CC |',
  '| REGISTRATION NUMBER: | 2001 / 000000 / 23 |',
  '| SHAREHOLDER NAME AND SURNAME | ID / REG NUMBER | CERTIFICATE NUMBER | NO OF SHARES ISSUED | CLASS SHARE | % SHARES | DATE ISSUED |',
  '| Sipho Mokoena | 7001015000000 | MFR001 | 100 | Ordinary | 100% | 2001-03-10 |',
].join('\n');

const BI_REGISTER_TEXT = [
  'BENEFICIAL INTEREST REGISTER',
  '| COMPANY NAME: | Mokoena Freight CC |',
  '| NUMBER: | 2001 / 000000 / 23 |',
  '| NAME AND SURNAME | ID / REG NUMBER | BENEFICIAL INTEREST | ACTIVE Y/N |',
  '| Sipho Mokoena | 7001015000000 | 100% | Y |',
  'Signed: Sipho Mokoena',
].join('\n');

const EEA1_TEXT = [
  'EEA1',
  'EMPLOYMENT EQUITY ACT, 1998',
  'DECLARATION BY EMPLOYEE',
  'Employee name: Lerato Khoza   Employee number: 0042',
  'Race: African   Gender: Female   Disability: No',
  'Signed by employee on 3 March 2025',
].join('\n');

const repositories = {
  bundled: () => new InMemoryOntologyRepository(),
  // The ontology the route's local fallback and the pack run build.
  workbook: async () => {
    const repo = new InMemoryOntologyRepository();
    await repo.upsertOntology(buildOntologyRecordsFromWorkbook('ontology/BBBEE_Verification_Document_Matrix_v3.xlsx'));
    return repo;
  },
};

describe.each(Object.entries(repositories))('classification by content (%s ontology)', (_label, makeRepo) => {
  async function classify(filename: string, text: string) {
    return classifyDocument(doc(filename, text) as never, await makeRepo());
  }

  it('reads a payroll export as payroll, not EEA1 — the filename says "Pay roll", the text never says payroll', async () => {
    const result = await classify('Pay roll Mar.pdf', PAYROLL_TEXT);
    expect(result.document_type).toBe(PAYROLL);
    expect(result.document_type).not.toBe(EEA1);
  });

  it('reads a salary report as payroll with a filename that says neither word', async () => {
    for (const filename of ['November Salary Report.pdf', 'scan_0091.pdf']) {
      const result = await classify(filename, SALARY_REPORT_TEXT);
      expect(result.document_type, filename).toBe(PAYROLL);
    }
  });

  it('reads EMP201 returns as EMP201 although the filename says "Skills Development"', async () => {
    const result = await classify('Skills Development Proof.pdf', EMP201_TEXT);
    expect(result.document_type).toBe(EMP201);
  });

  it('does not read "based" as the alias SED in a company profile', async () => {
    const result = await classify('COMPANY PROFILE v2.docx', COMPANY_PROFILE_TEXT);
    // There is no company-profile type: the honest outcome is "not identified".
    expect(result.status).toBe('low_confidence');
    for (const candidate of result.candidates ?? []) {
      expect(candidate.matched_evidence.map((e) => e.toLowerCase()), candidate.document_type).not.toContain('sed');
    }
    expect(result.document_type).not.toMatch(/SED|Skills Development expenditure/);
  });

  it('keeps EEA1 for a real EEA1 declaration', async () => {
    const result = await classify('EEA1.pdf', EEA1_TEXT);
    expect(result.document_type).toBe(EEA1);
  });

  it('keeps a CIPC registration document on its form code', async () => {
    const result = await classify('CIPC (3).pdf', 'CIPC Disclosure Certificate\nCOR14.3\nRegistration Number 2001/000000/23\nClose Corporation');
    expect(result.document_type).toBe(CIPC);
  });

  it('counts a singular and its plural as ONE word — "employee" does not score twice', async () => {
    const singular = await classify('x.pdf', 'Employee list\nEmployee: A. Person');
    const both = await classify('x.pdf', 'Employee list\nEmployee: A. Person\nNumber of employees: 1');
    const eea1 = (r: DocumentClassification) => r.ranked?.find((c) => c.document_type === EEA1)?.confidence ?? 0;
    expect(eea1(both)).toBeCloseTo(eea1(singular), 5);
  });

  it('weighs the filename below the text — a filename alone cannot classify', async () => {
    const result = await classify('EMP201 March 2025.pdf', 'Lunch Menu\nChicken sandwich: R85\nOrange juice: R30');
    expect(result.status).toBe('low_confidence');
    expect(result.document_type).toBe(EMP201);
    expect(result.candidates?.[0].evidence_basis).toBe('filename');
    // The same filename on the real return changes nothing about who wins.
    const onContent = await classify('scan_0001.pdf', EMP201_TEXT);
    const withName = await classify('EMP201 March 2025.pdf', EMP201_TEXT);
    expect(withName.document_type).toBe(onContent.document_type);
  });

  it('puts the share certificate type on the lexical shortlist of a share certificate', async () => {
    const result = await classify('Share Certificate MFR001 1 of 1.pdf', SHARE_CERT_TEXT);
    expect((result.candidates ?? []).map((c) => c.document_type)).toContain(SHARE_CERT);
  });
});

describe('contentConcepts', () => {
  it('names payroll from its columns, and not from a bank\'s "transaction history"', () => {
    expect(contentConcepts('Employee  Basic Salary')).toEqual(['payroll']);
    expect(contentConcepts('Transaction History Report  Employee  Basic Hourly Pay')).toEqual(['payroll']);
    expect(contentConcepts('Transaction History  Date  Description  Debit  Credit  Balance')).toEqual([]);
    // "Salaries and wages" is an expense line in every set of financial statements.
    expect(contentConcepts('Salaries and wages  1 204 000')).toEqual([]);
    // A document that already says payroll needs no concept word.
    expect(contentConcepts('Pay roll for November')).toEqual([]);
  });
});

describe('adjudication shortlist — the right type must be on the menu', () => {
  const repo = new InMemoryOntologyRepository();
  async function shortlistFor(filename: string, text: string) {
    const input = doc(filename, text);
    const classification = await classifyDocument(input as never, repo);
    return { classification, menu: adjudicationShortlist(input, classification).map((c) => c.document_type) };
  }

  const table: Array<[string, string, string, string]> = [
    ['payroll export', 'Pay roll Mar.pdf', PAYROLL_TEXT, PAYROLL],
    ['salary report', 'Acme November Salary Report.pdf', SALARY_REPORT_TEXT, PAYROLL],
    ['management representation letter', 'Management Representation letter.pdf', MRL_TEXT, MRL],
    ['share certificate', 'Share Certificate MFR001 1 of 1.pdf', SHARE_CERT_TEXT, SHARE_CERT],
    ['share register', 'Share Register.pdf', SHARE_REGISTER_TEXT, SHARE_REGISTER],
    ['beneficial interest register', 'BI Register.pdf', BI_REGISTER_TEXT, OWNERSHIP_CONFIRMATION],
    ['EMP201 return under a misleading name', 'Skills Development Proof.pdf', EMP201_TEXT, EMP201],
  ];

  for (const [label, filename, text, expected] of table) {
    it(`offers "${expected}" for a ${label}`, async () => {
      const { classification, menu } = await shortlistFor(filename, text);
      expect(menu).toContain(expected);
      expect(menu.length).toBeLessThanOrEqual(ADJUDICATION_MENU);
      // The lexical top 5 still lead the menu, in order.
      const lexical = (classification.candidates ?? []).filter((c) => c.confidence > 0).map((c) => c.document_type);
      expect(menu.slice(0, lexical.length)).toEqual(lexical);
      expect(new Set(menu).size).toBe(menu.length);
    });
  }

  it('widens past the lexical top 5 with content retrieval', async () => {
    // Retrieval adds types behind the keyword top 5. (The letter's own type used
    // to reach the menu only that way; since its "VAT Reg. No." footer stopped
    // counting as the alias VAT, it is in the keyword top 5 as well.)
    const { classification, menu } = await shortlistFor('Management Representation letter.pdf', MRL_TEXT);
    const lexical = (classification.candidates ?? []).map((c) => c.document_type);
    expect(menu).toContain(MRL);
    expect(menu.length).toBeGreaterThan(5);
    expect(menu.some((type) => !lexical.includes(type))).toBe(true);
  });
});

describe('when the adjudicator is asked', () => {
  const base: DocumentClassification = {
    document_type: 'X', pillar: 'OWN', confidence: 0.9, matched_evidence: [], status: 'classified',
    candidates: [{ document_type: 'X', pillar: 'OWN', confidence: 0.9, matched_evidence: [], reasons: [] }],
  };
  const withBasis = (basis: 'content' | 'alias' | 'filename' | 'sheet' | 'none', status = base.status): DocumentClassification => ({
    ...base,
    status,
    candidates: [{ ...base.candidates![0], evidence_basis: basis }],
  });

  it('always for undecided outcomes', () => {
    expect(needsAdjudication(withBasis('content', 'low_confidence'))).toBe(true);
    expect(needsAdjudication(withBasis('content', 'ambiguous'))).toBe(true);
  });

  it('for a confident pick that rests only on a label (alias or filename)', () => {
    expect(needsAdjudication(withBasis('alias'))).toBe(true);
    expect(needsAdjudication(withBasis('filename'))).toBe(true);
    expect(needsAdjudication(withBasis('none'))).toBe(true);
  });

  it('never for a confident pick backed by content or a sheet name, nor for a compendium', () => {
    expect(needsAdjudication(withBasis('content'))).toBe(false);
    expect(needsAdjudication(withBasis('sheet'))).toBe(false);
    expect(needsAdjudication(withBasis('alias', 'compendium'))).toBe(false);
    expect(needsAdjudication(withBasis('alias', 'unsupported'))).toBe(false);
  });
});

describe('ParserService with a stub adjudicator', () => {
  /** A stub reader that picks `want` when offered, records the menu, declines otherwise. */
  function stub(want: string) {
    const offered: string[][] = [];
    const adjudicator: DocumentTypeAdjudicator = vi.fn(async (_input: AdjudicationInput, candidates: AdjudicationCandidate[]) => {
      offered.push(candidates.map((c) => c.name));
      return candidates.some((c) => c.name === want)
        ? { documentType: want, confidence: 0.9, reason: 'stub: purpose matches' }
        : null;
    });
    return { adjudicator, offered };
  }

  const cases: Array<[string, string, string, string]> = [
    ['payroll export', 'Pay roll Mar.pdf', PAYROLL_TEXT, PAYROLL],
    ['management representation letter', 'Management Representation letter.pdf', MRL_TEXT, MRL],
    ['share certificate', 'Share Certificate MFR001 1 of 1.pdf', SHARE_CERT_TEXT, SHARE_CERT],
    ['share register', 'Share Register.pdf', SHARE_REGISTER_TEXT, SHARE_REGISTER],
  ];

  for (const [label, filename, text, expected] of cases) {
    it(`lets the reader land a ${label} on "${expected}"`, async () => {
      const { adjudicator, offered } = stub(expected);
      const result = await new ParserService(undefined, { adjudicator }).resolve(doc(filename, text));
      expect(adjudicator).toHaveBeenCalledTimes(1);
      expect(offered[0]).toContain(expected);
      expect(result.document_type).toBe(expected);
      expect(result.audit_trail.classification_reason).toMatch(/stub: purpose matches/);
    });
  }

  it('the payroll export is no longer read as EEA1, even when the reader declines', async () => {
    const result = await new ParserService(undefined, { adjudicator: async () => null }).resolve(doc('Pay roll Mar.pdf', PAYROLL_TEXT));
    expect(result.document_type).not.toBe(EEA1);
    expect(result.document_type).toBe(PAYROLL);
  });
});

describe('adjudicateDocumentType reads the whole widened menu', () => {
  beforeEach(() => resetAdjudicationCacheForTest());

  it(`shows the model up to ${ADJUDICATION_MENU} candidates and accepts a pick from the tail`, async () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      name: `Type ${String(i + 1).padStart(2, '0')}`,
      pillar: 'OWN',
      lexicalConfidence: 0.1,
      description: `Purpose of type ${i + 1}`,
      expectedFields: [],
    }));
    const complete = vi.fn(async () => '{"document_type":"Type 10","confidence":0.9,"reason":"its title"}');
    const model: ExtractionModel = { name: 'stub', complete };
    const verdict = await adjudicateDocumentType(model, { filename: 'x.pdf', raw_text: 'A document with enough text to read.' }, candidates);
    expect(verdict?.documentType).toBe('Type 10');
    const [, user] = complete.mock.calls[0] as unknown as [string, string];
    expect(user).toContain('"Type 10"');
    expect(user).not.toContain('"Type 11"');
  });
});
