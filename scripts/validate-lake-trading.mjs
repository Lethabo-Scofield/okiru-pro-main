/**
 * Lake Trading Validation Script
 *
 * Validates the RCOGP Generic template against the completed Lake Trading toolkit
 * to verify the system produces ~80 points.
 *
 * Usage: node scripts/validate-lake-trading.mjs
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
  console.log('Lake Trading Toolkit Validation');
  console.log('========================================\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Lake Trading File: ${LAKE_TRADING_PATH}\n`);

  // Check if file exists
  if (!fs.existsSync(LAKE_TRADING_PATH)) {
    console.error('✗ Lake Trading file not found!');
    process.exit(1);
  }

  const stats = fs.statSync(LAKE_TRADING_PATH);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

  // Step 1: Check API health
  console.log('Step 1: Checking API health...');
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    const health = await healthRes.json();
    if (health.arangodb?.ok) {
      console.log(`  ✓ API is running`);
      console.log(`  ✓ ArangoDB: connected (v${health.arangodb.version})\n`);
    } else {
      console.log('  ✗ ArangoDB: not connected');
      process.exit(1);
    }
  } catch (error) {
    console.error(`  ✗ Cannot connect to API: ${error.message}`);
    console.log('\nPlease ensure the API server is running:');
    console.log('  cd apps/api && pnpm dev');
    process.exit(1);
  }

  // Step 2: Get the RCOGP Generic template
  console.log('Step 2: Finding RCOGP Generic template...');
  try {
    const templatesRes = await fetch(`${API_URL}/api/templates`);
    const templates = await templatesRes.json();

    const rcogpGeneric = templates.find(t =>
      t.sectorCode === 'RCOGP' &&
      t.scorecardType === 'Generic' &&
      t.sourceFile?.includes('Template')
    );

    if (!rcogpGeneric) {
      console.error('  ✗ RCOGP Generic template not found!');
      console.log('\nAvailable templates:');
      for (const t of templates.slice(0, 10)) {
        console.log(`  - ${t.sourceFile} (${t.sectorCode}/${t.scorecardType})`);
      }
      process.exit(1);
    }

    console.log(`  ✓ Found template: ${rcogpGeneric.sourceFile}`);
    console.log(`  ✓ Graph Key: ${rcogpGeneric._key}\n`);

    // Step 3: Compare with Lake Trading
    console.log('Step 3: Comparing with Lake Trading (this may take a few minutes)...');
    const fileBuffer = fs.readFileSync(LAKE_TRADING_PATH);
    const blob = new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const formData = new FormData();
    formData.append('truthFile', blob, 'Lake Trading Toolkit (RCOGP).xlsx');

    const startTime = Date.now();
    const compareRes = await fetch(
      `${API_URL}/api/templates/${rcogpGeneric._key}/compare`,
      {
        method: 'POST',
        body: formData,
      }
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!compareRes.ok) {
      const error = await compareRes.text();
      console.error(`\n✗ Comparison failed: ${compareRes.status}`);
      console.error(error);
      process.exit(1);
    }

    const result = await compareRes.json();

    console.log(`\n✓ Comparison complete in ${duration}s!\n`);
    console.log('='.repeat(50));
    console.log('RESULTS');
    console.log('='.repeat(50));
    console.log(`Total Cells Compared: ${result.totalCompared}`);
    console.log(`Matches: ${result.matches}`);
    console.log(`Mismatches: ${result.mismatches}`);
    console.log(`Accuracy: ${result.accuracy}%`);
    console.log('='.repeat(50));

    if (result.accuracy >= 95) {
      console.log('\n🎉 SUCCESS! The template produces accurate results.');
      console.log('The RCOGP Generic template can now be used for automated');
      console.log('scorecard calculations with high confidence.');
    } else if (result.accuracy >= 80) {
      console.log('\n⚠ PARTIAL SUCCESS. Accuracy is acceptable but could be improved.');
      console.log('Review the mismatches below for potential issues.');
    } else {
      console.log('\n❌ VALIDATION FAILED. Significant differences detected.');
      console.log('The template needs formula corrections before use.');
    }

    // Show mismatches
    if (result.details?.length > 0) {
      console.log('\nMismatches (top 10):');
      for (const diff of result.details.slice(0, 10)) {
        console.log(`\n  ${diff.sheet}!${diff.address}`);
        console.log(`    Stored: ${diff.storedValue}`);
        console.log(`    Truth:  ${diff.truthValue}`);
        console.log(`    Delta:  ${diff.delta || 'N/A'}`);
        if (diff.semanticTag) {
          console.log(`    Tag:    ${JSON.stringify(diff.semanticTag)}`);
        }
      }
    }

    console.log('\nNext Steps:');
    console.log(`  1. Extract entities from documents using POST /api/extract-entities-hybrid`);
    console.log(`  2. Apply to scorecard: POST /api/templates/${rcogpGeneric._key}/evaluate`);
    console.log(`  3. Generate final scorecard with full pillar breakdown`);

  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
