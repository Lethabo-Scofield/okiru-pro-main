/**
 * Two classifications wave 1 lost on a real client pack, while the values read
 * from those documents held.
 *
 * 1. An SED proof-of-payment bundle — a community organisation's invoices for
 *    a monthly contribution, each followed by the bank's payment confirmation —
 *    ranked 0.56 as "Invoices / internal accounting records — each training
 *    event". The matrix keeps the bare word "Invoices" as an alias of that type,
 *    and once plurals folded it matched the page title INVOICE at the weight of
 *    a document naming itself. The adjudicator followed the keyword score.
 * 2. A close corporation's beneficial interest register (members and their
 *    percentage interest, no shares) was offered both "Ownership Confirmation"
 *    and the matrix's "Securities / share register" once the menu widened, and
 *    was read as a share register: nothing in the ontology knew the register's
 *    title, and Ownership Confirmation's purpose line claimed share registers
 *    and certificates itself.
 *
 * Every document below is SYNTHETIC — invented names and numbers — shaped like
 * the KIND of document in the pack. The adjudicator is always a stub.
 */
import { describe, expect, it, vi } from 'vitest';
import { classifyDocument } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook } from '../../graph/ontology_loader.js';
import { ParserService, adjudicationShortlist } from '../../parser/parser_service.js';
import type { AdjudicationCandidate, DocumentTypeAdjudicator } from '../../parser/type_adjudicator.js';

const TRAINING_INVOICES = 'Invoices / internal accounting records — each training event';
const SED_PROOF_OF_PAYMENT = 'Proof of payment — cash grants, donations, or monetary contributions';
const OWNERSHIP_CONFIRMATION = 'Ownership Confirmation';
const SHARE_REGISTER = 'Securities / share register';
const SHARE_CERT = 'Share certificates / security certificates held by each BEE participant';
const PAYROLL = 'Payroll as at Measurement Date';
const EMP201 = 'SARS EMP201 submissions (monthly employer declarations)';

function doc(filename: string, raw_text: string) {
  return { file_id: `f_${filename}`, filename, mime_type: 'application/pdf', raw_text, tables: [], metadata: {} };
}

/** One invoice from a community organisation, then the bank's record of paying it. */
function invoiceAndPayment(invoiceNo: string, date: string, paid: string): string {
  return [
    'Ubuntu Community Care',
    'NPC 2019/123456/08',
    '14 Example Street, Sampleton',
    'To:',
    'Acme Trading CC',
    '22 Main Road, Sampleton',
    'UBUNTU COMMUNITY CARE',
    'INVOICE',
    invoiceNo,
    `Date: ${date}`,
    'Ref: Monthly Contribution',
    'Co-ordinator | Job | Payment terms | Due date',
    'N. Example | Monthly Contribution |  | 7 Days',
    'Qty | Description | Unit price | Line total',
    '1 | Monthly Contribution | R750.00 | R750.00',
    'Subtotal: R750.00',
    'Total: R750.00',
    'Banking Details',
    'Ubuntu Community Care',
    'Example Bank Sampleton',
    'Acc: 1234567890',
    `Ref: ${invoiceNo.replace(/\s/g, '')}`,
    '',
    'From account name | Acme Trading CC',
    'My reference | Ubuntu Community Care',
    "Recipient's reference | Acme Trading",
    'Recipient bank | EXAMPLE BANK',
    'Amount | R750.00',
    `Payment date | ${paid}`,
    'Reference number | 20250101/Example/000000000001',
  ].join('\n');
}

const SED_PAYMENT_BUNDLE = [
  invoiceAndPayment('INV 0101', '25/02/2025', '04/03/2025'),
  invoiceAndPayment('INV 0087', '26/08/2024', '27/08/2024'),
].join('\n\n');

/** A training provider's invoice: the word INVOICE with the qualifier the type is named for. */
const TRAINING_INVOICE_TEXT = [
  'Example Skills Academy',
  'TAX INVOICE',
  'INV 2201   Date: 12/03/2025',
  'Bill to: Acme Trading CC',
  'Training event: First Aid Level 1 (2 days), 10–11 March 2025',
  'Delegates: 6   Rate per delegate: R1 450.00',
  'Total excl. VAT: R8 700.00',
  'Your accounting reference: TRN-0042',
].join('\n');

