/**
 * Toolkit Ingestion Script
 *
 * This script ingests all 6 B-BBEE toolkit Excel files into ArangoDB.
 * Run this after starting the API server and ensuring ArangoDB is connected.
 *
 * Usage:
 *   node scripts/ingest-toolkits.js [apiBaseUrl]
 *
 * Default API URL: http://localhost:3000
 */

const http = require('http');

const DEFAULT_API_URL = 'http://localhost:5000';
const API_URL = process.argv[2] || DEFAULT_API_URL;

// Path to BBBEE Toolkits directory (relative to workspace root)
const TOOLKITS_PATH = 'c:\\Users\\Administrator\\Documents\\GitHub\\okiru-pro-main\\docs\\BBBEE Toolkits';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('B-BBEE Toolkit Ingestion Script');
  console.log('========================================');
  console.log(`API URL: ${API_URL}`);
  console.log(`Toolkits Path: ${TOOLKITS_PATH}`);
  console.log('');

  // Step 1: Check API health
  console.log('Step 1: Checking API health...');
  try {
    const health = await makeRequest('/health');
    if (health.status === 200) {
      console.log('  ✓ API is running');
      if (health.data.arangodb) {
        console.log(`  ✓ ArangoDB: ${health.data.arangodb.ok ? 'connected' : 'not connected'}`);
        if (!health.data.arangodb.ok) {
          console.error('\n❌ ERROR: ArangoDB is not connected. Please ensure ArangoDB is running.');
          console.log('\nOptions to fix this:');
          console.log('  1. Start local ArangoDB (if installed): arangod');
          console.log('  2. Use ArangoDB Oasis cloud (free tier available): https://cloud.arangodb.com/');
          console.log('  3. Update .env with cloud ArangoDB credentials');
          process.exit(1);
        }
      }
    } else {
      console.error(`  ✗ API health check failed: ${health.status}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`  ✗ Cannot connect to API: ${error.message}`);
    console.log('\nPlease ensure the API server is running:');
    console.log('  cd apps/api && npm run dev');
    process.exit(1);
  }

  // Step 2: Ingest all toolkits
  console.log('\nStep 2: Ingesting all 6 toolkit templates...');
  console.log('  This will extract:');
  console.log('    - Scorecard structure (pillars, indicators, targets)');
  console.log('    - Formula graphs with cell dependencies');
  console.log('    - Weightings and level thresholds');
  console.log('');

  try {
    const result = await makeRequest('/api/templates/ingest-all', 'POST', {
      basePath: TOOLKITS_PATH,
    });

    if (result.status === 200) {
      console.log('✓ Ingestion complete!\n');
      console.log('Results:');
      console.log(`  Total: ${result.data.total}`);
      console.log(`  Successful: ${result.data.successful}`);
      console.log(`  Failed: ${result.data.failed}`);
      console.log('');

      if (result.data.results) {
        console.log('Details:');
        for (const item of result.data.results) {
          const status = item.result.errors.length === 0 ? '✓' : '✗';
          console.log(`  ${status} ${item.file}`);
          console.log(`      Sector: ${item.sectorCode}, Type: ${item.type}`);
          console.log(`      Pillars: ${item.result.pillarCount}, Indicators: ${item.result.indicatorCount}`);
          if (item.result.errors.length > 0) {
            console.log(`      Errors: ${item.result.errors.join(', ')}`);
          }
        }
      }

      if (result.data.failed > 0) {
        console.log('\n⚠ Some toolkits failed to ingest. Check the details above.');
        process.exit(1);
      } else {
        console.log('\n✓ All toolkits ingested successfully!');
        console.log('\nNext steps:');
        console.log('  1. Validate with Lake Trading toolkit: POST /api/templates/{graphId}/compare');
        console.log('  2. Test entity extraction: POST /api/extract-entities-hybrid');
        console.log('  3. Build entity-to-cell mappings for automated scorecard population');
      }
    } else {
      console.error(`\n✗ Ingestion failed: ${result.status}`);
      console.error(result.data);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n✗ Ingestion request failed: ${error.message}`);
    process.exit(1);
  }
}

main();
