import { describe, expect, it } from 'vitest';
import {
  PARSER_PILLAR_CODES,
  PARSER_PILLAR_COVERAGE,
  PILLAR_PARSER_MAPPING,
  SECTOR_PILLAR_COVERAGE,
  TRUSTED_SECTOR_CODES,
  UNTRUSTED_SECTOR_TOKENS,
  getSectorCoverage,
  isTrustedSectorCode,
  sectorReadiness,
} from '../../schemas/sector_pillar_coverage.js';
import { CALCULATOR_KEY_ALLOWLIST, isAllowedCalculatorKey } from '../../schemas/calculator_allowlist.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';

describe('trusted sector codes', () => {
  it('knows exactly the seven sector codes that have scoring configs', () => {
    expect([...TRUSTED_SECTOR_CODES].sort()).toEqual(
      ['AGRI', 'CONSTRUCTION', 'FSC', 'ICT', 'MAC', 'RCOGP', 'TRANSPORT'].sort(),
    );
    for (const code of TRUSTED_SECTOR_CODES) {
      expect(isTrustedSectorCode(code)).toBe(true);
      expect(isTrustedSectorCode(code.toLowerCase())).toBe(true);
    }
  });

  it('never trusts GENERIC — it is a scorecard type, not a sector', () => {
    expect(isTrustedSectorCode('GENERIC')).toBe(false);
    expect(isTrustedSectorCode('generic')).toBe(false);
    expect(sectorReadiness('GENERIC')).toBe('not_ready');
    expect(getSectorCoverage('GENERIC')).toEqual([]);
    expect(SECTOR_PILLAR_COVERAGE.some((e) => (e.sectorCode as string) === 'GENERIC')).toBe(false);
  });

  it('rejects every untrusted UI token and unknown codes', () => {
    for (const token of UNTRUSTED_SECTOR_TOKENS) {
      expect(isTrustedSectorCode(token)).toBe(false);
      expect(sectorReadiness(token)).toBe('not_ready');
    }
    expect(isTrustedSectorCode('')).toBe(false);
    expect(isTrustedSectorCode('MADE_UP')).toBe(false);
    expect(sectorReadiness('MADE_UP')).toBe('not_ready');
  });

  it('every matrix entry uses a trusted sector code', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      expect(isTrustedSectorCode(entry.sectorCode)).toBe(true);
    }
  });
});

