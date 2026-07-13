import { describe, expect, it } from 'vitest';
import { getSectorConfigSafe } from '../../../pipeline/sectorConfig.js';
import {
  PARSER_TARGET_SECTORS,
  isTrustedParserSector,
  UntrustedSectorError,
  buildSectorCoverageMatrix,
  mapParserCaseToSectorInput,
} from '../parserSectorAdapter.js';
import type { ParserCaseResult, ParserSupplierRow } from '../parserClient.js';

function supplierRow(over: Partial<ParserSupplierRow> = {}): ParserSupplierRow {
  return {
    supplier_name: 'Alpha Trading Pty Ltd',
    spend_amount: 1250000,
    bee_level: 2,
    black_ownership: 51,
    black_women_ownership: 35,
    enterprise_type: 'qse',
    calculator_fields: {
      'supplier.name': 'Alpha Trading Pty Ltd',
      'supplier.spend': 1250000,
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
      'supplier.black_women_ownership': 35,
      'supplier.enterprise_type': 'qse',
    },
    status: 'passed',
    issues: [],
    source_file: 'schedule.txt',
    ...over,
  };
}

function caseResult(over: Partial<ParserCaseResult> = {}): ParserCaseResult {
  return {
    case_id: 'case_1',
    status: 'passed',
    documents_detected: [],
    calculator_payload: {},
    supplier_rows: [],
    measured_procurement_spend: null,
    missing_required_documents: [],
    documents_needing_review: [],
    audit_trail: {},
    ...over,
  };
}

describe('sector adapter — sector trust', () => {
  it('RCOGP Generic and ICT Generic resolve; targets are exactly those two', () => {
    expect(getSectorConfigSafe('RCOGP', 'Generic')).not.toBeNull();
    expect(getSectorConfigSafe('ICT', 'Generic')).not.toBeNull();
    expect(PARSER_TARGET_SECTORS.map((t) => t.sectorCode)).toEqual(['RCOGP', 'ICT']);
  });

  it('rejects GENERIC as a sector token and un-audited sectors', () => {
    expect(isTrustedParserSector('GENERIC', 'Generic')).toBe(false);
    expect(getSectorConfigSafe('GENERIC', 'Generic')).toBeNull();
    expect(() => mapParserCaseToSectorInput('GENERIC', 'Generic', caseResult())).toThrow(UntrustedSectorError);
    expect(() => mapParserCaseToSectorInput('FSC', 'Generic', caseResult())).toThrow(UntrustedSectorError);
  });
});

describe('sector adapter — coverage matrix', () => {
  const matrix = buildSectorCoverageMatrix();

  it('pillar points stay synced with the sector config (source of truth)', () => {
    for (const row of matrix) {
      const config = getSectorConfigSafe(row.sectorCode, row.scorecardType)!;
      const pillarConfig = (config.pillarConfigs as Record<string, { maxPoints: number } | undefined>)[row.pillar];
      expect(row.pillarPoints).toBe(pillarConfig?.maxPoints ?? 0);
    }
  });

  it('preserves RCOGP vs ICT procurement/SED/ED differences', () => {
    const cell = (code: string, pillar: string) => matrix.find((r) => r.sectorCode === code && r.pillar === pillar)!;
    expect(cell('RCOGP', 'preferentialProcurement').pillarPoints).toBe(29);
    expect(cell('ICT', 'preferentialProcurement').pillarPoints).toBe(27);
    expect(cell('RCOGP', 'socioEconomicDevelopment').pillarPoints).toBe(5);
    expect(cell('ICT', 'socioEconomicDevelopment').pillarPoints).toBe(12);
    expect(cell('RCOGP', 'enterpriseDevelopment').pillarPoints).toBe(7);
    expect(cell('ICT', 'enterpriseDevelopment').pillarPoints).toBe(18);
  });

  it('procurement supported fields now include BWO + enterprise_type + tmps', () => {
    const pp = matrix.find((r) => r.pillar === 'preferentialProcurement')!;
    expect(pp.parserCalculatorKeys).toContain('supplier.black_women_ownership');
    expect(pp.parserCalculatorKeys).toContain('supplier.enterprise_type');
    expect(pp.actualScorecardInputMapping).toContain('tmps');
  });

  it('still never marks any pillar live_scoring_ready in the static matrix', () => {
    expect(matrix.every((r) => r.readinessStatus !== 'live_scoring_ready')).toBe(true);
  });
});

