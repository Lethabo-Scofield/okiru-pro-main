/**
 * Validation Script — Run without vitest
 * 
 * Execute: npx tsx pipeline/__tests__/validate.ts
 */

import { buildManifest } from '../extraction/entityManifest.js';
import { calculateScorecard } from '../rules/calculationEngine.js';
import type { EntityValue } from '../rules/calculationEngine.js';

// ============================================================================
// Test Data
// ============================================================================

const TEST_INPUT = {
  // Financials
  total_revenue: 52_350_000,
  npat: 4_185_000,
  leviable_amount: 12_564_000,
  tmps: 31_410_000,
  
  // Ownership (51% black owned)
  black_ownership_percent: 0.51,
  black_women_ownership_percent: 0.30,
  shareholding_percent: 1.0,
  share_value: 8_500_000,
};

// ============================================================================
// Helper Functions
// ============================================================================

function buildEntityValues(input: Record<string, number>): Map<string, EntityValue> {
  const values = new Map<string, EntityValue>();
  
  for (const [key, value] of Object.entries(input)) {
    values.set(key, {
      entityId: key,
      value,
      source: 'manual',
      confidence: 1.0,
    });
  }
  
  return values;
}

function buildCrossPillarValues(input: Record<string, number>): Map<string, number> {
  const values = new Map<string, number>();
  values.set('npat', input.npat);
  values.set('tmps', input.tmps);
  values.set('leviableAmount', input.leviable_amount);
  return values;
}

// ============================================================================
// Validation Tests
// ============================================================================

async function runTests() {
  console.log('========================================');
  console.log('B-BBEE Scoring Engine Validation');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      failed++;
    }
  }

  function expect(actual: unknown) {
    return {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(`Expected ${expected} but got ${actual}`);
        }
      },
      toBeGreaterThan(expected: number) {
        if (typeof actual !== 'number' || actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeLessThanOrEqual(expected: number) {
        if (typeof actual !== 'number' || actual > expected) {
          throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error(`Expected value to be defined`);
        }
      },
      toBeCloseTo(expected: number, precision: number = 0) {
        const multiplier = Math.pow(10, precision);
        const actualRounded = Math.round((actual as number) * multiplier) / multiplier;
        const expectedRounded = Math.round(expected * multiplier) / multiplier;
        if (actualRounded !== expectedRounded) {
          throw new Error(`Expected ${actualRounded} to be close to ${expectedRounded}`);
        }
      },
    };
  }

  // Test 1: Build Manifest
  await test('RCOGP Generic manifest builds correctly', async () => {
    const manifest = await buildManifest('RCOGP', 'Generic');
    expect(manifest.sectorCode).toBe('RCOGP');
    expect(manifest.scorecardType).toBe('Generic');
  });

  // Test 2: Max Points
  await test('RCOGP Generic has 116 max points', async () => {
    const manifest = await buildManifest('RCOGP', 'Generic');
    const totalMax = manifest.pillarPacks.reduce((sum: number, p) => sum + p.maxPoints, 0);
    expect(totalMax).toBe(116);
  });

  // Test 3: Criteria Count
  await test('RCOGP Generic has 33 criteria', async () => {
    const manifest = await buildManifest('RCOGP', 'Generic');
    const criteriaCount = manifest.pillarPacks.reduce((sum: number, p) => sum + p.criteria.length, 0);
    expect(criteriaCount).toBe(33);
  });

  // Test 4: Calculation
  await test('Calculation produces results', async () => {
    const entityValues = buildEntityValues(TEST_INPUT);
    const crossPillarValues = buildCrossPillarValues(TEST_INPUT);
    
    const result = await calculateScorecard({
      assessmentId: 'test-001',
      sectorCode: 'RCOGP',
      scorecardType: 'Generic',
      entityValues,
      crossPillarValues,
    });
    
    expect(result.totalPoints).toBeGreaterThan(0);
    expect(result.totalPoints).toBeLessThanOrEqual(116);
    expect(result.beeLevel).toBeGreaterThan(0);
  });

  // Test 5: All Sector Variants
  const sectors = [
    { code: 'RCOGP', type: 'Generic', maxPoints: 116 },
    { code: 'ICT', type: 'Generic', maxPoints: 118 },
    { code: 'FSC', type: 'Generic', maxPoints: 105 },
    { code: 'AGRI', type: 'Generic', maxPoints: 114 },
    { code: 'RCOGP', type: 'QSE', maxPoints: 124 },
    { code: 'ICT', type: 'QSE', maxPoints: 124 },
  ];

  for (const sector of sectors) {
    await test(`${sector.code} ${sector.type} has ${sector.maxPoints} max points`, async () => {
      const manifest = await buildManifest(sector.code, sector.type);
      const totalMax = manifest.pillarPacks.reduce((sum: number, p) => sum + p.maxPoints, 0);
      expect(totalMax).toBe(sector.maxPoints);
    });
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('\n----------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