describe('parser coverage facts stay in sync with the ontology + allowlist', () => {
  /**
   * The STRICT direction, unchanged: the matrix may never claim a calculator key
   * the allowlist does not permit. That is the safety property — it stops
   * ontology data injecting an arbitrary calculator path.
   *
   * The reverse direction used to be asserted as equality, back when the
   * allowlist WAS the parser's emission gate. It now describes what the
   * SCORECARD consumes (derived from the calculators, Phase 1b), so it is
   * deliberately BROADER than what the matrix currently maps — the surplus is
   * precisely the coverage gap we are working through. Asserting equality here
   * would mean the allowlist could never describe a field before the ontology
   * mapped it, which is backwards: the ceiling has to exist before extraction
   * can reach it.
   *
   * Same reasoning as the containment note below, applied to the allowlist.
   */
  it('the matrix never claims a key the allowlist does not permit', () => {
    const matrixKeys = PARSER_PILLAR_COVERAGE.flatMap((p) => [...p.calculatorKeys]).sort();
    for (const key of matrixKeys) {
      expect(isAllowedCalculatorKey(key), `matrix key not allowlisted: ${key}`).toBe(true);
    }

    // Containment, not equality.
    const allowlistKeys = new Set(CALCULATOR_KEY_ALLOWLIST.map((s) => s.key));
    for (const key of matrixKeys) expect(allowlistKeys.has(key)).toBe(true);
  });

  it('reports how much of the allowlist the ontology can actually reach', () => {
    // Not a pass/fail bar — a visible measure of the gap, so it cannot quietly
    // widen. Tighten this number as the ontology maps more of the scorecard.
    const matrixKeys = new Set(PARSER_PILLAR_COVERAGE.flatMap((p) => [...p.calculatorKeys]));
    const total = CALCULATOR_KEY_ALLOWLIST.length;
    const reached = CALCULATOR_KEY_ALLOWLIST.filter((s) => matrixKeys.has(s.key)).length;

    // eslint-disable-next-line no-console
    console.log(`ontology reaches ${reached}/${total} calculator keys (${Math.round((reached / total) * 100)}%)`);
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThanOrEqual(total);
  });

  /**
   * PARSER_PILLAR_COVERAGE describes the document types that carry calculator
   * keys. The ontology is now broader than that: it also holds the verification
   * matrix (109 documents the auditor asks for), which are recognised and
   * prompted for but do not yet map to calculator keys.
   *
   * So the invariant is containment, not equality — plus the two checks below
   * that stop containment from hiding a drift the old equality would have caught.
   */
  it('every covered document type exists in the ontology under the same pillar', async () => {
    const repo = new InMemoryOntologyRepository();
    const ontologyDocs = await repo.listDocumentTypes();

    for (const coverage of PARSER_PILLAR_COVERAGE) {
      for (const docName of coverage.documentTypes) {
        const doc = ontologyDocs.find((d) => d.name === docName);
        expect(doc, `ontology missing document type: ${docName}`).toBeDefined();
        expect(doc?.pillar_code).toBe(coverage.parserPillar);
      }
    }
  });

  it('the ontology is the canonical types plus the verification matrix, with no name collisions', async () => {
    const repo = new InMemoryOntologyRepository();
    const ontologyDocs = await repo.listDocumentTypes();
    const names = ontologyDocs.map((d) => d.name);

    // No duplicates: a matrix entry must never shadow a canonical type, because
    // only canonical types own calculator keys.
    expect(new Set(names).size, 'duplicate document type names').toBe(names.length);

    // Every calculator-bearing type is still present and still classifiable.
    const covered = PARSER_PILLAR_COVERAGE.flatMap((p) => [...p.documentTypes]);
    for (const docName of covered) {
      expect(names, `canonical type lost from ontology: ${docName}`).toContain(docName);
    }

    // And the matrix actually landed — this is what the parser was missing.
    expect(ontologyDocs.length).toBeGreaterThan(covered.length);
  });

  it('parser pillar codes are exactly those used by the ontology', async () => {
    const repo = new InMemoryOntologyRepository();
    const ontologyPillars = Array.from(new Set((await repo.listDocumentTypes()).map((d) => d.pillar_code))).sort();
    expect([...PARSER_PILLAR_CODES].sort()).toEqual(ontologyPillars);
  });

  it('pillar → parser mapping only references real parser pillars and is consistent', () => {
    for (const [pillar, mapping] of Object.entries(PILLAR_PARSER_MAPPING)) {
      for (const code of mapping.parserPillars) {
        expect(PARSER_PILLAR_CODES, `${pillar} references unknown parser pillar ${code}`).toContain(code);
      }
      if (mapping.level === 'not_covered') {
        expect(mapping.parserPillars, `${pillar} is 'not_covered' but lists parser pillars`).toHaveLength(0);
      } else {
        expect(mapping.parserPillars.length, `${pillar} is '${mapping.level}' but lists no parser pillars`).toBeGreaterThan(0);
      }
    }
  });
});

describe('readiness rules', () => {
  it('no sector is marked live_scoring while parser output is advisory-only', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      expect(entry.readiness, `${entry.configId} must not be live_scoring`).not.toBe('live_scoring');
    }
    for (const code of TRUSTED_SECTOR_CODES) {
      expect(sectorReadiness(code)).not.toBe('live_scoring');
    }
  });

  it('every entry has at least one documented readiness reason', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      expect(entry.readinessReasons.length, entry.configId).toBeGreaterThan(0);
    }
  });

  it('sector readiness is the weakest of its configs', () => {
    // FSC Generic is review_assisted but Banks/LTI/STI are shadow_mode.
    expect(sectorReadiness('FSC')).toBe('shadow_mode');
    expect(sectorReadiness('TRANSPORT')).toBe('shadow_mode');
    expect(sectorReadiness('CONSTRUCTION')).toBe('shadow_mode');
    expect(sectorReadiness('RCOGP')).toBe('review_assisted');
    expect(sectorReadiness('ICT')).toBe('review_assisted');
    expect(sectorReadiness('AGRI')).toBe('review_assisted');
  });

  it('sectors with a separately scored EE pillar or PP=0 are never review_assisted', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      const ee = entry.pillarPoints.employmentEquity ?? 0;
      const pp = entry.pillarPoints.preferentialProcurement ?? 0;
      if (ee > 0 || pp === 0) {
        expect(entry.readiness, `${entry.configId} (EE=${ee}, PP=${pp})`).toBe('shadow_mode');
      }
    }
  });
});

describe('matrix shape', () => {
  it('has 17 configs with unique configIds and positive totals', () => {
    expect(SECTOR_PILLAR_COVERAGE).toHaveLength(17) // +FSC QSFI (shipped 2026-07-26);
    const ids = SECTOR_PILLAR_COVERAGE.map((e) => e.configId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      expect(entry.totalMaxPoints).toBeGreaterThan(0);
      expect(Object.keys(entry.pillarPoints).length).toBeGreaterThan(0);
    }
  });
});