describe('sector adapter — procurement mapping (RCOGP + ICT)', () => {
  it('maps a clean schedule to SupplierInput with % converted to fractions', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow()],
      measured_procurement_spend: 10_000_000,
    }));
    const s = result.scorecardInputDraft.suppliers[0];
    // calcProcurement compares blackOwnership >= 0.51 — must be a fraction.
    expect(s).toMatchObject({
      name: 'Alpha Trading Pty Ltd', spend: 1250000, beeLevel: 2,
      blackOwnership: 0.51, blackWomenOwnership: 0.35, enterpriseType: 'qse',
    });
    expect(result.scorecardInputDraft.tmps).toBe(10_000_000);
  });

  it('is live_scoring_ready ONLY when suppliers AND TMPS are present', () => {
    const withTmps = mapParserCaseToSectorInput('ICT', 'Generic', caseResult({
      supplier_rows: [supplierRow()], measured_procurement_spend: 8_000_000,
    }));
    expect(withTmps.procurementReadiness).toBe('live_scoring_ready');
    expect(withTmps.procurementBlockers).toEqual([]);

    const noTmps = mapParserCaseToSectorInput('ICT', 'Generic', caseResult({
      supplier_rows: [supplierRow()], measured_procurement_spend: null,
    }));
    expect(noTmps.procurementReadiness).toBe('review_assisted_ready');
    expect(noTmps.procurementBlockers.join(' ')).toContain('TMPS');
  });

  it('excludes review_required supplier rows from scoring input', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow(), supplierRow({ supplier_name: 'Bad', status: 'review_required', issues: ['x'] })],
      measured_procurement_spend: 5_000_000,
    }));
    expect(result.scorecardInputDraft.suppliers).toHaveLength(1);
    expect(result.audit.supplierRowsSkippedNotPassed).toBe(1);
  });

  it('rejects unknown / mistyped supplier keys', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow({ calculator_fields: {
        'supplier.name': 'Alpha Trading Pty Ltd',
        'supplier.spend': 1250000,
        'ownership.black_ownership': 99,     // wrong namespace
        'supplier.bee_level': 'two',         // wrong type
        'supplier.enterprise_type': 'megacorp', // invalid enum
      } as unknown as Record<string, unknown> })],
      measured_procurement_spend: 5_000_000,
    }));
    const reasons = result.rejectedKeys.reduce<Record<string, string>>((a, r) => { a[r.key] = r.reason; return a; }, {});
    expect(reasons['ownership.black_ownership']).toBe('unknown_supplier_key');
    expect(reasons['supplier.bee_level']).toBe('type_mismatch');
    expect(reasons['supplier.enterprise_type']).toBe('invalid_enterprise_type');
  });

  it('defaults a supplier with no enterpriseType to generic and flags the gap', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow({ calculator_fields: {
        'supplier.name': 'No Type Co', 'supplier.spend': 90000, 'supplier.bee_level': 1, 'supplier.black_ownership': 100,
      } })],
      measured_procurement_spend: 5_000_000,
    }));
    const s = result.scorecardInputDraft.suppliers[0];
    expect(s.enterpriseType).toBe('generic');
    expect(s.gaps.join(' ')).toContain('enterpriseType absent');
  });

  it('surfaces missing required documents and keeps procurement review-assisted', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      status: 'review_required',
      missing_required_documents: ['Supplier Spend Schedule'],
    }));
    expect(result.audit.missingRequiredDocuments).toContain('Supplier Spend Schedule');
    expect(result.scorecardInputDraft.suppliers).toHaveLength(0);
    expect(result.procurementReadiness).toBe('review_assisted_ready');
  });

  it('leaves ownership/management/skills/SD/ED unmapped', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow()], measured_procurement_spend: 5_000_000,
    }));
    for (const pillar of ['ownership', 'managementControl', 'skillsDevelopment', 'supplierDevelopment', 'enterpriseDevelopment']) {
      expect(result.unmappedPillars).toContain(pillar);
    }
  });
});
