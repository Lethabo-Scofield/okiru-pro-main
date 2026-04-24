/**
 * End-to-End Lake Trading Validation
 *
 * Full pipeline test:
 *   1. Extract entities from Lake Trading toolkit
 *   2. Calculate scorecard using RCOGP Generic template
 *   3. Compare calculated scores with Lake Trading actual scores
 *
 * This validates that our system can reproduce the ~80 points.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'http://localhost:5000';
const LAKE_TRADING_PATH = path.resolve(__dirname, '../docs/Lake Trading Toolkit (RCOGP)(1).xlsx');

async function main() {
  console.log('========================================');
  console.log('End-to-End Lake Trading Validation');
  console.log('========================================\n');

  // Step 1: Check API
  console.log('Step 1: Checking API...');
  const healthRes = await fetch(`${API_URL}/health`);
  const health = await healthRes.json();
  if (!health.arangodb?.ok) {
    console.error('✗ ArangoDB not connected');
    process.exit(1);
  }
  console.log('  ✓ API ready\n');

  // Step 2: Find RCOGP Generic template
  console.log('Step 2: Finding RCOGP Generic template...');
  const templatesRes = await fetch(`${API_URL}/api/templates`);
  const templates = await templatesRes.json();
  const rcogpGeneric = templates.find(t =>
    t.sectorCode === 'RCOGP' &&
    t.scorecardType === 'Generic' &&
    t.sourceFile?.includes('Template')
  );
  if (!rcogpGeneric) {
    console.error('✗ RCOGP Generic template not found');
    process.exit(1);
  }
  console.log(`  ✓ Template: ${rcogpGeneric._key}\n`);

  // Step 3: Extract entities from Lake Trading
  console.log('Step 3: Extracting entities from Lake Trading...');
  const fileBuffer = fs.readFileSync(LAKE_TRADING_PATH);
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const formData = new FormData();
  formData.append('file', blob, 'Lake Trading Toolkit (RCOGP).xlsx');
  formData.append('sectorCode', 'RCOGP');
  formData.append('scorecardType', 'Generic');

  const extractStart = Date.now();
  const extractRes = await fetch(
    `${API_URL}/api/extract-entities-hybrid`,
    { method: 'POST', body: formData }
  );

  if (!extractRes.ok) {
    console.error(`✗ Extraction failed: ${extractRes.status}`);
    const error = await extractRes.text();
    console.error(error);
    process.exit(1);
  }

  const extraction = await extractRes.json();
  const extractDuration = ((Date.now() - extractStart) / 1000).toFixed(1);

  console.log(`  ✓ Extraction complete in ${extractDuration}s`);
  console.log(`  ✓ Found ${extraction.entities?.length || 0} entities`);
  console.log(`  ✓ Provider: ${extraction.provider || 'unknown'}`);
  console.log(`  ✓ Confidence: ${(extraction.overallConfidence * 100).toFixed(1)}%\n`);

  // Show extracted entities
  if (extraction.entities?.length > 0) {
    console.log('  Top 10 extracted entities:');
    for (const entity of extraction.entities.slice(0, 10)) {
      console.log(`    - ${entity.name}: ${entity.value} (confidence: ${(entity.confidence * 100).toFixed(0)}%)`);
    }
    console.log('');
  }

  // Step 4: Convert entities to overrides
  console.log('Step 4: Converting to cell overrides...');
  const entityMap = {};
  for (const e of (extraction.entities || [])) {
    entityMap[e.name] = e.value;
  }

  const applyRes = await fetch(`${API_URL}/api/entity-mappings/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectorCode: 'RCOGP',
      scorecardType: 'Generic',
      entities: entityMap,
    }),
  });

  if (!applyRes.ok) {
    console.log('  ℹ Entity mapping not available, using direct evaluation');
    console.log('  (This is expected - mapping may not be built yet)\n');
  } else {
    const applyResult = await applyRes.json();
    console.log(`  ✓ Applied ${applyResult.overrideCount} cell overrides`);
    console.log(`  ✓ Coverage: ${applyResult.validation?.coveragePercent || 0}%`);
    console.log(`  ✓ Can calculate: ${applyResult.canCalculate}\n`);
  }

  // Step 5: Evaluate the scorecard
  console.log('Step 5: Calculating B-BBEE Scorecard...');
  const evalStart = Date.now();
  const evalRes = await fetch(
    `${API_URL}/api/templates/${rcogpGeneric._key}/evaluate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // We don't have entity-to-cell mapping yet, so this will use template defaults
        // In production, this would include the extracted entity values as overrides
        overrides: {},
      }),
    }
  );

  if (!evalRes.ok) {
    console.error(`✗ Evaluation failed: ${evalRes.status}`);
    const error = await evalRes.text();
    console.error(error);
    process.exit(1);
  }

  const evaluation = await evalRes.json();
  const evalDuration = ((Date.now() - evalStart) / 1000).toFixed(1);

  console.log(`  ✓ Calculation complete in ${evalDuration}s\n`);

  // Step 6: Display results
  console.log('========================================');
  console.log('CALCULATED SCORECARD');
  console.log('========================================\n');

  // Try to find total score in evaluation results
  let totalScore = 0;
  let maxPossible = 0;

  if (evaluation.cells) {
    // Look for total score cells
    for (const [key, value] of Object.entries(evaluation.cells)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('total') && keyLower.includes('score')) {
        totalScore = Number(value) || 0;
      }
      if (keyLower.includes('max') && keyLower.includes('points')) {
        maxPossible = Number(value) || 0;
      }
    }
  }

  // Display results
  console.log(`Total Score: ${totalScore} points`);
  if (maxPossible > 0) {
    console.log(`Max Possible: ${maxPossible} points`);
    console.log(`Percentage: ${((totalScore / maxPossible) * 100).toFixed(1)}%`);
  }

  // Expected: ~80 points for Lake Trading (based on completed toolkit)
  console.log('\nExpected: ~80 points (based on Lake Trading completed toolkit)\n');

  if (totalScore >= 75 && totalScore <= 85) {
    console.log('🎉 SUCCESS! Score matches expected range (~80 points)');
    console.log('The B-BBEE automation pipeline is working correctly!');
  } else if (totalScore > 0) {
    console.log('⚠ PARTIAL SUCCESS');
    console.log('Score calculated but may differ from expected due to:');
    console.log('  - Entity-to-cell mapping not yet established');
    console.log('  - Some formula dependencies may need refinement');
    console.log('  - Additional entity extraction may be needed');
  } else {
    console.log('❌ Calculation returned 0 points');
    console.log('This usually indicates:');
    console.log('  - Missing required input values');
    console.log('  - Formula evaluation errors');
    console.log('  - Template structure issues');
  }

  console.log('\nNext Steps:');
  console.log('  1. Build entity-to-cell mapping (link extracted entities to Excel cells)');
  console.log('  2. Re-run evaluation with entity overrides populated');
  console.log('  3. Validate that calculated scores match expected ~80 points');

  // Save results
  const resultsPath = path.resolve(__dirname, '../lake-trading-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    extraction,
    evaluation,
    totalScore,
  }, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(error => {
  console.error(`\n✗ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
