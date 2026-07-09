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

function supplierRow(over: Partial<ParserSupplierRow>): ParserSupplierRow {
  return {
    supplier_name: 'Alpha Trading Pty Ltd',
    spend_amount: 1250000,
    bee_level: 2,
    black_ownership: 51,
    calculator_fields: {
      'supplier.name': 'Alpha Trading Pty Ltd',
      'supplier.spend': 1250000,
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
    },
    status: 'passed',
    issues: [],
    source_file: 'schedule.txt',
    ...over,
  };
}

function caseResult(over: Partial<ParserCaseResult>): ParserCaseResult {
  return {
    case_id: 'case_1',
    status: 'passed',
    documents_detected: [],
    calculator_payload: {},
    supplier_rows: [],
    missing_required_documents: [],
    documents_needing_review: [],
    audit_trail: {},
    ...over,
  };
}

describe('parser sector adapter — sector trust', () => {
  it('RCOGP Generic and ICT Generic resolve in the real sector config', () => {
    expect(getSectorConfigSafe('RCOGP', 'Generic')).not.toBeNull();
    expect(getSectorConfigSafe('ICT', 'Generic')).not.toBeNull();
    expect(PARSER_TARGET_SECTORS.map((t) => t.sectorCode)).toEqual(['RCOGP', 'ICT']);
  });

  it('rejects GENERIC as a sector token', () => {
    expect(isTrustedParserSector('GENERIC', 'Generic')).toBe(false);
    expect(getSectorConfigSafe('GENERIC', 'Generic')).toBeNull();
    expect(() => mapParserCaseToSectorInput('GENERIC', 'Generic', caseResult({}))).toThrow(UntrustedSectorError);
  });

  it('rejects sectors outside the audited target set (FSC/AGRI/etc.)', () => {
    expect(isTrustedParserSector('FSC', 'Generic')).toBe(false);
    expect(() => mapParserCaseToSectorInput('FSC', 'Generic', caseResult({}))).toThrow(UntrustedSectorError);
  });
});

describe('parser sector adapter — coverage matrix', () => {
  const matrix = buildSectorCoverageMatrix();

  it('covers all seven config pillars for both target sectors', () => {
    const rcogp = matrix.filter((r) => r.sectorCode === 'RCOGP');
    const ict = matrix.filter((r) => r.sectorCode === 'ICT');
    expect(rcogp).toHaveLength(7);
    expect(ict).toHaveLength(7);
  });

  it('pillar points stay synchronised with the sector config (source of truth)', () => {
    for (const row of matrix) {
      const config = getSectorConfigSafe(row.sectorCode, row.scorecardType)!;
      const pillarConfig = (config.pillarConfigs as Record<string, { maxPoints: number } | undefined>)[row.pillar];
      expect(row.pillarPoints).toBe(pillarConfig?.maxPoints ?? 0);
    }
  });

  it('reflects RCOGP vs ICT sector differences (not copied mappings)', () => {
    const pp = (code: string) => matrix.find((r) => r.sectorCode === code && r.pillar === 'preferentialProcurement')!;
    const sed = (code: string) => matrix.find((r) => r.sectorCode === code && r.pillar === 'socioEconomicDevelopment')!;
    const ed = (code: string) => matrix.find((r) => r.sectorCode === code && r.pillar === 'enterpriseDevelopment')!;
    expect(pp('RCOGP').pillarPoints).toBe(29);
    expect(pp('ICT').pillarPoints).toBe(27);
    expect(sed('RCOGP').pillarPoints).toBe(5);
    expect(sed('ICT').pillarPoints).toBe(12);
    expect(ed('RCOGP').pillarPoints).toBe(7);
    expect(ed('ICT').pillarPoints).toBe(18);
  });

  it('is honest: only procurement + SED have a real calculator input mapping', () => {
    const withMapping = matrix.filter((r) => r.actualScorecardInputMapping != null).map((r) => r.pillar);
    const uniq = Array.from(new Set(withMapping));
    expect(uniq.sort()).toEqual(['preferentialProcurement', 'socioEconomicDevelopment']);
    // Ownership/management/skills must NOT claim a live mapping.
    for (const pillar of ['ownership', 'managementControl', 'skillsDevelopment']) {
      const row = matrix.find((r) => r.pillar === pillar)!;
      expect(row.actualScorecardInputMapping).toBeNull();
      expect(row.readinessStatus).toBe('shadow_ready');
      expect(row.gaps.length).toBeGreaterThan(0);
    }
  });

  it('never marks any pillar live_scoring_ready yet', () => {
    expect(matrix.every((r) => r.readinessStatus !== 'live_scoring_ready')).toBe(true);
  });
});

