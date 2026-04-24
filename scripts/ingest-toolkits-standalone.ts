/**
 * Standalone Toolkit Ingestion Script
 *
 * Ingests all 6 B-BBEE toolkit Excel files directly into ArangoDB.
 * Run with: npx tsx scripts/ingest-toolkits-standalone.ts
 *
 * This script:
 *   1. Connects to ArangoDB (local or cloud)
 *   2. Ingests all 6 toolkit templates
 *   3. Displays results and any errors
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';
import { connectArango, checkArangoHealth } from '../apps/api/arango/connection.js';
import { ingestAllToolkits, BulkIngestionResult } from '../apps/api/arango/ingestion/templateIngester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from apps/api/.env
loadDotenv({ path: path.resolve(__dirname, '../apps/api/.env') });

// Path to BBBEE Toolkits directory.
// Priority:
//   1. --path argument: npx tsx scripts/ingest-toolkits-standalone.ts --path "C:/..."
//   2. docs/BBBEE Toolkits (if it exists)
//   3. ~/Downloads/BBBEE Toolkit.../BBBEE Toolkits (Windows default download location)
const argPathIdx = process.argv.indexOf('--path');
const DEFAULT_PATHS = [
  path.resolve(__dirname, '../docs/BBBEE Toolkits'),
  path.resolve(process.env.USERPROFILE || process.env.HOME || '', 'Downloads/BBBEE Toolkit-20260318T172641Z-1-001/BBBEE Toolkit/BBBEE Toolkits'),
];

let TOOLKITS_PATH: string;
if (argPathIdx !== -1 && process.argv[argPathIdx + 1]) {
  TOOLKITS_PATH = process.argv[argPathIdx + 1];
} else {
  TOOLKITS_PATH = DEFAULT_PATHS.find(p => fs.existsSync(p)) || DEFAULT_PATHS[0];
}

async function main() {
  console.log('========================================');
  console.log('B-BBEE Toolkit Standalone Ingestion');
  console.log('========================================\n');

  // Step 1: Connect to ArangoDB
  console.log('Step 1: Connecting to ArangoDB...');
  try {
    const db = await connectArango();
    if (!db) {
      console.error('  ✗ ArangoDB connection returned null');
      console.log('\nOptions to fix this:');
      console.log('  1. Start local ArangoDB (if installed)');
      console.log('  2. Use ArangoDB Oasis cloud: https://cloud.arangodb.com/');
      console.log('  3. See docs/ARANGODB_CLOUD_SETUP.md for detailed instructions');
      process.exit(1);
    }
    console.log('  ✓ Database connection established\n');
  } catch (error) {
    console.error(`  ✗ ArangoDB connection failed: ${error instanceof Error ? error.message : String(error)}`);
    console.log('\nOptions to fix this:');
    console.log('  1. Start local ArangoDB (if installed)');
    console.log('  2. Use ArangoDB Oasis cloud: https://cloud.arangodb.com/');
    console.log('  3. Check ARANGO_URL/ARANGO_USER/ARANGO_PASSWORD in apps/api/.env');
    process.exit(1);
  }

  // Step 2: Verify health
  console.log('Step 2: Verifying ArangoDB health...');
  const health = await checkArangoHealth();
  if (!health.ok) {
    console.error(`  ✗ Health check failed: ${health.error}`);
    process.exit(1);
  }
  console.log(`  ✓ ArangoDB healthy (version: ${health.version})\n`);

  // Step 3: Ingest all toolkits
  console.log('Step 3: Ingesting all 6 toolkit templates...');
  console.log('  This will extract:');
  console.log('    - Scorecard structure (pillars, indicators, targets)');
  console.log('    - Formula graphs with cell dependencies');
  console.log('    - Weightings and level thresholds');
  console.log('    - Source file mappings');
  console.log('');
  console.log(`  Toolkits path: ${TOOLKITS_PATH}`);
  console.log('');

  try {
    const result: BulkIngestionResult = await ingestAllToolkits(TOOLKITS_PATH);

    console.log('✓ Ingestion complete!\n');
    console.log('Summary:');
    console.log(`  Total templates: ${result.total}`);
    console.log(`  Successful: ${result.successful}`);
    console.log(`  Failed: ${result.failed}`);
    console.log('');

    console.log('Details:');
    for (const item of result.results) {
      const status = item.result.errors.length === 0 ? '✓' : '✗';
      console.log(`\n  ${status} ${item.file}`);
      console.log(`     Sector: ${item.sectorCode}, Type: ${item.type}`);
      console.log(`     Scorecard Key: ${item.result.scorecardKey}`);
      console.log(`     Graph Key: ${item.result.graphKey}`);
      console.log(`     Pillars: ${item.result.pillarCount}`);
      console.log(`     Indicators: ${item.result.indicatorCount}`);
      console.log(`     Targets: ${item.result.targetCount}`);
      console.log(`     Graph Nodes: ${item.result.graphNodeCount}`);
      console.log(`     Graph Edges: ${item.result.graphEdgeCount}`);

      if (item.result.errors.length > 0) {
        console.log(`     ⚠ Errors: ${item.result.errors.join(', ')}`);
      }
    }

    console.log('\n' + '='.repeat(40));
    if (result.failed > 0) {
      console.log(`⚠ ${result.failed} toolkit(s) failed to ingest`);
      console.log('Check the details above for specific errors.');
    } else {
      console.log('✓ All toolkits ingested successfully!');
    }
    console.log('='.repeat(40) + '\n');

    console.log('Next steps:');
    console.log('  1. Start API server: cd apps/api && npm run dev');
    console.log('  2. List templates: GET http://localhost:3000/api/templates');
    console.log('  3. Validate Lake Trading: POST /api/templates/{graphId}/compare');
    console.log('     (Upload Lake Trading Toolkit as truthFile)');
    console.log('  4. Test entity extraction: POST /api/extract-entities-hybrid');
    console.log('  5. Build entity-to-cell mappings for automated population');

  } catch (error) {
    console.error(`\n✗ Ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

main();
