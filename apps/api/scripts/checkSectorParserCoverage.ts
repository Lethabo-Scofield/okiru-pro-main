/**
 * Standalone runner for the sector/parser coverage assertions.
 *
 * vitest cannot be installed in the Replit environment (package firewall), so
 * this script mirrors the assertions in:
 *   - okiru-ai-parser/__tests__/parser/sector_pillar_coverage.test.ts
 *   - apps/api/__tests__/sectorParserCoverage.test.ts
 * and can be run anywhere with:
 *   cd apps/api && pnpm exec tsx scripts/checkSectorParserCoverage.ts
 */
import { strict as assert } from 'node:assert';
import { listSectorConfigsFull } from '../pipeline/sectorConfig.js';
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
} from '../../../okiru-ai-parser/schemas/sector_pillar_coverage.js';
import {
  CALCULATOR_KEY_ALLOWLIST,
  isAllowedCalculatorKey,
} from '../../../okiru-ai-parser/schemas/calculator_allowlist.js';
import { InMemoryOntologyRepository } from '../../../okiru-ai-parser/graph/ontology_queries.js';

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> | void {
  const done = () => {
    passed += 1;
    console.log(`  ✓ ${name}`);
  };
  const result = fn();
  if (result instanceof Promise) return result.then(done);
  done();
}

