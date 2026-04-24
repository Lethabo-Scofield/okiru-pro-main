/**
 * End-to-End Scorecard Validation Test
 *
 * Tests the complete pipeline:
 *   1. Load Lake Trading test entities
 *   2. Build entity-to-cell mapping for RCOGP Generic template
 *   3. Apply entities to get cell overrides
 *   4. Call API to evaluate scorecard with overrides
 *   5. Compare calculated scores against expected values
 *
 * Expected Results (from completed Lake Trading toolkit):
 *   - Total Score: ~80 points (Level 4/5)
 *   - Ownership: ~20-25 points
 *   - Management: ~15-19 points
 *   - Skills: ~20-25 points
 *   - Procurement: ~20-25 points
 *   - ESD/SED: Combined ~10-15 points
 */

import dotenv from 'dotenv';
dotenv.config();

import { loadLakeTradingEntities, convertToEntityMap } from './load-test-entities.mjs';

const API_URL = process.env.API_URL || 'http://localhost:5000';
const SECTOR_CODE = 'RCOGP';
const SCORECARD_TYPE = 'Generic';
const GRAPH_KEY = '51320'; // RCOGP Generic graph key

// Expected scores from completed Lake Trading toolkit
const EXPECTED_SCORES = {
  total: { min: 75, max: 85, target: 80 },
  ownership: { min: 20, max: 25 },
  managementControl: { min: 15, max: 19 },
  skillsDevelopment: { min: 20, max: 25 },
  preferentialProcurement: { min: 20, max: 25 },
  enterpriseDevelopment: { min: 5, max: 10 },
  socioEconomicDevelopment: { min: 5, max: 10 },
};

/**
 * API helper functions
 */
