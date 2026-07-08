import { describe, expect, it } from 'vitest';
import { ParserService } from '../../parser/parser_service.js';
import { CaseParserService } from '../../parser/case_parser_service.js';
import { mapCalculatorPayload } from '../../parser/calculator_mapper.js';
import { admitCalculatorEntry, isAllowedCalculatorKey } from '../../schemas/calculator_allowlist.js';
import type { FieldKnowledge } from '../../graph/ontology_models.js';
import type { ExtractedFieldWithMeta } from '../../parser/extract_fields.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

function rawText(fileId: string, text: string): RawExtractionInput {
  return {
    file_id: fileId,
    filename: `${fileId}.txt`,
    mime_type: 'text/plain',
    raw_text: text,
    tables: [],
    metadata: {},
  };
}

const validCertificate = [
  'B-BBEE CERTIFICATE',
  'Enterprise Name: Gate Test Suppliers Pty Ltd',
  'B-BBEE Status Level: Level Two',
  'Black Ownership: 51%',
  'Expiry Date: 01 Feb 2035',
].join('\n');

describe('parser safety gate (end to end)', () => {
  it('emits a calculator payload only when the document passes', async () => {
    const result = await new ParserService().resolve(rawText('valid_cert', validCertificate));
    expect(result.status).toBe('passed');
    expect(Object.keys(result.calculator_payload).length).toBeGreaterThan(0);
    expect(result.calculator_payload['supplier.bee_level']).toBe(2);
  });

  it('never emits a calculator payload for a review_required document', async () => {
    // Missing expiry date -> required field missing -> review_required.
    const result = await new ParserService().resolve(rawText('review_cert', [
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Review Suppliers Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
    ].join('\n')));
    expect(result.status).toBe('review_required');
    expect(result.calculator_payload).toEqual({});
  });

  it('never emits a calculator payload for a failed / unsupported document', async () => {
    const result = await new ParserService().resolve(rawText('random', 'This is an unrelated invoice for office chairs and coffee.'));
    expect(result.status).not.toBe('passed');
    expect(result.calculator_payload).toEqual({});
  });

  it('expired certificate cannot pass and emits no payload', async () => {
    const result = await new ParserService().resolve(rawText('expired', [
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Expired Suppliers Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
      'Expiry Date: 01 Feb 2020',
    ].join('\n')));
    expect(result.status).toBe('review_required');
    expect(result.validation.errors).toContain('Certificate is expired');
    expect(result.calculator_payload).toEqual({});
  });
});

describe('calculator allowlist', () => {
  it('accepts only known keys with matching runtime types', () => {
    expect(admitCalculatorEntry('supplier.bee_level', 2).accepted).toBe(true);
    expect(admitCalculatorEntry('supplier.name', 'ABC Pty Ltd').accepted).toBe(true);
    expect(admitCalculatorEntry('supplier.certificate_expiry', '2027-02-01').accepted).toBe(true);
  });

  it('rejects unknown calculator keys', () => {
    expect(isAllowedCalculatorKey('esd.inspect')).toBe(false);
    const decision = admitCalculatorEntry('esd.inspect', 'something');
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe('unknown_key');
  });

  it('rejects known keys with the wrong value type', () => {
    // bee_level expects a number, not a string.
    expect(admitCalculatorEntry('supplier.bee_level', 'Level Two').accepted).toBe(false);
    // certificate_expiry expects an ISO date string, not a raw label.
    expect(admitCalculatorEntry('supplier.certificate_expiry', '01 Feb 2027').accepted).toBe(false);
    // name must be a non-empty string.
    expect(admitCalculatorEntry('supplier.name', '').accepted).toBe(false);
  });

  it('drops ontology fields whose calculator key is outside the allowlist', () => {
    const fields: FieldKnowledge[] = [{
      field: {
        name: 'inspection_note',
        data_type: 'string',
        required: false,
        description: 'Auditor free-text derived by the Excel loader',
        calculator_key: 'esd.inspection_note',
        graph_version: 'v1',
      },
      rules: [],
      patterns: [],
      calculator_requirements: [{
        key: 'esd.inspection_note',
        expected_type: 'string',
        destination: 'manual_workbook',
        workbook_field: 'esd.inspection_note',
        manual_flow_mapping: 'esd.inspection_note',
        graph_version: 'v1',
      }],
    }];
    const extracted: Record<string, ExtractedFieldWithMeta> = {
      inspection_note: {
        raw_value: 'checked',
        normalized_value: 'checked',
        data_type: 'string',
        confidence: 0.95,
        source: { page: 1, table: null, text_snippet: 'checked' },
        matched_patterns: ['inspection_note'],
      },
    };
    const result = mapCalculatorPayload(fields, extracted, new Set(['inspection_note']));
    expect(result.payload).toEqual({});
    expect(result.rejected).toEqual([{ key: 'esd.inspection_note', reason: 'unknown_key' }]);
  });
});

describe('case parser conflict detection', () => {
  const certificate = (name: string, level: string) => [
    'B-BBEE CERTIFICATE',
    `Enterprise Name: ${name}`,
    `B-BBEE Status Level: ${level}`,
    'Black Ownership: 51%',
    'Expiry Date: 01 Feb 2035',
  ].join('\n');

  const spendSchedule = (name: string) => [
    'Supplier Spend Schedule',
    `Supplier Name: ${name}`,
    'Amount Excl VAT: R 1250000',
    'B-BBEE Level: Level Two',
    'Black Ownership: 51%',
  ].join('\n');

  it('withholds conflicting values across passed documents and flags the case for review', async () => {
    const service = new CaseParserService();
    const result = await service.resolveCase([
      rawText('doc_a', certificate('Same Supplier Pty Ltd', 'Level Two')),
      rawText('doc_b', spendSchedule('Same Supplier Pty Ltd')),
      // Conflicting bee_level for the same key across a third passed document.
      rawText('doc_c', certificate('Same Supplier Pty Ltd', 'Level Four')),
    ], 'case_conflict');

    expect(result.status).toBe('review_required');
    expect(result.audit_trail.conflicting_fields.some((c) => c.key === 'supplier.bee_level')).toBe(true);
    // The conflicting key must NOT appear in the merged payload.
    expect(result.calculator_payload).not.toHaveProperty('supplier.bee_level');
  });

  it('merges non-conflicting passed documents into a single payload', async () => {
    const service = new CaseParserService();
    const result = await service.resolveCase([
      rawText('doc_a', certificate('Agree Supplier Pty Ltd', 'Level Two')),
      rawText('doc_b', spendSchedule('Agree Supplier Pty Ltd')),
    ], 'case_agree');

    expect(result.audit_trail.conflicting_fields).toEqual([]);
    expect(result.calculator_payload['supplier.bee_level']).toBe(2);
    expect(result.calculator_payload['supplier.spend']).toBe(1250000);
  });
});
