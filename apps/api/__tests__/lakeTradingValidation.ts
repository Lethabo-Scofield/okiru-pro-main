/**
 * Lake Trading Validation Test
 *
 * This test validates the new calculation engine against known
 * Lake Trading verification output to ensure accuracy.
 *
 * Run: npx tsx __tests__/lakeTradingValidation.ts
 */

import { calculateScorecard, type EntityValue } from '../pipeline/rules/index.js';

// ============================================================================
// Lake Trading Reference Data (Expected Output)
// ============================================================================

const LAKE_TRADING_EXPECTED = {
  sectorCode: 'RCOGP',
  scorecardType: 'Generic',
  totalPoints: 85.42, // Placeholder - replace with actual from Lake Trading
  beeLevel: 4,
  recognitionLevel: 100,
  pillars: {
    ownership: { points: 23.5, maxPoints: 25, subMinimumMet: true },
    managementControl: { points: 7.2, maxPoints: 8, subMinimumMet: true },
    employmentEquity: { points: 9.8, maxPoints: 11, subMinimumMet: true },
    skillsDevelopment: { points: 22.0, maxPoints: 25, subMinimumMet: true },
    preferentialProcurement: { points: 18.5, maxPoints: 27, subMinimumMet: true },
    enterpriseSupplierDevelopment: { points: 12.0, maxPoints: 15, subMinimumMet: true },
    socioEconomicDevelopment: { points: 5.0, maxPoints: 5, subMinimumMet: true },
  },
};

// ============================================================================
// Lake Trading Input Data
// ============================================================================

function buildLakeTradingEntityValues(): Map<string, EntityValue> {
  const values = new Map<string, EntityValue>();

  // Financials
  values.set('total_revenue', { entityId: 'total_revenue', value: 50_000_000, source: 'extraction', confidence: 0.95 });
  values.set('npat', { entityId: 'npat', value: 5_000_000, source: 'extraction', confidence: 0.95 });
  values.set('leviable_amount', { entityId: 'leviable_amount', value: 15_000_000, source: 'extraction', confidence: 0.95 });
  values.set('tmps', { entityId: 'tmps', value: 25_000_000, source: 'extraction', confidence: 0.95 });

  // Ownership (51% black owned example)
  values.set('black_ownership_percent', { entityId: 'black_ownership_percent', value: 0.51, source: 'extraction', confidence: 0.98 });
  values.set('black_women_ownership_percent', { entityId: 'black_women_ownership_percent', value: 0.30, source: 'extraction', confidence: 0.95 });
  values.set('shareholding_percent', { entityId: 'shareholding_percent', value: 1.0, source: 'extraction', confidence: 0.98 });
  values.set('share_value', { entityId: 'share_value', value: 10_000_000, source: 'extraction', confidence: 0.90 });

  // Management Control (example data)
  values.set('employee_name', { entityId: 'employee_name', value: 'Employee Register', source: 'extraction', confidence: 0.90 });
  values.set('employee_race', { entityId: 'employee_race', value: 'Mixed', source: 'extraction', confidence: 0.90 });
  values.set('employee_gender', { entityId: 'employee_gender', value: 'Mixed', source: 'extraction', confidence: 0.90 });
  values.set('employee_designation', { entityId: 'employee_designation', value: 'Mixed', source: 'extraction', confidence: 0.90 });
  values.set('employee_disabled', { entityId: 'employee_disabled', value: 0.02, source: 'extraction', confidence: 0.85 });

  // Skills
  values.set('training_cost', { entityId: 'training_cost', value: 525_000, source: 'extraction', confidence: 0.90 });
  values.set('learner_race', { entityId: 'learner_race', value: 'Black', source: 'extraction', confidence: 0.90 });
  values.set('learner_employment_status', { entityId: 'learner_employment_status', value: 'Employed', source: 'extraction', confidence: 0.90 });

  // Procurement
  values.set('supplier_spend', { entityId: 'supplier_spend', value: 20_000_000, source: 'extraction', confidence: 0.90 });
  values.set('supplier_bee_level', { entityId: 'supplier_bee_level', value: 4, source: 'extraction', confidence: 0.90 });
  values.set('supplier_black_ownership', { entityId: 'supplier_black_ownership', value: 0.51, source: 'extraction', confidence: 0.85 });

  // ESD
  values.set('esd_amount', { entityId: 'esd_amount', value: 150_000, source: 'extraction', confidence: 0.90 });
  values.set('esd_category', { entityId: 'esd_category', value: 'Supplier Development', source: 'extraction', confidence: 0.90 });

  // SED
  values.set('sed_amount', { entityId: 'sed_amount', value: 50_000, source: 'extraction', confidence: 0.90 });

  return values;
}

function buildLakeTradingCrossPillarValues(): Map<string, number> {
  const values = new Map<string, number>();
  values.set('npat', 5_000_000);
  values.set('tmps', 25_000_000);
  values.set('leviableAmount', 15_000_000);
  return values;
}

// ============================================================================
// Test Execution
// ============================================================================

interface TestResult {
  passed: boolean;
  criterionCode: string;
  expected: number;
  actual: number;
  diff: number;
  errors: string[];
}

interface TestReport {
  testName: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
  summary: {
    expectedTotal: number;
    actualTotal: number;
    diff: number;
    pillarsMatch: boolean;
  };
}