const BI_REGISTER_TEXT = [
  'BENEFICIAL INTEREST REGISTER',
  '| COMPANY NAME: | Acme Trading CC |',
  '| NUMBER: | 2001 / 000000 / 23 |',
  '| REGISTRATION DATE: | 10 March 2001 |',
  '| STREET ADDRESS: | 22 Main Road, Sampleton |',
  '| NAME AND SURNAME | ID / REG NUMBER | ADDRESS | % BENEFICIAL INTEREST | ACTIVE Y/N |',
  '| Sipho Example | 7001015000000 | 22 Main Road, Sampleton | 100% | Y |',
  'Signed: Sipho Example (Member)',
].join('\n');

const SHARE_REGISTER_TEXT = [
  'SHARE REGISTER',
  '| COMPANY NAME: | Acme Trading (Pty) Ltd |',
  '| REGISTRATION NUMBER: | 2001 / 000000 / 07 |',
  '| SHAREHOLDER NAME AND SURNAME | ID / REG NUMBER | CERTIFICATE NUMBER | NO OF SHARES ISSUED | CLASS SHARE | % SHARES | DATE ISSUED |',
  '| Sipho Example | 7001015000000 | ACM001 | 100 | Ordinary | 100% | 2001-03-10 |',
].join('\n');

const SHARE_CERT_TEXT = [
  'SHARE CERTIFICATE',
  'Authorised Shares: 1000',
  '| Certificate Number: | Class: | Number of Shares: |',
  '| ACM001 | Ordinary Shares | 100 |',
  'Company Name: Acme Trading (Pty) Ltd   Company Registration Number: 2001 / 000000 / 07',
  'This is to certify that Sipho Example is the registered holder of 100% shares in the above named company.',
  "Each share is recorded in the company's share register and is subject to the company's memorandum of incorporation.",
].join('\n');

const PAYROLL_TEXT = [
  'Acme Trading CC',
  'Transaction History Report',
  '| Period: | 2025-10-31 to 2025-11-30 |',
  '| Number of employees: | 9 |',
  '| Employee | Basic Hourly Pay | Basic Salary |',
  '| Example, Sipho | R 8 120,00 | R 0,00 |',
  '| Example, Lerato | R 0,00 | R 21 300,00 |',
  '| Example, Thabo | R 14 010,40 | R 0,00 |',
  '| Example, Anisha | R 0,00 | R 19 750,00 |',
  '| TOTAL | R 22 130,40 | R 41 050,00 |',
].join('\n');