describe('parser sector adapter — mapping into calculator input', () => {
  it('maps passed supplier rows into SupplierInput drafts for RCOGP', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [
        supplierRow({}),
        supplierRow({ supplier_name: 'Beta Logistics CC', source_file: 'schedule.txt', calculator_fields: {
          'supplier.name': 'Beta Logistics CC', 'supplier.spend': 480000, 'supplier.bee_level': 4, 'supplier.black_ownership': 30,
        } }),
      ],
    }));
    expect(result.scorecardInputDraft.suppliers).toHaveLength(2);
    expect(result.scorecardInputDraft.suppliers[0]).toMatchObject({ name: 'Alpha Trading Pty Ltd', spend: 1250000, beeLevel: 2, blackOwnership: 51 });
    expect(result.mappedPillars).toContain('preferentialProcurement');
  });

  it('excludes review_required supplier rows from scoring input', () => {
    const result = mapParserCaseToSectorInput('ICT', 'Generic', caseResult({
      supplier_rows: [
        supplierRow({}),
        supplierRow({ supplier_name: 'Bad Row', status: 'review_required', issues: ['black ownership out of range'] }),
      ],
    }));
    expect(result.scorecardInputDraft.suppliers).toHaveLength(1);
    expect(result.audit.supplierRowsSkippedNotPassed).toBe(1);
  });

  it('rejects unknown / mistyped supplier keys (no arbitrary calculator paths)', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      supplier_rows: [supplierRow({ calculator_fields: {
        'supplier.name': 'Alpha Trading Pty Ltd',
        'supplier.spend': 1250000,
        'ownership.black_ownership': 99,   // wrong namespace for a supplier row
        'supplier.bee_level': 'two',       // wrong type
      } as unknown as Record<string, unknown> })],
    }));
    const reasons = result.rejectedKeys.reduce<Record<string, string>>((acc, r) => { acc[r.key] = r.reason; return acc; }, {});
    expect(reasons['ownership.black_ownership']).toBe('unknown_supplier_key');
    expect(reasons['supplier.bee_level']).toBe('type_mismatch');
    // Name + spend still map; bee_level falls to a gap.
    expect(result.scorecardInputDraft.suppliers[0].gaps.join(' ')).toContain('beeLevel missing');
  });

  it('reports per-supplier gaps (blackWomenOwnership, enterpriseType)', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({ supplier_rows: [supplierRow({})] }));
    const gaps = result.scorecardInputDraft.suppliers[0].gaps.join(' ');
    expect(gaps).toContain('blackWomenOwnership');
    expect(gaps).toContain('enterpriseType');
  });

  it('maps SED contribution but flags the NPAT denominator gap', () => {
    const result = mapParserCaseToSectorInput('ICT', 'Generic', caseResult({
      calculator_payload: { 'sed.contribution': 120000, 'sed.beneficiary_name': 'Rural Schools Trust' },
    }));
    expect(result.scorecardInputDraft.contributions).toHaveLength(1);
    expect(result.scorecardInputDraft.contributions[0]).toMatchObject({ amount: 120000, category: 'sed', beneficiary: 'Rural Schools Trust' });
    expect(result.scorecardInputDraft.contributions[0].gaps.join(' ')).toContain('NPAT denominator');
  });

  it('surfaces missing required documents from the case', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({
      status: 'review_required',
      missing_required_documents: ['Supplier Spend Schedule'],
    }));
    expect(result.audit.missingRequiredDocuments).toContain('Supplier Spend Schedule');
    expect(result.scorecardInputDraft.suppliers).toHaveLength(0);
  });

  it('leaves ownership/management/skills unmapped (shadow-only) even with a passed bundle', () => {
    const result = mapParserCaseToSectorInput('RCOGP', 'Generic', caseResult({ supplier_rows: [supplierRow({})] }));
    for (const pillar of ['ownership', 'managementControl', 'skillsDevelopment', 'supplierDevelopment', 'enterpriseDevelopment']) {
      expect(result.unmappedPillars).toContain(pillar);
    }
  });
});
