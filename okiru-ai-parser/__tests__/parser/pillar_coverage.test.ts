import { describe, expect, it } from 'vitest';
import { ParserService } from '../../parser/parser_service.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

function raw(fileId: string, text: string): RawExtractionInput {
  return { file_id: fileId, filename: `${fileId}.txt`, mime_type: 'text/plain', raw_text: text, tables: [], metadata: {} };
}

describe('multi-pillar canonical coverage', () => {
  it('Ownership: classifies a share/ownership confirmation and maps ownership.* keys', async () => {
    const result = await new ParserService().resolve(raw('own', [
      'OWNERSHIP CONFIRMATION',
      'Measured Entity Name: Umbrella Holdings Pty Ltd',
      'Black Ownership: 51%',
      'Black Women Ownership: 30%',
    ].join('\n')));
    expect(result.document_type).toBe('Ownership Confirmation');
    expect(result.status).toBe('passed');
    expect(result.calculator_payload).toMatchObject({
      'ownership.entity_name': 'Umbrella Holdings Pty Ltd',
      'ownership.black_ownership': 51,
      'ownership.black_women_ownership': 30,
    });
  });

  it('Management Control: classifies an EE report and maps management.* keys', async () => {
    const result = await new ParserService().resolve(raw('mac', [
      'EMPLOYMENT EQUITY REPORT',
      'Black Representation: 45%',
      'Black Women Representation: 25%',
    ].join('\n')));
    expect(result.document_type).toBe('Employment Equity Report');
    expect(result.status).toBe('passed');
    expect(result.calculator_payload).toMatchObject({
      'management.black_representation': 45,
      'management.black_women_representation': 25,
    });
  });

  it('Skills Development: classifies a WSP and maps skills.* keys', async () => {
    const result = await new ParserService().resolve(raw('skl', [
      'WORKPLACE SKILLS PLAN',
      'Total Skills Development Spend: R 500000',
      'Black Training Spend: R 350000',
    ].join('\n')));
    expect(result.document_type).toBe('Workplace Skills Plan');
    expect(result.status).toBe('passed');
    expect(result.calculator_payload).toMatchObject({
      'skills.total_spend': 500000,
      'skills.black_spend': 350000,
    });
  });

  it('SED: classifies a SED contribution and maps sed.* keys', async () => {
    const result = await new ParserService().resolve(raw('sed', [
      'SED CONTRIBUTION CONFIRMATION',
      'SED Contribution: R 120000',
      'Beneficiary: Rural Schools Trust',
    ].join('\n')));
    expect(result.document_type).toBe('SED Contribution Confirmation');
    expect(result.status).toBe('passed');
    expect(result.calculator_payload).toMatchObject({
      'sed.contribution': 120000,
      'sed.beneficiary_name': 'Rural Schools Trust',
    });
  });

  it('safety gate still holds per pillar: out-of-range ownership -> review, empty payload', async () => {
    const result = await new ParserService().resolve(raw('own_bad', [
      'OWNERSHIP CONFIRMATION',
      'Measured Entity Name: Bad Owner Pty Ltd',
      'Black Ownership: 140%',
    ].join('\n')));
    expect(result.status).toBe('review_required');
    expect(result.calculator_payload).toEqual({});
  });
});