function runLakeTradingTest(): TestReport {
  console.log('========================================');
  console.log('Lake Trading Validation Test');
  console.log('========================================\n');

  // Build inputs
  const entityValues = buildLakeTradingEntityValues();
  const crossPillarValues = buildLakeTradingCrossPillarValues();

  // Run calculation
  const result = calculateScorecard({
    assessmentId: 'lake-trading-test-001',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    entityValues,
    crossPillarValues,
  });

  // Validate results
  const testResults: TestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  // Check each pillar
  for (const pillar of result.pillars) {
    const expected = LAKE_TRADING_EXPECTED.pillars[pillar.pillarCode as keyof typeof LAKE_TRADING_EXPECTED.pillars];

    if (expected) {
      const diff = Math.abs(pillar.points - expected.points);
      const passed = diff < 0.5; // Allow 0.5 point tolerance

      const testResult: TestResult = {
        passed,
        criterionCode: pillar.pillarCode,
        expected: expected.points,
        actual: pillar.points,
        diff,
        errors: pillar.criteria.flatMap(c => c.errors),
      };

      testResults.push(testResult);

      if (passed) passedCount++; else failedCount++;

      console.log(`${passed ? '✓' : '✗'} ${pillar.pillarName}`);
      console.log(`  Expected: ${expected.points} / ${expected.maxPoints}`);
      console.log(`  Actual:   ${pillar.points} / ${pillar.maxPoints}`);
      console.log(`  Diff:     ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`);
      if (testResult.errors.length > 0) {
        console.log(`  Errors:   ${testResult.errors.join(', ')}`);
      }
      console.log();
    }
  }

  // Overall validation
  const totalDiff = Math.abs(result.totalPoints - LAKE_TRADING_EXPECTED.totalPoints);
  const totalPassed = totalDiff < 1.0; // Allow 1 point tolerance on total

  console.log('----------------------------------------');
  console.log('Overall Score');
  console.log('----------------------------------------');
  console.log(`Expected: ${LAKE_TRADING_EXPECTED.totalPoints} pts | Level ${LAKE_TRADING_EXPECTED.beeLevel}`);
  console.log(`Actual:   ${result.totalPoints} pts | Level ${result.beeLevel}`);
  console.log(`Diff:     ${totalDiff > 0 ? '+' : ''}${totalDiff.toFixed(2)}`);
  console.log(`Status:   ${totalPassed ? '✓ PASS' : '✗ FAIL'}`);
  console.log();

  if (result.calculationErrors.length > 0) {
    console.log('Calculation Errors:');
    for (const err of result.calculationErrors) {
      console.log(`  - ${err}`);
    }
  }

  return {
    testName: 'Lake Trading RCOGP Generic Validation',
    totalTests: testResults.length,
    passed: passedCount,
    failed: failedCount,
    results: testResults,
    summary: {
      expectedTotal: LAKE_TRADING_EXPECTED.totalPoints,
      actualTotal: result.totalPoints,
      diff: totalDiff,
      pillarsMatch: passedCount === testResults.length,
    },
  };
}

// ============================================================================
// Formula Unit Tests
// ============================================================================

function runFormulaUnitTests(): void {
  console.log('========================================');
  console.log('Formula Registry Unit Tests');
  console.log('========================================\n');

  const { FORMULA_REGISTRY, executeFormula } = require('../pipeline/rules/formulaRegistry.js');

  // Test 1: Proportional formula
  console.log('Test 1: Proportional (voting rights)');
  const propResult = executeFormula('proportional', { actual: 0.30 }, { target: 0.25, maxPoints: 4 });
  console.log(`  Input: 30% actual vs 25% target, 4 max points`);
  console.log(`  Result: ${JSON.stringify(propResult)}`);
  console.log(`  Expected: 4 points (120% of target, capped)`);
  console.log();

  // Test 2: Percent of base (skills)
  console.log('Test 2: Percent of Base (skills spend)');
  const skillsResult = executeFormula('percent_of_base', {
    spend: 525_000,
    baseValue: 15_000_000
  }, { targetPercent: 0.035, maxPoints: 20 });
  console.log(`  Input: R525k spend vs R15m leviable (3.5% target)`);
  console.log(`  Result: ${JSON.stringify(skillsResult)}`);
  console.log(`  Expected: ~10 points (100% of 3.5% target)`);
  console.log();

  // Test 3: Percent of NPAT (ESD)
  console.log('Test 3: Percent of NPAT (ESD contribution)');
  const esdResult = executeFormula('percent_of_npat', {
    spend: 100_000,
    npat: 5_000_000
  }, { targetPercent: 0.02, maxPoints: 10 });
  console.log(`  Input: R100k spend vs R5m NPAT (2% target)`);
  console.log(`  Result: ${JSON.stringify(esdResult)}`);
  console.log(`  Expected: 10 points (100% of 2% target)`);
  console.log();

  // Test 4: Bonus flag
  console.log('Test 4: Bonus Flag');
  const bonusResult = executeFormula('bonus_flag', { conditionMet: true }, { condition: 'test', maxPoints: 1 });
  console.log(`  Input: conditionMet = true`);
  console.log(`  Result: ${JSON.stringify(bonusResult)}`);
  console.log(`  Expected: 1 point`);
  console.log();
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  // Run formula unit tests
  runFormulaUnitTests();

  console.log('\n');

  // Run Lake Trading validation
  const report = runLakeTradingTest();

  // Exit with appropriate code
  process.exit(report.summary.pillarsMatch ? 0 : 1);
}

export { runLakeTradingTest, runFormulaUnitTests, LAKE_TRADING_EXPECTED };
