/**
 * Signed parser runs. The document library accepts a run only as one of these
 * records, so what is in them — and that nothing else verifies — is what stops
 * a browser filing a "parser reading" it made up.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AI_VALUE_LIMITS,
  aiValuesForUpload,
  bbbeeRunRecords,
  esgRunRecords,
  GATHERING_WORKBOOK_TYPE,
  RULE_LAYER_UNSURE,
  RUN_ATTESTATION_TTL_MS,
  signParserRuns,
  signRunPayload,
  verifiedQuoteId,
  type ParserRunClaims,
} from '../../src/services/runAttestation.js';
import { parserBuild } from '../../src/services/parserBuild.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import type { UploadedFileLike } from '../../src/services/fileExtraction.js';

const upload = (name: string, content: string): UploadedFileLike => {
  const buffer = Buffer.from(content, 'utf8');
  return { originalname: name, mimetype: 'application/pdf', buffer, size: buffer.length };
};
const sha256 = (content: string) => createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');

describe('signRunPayload', () => {
  it('matches the known-answer vector the api verifies against', () => {
    // The same vector is pinned in apps/api/src/security/__tests__/
    // parserRunAttestation.test.ts. If either side changes the scheme, one of
    // the two fails instead of every run silently being refused in production.
    expect(signRunPayload('{"typ":"okiru.parser-run","v":1}', 'okiru-known-answer-secret'))
      .toBe('EG0GVBbF-Qe8I8WTNF7TwhOkOviGmD1AdRQ_Nb7DQq4');
  });

  it('is a different signature under a different secret', () => {
    const payload = '{"typ":"okiru.parser-run","v":1}';
    expect(signRunPayload(payload, 'one')).not.toBe(signRunPayload(payload, 'two'));
  });
});

describe('signParserRuns', () => {
  const record = {
    filename: 'cert.pdf',
    contentSha256: sha256('cert bytes'),
    parserOutput: { status: 'passed', document_type: 'B-BBEE Certificate' },
    reviewReasons: ['Confirm level'],
  };

  it('signs nothing without a secret, so there is nothing for the library to refuse', () => {
    expect(signParserRuns('bbbee', [record], {}, { secret: '' })).toBeUndefined();
  });

  it('carries the record, its binding and its lifetime in the signed text', () => {
    const [signed] = signParserRuns('bbbee', [record], { caseId: 'case-1', quoteId: 'q-1' }, { secret: 's', now: 1_000, build: 'abc1234' })!;
    expect(signed.filename).toBe('cert.pdf');
    expect(signed.signature).toBe(signRunPayload(signed.payload, 's'));
    const claims = JSON.parse(signed.payload) as ParserRunClaims;
    expect(claims).toEqual({
      typ: 'okiru.parser-run',
      v: 1,
      iat: 1_000,
      exp: 1_000 + RUN_ATTESTATION_TTL_MS,
      domain: 'bbbee',
      caseId: 'case-1',
      quoteId: 'q-1',
      filename: 'cert.pdf',
      contentSha256: sha256('cert bytes'),
      parserVersion: 'abc1234',
      reviewReasons: ['Confirm level'],
      parserOutput: { status: 'passed', document_type: 'B-BBEE Certificate', parser_build: 'abc1234' },
    });
  });

  it('names the build that read the file on every run, never null', () => {
    const previous = process.env.PARSER_BUILD;
    process.env.PARSER_BUILD = 'def5678';
    try {
      const [signed] = signParserRuns('bbbee', [record], {}, { secret: 's' })!;
      const claims = JSON.parse(signed.payload) as ParserRunClaims;
      expect(claims.parserVersion).toBe('def5678');
      expect(claims.parserOutput.parser_build).toBe('def5678');
    } finally {
      if (previous === undefined) delete process.env.PARSER_BUILD;
      else process.env.PARSER_BUILD = previous;
    }
  });
});

describe('parserBuild', () => {
  it('is the image build, else the pod (whose ReplicaSet names the image), else says unknown', () => {
    expect(parserBuild({ PARSER_BUILD: ' 027bc09 ', HOSTNAME: 'okiru-parser-5d8f-x' })).toBe('027bc09');
    expect(parserBuild({ HOSTNAME: 'okiru-parser-5d8f9c7b6-abcde' })).toBe('pod:okiru-parser-5d8f9c7b6-abcde');
    expect(parserBuild({})).toBe('unknown');
    expect(parserBuild({ PARSER_BUILD: 'x'.repeat(500) })).toHaveLength(100);
  });
});

describe('verifiedQuoteId', () => {
  it('names the quote only when the payment gate checked it', () => {
    expect(verifiedQuoteId({ quote_id: 'q-1' }, true)).toBe('q-1');
    expect(verifiedQuoteId({ quote_id: 'q-1' }, false)).toBeNull();
    expect(verifiedQuoteId({}, true)).toBeNull();
  });
});

describe('bbbeeRunRecords', () => {
  const parserOutput = (filename: string, status: 'passed' | 'review_required') => ({
    file_id: `upload_${filename}`,
    filename,
    document_type: 'B-BBEE Certificate',
    pillar: 'General',
    overall_confidence: 0.9,
    status,
    extracted_fields: {},
    calculator_payload: {},
    supplier_rows: [],
    measured_procurement_spend: null,
    validation: { passed: status === 'passed', warnings: [], errors: [], missing_fields: [] },
    audit_trail: {
      source_file: filename, matched_patterns: [], rules_applied: [], graph_version: 'v1',
      requires_human_review: status !== 'passed', classification_candidates: [], rejected_calculator_keys: [],
    },
  });
  const detected = (filename: string, status: 'passed' | 'review_required' = 'passed') => ({
    file_id: `upload_${filename}`,
    filename,
    document_type: 'B-BBEE Certificate',
    status,
    overall_confidence: 0.9,
    extracted_fields: {},
    calculator_payload: {},
    validation: { warnings: [], errors: [], missing_fields: [] },
    parser_output: parserOutput(filename, status),
  });

  it('binds each document to the bytes it was read from, and keeps the parser output verbatim', () => {
    const records = bbbeeRunRecords({
      documents_detected: [detected('cert.pdf'), detected('afs.pdf', 'review_required')],
      documents_needing_review: [{ filename: 'afs.pdf', document_type: 'AFS', status: 'review_required', reasons: ['NPAT unclear'] }],
    }, [upload('cert.pdf', 'certificate'), upload('afs.pdf', 'financials')]);

    expect(records.map((r) => [r.filename, r.contentSha256])).toEqual([
      ['cert.pdf', sha256('certificate')],
      ['afs.pdf', sha256('financials')],
    ]);
    expect(records[0].parserOutput).toEqual(parserOutput('cert.pdf', 'passed'));
    expect(records[1].reviewReasons).toEqual(['NPAT unclear']);
  });

  it('files a workbook read sheet by sheet as ONE run, the workbook’s — it used to get none', () => {
    const ownership = detected('Pack.xlsx › Ownership');
    ownership.document_type = 'Share register';
    (ownership.parser_output as any).extracted_fields = {
      black_ownership: { raw_value: '51%', normalized_value: 0.51, confidence: 0.9 },
    };
    const skills = detected('Pack.xlsx › Skills', 'review_required');
    skills.document_type = 'Skills register';
    (skills.parser_output as any).extracted_fields = {
      black_ownership: { raw_value: null, normalized_value: null, confidence: 0 },
      skills_spend: { raw_value: 'R 12 000', normalized_value: 12000, confidence: 0.8 },
    };
    (skills.parser_output as any).validation.missing_fields = ['black_ownership', 'training_hours'];

    const records = bbbeeRunRecords({
      documents_detected: [ownership, skills],
      documents_needing_review: [{ filename: 'Pack.xlsx › Skills', document_type: 'Skills register', status: 'review_required', reasons: ['Totals do not add up'] }],
    }, [upload('Pack.xlsx', 'workbook'), upload('Other.xlsx', 'not read')]);

    expect(records).toHaveLength(1);
    const [run] = records;
    expect(run.filename).toBe('Pack.xlsx');
    expect(run.contentSha256).toBe(sha256('workbook'));
    const output = run.parserOutput as any;
    expect(output.status).toBe('review_required');
    expect(output.document_type).toBe('Workbook');
    // The first sheet to READ a field supplies it; a sheet that did not read it never blanks it.
    expect(output.extracted_fields.black_ownership.normalized_value).toBe(0.51);
    expect(output.extracted_fields.skills_spend.normalized_value).toBe(12000);
    expect(output.validation.missing_fields).toEqual(['training_hours']);
    expect(output.sheets.map((s: any) => [s.sheet, s.document_type])).toEqual([
      ['Ownership', 'Share register'],
      ['Skills', 'Skills register'],
    ]);
    expect(run.reviewReasons).toEqual(['Pack.xlsx › Skills: Totals do not add up']);
  });

  it('carries the model and agent values of each upload, with their source layer and citation', () => {
    const extraction = (over: Partial<DocumentExtraction>): DocumentExtraction => ({
      documentId: 'bbbee_certificate',
      documentName: 'B-BBEE Certificate',
      element: 'GENERAL',
      sourceFile: 'cert.pdf',
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
      ...over,
    });
    const [cert, afs] = bbbeeRunRecords({
      documents_detected: [detected('cert.pdf'), detected('afs.pdf')],
      documents_needing_review: [],
    }, [upload('cert.pdf', 'certificate'), upload('afs.pdf', 'financials')], {
      extractions: [
        extraction({
          ungroundedFields: ['expiry_date'],
          values: [
            { field: 'bee_level', value: 2, sourceFile: 'cert.pdf', sourceDocumentId: 'bbbee_certificate' },
            { field: 'expiry_date', value: '2027-02-28', sourceFile: 'cert.pdf', sourceDocumentId: 'bbbee_certificate' },
            { field: 'empty', value: null, sourceFile: 'cert.pdf', sourceDocumentId: 'bbbee_certificate' },
          ],
        }),
        extraction({
          documentId: 'afs',
          documentName: 'Annual financial statements',
          sourceFile: 'afs.pdf',
          values: [{
            field: 'npat', value: 310000, sourceFile: 'afs.pdf', sourceDocumentId: 'afs',
            source: { method: 'agent', page: 4, quote: 'Net profit after tax 310 000' },
          }],
        }),
      ],
    });

    expect(cert.aiValues).toEqual([
      expect.objectContaining({ key: 'ai.bbbee_certificate.bee_level', field: 'bee_level', value: 2, layer: 'ai', grounded: true, page: null, quote: null }),
      expect.objectContaining({ field: 'expiry_date', grounded: false }),
    ]);
    expect(afs.aiValues).toEqual([
      expect.objectContaining({ key: 'ai.afs.npat', field: 'npat', value: 310000, layer: 'agent', page: 4, quote: 'Net profit after tax 310 000', grounded: null }),
    ]);
  });

  describe('what the library shows for a run', () => {
    const extraction = (over: Partial<DocumentExtraction>): DocumentExtraction => ({
      documentId: 'sheet_table__esd',
      documentName: 'Procurement sheet',
      element: 'ESD',
      sourceFile: 'Gathering.xlsx › Procurement',
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
      ...over,
    });
    const sheet = (
      name: string,
      documentType: string,
      status: 'passed' | 'review_required' | 'failed',
      fields: Record<string, unknown>,
      issues: { errors?: string[]; warnings?: string[]; missing?: string[] } = {},
    ) => {
      const doc = detected(`Gathering.xlsx › ${name}`) as any;
      doc.status = status;
      doc.document_type = documentType;
      doc.overall_confidence = status === 'failed' ? 0.2 : 0.6;
      doc.parser_output.status = status;
      doc.parser_output.extracted_fields = fields;
      doc.parser_output.validation = {
        passed: status === 'passed', warnings: issues.warnings ?? [], errors: issues.errors ?? [], missing_fields: issues.missing ?? [],
      };
      return doc;
    };
    const empty = { raw_value: null, normalized_value: null, confidence: 0 };
    const named = { raw_value: 'Acme Trading', normalized_value: 'Acme Trading', confidence: 0.9 };
    const pack = () => ({
      documents_detected: [
        sheet('Instructions', 'Company profile', 'review_required', { trading_name: empty, entity_name: named }, { missing: ['trading_name'], errors: ['trading_name is required'] }),
        sheet('Finance', 'Payroll / remuneration schedules for directors', 'review_required', { headcount_by_race: empty, mean_tcc_by_race: empty }, { missing: ['headcount_by_race', 'mean_tcc_by_race'], warnings: ['Top document-type candidates are too close (A vs B)'] }),
        sheet('Procurement', 'SARS VAT declaration for imported goods', 'review_required', { total_imports_declared: empty }, { missing: ['total_imports_declared'], errors: ['Document confidence is too low', 'role_title not found'], warnings: ['Document classification confidence requires human review'] }),
        sheet('Imports', 'B-BBEE certificate or affidavit for each ESD beneficiary', 'failed', {}, { errors: ['Best document-type confidence is below review threshold'] }),
      ],
      documents_needing_review: [
        { filename: 'Gathering.xlsx › Finance', document_type: 'Payroll', status: 'review_required', reasons: ['headcount_by_race missing', 'mean_tcc_by_race missing', 'Read as Payroll with some doubt: the sheet lists employees'] },
        { filename: 'Gathering.xlsx › Procurement', document_type: 'VAT', status: 'review_required', reasons: ['Supplier spend does not add up to the stated total'] },
      ],
    });
    const extractions = [
      extraction({
        documentId: 'sheet_instructions', documentName: 'Instructions sheet', element: 'GENERAL', sourceFile: 'Gathering.xlsx › Instructions',
        values: [{ field: 'industry_sector', value: 'Transport', sourceFile: 'Gathering.xlsx › Instructions', sourceDocumentId: 'sheet_instructions' }],
      }),
      extraction({
        documentId: 'sheet_financials', documentName: 'Finance sheet', element: 'GENERAL', sourceFile: 'Gathering.xlsx › Finance',
        values: [{ field: 'current_year_revenue', value: 12000000, sourceFile: 'Gathering.xlsx › Finance', sourceDocumentId: 'sheet_financials' }],
      }),
      extraction({
        values: [{ field: 'supplier_rows', value: [{ supplier_name: 'Kestrel Freight', claimed_spend_ex_vat: 1000 }], sourceFile: 'Gathering.xlsx › Procurement', sourceDocumentId: 'sheet_table__esd' }],
      }),
    ];

    it('names a gathering template as one, without the guessed evidence types’ missing fields', () => {
      const [run] = bbbeeRunRecords(pack() as any, [upload('Gathering.xlsx', 'workbook')], { extractions });
      const output = run.parserOutput as any;
      expect(output.document_type).toBe(GATHERING_WORKBOOK_TYPE);
      expect(output.validation.missing_fields).toEqual([]);
      expect(Object.keys(output.extracted_fields)).toEqual(['entity_name']);
      expect(output.validation.errors).toEqual([]);
      expect(output.validation.warnings).toEqual([]);
      expect(run.reviewReasons).toEqual(['Gathering.xlsx › Procurement: Supplier spend does not add up to the stated total']);
    });

    it('keeps a template’s real problems, and asks for a look because of them', () => {
      const withProblem = pack();
      withProblem.documents_detected[0].parser_output.validation.errors.push('Percentage must be between 0 and 100');
      const [run] = bbbeeRunRecords(withProblem as any, [upload('Gathering.xlsx', 'workbook')], { extractions });
      expect((run.parserOutput as any).validation.errors).toEqual(['Percentage must be between 0 and 100']);
      expect((run.parserOutput as any).status).toBe('review_required');
    });

    it('does not fail a workbook for a sheet that gave nothing', () => {
      const [run] = bbbeeRunRecords(pack() as any, [upload('Gathering.xlsx', 'workbook')], { extractions });
      const output = run.parserOutput as any;
      expect(output.status).toBe('passed');
      expect(output.overall_confidence).toBe(0.6);
      expect(output.sheets.find((s: any) => s.sheet === 'Imports')).toMatchObject({ status: 'failed', read: false });

      // Not a recognised template: the sheets' own statuses still decide, but
      // the empty Imports sheet still does not fail it.
      const [plain] = bbbeeRunRecords(pack() as any, [upload('Gathering.xlsx', 'workbook')], { extractions: extractions.slice(1) });
      expect((plain.parserOutput as any).status).toBe('review_required');
      expect((plain.parserOutput as any).document_type).toBe('Workbook');
    });

    it('fails a workbook only when none of its sheets gave anything', () => {
      const [run] = bbbeeRunRecords({
        documents_detected: [sheet('Sheet1', 'Unknown', 'failed', {}), sheet('Sheet2', 'Unknown', 'failed', {})],
        documents_needing_review: [],
      } as any, [upload('Gathering.xlsx', 'workbook')], { extractions: [] });
      expect((run.parserOutput as any).status).toBe('failed');
    });

    it('does not call a document failed when the model read values from it', () => {
      const profile = detected('profile.pdf') as any;
      profile.status = 'failed';
      profile.parser_output.status = 'failed';
      profile.parser_output.validation = { passed: false, warnings: [], errors: ['Document confidence is too low'], missing_fields: [] };
      const read = extraction({
        documentId: 'company_profile', documentName: 'Company profile', element: 'GENERAL', sourceFile: 'profile.pdf',
        values: [{ field: 'registered_name', value: 'Acme Trading (Pty) Ltd', sourceFile: 'profile.pdf', sourceDocumentId: 'company_profile' }],
      });

      const [withValues] = bbbeeRunRecords({ documents_detected: [profile], documents_needing_review: [] }, [upload('profile.pdf', 'p')], { extractions: [read] });
      expect((withValues.parserOutput as any).status).toBe('review_required');
      expect((withValues.parserOutput as any).validation.warnings).toEqual([RULE_LAYER_UNSURE]);
      expect((withValues.parserOutput as any).audit_trail.requires_human_review).toBe(true);

      const [nothing] = bbbeeRunRecords({ documents_detected: [profile], documents_needing_review: [] }, [upload('profile.pdf', 'p')], { extractions: [] });
      expect((nothing.parserOutput as any).status).toBe('failed');
    });
  });

  it('carries no AI block when there was no model read', () => {
    const [record] = bbbeeRunRecords({ documents_detected: [detected('cert.pdf')], documents_needing_review: [] }, [upload('cert.pdf', 'c')]);
    expect(record).not.toHaveProperty('aiValues');
  });
});

describe('aiValuesForUpload', () => {
  const uploadOf = (source: unknown) => (String(source).startsWith('Book.xlsx') ? 'Book.xlsx' : null);
  const base = { documentName: 'Register', element: 'SKILLS', missingFields: [], unexpectedFields: [], exceptions: [] };

  it('keys repeated fields uniquely, so each can be corrected on its own', () => {
    const values = aiValuesForUpload([
      { ...base, documentId: 'skills', sourceFile: 'Book.xlsx › A', values: [{ field: 'total', value: 1, sourceFile: 'Book.xlsx › A', sourceDocumentId: 'skills' }] },
      { ...base, documentId: 'skills', sourceFile: 'Book.xlsx › B', values: [{ field: 'total', value: 2, sourceFile: 'Book.xlsx › B', sourceDocumentId: 'skills' }] },
      { ...base, documentId: 'skills', sourceFile: 'Other.pdf', values: [{ field: 'total', value: 3, sourceFile: 'Other.pdf', sourceDocumentId: 'skills' }] },
    ], 'Book.xlsx', uploadOf);
    expect(values.map((v) => [v.key, v.value, v.sourceFile])).toEqual([
      ['ai.skills.total', 1, 'Book.xlsx › A'],
      ['ai.skills.total.2', 2, 'Book.xlsx › B'],
    ]);
    for (const value of values) expect(value.key).toMatch(/^[A-Za-z0-9_. -]+$/);
  });

  it('keeps the first rows of a register and says how many there were', () => {
    const rows = Array.from({ length: AI_VALUE_LIMITS.maxRows + 25 }, (_, i) => ({ learner: `L${i}` }));
    const [value] = aiValuesForUpload([
      { ...base, documentId: 'skills', sourceFile: 'Book.xlsx › A', values: [{ field: 'learners', value: rows, sourceFile: 'Book.xlsx › A', sourceDocumentId: 'skills' }] },
    ], 'Book.xlsx', uploadOf);
    expect((value.value as unknown[]).length).toBe(AI_VALUE_LIMITS.maxRows);
    expect(value.rowCount).toBe(AI_VALUE_LIMITS.maxRows + 25);
  });

  it('marks a code-only reader as the rule layer', () => {
    const [value] = aiValuesForUpload([
      { ...base, documentId: 'sheet_instructions', sourceFile: 'Book.xlsx › Instructions', values: [{ field: 'sector', value: 'Transport', sourceFile: 'Book.xlsx › Instructions', sourceDocumentId: 'sheet_instructions' }] },
    ], 'Book.xlsx', uploadOf);
    expect(value.layer).toBe('rule');
  });

  it('marks a figure the parser worked out as derived, never as a grounded AI read', () => {
    // The grounding check ran before the derivation existed, so the extraction's
    // ungrounded list cannot speak for it: an edited derived figure must never
    // be taken for one the document printed.
    const values = aiValuesForUpload([
      {
        ...base,
        documentId: 'emp201',
        sourceFile: 'Book.xlsx',
        ungroundedFields: [],
        values: [
          { field: 'sdl_amount', value: 120, sourceFile: 'Book.xlsx', sourceDocumentId: 'emp201' },
          { field: 'derived_leviable_amount', value: 12000, sourceFile: 'Book.xlsx', sourceDocumentId: 'emp201', source: { method: 'derived', quote: 'derived: SDL 120 x 100' } },
        ],
      },
    ], 'Book.xlsx', uploadOf);
    expect(values.map((v) => [v.field, v.layer, v.grounded])).toEqual([
      ['sdl_amount', 'ai', true],
      ['derived_leviable_amount', 'derived', null],
    ]);
  });
});

describe('signParserRuns with an AI block', () => {
  it('signs the AI values with the record, so editing one voids the signature', () => {
    const [signed] = signParserRuns('bbbee', [{
      filename: 'cert.pdf',
      contentSha256: sha256('c'),
      parserOutput: { status: 'passed' },
      reviewReasons: [],
      aiValues: [{
        key: 'ai.cert.bee_level', field: 'bee_level', value: 4, layer: 'ai', confidence: null,
        documentId: 'cert', documentName: 'Certificate', element: null, sourceFile: 'cert.pdf',
        page: null, cell: null, quote: null, grounded: true,
      }],
    }], {}, { secret: 's', now: 1 })!;
    const claims = JSON.parse(signed.payload) as ParserRunClaims;
    expect(claims.aiValues?.[0].value).toBe(4);
    claims.aiValues![0].value = 1;
    expect(signRunPayload(JSON.stringify(claims), 's')).not.toBe(signed.signature);
  });
});

describe('esgRunRecords', () => {
  const extraction = (over: Partial<DocumentExtraction>): DocumentExtraction => ({
    documentId: 'esg_energy_bill',
    documentName: 'Electricity bill',
    element: 'ENVIRONMENTAL',
    sourceFile: 'power-bill.pdf',
    values: [],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
    ...over,
  });

  it('files a workbook’s sheets under the workbook that was uploaded, with a status the library accepts', () => {
    const [record] = esgRunRecords({
      files: [upload('Gathering.xlsx', 'workbook')],
      inputs: [
        { filename: 'Gathering.xlsx › Energy', metadata: { parent_file: 'Gathering.xlsx' } },
        { filename: 'Gathering.xlsx › Water', metadata: { parent_file: 'Gathering.xlsx' } },
      ],
      extractions: [
        extraction({
          sourceFile: 'Gathering.xlsx › Energy',
          values: [{ field: 'electricity_kwh', value: 35332, sourceFile: 'Gathering.xlsx › Energy', sourceDocumentId: 'esg_energy_bill' }],
        }),
        extraction({
          documentName: 'Water bill',
          sourceFile: 'Gathering.xlsx › Water',
          values: [{ field: 'water_kl', value: 120, sourceFile: 'Gathering.xlsx › Water', sourceDocumentId: 'esg_water_bill' }],
        }),
      ],
      readErrors: new Map(),
    });

    expect(record.filename).toBe('Gathering.xlsx');
    expect(record.contentSha256).toBe(sha256('workbook'));
    const output = record.parserOutput as any;
    expect(output.status).toBe('passed');
    expect(output.domain).toBe('esg');
    // ESG has no rule layer; every value it read rides in the AI block, with
    // the sheet it came from and no invented confidence.
    expect(output.extracted_fields).toEqual({});
    expect(record.aiValues).toEqual([
      expect.objectContaining({
        key: 'ai.esg_energy_bill.electricity_kwh',
        field: 'electricity_kwh',
        value: 35332,
        layer: 'ai',
        confidence: null,
        sourceFile: 'Gathering.xlsx › Energy',
        documentName: 'Electricity bill',
      }),
      expect.objectContaining({ field: 'water_kl', value: 120, sourceFile: 'Gathering.xlsx › Water', documentName: 'Water bill' }),
    ]);
  });

  it('records a file the parser could not read as a failed run with the reason', () => {
    const [record] = esgRunRecords({
      files: [upload('scan.pdf', 'image only')],
      inputs: [],
      extractions: null,
      readErrors: new Map([['scan.pdf', 'No text layer and OCR is unavailable']]),
    });
    const output = record.parserOutput as any;
    expect(output.status).toBe('failed');
    expect(output.validation.errors).toEqual(['No text layer and OCR is unavailable']);
  });

  it('asks for review when a file was read but nothing came out of it, or an exception was raised', () => {
    const records = esgRunRecords({
      files: [upload('empty.pdf', 'blank'), upload('power-bill.pdf', 'bill')],
      inputs: [{ filename: 'empty.pdf' }, { filename: 'power-bill.pdf' }],
      extractions: [extraction({
        values: [{ field: 'electricity_kwh', value: 1, sourceFile: 'power-bill.pdf', sourceDocumentId: 'x' }],
        exceptions: ['Billing period is one day outside the reporting period'],
      })],
      readErrors: new Map(),
    });
    const [empty, bill] = records.map((r) => r.parserOutput as any);
    expect(empty.status).toBe('review_required');
    expect(empty.validation.warnings).toContain('Nothing was extracted from this document.');
    expect(bill.status).toBe('review_required');
    expect(bill.validation.warnings).toEqual(['Billing period is one day outside the reporting period']);
  });
});

describe('aiValuesForUpload — the size of a run', () => {
  it('stops before the AI block outgrows what one run can store, rather than losing the whole run', () => {
    const big = 'x'.repeat(900);
    const values = Array.from({ length: 50 }, (_, i) => ({ field: `note_${i}`, value: big, sourceFile: 'a.pdf', sourceDocumentId: 'notes' }));
    const kept = aiValuesForUpload(
      [{ documentId: 'notes', documentName: 'Notes', sourceFile: 'a.pdf', values, missingFields: [], unexpectedFields: [], exceptions: [] }],
      'a.pdf',
      () => 'a.pdf',
      { ...AI_VALUE_LIMITS, maxBytes: 10_000 },
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(50);
    expect(Buffer.byteLength(JSON.stringify(kept))).toBeLessThanOrEqual(10_000);
    // What is kept is the first values, in order.
    expect(kept.map((v) => v.field)).toEqual(values.slice(0, kept.length).map((v) => v.field));
  });
});