async function main(): Promise<void> {
  console.log('trusted sector codes');
  check('exactly six trusted sector codes', () => {
    assert.deepEqual(
      [...TRUSTED_SECTOR_CODES].sort(),
      ['AGRI', 'CONSTRUCTION', 'FSC', 'ICT', 'RCOGP', 'TRANSPORT'],
    );
    for (const code of TRUSTED_SECTOR_CODES) {
      assert.equal(isTrustedSectorCode(code), true);
      assert.equal(isTrustedSectorCode(code.toLowerCase()), true);
    }
  });
  check('GENERIC is never trusted', () => {
    assert.equal(isTrustedSectorCode('GENERIC'), false);
    assert.equal(isTrustedSectorCode('generic'), false);
    assert.equal(sectorReadiness('GENERIC'), 'not_ready');
    assert.deepEqual(getSectorCoverage('GENERIC'), []);
    assert.equal(SECTOR_PILLAR_COVERAGE.some((e) => (e.sectorCode as string) === 'GENERIC'), false);
  });
  check('untrusted tokens and unknown codes are not_ready', () => {
    for (const token of UNTRUSTED_SECTOR_TOKENS) {
      assert.equal(isTrustedSectorCode(token), false, token);
      assert.equal(sectorReadiness(token), 'not_ready', token);
    }
    assert.equal(isTrustedSectorCode(''), false);
    assert.equal(sectorReadiness('MADE_UP'), 'not_ready');
  });
  check('every matrix entry uses a trusted sector code', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      assert.equal(isTrustedSectorCode(entry.sectorCode), true, entry.configId);
    }
  });

  console.log('parser facts ↔ ontology + allowlist');
  check('matrix calculator keys === allowlist keys', () => {
    const matrixKeys = PARSER_PILLAR_COVERAGE.flatMap((p) => [...p.calculatorKeys]).sort();
    for (const key of matrixKeys) assert.equal(isAllowedCalculatorKey(key), true, key);
    assert.deepEqual(matrixKeys, CALCULATOR_KEY_ALLOWLIST.map((s) => s.key).sort());
  });
  await check('matrix document types + pillar codes match ontology', async () => {
    const repo = new InMemoryOntologyRepository();
    const docs = await repo.listDocumentTypes();
    assert.deepEqual(
      PARSER_PILLAR_COVERAGE.flatMap((p) => [...p.documentTypes]).sort(),
      docs.map((d) => d.name).sort(),
    );
    for (const coverage of PARSER_PILLAR_COVERAGE) {
      for (const docName of coverage.documentTypes) {
        const doc = docs.find((d) => d.name === docName);
        assert.ok(doc, `ontology missing ${docName}`);
        assert.equal(doc.pillar_code, coverage.parserPillar, docName);
      }
    }
    const ontologyPillars = Array.from(new Set(docs.map((d) => d.pillar_code))).sort();
    assert.deepEqual([...PARSER_PILLAR_CODES].sort(), ontologyPillars);
  });
  check('pillar → parser mapping is internally consistent', () => {
    for (const [pillar, mapping] of Object.entries(PILLAR_PARSER_MAPPING)) {
      for (const code of mapping.parserPillars) {
        assert.ok((PARSER_PILLAR_CODES as readonly string[]).includes(code), `${pillar} → ${code}`);
      }
      if (mapping.level === 'not_covered') assert.equal(mapping.parserPillars.length, 0, pillar);
      else assert.ok(mapping.parserPillars.length > 0, pillar);
    }
  });

  console.log('readiness rules');
  check('no sector is live_scoring (advisory-only wiring)', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      assert.notEqual(entry.readiness, 'live_scoring', entry.configId);
      assert.ok(entry.readinessReasons.length > 0, entry.configId);
    }
    for (const code of TRUSTED_SECTOR_CODES) assert.notEqual(sectorReadiness(code), 'live_scoring', code);
  });
  check('sector readiness is the weakest config', () => {
    assert.equal(sectorReadiness('FSC'), 'shadow_mode');
    assert.equal(sectorReadiness('TRANSPORT'), 'shadow_mode');
    assert.equal(sectorReadiness('CONSTRUCTION'), 'shadow_mode');
    assert.equal(sectorReadiness('RCOGP'), 'review_assisted');
    assert.equal(sectorReadiness('ICT'), 'review_assisted');
    assert.equal(sectorReadiness('AGRI'), 'review_assisted');
  });
  check('split EE pillar or PP=0 ⇒ shadow_mode', () => {
    for (const entry of SECTOR_PILLAR_COVERAGE) {
      const ee = entry.pillarPoints.employmentEquity ?? 0;
      const pp = entry.pillarPoints.preferentialProcurement ?? 0;
      if (ee > 0 || pp === 0) assert.equal(entry.readiness, 'shadow_mode', `${entry.configId} EE=${ee} PP=${pp}`);
    }
  });

  console.log('matrix ↔ sectorConfig sync');
  const configs = listSectorConfigsFull();
  check('one-to-one, same order, same identity fields', () => {
    assert.equal(SECTOR_PILLAR_COVERAGE.length, configs.length);
    configs.forEach((config, i) => {
      const entry = SECTOR_PILLAR_COVERAGE[i];
      assert.equal(entry.sectorCode, config.code, `index ${i}`);
      assert.equal(entry.scorecardType, config.type, entry.configId);
      assert.equal(entry.sectorName, config.name, entry.configId);
      assert.equal(entry.totalMaxPoints, config.totalPoints, entry.configId);
    });
  });
  check('pillar point snapshots match exactly', () => {
    configs.forEach((config, i) => {
      const entry = SECTOR_PILLAR_COVERAGE[i];
      const expected = Object.fromEntries(
        Object.entries(config.pillarConfigs)
          .filter(([, p]) => p && typeof (p as { maxPoints?: unknown }).maxPoints === 'number')
          .map(([k, p]) => [k, (p as { maxPoints: number }).maxPoints]),
      );
      assert.deepEqual({ ...entry.pillarPoints }, expected, entry.configId);
    });
  });
  check('trusted codes === distinct sectorConfig codes; GENERIC absent', () => {
    const configCodes = Array.from(new Set(configs.map((c) => c.code))).sort();
    assert.deepEqual([...TRUSTED_SECTOR_CODES].sort(), configCodes);
    assert.equal(configs.some((c) => c.code === 'GENERIC'), false);
  });

  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((error) => {
  console.error('\nCHECK FAILED:', error);
  process.exit(1);
});