const EMP201_TEXT = [
  'SARS EMP201 Monthly Employer Declaration',
  'Employer: Acme Trading CC   PAYE reference 7012345678',
  'Period 2024/11',
  'PAYE R 18 402,00   SDL R 1 812,55   UIF R 1 450,10',
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

describe.each(Object.entries(repositories))('a one-word piece of a type name is a genre, not the type (%s ontology)', (_label, makeRepo) => {
  async function classify(filename: string, text: string) {
    return classifyDocument(doc(filename, text) as never, await makeRepo());
  }

  it('does not read an SED proof-of-payment bundle as training-event invoices because it says INVOICE', async () => {
    const result = await classify('scan_0042.pdf', SED_PAYMENT_BUNDLE);
    const training = result.ranked?.find((c) => c.document_type === TRAINING_INVOICES);
    // The bare "Invoices" is not the type naming itself: no alias evidence, and
    // it no longer outranks the proof-of-payment types by a decisive margin.
    expect(training?.matched_evidence ?? []).not.toContain('Invoices');
    expect(training?.reasons.join(' ') ?? '').not.toMatch(/exact alias\/name matched: Invoices/);
    expect(result.document_type).not.toBe(TRAINING_INVOICES);
    const sedProof = result.ranked?.find((c) => c.document_type === SED_PROOF_OF_PAYMENT);
    expect(sedProof?.confidence ?? 0).toBeGreaterThan(training?.confidence ?? 0);
    // …and the reader is offered the SED proof-of-payment type.
    const menu = adjudicationShortlist(doc('scan_0042.pdf', SED_PAYMENT_BUNDLE), result).map((c) => c.document_type);
    expect(menu).toContain(SED_PROOF_OF_PAYMENT);
  });

  it('still counts the word as a word of the type name', async () => {
    const result = await classify('scan_0042.pdf', SED_PAYMENT_BUNDLE);
    const training = result.ranked?.find((c) => c.document_type === TRAINING_INVOICES);
    expect(training?.matched_evidence).toContain('invoice');
    expect(training?.confidence ?? 0).toBeGreaterThan(0);
  });

  it('lets the word name its type when the rest of the name is there — a training invoice is still one', async () => {
    const result = await classify('scan_0043.pdf', TRAINING_INVOICE_TEXT);
    expect(result.document_type).toBe(TRAINING_INVOICES);
    expect(result.candidates?.[0].reasons.join(' ')).toMatch(/exact alias\/name matched: Invoices/);
  });

  it('keeps a code alias decisive — EMP201 is a name, not a genre', async () => {
    const result = await classify('scan_0001.pdf', EMP201_TEXT);
    expect(result.document_type).toBe(EMP201);
    expect(result.candidates?.[0].reasons.join(' ')).toMatch(/exact alias\/name matched/);
  });

  it('keeps the payroll export on payroll', async () => {
    const result = await classify('Pay roll Mar.pdf', PAYROLL_TEXT);
    expect(result.document_type).toBe(PAYROLL);
  });
});

describe.each(Object.entries(repositories))('a beneficial interest register confirms ownership (%s ontology)', (_label, makeRepo) => {
  async function classify(filename: string, text: string) {
    return classifyDocument(doc(filename, text) as never, await makeRepo());
  }

  it('is read as Ownership Confirmation by its own title, from its content', async () => {
    const result = await classify('scan_0007.pdf', BI_REGISTER_TEXT);
    expect(result.document_type).toBe(OWNERSHIP_CONFIRMATION);
    expect(result.candidates?.[0].evidence_basis).toBe('content');
    expect(result.candidates?.[0].reasons.join(' ')).toMatch(/Beneficial Interest Register/);
  });

  it('leads the adjudication menu, with the share-register type still offered behind it', async () => {
    const input = doc('scan_0007.pdf', BI_REGISTER_TEXT);
    const classification = await classifyDocument(input as never, await makeRepo());
    const menu = adjudicationShortlist(input, classification).map((c) => c.document_type);
    expect(menu[0]).toBe(OWNERSHIP_CONFIRMATION);
  });

  it('leaves a share register and a share certificate to their own types on the menu', async () => {
    for (const [text, own] of [[SHARE_REGISTER_TEXT, SHARE_REGISTER], [SHARE_CERT_TEXT, SHARE_CERT]] as const) {
      const input = doc('scan_0008.pdf', text);
      const classification = await classifyDocument(input as never, await makeRepo());
      const menu = adjudicationShortlist(input, classification).map((c) => c.document_type);
      expect(menu).toContain(own);
      const oc = classification.ranked?.find((c) => c.document_type === OWNERSHIP_CONFIRMATION);
      expect(oc?.reasons.join(' ') ?? '').not.toMatch(/Beneficial/);
    }
  });
});

describe('what the adjudicator reads about Ownership Confirmation', () => {
  async function menuFor(text: string): Promise<AdjudicationCandidate[]> {
    const repo = new InMemoryOntologyRepository();
    await repo.upsertOntology(buildOntologyRecordsFromWorkbook('ontology/BBBEE_Verification_Document_Matrix_v3.xlsx'));
    let offered: AdjudicationCandidate[] = [];
    const adjudicator: DocumentTypeAdjudicator = vi.fn(async (_input, candidates) => {
      offered = candidates;
      return null;
    });
    await new ParserService(repo, { adjudicator }).resolve(doc('scan_0007.pdf', text));
    return offered;
  }

  it('describes who holds what percentage, including a register of beneficial interests', async () => {
    const offered = await menuFor(BI_REGISTER_TEXT);
    const oc = offered.find((c) => c.name === OWNERSHIP_CONFIRMATION);
    expect(oc?.description).toMatch(/who holds what percentage/i);
    expect(oc?.description).toMatch(/beneficial/i);
  });

  it('no longer claims share registers and share certificates, which the menu offers as their own types', async () => {
    const offered = await menuFor(BI_REGISTER_TEXT);
    const oc = offered.find((c) => c.name === OWNERSHIP_CONFIRMATION);
    expect(oc?.description).not.toMatch(/share (register|certificate)/i);
    expect(offered.map((c) => c.name)).toContain(SHARE_REGISTER);
  });
});