async function apiCall(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Check API health
 */
async function checkHealth() {
  try {
    const result = await apiCall('/health');
    console.log(`[e2e-test] API Health: ${result.status}`);
    return result.status === 'ok';
  } catch (error) {
    console.error(`[e2e-test] API Health Check Failed: ${error.message}`);
    return false;
  }
}

/**
 * Build entity-to-cell mapping
 */
async function buildEntityMapping(sectorCode, scorecardType) {
  console.log(`[e2e-test] Building entity mapping for ${sectorCode}/${scorecardType}...`);

  try {
    const result = await apiCall(`/api/entity-mappings/build/${sectorCode}/${scorecardType}`, {
      method: 'POST',
    });

    console.log(`[e2e-test] Mapping built: ${result.mapping.coverage.mappedEntities}/${result.mapping.coverage.totalEntities} entities mapped (${result.mapping.coverage.coveragePercent}%)`);

    if (result.mapping.coverage.unmappedEntities.length > 0) {
      console.log(`[e2e-test] Unmapped entities: ${result.mapping.coverage.unmappedEntities.join(', ')}`);
    }

    return result.mapping;
  } catch (error) {
    console.error(`[e2e-test] Failed to build mapping: ${error.message}`);
    throw error;
  }
}

/**
 * Get entity-to-cell mapping
 */
async function getEntityMapping(sectorCode, scorecardType) {
  console.log(`[e2e-test] Getting entity mapping for ${sectorCode}/${scorecardType}...`);

  try {
    const result = await apiCall(`/api/entity-mappings/${sectorCode}/${scorecardType}`);
    return result.mapping;
  } catch (error) {
    console.error(`[e2e-test] Failed to get mapping: ${error.message}`);
    throw error;
  }
}

/**
 * Apply entities to get cell overrides
 */
function applyEntitiesToCells(entities, mapping) {
  const overrides = {};
  let appliedCount = 0;

  for (const entityMapping of mapping.mappings) {
    const entityName = entityMapping.entityName;
    const entityValue = entities[entityName];

    if (entityValue !== undefined && entityValue !== null) {
      // Apply to all mapped cells
      for (const cellAddress of entityMapping.cellAddresses) {
        overrides[cellAddress] = entityValue;
        appliedCount++;
      }

      // Log first few mappings for visibility
      if (appliedCount <= 10) {
        console.log(`[e2e-test]   ${entityName} -> ${entityMapping.cellAddresses[0]} = ${entityValue}`);
      }
    }
  }

  console.log(`[e2e-test] Applied ${appliedCount} cell overrides from ${Object.keys(entities).length} entities`);
  return overrides;
}

/**
 * Evaluate scorecard with cell overrides
 */
async function evaluateScorecard(graphKey, overrides) {
  console.log(`[e2e-test] Evaluating scorecard with graph ${graphKey}...`);

  try {
    const result = await apiCall(`/api/templates/${graphKey}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({
        overrides,
        includeFormulaDetails: false,
      }),
    });

    return result;
  } catch (error) {
    console.error(`[e2e-test] Failed to evaluate scorecard: ${error.message}`);
    throw error;
  }
}

/**
 * Validate calculated scores against expected ranges
 */
function validateScores(scores) {
  const results = {
    passed: 0,
    failed: 0,
    details: [],
  };

  console.log('\n[e2e-test] === Score Validation ===\n');

  // Total score
  const total = scores.total?.calculated ?? scores.total ?? 0;
  const totalExpected = EXPECTED_SCORES.total;
  const totalPass = total >= totalExpected.min && total <= totalExpected.max;
  results.details.push({
    pillar: 'Total Score',
    calculated: total,
    expected: totalExpected,
    passed: totalPass,
  });
  console.log(`[e2e-test] Total Score: ${total.toFixed(1)} points (expected ${totalExpected.min}-${totalExpected.max}) ${totalPass ? '✓' : '✗'}`);
  if (totalPass) results.passed++; else results.failed++;

  // Individual pillars
  const pillarMap = {
    'ownership': 'Ownership',
    'managementControl': 'Management Control',
    'skillsDevelopment': 'Skills Development',
    'preferentialProcurement': 'Preferential Procurement',
    'enterpriseDevelopment': 'Enterprise Development',
    'socioEconomicDevelopment': 'Socio-Economic Development',
  };

  for (const [key, label] of Object.entries(pillarMap)) {
    const pillarData = scores.pillars?.[key];
    const calculated = pillarData?.score ?? pillarData?.calculated ?? 0;
    const expected = EXPECTED_SCORES[key];

    if (expected) {
      const passed = calculated >= expected.min && calculated <= expected.max;
      results.details.push({
        pillar: label,
        calculated,
        expected,
        passed,
      });
      console.log(`[e2e-test] ${label}: ${calculated.toFixed(1)} points (expected ${expected.min}-${expected.max}) ${passed ? '✓' : '✗'}`);
      if (passed) results.passed++; else results.failed++;
    }
  }

  return results;
}

/**
 * Main test function
 */
async function runTest() {
  console.log('[e2e-test] ===========================================');
  console.log('[e2e-test] Lake Trading End-to-End Scorecard Test');
  console.log('[e2e-test] ===========================================\n');

  try {
    // Step 1: Check API health
    const healthy = await checkHealth();
    if (!healthy) {
      throw new Error('API is not healthy. Please start the API server.');
    }

    // Step 2: Load Lake Trading entities
    console.log('[e2e-test] Step 1: Loading Lake Trading entities...');
    const entities = loadLakeTradingEntities();
    const entityMap = convertToEntityMap(entities);
    console.log(`[e2e-test] Loaded ${entities.length} entities\n`);

    // Step 3: Build/get entity mapping
    console.log('[e2e-test] Step 2: Building entity-to-cell mapping...');
    let mapping;
    try {
      mapping = await buildEntityMapping(SECTOR_CODE, SCORECARD_TYPE);
    } catch (error) {
      console.log('[e2e-test] Mapping build failed, trying to get existing mapping...');
      mapping = await getEntityMapping(SECTOR_CODE, SCORECARD_TYPE);
    }

    // Check coverage
    const coverage = mapping.coverage.coveragePercent;
    console.log(`[e2e-test] Entity coverage: ${coverage}%`);
    if (coverage < 50) {
      console.warn('[e2e-test] WARNING: Low entity coverage may affect score accuracy');
    }

    // Step 4: Apply entities to get cell overrides
    console.log('\n[e2e-test] Step 3: Applying entities to cells...');
    const overrides = applyEntitiesToCells(entityMap, mapping);
    console.log(`[e2e-test] Generated ${Object.keys(overrides).length} cell overrides\n`);

    // Step 5: Evaluate scorecard
    console.log('[e2e-test] Step 4: Evaluating scorecard...');
    const evaluation = await evaluateScorecard(GRAPH_KEY, overrides);

    // Step 6: Validate results
    console.log('\n[e2e-test] Step 5: Validating scores...');
    const validation = validateScores(evaluation);

    // Summary
    console.log('\n[e2e-test] ===========================================');
    console.log('[e2e-test] Test Summary');
    console.log('[e2e-test] ===========================================');
    console.log(`[e2e-test] Passed: ${validation.passed}`);
    console.log(`[e2e-test] Failed: ${validation.failed}`);
    console.log(`[e2e-test] Total: ${validation.passed + validation.failed}`);

    if (validation.failed === 0) {
      console.log('\n[e2e-test] ✓ All validations passed!');
      return 0;
    } else {
      console.log(`\n[e2e-test] ✗ ${validation.failed} validation(s) failed`);
      return 1;
    }

  } catch (error) {
    console.error('\n[e2e-test] ===========================================');
    console.error('[e2e-test] Test Failed');
    console.error('[e2e-test] ===========================================');
    console.error(`[e2e-test] Error: ${error.message}`);

    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.error('[e2e-test]');
      console.error('[e2e-test] The API server appears to be offline.');
      console.error(`[e2e-test] Please ensure the API is running at ${API_URL}`);
      console.error('[e2e-test] You can start it with: pnpm run dev (from apps/api directory)');
    }

    return 1;
  }
}

// Run test
runTest().then(code => process.exit(code));
